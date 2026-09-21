import { UNKNOWN_ARTIST } from './store-schema.js';

/**
 * Naming for files copied onto a device.
 *
 * Pure string work, kept away from the copying itself so the fiddly part -
 * what a name may contain on a FAT32 stick plugged into a car stereo - can be
 * tested without touching a disk.
 *
 * Every name starts with the track's position on the list, because hardware
 * players sort alphabetically and have no idea what a playlist is. That prefix
 * also makes every name in one export unique, so there is no collision to
 * resolve: two copies of the same track still land on different numbers.
 */

/** Characters Windows refuses in a file name, plus control codes. */
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Device names MS-DOS claimed and Windows still will not hand out. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** FAT32 and exFAT both stop here, and it is well under the NTFS limit. */
const MAX_NAME_LENGTH = 255;

const FALLBACK = 'Bez nazwy';

/** True when something readable survived the cleaning, rather than just punctuation. */
function hasWords(text) {
  return /[\p{L}\p{N}]/u.test(text);
}

/** Strip a string down to what a file name may contain. May return ''. */
function clean(text) {
  const trimmed = String(text ?? '')
    .replace(FORBIDDEN, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  return hasWords(trimmed) ? trimmed : '';
}

/** '.mp3' from 'D:\music\song.mp3'. Case is left alone - nothing is transcoded. */
function extensionOf(filePath) {
  const base = String(filePath).split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

/** Cut a name down to the length limit without losing its extension. */
function fitLength(stem, extension) {
  const room = MAX_NAME_LENGTH - extension.length;
  if (stem.length <= room) return `${stem}${extension}`;
  const cut = stem.slice(0, room).replace(/[\s.]+$/, '');
  return `${cut}${extension}`;
}

/**
 * Names for a list of tracks, in the order they will be copied.
 *
 * @param {Array<{path: string, title: string, artist: string}>} tracks
 * @returns {Array<{path: string, name: string}>}
 */
export function exportFileNames(tracks) {
  const list = [...tracks];
  // Two digits at minimum: "01" sorts and reads better than "1", and a list
  // that grows past nine keeps the same shape.
  const width = Math.max(2, String(list.length).length);

  return list.map((track, index) => {
    const number = String(index + 1).padStart(width, '0');
    // An untagged track already carries the file name as its title, so
    // repeating "Nieznany wykonawca" on every file would only add noise.
    const artist = track.artist === UNKNOWN_ARTIST ? '' : clean(track.artist);
    const title = clean(track.title) || FALLBACK;
    const stem = [number, artist, title].filter(Boolean).join(' - ');

    return { path: track.path, name: fitLength(stem, extensionOf(track.path)) };
  });
}

/** Folder name for one export: the playlist's own name, made safe. */
export function exportFolderName(name) {
  const cleaned = clean(name);
  if (!cleaned) return FALLBACK;
  const fitted = fitLength(cleaned, '');
  return RESERVED.test(fitted) ? `${fitted}_` : fitted;
}
