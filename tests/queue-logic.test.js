import { describe, it, expect } from 'vitest';
import { REPEAT_MODES, makeOrder, step, STOP } from '../src/shared/queue-logic.js';

const seq = (n) => Array.from({ length: n }, (_, i) => i);

describe('makeOrder', () => {
  it('is the natural order when shuffle is off', () => {
    expect(makeOrder(5, false, 2)).toEqual(seq(5));
  });

  it('puts the chosen track first when shuffling, then the rest', () => {
    const order = makeOrder(6, true, 3, () => 0.5);
    expect(order[0]).toBe(3);
    expect([...order].sort((a, b) => a - b)).toEqual(seq(6));
  });

  it('is a permutation for any random sequence', () => {
    let n = 0;
    const rng = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    const order = makeOrder(50, true, 0, rng);
    expect(new Set(order).size).toBe(50);
  });

  it('handles empty and single-item queues', () => {
    expect(makeOrder(0, true, 0)).toEqual([]);
    expect(makeOrder(1, true, 0)).toEqual([0]);
  });
});

describe('step', () => {
  const base = { orderLength: 4, pos: 1, direction: 1, repeat: 'off', auto: false };

  it('walks forward and backward', () => {
    expect(step({ ...base }).pos).toBe(2);
    expect(step({ ...base, direction: -1 }).pos).toBe(0);
  });

  it('stops at the end when repeat is off', () => {
    expect(step({ ...base, pos: 3 }).pos).toBe(STOP);
  });

  it('wraps around when repeat is all', () => {
    expect(step({ ...base, pos: 3, repeat: 'all' }).pos).toBe(0);
    expect(step({ ...base, pos: 0, direction: -1, repeat: 'all' }).pos).toBe(3);
  });

  it('holds at the first track when stepping back past the start', () => {
    expect(step({ ...base, pos: 0, direction: -1 }).pos).toBe(0);
  });

  it('replays the same track when a track ends under repeat-one', () => {
    const result = step({ ...base, repeat: 'one', auto: true });
    expect(result.pos).toBe(1);
    expect(result.restart).toBe(true);
  });

  it('still moves on when the user presses next under repeat-one', () => {
    const result = step({ ...base, repeat: 'one', auto: false });
    expect(result.pos).toBe(2);
    expect(result.restart).toBe(false);
  });

  it('stops on an empty queue', () => {
    expect(step({ ...base, orderLength: 0, pos: 0 }).pos).toBe(STOP);
  });

  it('exposes the three repeat modes', () => {
    expect(REPEAT_MODES).toEqual(['off', 'all', 'one']);
  });
});
