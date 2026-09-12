/**
 * Playlist and favourites operations.
 *
 * Every function returns a new object instead of editing the one it was given,
 * which keeps the renderer's change detection honest and makes these easy to
 * test in isolation.
 */

const DEFAULT_PLAYLIST_NAME = 'Nowa playlista';

let counter = 0;

function newId() {
  counter += 1;
  return `pl_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createPlaylist(name, id = newId()) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return {
    id,
    name: trimmed || DEFAULT_PLAYLIST_NAME,
    trackIds: [],
    createdAt: Date.now(),
  };
}

/** Append tracks that are not on the playlist yet, preserving the given order. */
export function addTracks(playlist, trackIds) {
  const existing = new Set(playlist.trackIds);
  const additions = [];
  for (const id of trackIds ?? []) {
    if (!id || existing.has(id)) continue;
    existing.add(id);
    additions.push(id);
  }
  return { ...playlist, trackIds: [...playlist.trackIds, ...additions] };
}

export function removeTrack(playlist, trackId) {
  return { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId) };
}

/** Drag-and-drop reordering. Out-of-range indices leave the list untouched. */
export function moveTrack(playlist, from, to) {
  const list = playlist.trackIds;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return { ...playlist };
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return { ...playlist };

  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...playlist, trackIds: next };
}

export function renamePlaylist(playlist, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return { ...playlist, name: trimmed || playlist.name };
}

/** Favourite on, favourite off. */
export function toggleFavorite(favorites, trackId) {
  const list = Array.isArray(favorites) ? favorites : [];
  return list.includes(trackId)
    ? list.filter((id) => id !== trackId)
    : [...list, trackId];
}

export function isFavorite(favorites, trackId) {
  return Array.isArray(favorites) && favorites.includes(trackId);
}

/** "Mix" becomes "Mix 2" when "Mix" is taken, and so on. */
export function uniqueName(existingNames, base) {
  const taken = new Set(existingNames ?? []);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
