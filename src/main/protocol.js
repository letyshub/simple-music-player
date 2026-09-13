import { protocol } from 'electron';
import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isKnownTrackPath } from './store.js';

/**
 * Everything the window loads comes from one custom scheme.
 *
 * The interface is served from `app://smp/index.html` and audio from
 * `app://smp/track/<encoded path>`, which makes the two the same origin.
 * That is the whole point of the arrangement.
 *
 * An earlier version loaded the page over file:// and only the audio over a
 * custom scheme, relying on an Access-Control-Allow-Origin header plus
 * crossOrigin on the audio element to keep the media node untainted. Chromium
 * has since stopped honouring CORS on non-standard schemes at all — it allows
 * it only for http, https, data and its own internal schemes — so that
 * approach began failing with "blocked by CORS policy" and the analyser sat
 * at zero while the music played. Same-origin sidesteps the question: there
 * is no cross-origin request to approve, nothing is tainted, and web security
 * stays switched on.
 *
 * Range requests are answered properly, otherwise dragging the seek bar would
 * restart the song instead of jumping.
 */

export const APP_SCHEME = 'app';
const APP_HOST = 'smp';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The two directories the window may read from.
 *
 * The interface sits under renderer/, but its modules also import the shared
 * logic that the main process uses, which lives one level up. Rather than
 * making all of src/ reachable — that would hand the window the main process
 * source too — each root is mapped explicitly and nothing else is served.
 */
const rendererRoot = path.join(srcRoot, 'renderer');
const sharedRoot = path.join(srcRoot, 'shared');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wma': 'audio/x-ms-wma',
};

function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Must be called before the app is ready. */
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  }]);
}

/** The URL the window is loaded from. */
export function appUrl(pathname = 'index.html') {
  return `${APP_SCHEME}://${APP_HOST}/${pathname}`;
}

/** The URL the renderer puts in an audio element's src. */
export function trackUrl(filePath) {
  return `${APP_SCHEME}://${APP_HOST}/track/${encodeURIComponent(filePath)}`;
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  let start = rawStart === '' ? null : Number(rawStart);
  let end = rawEnd === '' ? null : Number(rawEnd);

  if (start === null && end === null) return null;
  if (start === null) {
    // "bytes=-500" means the final 500 bytes.
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null) {
    end = size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  end = Math.min(end, size - 1);
  if (start > end || start < 0) return null;

  return { start, end };
}

/** Stream a file, honouring a Range header when the client sent one. */
async function serveFile(filePath, rangeHeader) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!stat.isFile()) return new Response('Not found', { status: 404 });

  const headers = {
    'Content-Type': mimeFor(filePath),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };

  const range = parseRange(rangeHeader, stat.size);

  if (range) {
    const { start, end } = range;
    return new Response(Readable.toWeb(createReadStream(filePath, { start, end })), {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }

  return new Response(Readable.toWeb(createReadStream(filePath)), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(stat.size) },
  });
}

/** An audio file from the library. */
async function serveTrack(encodedPath, rangeHeader) {
  const filePath = decodeURIComponent(encodedPath);

  // The renderer is our own code, but this keeps a bug in it from turning the
  // scheme into a way to read arbitrary files off the disk.
  if (!isKnownTrackPath(filePath)) {
    return new Response('Not in library', { status: 403 });
  }
  return serveFile(filePath, rangeHeader);
}

function within(root, resolved) {
  return resolved === root || resolved.startsWith(root + path.sep);
}

/** A file belonging to the interface, or one of the shared modules it imports. */
async function serveStatic(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';

  const sharedPrefix = 'shared/';
  const [root, target] = relative.startsWith(sharedPrefix)
    ? [sharedRoot, path.resolve(sharedRoot, relative.slice(sharedPrefix.length))]
    : [rendererRoot, path.resolve(rendererRoot, relative)];

  // Refuse anything that climbs out of the directory it was resolved against.
  if (!within(root, target)) return new Response('Forbidden', { status: 403 });

  return serveFile(target, null);
}

async function handle(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });

  const trackPrefix = '/track/';
  if (url.pathname.startsWith(trackPrefix)) {
    return serveTrack(url.pathname.slice(trackPrefix.length), request.headers.get('Range'));
  }

  return serveStatic(url.pathname);
}

/** Must be called after the app is ready. */
export function installAppProtocol() {
  protocol.handle(APP_SCHEME, handle);
}
