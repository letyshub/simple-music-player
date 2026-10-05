import { describe, it, expect } from 'vitest';
import { rangeIds, selectionCoverage } from '../src/shared/selection.js';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('rangeIds', () => {
  it('takes everything between the two positions, inclusive', () => {
    expect(rangeIds(ids, 1, 3)).toEqual(['b', 'c', 'd']);
  });

  it('works when the range is dragged upwards', () => {
    expect(rangeIds(ids, 3, 1)).toEqual(['b', 'c', 'd']);
  });

  it('selects a single row when both ends are the same', () => {
    expect(rangeIds(ids, 2, 2)).toEqual(['c']);
  });

  it('clamps an anchor left over from a longer list', () => {
    expect(rangeIds(ids, 9, 3)).toEqual(['d', 'e']);
  });

  it('returns nothing for an empty list', () => {
    expect(rangeIds([], 0, 4)).toEqual([]);
  });
});

describe('selectionCoverage', () => {
  it('reports none, some and all', () => {
    expect(selectionCoverage(ids, new Set())).toBe('none');
    expect(selectionCoverage(ids, new Set(['a', 'c']))).toBe('some');
    expect(selectionCoverage(ids, new Set(ids))).toBe('all');
  });

  it('ignores selected tracks that are not on screen', () => {
    expect(selectionCoverage(['a', 'b'], new Set(['a', 'b', 'z']))).toBe('all');
    expect(selectionCoverage(['a', 'b'], new Set(['z']))).toBe('none');
  });

  it('treats an empty view as nothing selected', () => {
    expect(selectionCoverage([], new Set(['a']))).toBe('none');
  });
});
