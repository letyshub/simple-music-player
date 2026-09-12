/**
 * What plays next.
 *
 * Kept free of any audio or DOM reference so the awkward cases — repeat-one
 * versus a deliberate press of NEXT, running off either end of the queue —
 * can be pinned down in tests.
 */

export const REPEAT_MODES = ['off', 'all', 'one'];

/** Returned as the new position when playback should simply stop. */
export const STOP = -1;

/**
 * The order in which queue slots get played.
 *
 * Sequential play is just 0..n-1. Shuffle keeps the track the user picked at
 * the front and shuffles everything after it, so pressing play on a song
 * starts with that song rather than jumping somewhere else.
 */
export function makeOrder(count, shuffle, startIndex = 0, rng = Math.random) {
  const indices = Array.from({ length: count }, (_, i) => i);
  if (!shuffle || count < 2) return indices;

  const start = startIndex >= 0 && startIndex < count ? startIndex : 0;
  const rest = indices.filter((i) => i !== start);
  // Fisher-Yates over the remainder.
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [start, ...rest];
}

/**
 * Advance the play position.
 *
 * `auto` marks the move as caused by a track finishing rather than by a button
 * press. That is the only difference repeat-one cares about: a finished track
 * repeats, but NEXT still moves on, which is what the hardware always did.
 */
export function step({ orderLength, pos, direction, repeat, auto }) {
  if (!orderLength || orderLength < 1) return { pos: STOP, restart: false };

  if (auto && repeat === 'one') return { pos, restart: true };

  const next = pos + direction;

  if (next >= orderLength) {
    return repeat === 'all'
      ? { pos: 0, restart: false }
      : { pos: STOP, restart: false };
  }

  if (next < 0) {
    // Stepping back from the first track holds there rather than stopping.
    return repeat === 'all'
      ? { pos: orderLength - 1, restart: false }
      : { pos: 0, restart: false };
  }

  return { pos: next, restart: false };
}
