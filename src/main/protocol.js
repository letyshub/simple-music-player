import { protocol } from 'electron';
import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { isKnownTrackPath } from './store.js';

/**
 * Serving audio files to the renderer.
 *
 * The renderer has no file system access, so audio arrives over a custom
 * `track://` scheme instead of `file://`. Two details matter:
 *
 *  - Range requests are answered properly, otherwise dragging the seek bar
 *    would restart the song instead of jumping.
 *  - The response carries an Access-Control-Allow-Origin header and the audio
 *    element sets crossOrigin, otherwise the media node counts as cross-origin,
 *    the Web Audio graph is muted for security, and the spectrum analyser
 *    would sit at zero while the music plays.
 */

export const TRACK_SCHEME = 'track';

const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wma': 'audio/x-ms-wma',
};

/** Must be called before the app is ready. */
export function registerTrackScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: TRACK_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false },
  }]);
}

/** Build the URL the renderer puts in an audio element's src. */
export function trackUrl(filePath) {
  return `${TRACK_SCHEME}://file/${encodeURIComponent(filePath)}`;
}

function pathFromUrl(rawUrl) {
  const { pathname } = new URL(rawUrl);
  return decodeURIComponent(pathname.replace(/^\//, ''));
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

async function handle(request) {
  let filePath;
  try {
    filePath = pathFromUrl(request.url);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // The renderer is our own code, but this keeps a bug in it from turning the
  // scheme into a way to read arbitrary files off the disk.
  if (!isKnownTrackPath(filePath)) {
    return new Response('Not in library', { status: 403 });
  }

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const headers = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  };

  const range = parseRange(request.headers.get('Range'), stat.size);

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

/** Must be called after the app is ready. */
export function installTrackProtocol() {
  protocol.handle(TRACK_SCHEME, handle);
}
