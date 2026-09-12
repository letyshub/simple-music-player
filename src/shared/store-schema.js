import { normalizeGains, matchPreset } from './eq-presets.js';
import { REPEAT_MODES } from './queue-logic.js';

/**
 * Shape of the on-disk library file, plus the repair pass that runs on every
 * load. The store is a plain JSON file the user could edit or half-write during
 * a power cut, so nothing here trusts its input: anything unrecognised is
 * replaced with a sane default rather than allowed to crash the app.
 */

export const STORE_VERSION = 1;

export const DEFAULT_SETTINGS = {
  volume: 0.8,
  muted: false,
  eqEnabled: true,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  eqPreset: 'flat',
  preamp: 0,
  repeat: 'off',
  shuffle: false,
  lastTrackId: null,
};

export const UNKNOWN_ARTIST = 'Nieznany wykonawca';

export function defaultStore() {
  return {
    version: STORE_VERSION,
    tracks: {},
    favorites: [],
    playlists: [],
    folders: [],
    settings: { ...DEFAULT_SETTINGS, eqGains: [...DEFAULT_SETTINGS.eqGains] },
  };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function baseName(filePath) {
  const parts = String(filePath).split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

function stripExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function clamp(n, lo, hi, fallback) {
  const value = Number(n);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(hi, Math.max(lo, value));
}

/** Fill in a track record, using the file name when the ID3 title is missing. */
export function normalizeTrack(raw) {
  if (!isPlainObject(raw) || !raw.path) return null;
  const path = String(raw.path);
  const title = typeof raw.title === 'string' && raw.title.trim()
    ? raw.title.trim()
    : stripExtension(baseName(path));

  return {
    id: String(raw.id ?? ''),
    path,
    title,
    artist: typeof raw.artist === 'string' && raw.artist.trim() ? raw.artist.trim() : UNKNOWN_ARTIST,
    album: typeof raw.album === 'string' ? raw.album.trim() : '',
    duration: clamp(raw.duration, 0, Number.MAX_SAFE_INTEGER, 0),
    addedAt: clamp(raw.addedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  };
}

function normalizeSettings(raw) {
  const input = isPlainObject(raw) ? raw : {};
  const eqGains = normalizeGains(input.eqGains);
  // A stored preset name is only believable if the curve still matches it.
  const detected = matchPreset(eqGains);

  return {
    volume: clamp(input.volume, 0, 1, DEFAULT_SETTINGS.volume),
    muted: Boolean(input.muted),
    eqEnabled: input.eqEnabled === undefined ? DEFAULT_SETTINGS.eqEnabled : Boolean(input.eqEnabled),
    eqGains,
    eqPreset: detected,
    preamp: clamp(input.preamp, -12, 12, 0),
    repeat: REPEAT_MODES.includes(input.repeat) ? input.repeat : 'off',
    shuffle: Boolean(input.shuffle),
    lastTrackId: typeof input.lastTrackId === 'string' ? input.lastTrackId : null,
  };
}

/**
 * Repair a store loaded from disk.
 *
 * Besides filling in defaults this drops references to tracks that no longer
 * exist, so a playlist can never point at a track the library has forgotten.
 */
export function normalizeStore(raw) {
  if (!isPlainObject(raw)) return defaultStore();

  const tracks = {};
  if (isPlainObject(raw.tracks)) {
    for (const [id, value] of Object.entries(raw.tracks)) {
      const track = normalizeTrack(value);
      if (track) tracks[id] = { ...track, id };
    }
  }
  const known = new Set(Object.keys(tracks));

  const favorites = (Array.isArray(raw.favorites) ? raw.favorites : [])
    .filter((id) => known.has(id));

  const playlists = (Array.isArray(raw.playlists) ? raw.playlists : [])
    .filter(isPlainObject)
    .map((p, index) => ({
      id: String(p.id ?? `pl_restored_${index}`),
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Playlista ${index + 1}`,
      trackIds: (Array.isArray(p.trackIds) ? p.trackIds : []).filter((id) => known.has(id)),
      createdAt: clamp(p.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    }));

  const folders = (Array.isArray(raw.folders) ? raw.folders : [])
    .filter((f) => typeof f === 'string' && f.length > 0);

  return {
    version: STORE_VERSION,
    tracks,
    favorites,
    playlists,
    folders,
    settings: normalizeSettings(raw.settings),
  };
}
