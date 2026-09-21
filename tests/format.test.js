import { describe, it, expect } from 'vitest';
import { formatBytes, fileCount } from '../src/renderer/js/util/format.js';

describe('formatBytes', () => {
  it('shows plain bytes for tiny sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('steps up through the units', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(312 * 1024 ** 2)).toBe('312 MB');
    expect(formatBytes(4 * 1024 ** 3)).toBe('4 GB');
  });

  it('keeps one decimal below ten, with a Polish comma', () => {
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(Math.round(1.8 * 1024 ** 3))).toBe('1,8 GB');
  });

  it('drops the decimal once the number is big enough to carry itself', () => {
    expect(formatBytes(Math.round(48.4 * 1024 ** 2))).toBe('48 MB');
  });

  it('treats junk as nothing', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('fileCount', () => {
  it('uses the three Polish forms', () => {
    expect(fileCount(1)).toBe('1 plik');
    expect(fileCount(2)).toBe('2 pliki');
    expect(fileCount(5)).toBe('5 plików');
    expect(fileCount(22)).toBe('22 pliki');
    expect(fileCount(0)).toBe('0 plików');
  });
});
