import { describe, it, expect } from 'vitest';
import { exportFileNames, exportFolderName } from '../src/shared/export-names.js';
import { UNKNOWN_ARTIST } from '../src/shared/store-schema.js';

const track = (over = {}) => ({
  path: 'D:\\Muzyka\\utwor.mp3',
  title: 'Tytul',
  artist: 'Wykonawca',
  ...over,
});

describe('exportFileNames', () => {
  it('numbers tracks in list order so an alphabetical player keeps the order', () => {
    const names = exportFileNames([
      track({ title: 'One', artist: 'Metallica' }),
      track({ title: 'Time', artist: 'Pink Floyd' }),
    ]).map((entry) => entry.name);

    expect(names).toEqual([
      '01 - Metallica - One.mp3',
      '02 - Pink Floyd - Time.mp3',
    ]);
  });

  it('pads the number to the width of the largest position', () => {
    const many = Array.from({ length: 100 }, (_, i) => track({ title: `T${i}` }));
    const names = exportFileNames(many).map((entry) => entry.name);

    expect(names[0]).toBe('001 - Wykonawca - T0.mp3');
    expect(names[99]).toBe('100 - Wykonawca - T99.mp3');
  });

  it('keeps the source path alongside the new name', () => {
    expect(exportFileNames([track({ path: 'E:\\a\\b.flac' })])).toEqual([
      { path: 'E:\\a\\b.flac', name: '01 - Wykonawca - Tytul.flac' },
    ]);
  });

  it('keeps the original extension, because nothing is transcoded', () => {
    const names = exportFileNames([
      track({ path: 'D:\\a.flac' }),
      track({ path: 'D:\\b.OGG' }),
    ]).map((entry) => entry.name);

    expect(names[0].endsWith('.flac')).toBe(true);
    expect(names[1].endsWith('.OGG')).toBe(true);
  });

  it('replaces characters Windows forbids in a file name', () => {
    const [entry] = exportFileNames([track({ artist: 'AC/DC', title: 'Who: What?' })]);
    expect(entry.name).toBe('01 - AC-DC - Who- What-.mp3');
  });

  it('collapses whitespace and strips trailing dots and spaces', () => {
    const [entry] = exportFileNames([track({ title: 'Koniec ...  ' })]);
    expect(entry.name).toBe('01 - Wykonawca - Koniec.mp3');
  });

  it('leaves the artist out when the tag was missing', () => {
    const [entry] = exportFileNames([track({ artist: UNKNOWN_ARTIST, title: 'Bez tagu' })]);
    expect(entry.name).toBe('01 - Bez tagu.mp3');
  });

  it('trims a long name to the FAT32 limit, keeping number and extension', () => {
    const [entry] = exportFileNames([track({ title: 'x'.repeat(400) })]);

    expect(entry.name.length).toBeLessThanOrEqual(255);
    expect(entry.name.startsWith('01 - Wykonawca - ')).toBe(true);
    expect(entry.name.endsWith('.mp3')).toBe(true);
  });

  it('falls back to a placeholder when nothing usable is left', () => {
    const [entry] = exportFileNames([track({ artist: UNKNOWN_ARTIST, title: '???' })]);
    expect(entry.name).toBe('01 - Bez nazwy.mp3');
  });

  it('handles an empty list', () => {
    expect(exportFileNames([])).toEqual([]);
  });
});

describe('exportFolderName', () => {
  it('keeps an ordinary playlist name', () => {
    expect(exportFolderName('Na rower')).toBe('Na rower');
  });

  it('strips characters a folder cannot contain', () => {
    expect(exportFolderName('Rock/Metal: 90*')).toBe('Rock-Metal- 90-');
  });

  it('escapes names Windows reserves for devices', () => {
    expect(exportFolderName('CON')).toBe('CON_');
    expect(exportFolderName('com1')).toBe('com1_');
    expect(exportFolderName('Concert')).toBe('Concert');
  });

  it('falls back when the name is blank or unusable', () => {
    expect(exportFolderName('   ')).toBe('Bez nazwy');
    expect(exportFolderName('***')).toBe('Bez nazwy');
  });
});
