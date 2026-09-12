import { createHash } from 'node:crypto';

/**
 * A stable identifier for a file on disk.
 *
 * Derived from the path rather than from a counter, so that re-scanning a
 * folder produces the same ids and the user's favourites and playlists keep
 * pointing at the right tracks. Windows paths are case-insensitive and accept
 * either slash, so both are normalised away first.
 */
export function trackId(absolutePath) {
  const normalized = String(absolutePath).replace(/\\/g, '/').toLowerCase();
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}
