import { describe, it, expect } from 'vitest';
import { trackId } from '../src/shared/track-id.js';

describe('trackId', () => {
  it('is stable for the same path', () => {
    expect(trackId('C:\\Muzyka\\a.mp3')).toBe(trackId('C:\\Muzyka\\a.mp3'));
  });

  it('ignores case and slash direction, so a rescan keeps favourites', () => {
    expect(trackId('C:\\Muzyka\\A.mp3')).toBe(trackId('c:/muzyka/a.mp3'));
  });

  it('differs between different paths', () => {
    expect(trackId('C:\\a.mp3')).not.toBe(trackId('C:\\b.mp3'));
  });

  it('returns a short hex string', () => {
    expect(trackId('C:\\a.mp3')).toMatch(/^[0-9a-f]{16}$/);
  });
});
