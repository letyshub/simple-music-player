import { describe, it, expect } from 'vitest';
import { defaultStore, normalizeStore, normalizeTrack, DEFAULT_SETTINGS } from '../src/shared/store-schema.js';

describe('defaultStore', () => {
  it('is a complete, empty library', () => {
    const s = defaultStore();
    expect(s.version).toBe(1);
    expect(s.tracks).toEqual({});
    expect(s.favorites).toEqual([]);
    expect(s.playlists).toEqual([]);
    expect(s.folders).toEqual([]);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('hands out a fresh object each time', () => {
    const a = defaultStore();
    a.favorites.push('x');
    expect(defaultStore().favorites).toEqual([]);
  });
});

describe('normalizeStore', () => {
  it('rebuilds a default store from junk input', () => {
    for (const junk of [null, undefined, 42, 'broken', []]) {
      expect(normalizeStore(junk)).toEqual(defaultStore());
    }
  });

  it('fills in missing sections', () => {
    const s = normalizeStore({ favorites: ['a'] });
    expect(s.playlists).toEqual([]);
    expect(s.settings.volume).toBe(DEFAULT_SETTINGS.volume);
  });

  it('drops favourites and playlist entries pointing at unknown tracks', () => {
    const s = normalizeStore({
      tracks: { a: { id: 'a', path: 'C:\\a.mp3' } },
      favorites: ['a', 'ghost'],
      playlists: [{ id: 'p', name: 'P', trackIds: ['a', 'ghost'] }],
    });
    expect(s.favorites).toEqual(['a']);
    expect(s.playlists[0].trackIds).toEqual(['a']);
  });

  it('discards track records with no path', () => {
    const s = normalizeStore({ tracks: { a: { id: 'a' }, b: { id: 'b', path: 'C:\\b.mp3' } } });
    expect(Object.keys(s.tracks)).toEqual(['b']);
  });

  it('clamps a corrupted volume and equaliser curve back into range', () => {
    const s = normalizeStore({ settings: { volume: 99, eqGains: [50, -50] } });
    expect(s.settings.volume).toBe(1);
    expect(s.settings.eqGains).toEqual([12, -12, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('resets an unknown repeat mode', () => {
    expect(normalizeStore({ settings: { repeat: 'sometimes' } }).settings.repeat).toBe('off');
  });

  it('keeps playlists without a name usable', () => {
    const s = normalizeStore({ playlists: [{ id: 'p', trackIds: [] }] });
    expect(s.playlists[0].name).toBeTruthy();
  });
});

describe('normalizeTrack', () => {
  it('falls back to the file name when there is no title tag', () => {
    const t = normalizeTrack({ id: 'a', path: 'C:\\Muzyka\\Arahja.mp3' });
    expect(t.title).toBe('Arahja');
  });

  it('keeps a real title tag', () => {
    const t = normalizeTrack({ id: 'a', path: 'C:\\x.mp3', title: 'Arahja' });
    expect(t.title).toBe('Arahja');
  });

  it('defaults unknown artist and album', () => {
    const t = normalizeTrack({ id: 'a', path: 'C:\\x.mp3' });
    expect(t.artist).toBe('Nieznany wykonawca');
    expect(t.album).toBe('');
    expect(t.duration).toBe(0);
  });
});
