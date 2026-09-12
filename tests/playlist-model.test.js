import { describe, it, expect } from 'vitest';
import {
  createPlaylist, addTracks, removeTrack, moveTrack, renamePlaylist,
  toggleFavorite, isFavorite, uniqueName,
} from '../src/shared/playlist-model.js';

describe('createPlaylist', () => {
  it('starts empty with the given name and an id', () => {
    const p = createPlaylist('Do biegania');
    expect(p.name).toBe('Do biegania');
    expect(p.trackIds).toEqual([]);
    expect(p.id).toBeTruthy();
    expect(typeof p.createdAt).toBe('number');
  });

  it('falls back to a default name when given blank input', () => {
    expect(createPlaylist('   ').name).toBe('Nowa playlista');
  });
});

describe('addTracks', () => {
  it('appends in order without mutating the original', () => {
    const p = createPlaylist('x');
    const next = addTracks(p, ['a', 'b']);
    expect(next.trackIds).toEqual(['a', 'b']);
    expect(p.trackIds).toEqual([]);
  });

  it('ignores tracks already on the playlist', () => {
    const p = addTracks(createPlaylist('x'), ['a', 'b']);
    expect(addTracks(p, ['b', 'c']).trackIds).toEqual(['a', 'b', 'c']);
  });

  it('de-duplicates within a single call', () => {
    expect(addTracks(createPlaylist('x'), ['a', 'a']).trackIds).toEqual(['a']);
  });
});

describe('removeTrack', () => {
  it('drops every occurrence and leaves the rest in order', () => {
    const p = addTracks(createPlaylist('x'), ['a', 'b', 'c']);
    expect(removeTrack(p, 'b').trackIds).toEqual(['a', 'c']);
  });

  it('is a no-op for an unknown track', () => {
    const p = addTracks(createPlaylist('x'), ['a']);
    expect(removeTrack(p, 'zzz').trackIds).toEqual(['a']);
  });
});

describe('moveTrack', () => {
  const p = addTracks(createPlaylist('x'), ['a', 'b', 'c', 'd']);

  it('moves an item down the list', () => {
    expect(moveTrack(p, 0, 2).trackIds).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item up the list', () => {
    expect(moveTrack(p, 3, 1).trackIds).toEqual(['a', 'd', 'b', 'c']);
  });

  it('ignores out-of-range indices', () => {
    expect(moveTrack(p, 9, 0).trackIds).toEqual(['a', 'b', 'c', 'd']);
    expect(moveTrack(p, 0, -3).trackIds).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('renamePlaylist', () => {
  it('trims the new name', () => {
    expect(renamePlaylist(createPlaylist('x'), '  Chill  ').name).toBe('Chill');
  });

  it('keeps the old name when the new one is blank', () => {
    expect(renamePlaylist(createPlaylist('Stara'), '  ').name).toBe('Stara');
  });
});

describe('favourites', () => {
  it('adds on first toggle and removes on the second', () => {
    const once = toggleFavorite([], 'a');
    expect(once).toEqual(['a']);
    expect(toggleFavorite(once, 'a')).toEqual([]);
  });

  it('does not mutate the input list', () => {
    const favs = ['a'];
    toggleFavorite(favs, 'b');
    expect(favs).toEqual(['a']);
  });

  it('reports membership', () => {
    expect(isFavorite(['a', 'b'], 'b')).toBe(true);
    expect(isFavorite(['a'], 'b')).toBe(false);
    expect(isFavorite(null, 'b')).toBe(false);
  });
});

describe('uniqueName', () => {
  it('returns the base name when it is free', () => {
    expect(uniqueName(['A'], 'B')).toBe('B');
  });

  it('appends a counter when the name is taken', () => {
    expect(uniqueName(['Nowa playlista'], 'Nowa playlista')).toBe('Nowa playlista 2');
    expect(uniqueName(['Mix', 'Mix 2'], 'Mix')).toBe('Mix 3');
  });
});
