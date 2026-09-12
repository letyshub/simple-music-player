import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defaultStore, normalizeStore } from '../shared/store-schema.js';

/**
 * The library file.
 *
 * Held in memory for the life of the app and flushed to disk on a short delay,
 * because settings like the volume slider or an equaliser drag change dozens of
 * times a second and each one must not cost a file write. Writes go to a
 * temporary file first and are then renamed over the real one, so a crash
 * mid-write leaves the previous library intact rather than a truncated file.
 */

const WRITE_DELAY_MS = 400;

let state = defaultStore();
let storePath = null;
let flushTimer = null;
let pendingWrite = Promise.resolve();

function filePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), 'library.json');
  return storePath;
}

export async function loadStore() {
  try {
    const raw = await fs.readFile(filePath(), 'utf8');
    state = normalizeStore(JSON.parse(raw));
  } catch (error) {
    // A missing file is the normal first run. Anything else means the file is
    // unreadable or corrupt; starting from defaults beats refusing to launch.
    if (error.code !== 'ENOENT') {
      console.error('[store] nie udalo sie wczytac biblioteki, startuje od zera:', error.message);
    }
    state = defaultStore();
  }
  return state;
}

export function getStore() {
  return state;
}

/** Replace part of the store and schedule a save. */
export function updateStore(patch) {
  state = { ...state, ...patch };
  scheduleFlush();
  return state;
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; void flushStore(); }, WRITE_DELAY_MS);
}

/** Write the library to disk now. Serialised so two flushes cannot interleave. */
export function flushStore() {
  const snapshot = JSON.stringify(state, null, 2);
  pendingWrite = pendingWrite.then(async () => {
    const target = filePath();
    const temp = `${target}.tmp`;
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(temp, snapshot, 'utf8');
      await fs.rename(temp, target);
    } catch (error) {
      console.error('[store] zapis biblioteki nie powiodl sie:', error.message);
    }
  });
  return pendingWrite;
}

/** Called on quit so nothing waiting on the debounce timer is lost. */
export async function flushStoreNow() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  await flushStore();
}

/** True when the path belongs to a track we know about; used to gate file access. */
export function isKnownTrackPath(candidate) {
  const needle = String(candidate).replace(/\\/g, '/').toLowerCase();
  return Object.values(state.tracks).some(
    (track) => track.path.replace(/\\/g, '/').toLowerCase() === needle,
  );
}
