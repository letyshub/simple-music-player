import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isAudioFile, compareByPath } from '../shared/audio-files.js';
import { trackId } from '../shared/track-id.js';
import { normalizeTrack } from '../shared/store-schema.js';

/**
 * Turning a folder on disk into track records.
 *
 * Two stages, because they fail differently: walking the tree is quick and
 * mostly hits permission errors, while reading ID3 tags is slow and hits
 * malformed files. Neither is allowed to abort the whole scan - a folder with
 * one unreadable file should still import the other nine hundred.
 */

/** How many files have their tags read at once. Enough to keep the disk busy
 *  without opening hundreds of handles on a folder of thousands of tracks. */
const METADATA_CONCURRENCY = 8;

/** Recursively collect audio file paths, skipping anything we cannot read. */
export async function findAudioFiles(root) {
  const found = [];
  const seen = new Set();

  async function walk(dir) {
    // Guard against a symlink loop pointing a folder back at its own parent.
    let real;
    try {
      real = await fs.realpath(dir);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      console.warn('[library] pomijam folder', dir, error.message);
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        found.push(full);
      }
    }
  }

  await walk(root);
  found.sort(compareByPath);
  return found;
}

/** Read one file's tags. Never throws: an unreadable tag just means fewer details. */
async function readMetadata(filePath) {
  try {
    const { parseFile } = await import('music-metadata');
    const meta = await parseFile(filePath, { duration: true, skipCovers: true });
    return {
      title: meta.common?.title ?? '',
      artist: meta.common?.artist ?? meta.common?.albumartist ?? '',
      album: meta.common?.album ?? '',
      duration: Math.round(meta.format?.duration ?? 0),
    };
  } catch {
    return { title: '', artist: '', album: '', duration: 0 };
  }
}

/**
 * Build track records for a list of files, reading tags a few at a time.
 * `onProgress` is called as files complete so the window can show a counter.
 */
export async function buildTracks(files, onProgress) {
  const tracks = [];
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const filePath = files[index];
      const meta = await readMetadata(filePath);
      tracks.push(normalizeTrack({
        id: trackId(filePath),
        path: filePath,
        ...meta,
        addedAt: Date.now(),
      }));
      done += 1;
      onProgress?.(done, files.length);
    }
  }

  const workers = Array.from(
    { length: Math.min(METADATA_CONCURRENCY, files.length) },
    () => worker(),
  );
  await Promise.all(workers);

  tracks.sort((a, b) => compareByPath(a.path, b.path));
  return tracks;
}

/** Scan a folder end to end. */
export async function scanFolder(root, onProgress) {
  const files = await findAudioFiles(root);
  return buildTracks(files, onProgress);
}

/** Build records for individually chosen files. */
export async function scanFiles(filePaths, onProgress) {
  const audio = filePaths.filter((f) => isAudioFile(f)).sort(compareByPath);
  return buildTracks(audio, onProgress);
}
