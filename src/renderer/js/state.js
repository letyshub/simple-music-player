import { compareByPath } from '../../shared/audio-files.js';
import {
  createPlaylist as makePlaylist, addTracks, removeTrack, moveTrack,
  renamePlaylist as rename, toggleFavorite as toggleFav, uniqueName,
} from '../../shared/playlist-model.js';

/**
 * The renderer's copy of the library, plus what the window is currently
 * showing. Every mutation goes through here so there is exactly one place
 * that talks to the main process and exactly one place that announces change.
 */

const listeners = new Map();

export const state = {
  store: null,
  /** kind: 'library' | 'favorites' | 'playlist' | 'folder' */
  view: { kind: 'library', id: null },
  search: '',
  selection: new Set(),
};

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  for (const handler of listeners.get(event) ?? []) handler(payload);
}

export async function initState() {
  state.store = await window.api.loadStore();
}

/** Adopt a store returned by the main process after a scan or a removal. */
export function setStore(store) {
  state.store = store;
  emit('library');
}

/* ---------------------------------------------------------------- reading */

export function trackById(id) {
  return state.store.tracks[id] ?? null;
}

function byArtistThenPath(a, b) {
  const artist = a.artist.localeCompare(b.artist, 'pl');
  if (artist !== 0) return artist;
  const album = a.album.localeCompare(b.album, 'pl');
  if (album !== 0) return album;
  return compareByPath(a.path, b.path);
}

export function allTracks() {
  return Object.values(state.store.tracks).sort(byArtistThenPath);
}

export function playlistById(id) {
  return state.store.playlists.find((p) => p.id === id) ?? null;
}

function tracksInFolder(folder) {
  const prefix = `${folder.replace(/\\/g, '/').toLowerCase()}/`;
  return Object.values(state.store.tracks)
    .filter((t) => t.path.replace(/\\/g, '/').toLowerCase().startsWith(prefix))
    .sort((a, b) => compareByPath(a.path, b.path));
}

/** Fold case and Polish diacritics so "zolw" finds "Żółw". */
function fold(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip combining accents
    .replace(/ł/gi, 'l')             // NFD leaves Polish l-with-stroke alone
    .toLowerCase();
}

function matchesSearch(track, needle) {
  return fold(track.title).includes(needle)
    || fold(track.artist).includes(needle)
    || fold(track.album).includes(needle);
}

/** The tracks the main pane should show right now, in display order. */
export function tracksForView() {
  const { kind, id } = state.view;
  let list;

  if (kind === 'favorites') {
    list = state.store.favorites.map(trackById).filter(Boolean);
  } else if (kind === 'playlist') {
    const playlist = playlistById(id);
    list = playlist ? playlist.trackIds.map(trackById).filter(Boolean) : [];
  } else if (kind === 'folder') {
    list = tracksInFolder(id);
  } else {
    list = allTracks();
  }

  const needle = fold(state.search.trim());
  return needle ? list.filter((t) => matchesSearch(t, needle)) : list;
}

export function isFavorite(id) {
  return state.store.favorites.includes(id);
}

/* --------------------------------------------------------------- mutation */

let settingsTimer = null;
let pendingSettings = null;

/**
 * Store a settings change. Dragging a fader fires continuously, so the write
 * is coalesced rather than sent to the main process on every pixel.
 */
export function saveSettings(patch) {
  state.store.settings = { ...state.store.settings, ...patch };
  pendingSettings = state.store.settings;
  emit('settings', state.store.settings);

  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(async () => {
    settingsTimer = null;
    const saved = await window.api.saveSettings(pendingSettings);
    state.store.settings = saved;
  }, 250);
}

export async function toggleFavorite(id) {
  state.store.favorites = toggleFav(state.store.favorites, id);
  emit('favorites', id);
  emit('library');
  state.store.favorites = await window.api.saveFavorites(state.store.favorites);
}

async function persistPlaylists() {
  emit('library');
  state.store.playlists = await window.api.savePlaylists(state.store.playlists);
}

export async function createPlaylist(name) {
  const finalName = uniqueName(state.store.playlists.map((p) => p.name), name);
  const playlist = makePlaylist(finalName);
  state.store.playlists = [...state.store.playlists, playlist];
  await persistPlaylists();
  return playlist;
}

export async function deletePlaylist(id) {
  state.store.playlists = state.store.playlists.filter((p) => p.id !== id);
  if (state.view.kind === 'playlist' && state.view.id === id) {
    setView({ kind: 'library', id: null });
  }
  await persistPlaylists();
}

export async function renamePlaylistById(id, name) {
  state.store.playlists = state.store.playlists.map((p) => (p.id === id ? rename(p, name) : p));
  await persistPlaylists();
}

export async function addToPlaylist(playlistId, trackIds) {
  let added = 0;
  state.store.playlists = state.store.playlists.map((p) => {
    if (p.id !== playlistId) return p;
    const next = addTracks(p, trackIds);
    added = next.trackIds.length - p.trackIds.length;
    return next;
  });
  await persistPlaylists();
  return added;
}

export async function removeFromPlaylist(playlistId, trackId) {
  state.store.playlists = state.store.playlists.map(
    (p) => (p.id === playlistId ? removeTrack(p, trackId) : p),
  );
  await persistPlaylists();
}

export async function reorderPlaylist(playlistId, from, to) {
  state.store.playlists = state.store.playlists.map(
    (p) => (p.id === playlistId ? moveTrack(p, from, to) : p),
  );
  await persistPlaylists();
}

/* ------------------------------------------------------------------- view */

export function setView(view) {
  state.view = view;
  state.selection.clear();
  emit('view');
}

export function setSearch(text) {
  state.search = text;
  emit('search');
}
