/**
 * Rules for selecting several tracks at once. Kept apart from the DOM so the
 * track list only has to decide which rows to paint.
 */

/** The ids between two positions in the list, inclusive, whichever comes first. */
export function rangeIds(orderedIds, from, to) {
  if (!orderedIds.length) return [];
  const clamp = (n) => Math.min(Math.max(0, n), orderedIds.length - 1);
  const [start, end] = [clamp(from), clamp(to)].sort((a, b) => a - b);
  return orderedIds.slice(start, end + 1);
}

/**
 * How much of what is on screen is selected: 'none', 'some' or 'all'.
 * Selected tracks hidden by a search do not count either way.
 */
export function selectionCoverage(visibleIds, selected) {
  const picked = visibleIds.filter((id) => selected.has(id)).length;
  if (picked === 0) return 'none';
  return picked === visibleIds.length ? 'all' : 'some';
}
