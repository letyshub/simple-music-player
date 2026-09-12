import { describe, it, expect } from 'vitest';
import { AUDIO_EXTENSIONS, isAudioFile, compareByPath } from '../src/shared/audio-files.js';

describe('isAudioFile', () => {
  it('accepts mp3 regardless of case', () => {
    expect(isAudioFile('song.mp3')).toBe(true);
    expect(isAudioFile('SONG.MP3')).toBe(true);
    expect(isAudioFile('C:\\Muzyka\\Kult\\Arahja.Mp3')).toBe(true);
  });

  it('accepts the other formats we advertise', () => {
    for (const ext of AUDIO_EXTENSIONS) {
      expect(isAudioFile(`track${ext}`)).toBe(true);
    }
  });

  it('rejects non-audio and extensionless files', () => {
    expect(isAudioFile('cover.jpg')).toBe(false);
    expect(isAudioFile('notes.txt')).toBe(false);
    expect(isAudioFile('README')).toBe(false);
    expect(isAudioFile('')).toBe(false);
  });

  it('rejects a directory that merely ends in mp3-like text', () => {
    expect(isAudioFile('mp3')).toBe(false);
  });

  it('survives non-string input', () => {
    expect(isAudioFile(null)).toBe(false);
    expect(isAudioFile(undefined)).toBe(false);
    expect(isAudioFile(42)).toBe(false);
  });
});

describe('compareByPath', () => {
  it('orders track numbers numerically, not lexically', () => {
    const files = ['10 - Ten.mp3', '2 - Two.mp3', '1 - One.mp3'];
    expect([...files].sort(compareByPath)).toEqual([
      '1 - One.mp3', '2 - Two.mp3', '10 - Ten.mp3',
    ]);
  });

  it('is case-insensitive', () => {
    expect([...['b.mp3', 'A.mp3']].sort(compareByPath)).toEqual(['A.mp3', 'b.mp3']);
  });
});
