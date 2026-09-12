import { describe, it, expect } from 'vitest';
import {
  EQ_BANDS, EQ_MIN_GAIN, EQ_MAX_GAIN, EQ_PRESETS,
  clampGain, normalizeGains, gainsForPreset, matchPreset, formatFrequency,
} from '../src/shared/eq-presets.js';

describe('EQ_BANDS', () => {
  it('has the ten classic hi-fi bands in ascending order', () => {
    expect(EQ_BANDS).toHaveLength(10);
    expect(EQ_BANDS.map((b) => b.freq)).toEqual([31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
  });

  it('uses shelving filters at the extremes and peaking in between', () => {
    expect(EQ_BANDS[0].type).toBe('lowshelf');
    expect(EQ_BANDS[9].type).toBe('highshelf');
    for (const band of EQ_BANDS.slice(1, 9)) expect(band.type).toBe('peaking');
  });
});

describe('clampGain', () => {
  it('keeps values inside the +/-12 dB range', () => {
    expect(clampGain(20)).toBe(EQ_MAX_GAIN);
    expect(clampGain(-20)).toBe(EQ_MIN_GAIN);
    expect(clampGain(5.5)).toBe(5.5);
  });

  it('maps rubbish to zero', () => {
    expect(clampGain(NaN)).toBe(0);
    expect(clampGain('loud')).toBe(0);
    expect(clampGain(undefined)).toBe(0);
    expect(clampGain(Infinity)).toBe(EQ_MAX_GAIN);
  });
});

describe('normalizeGains', () => {
  it('always returns exactly one value per band', () => {
    expect(normalizeGains([1, 2, 3])).toHaveLength(10);
    expect(normalizeGains(new Array(30).fill(1))).toHaveLength(10);
    expect(normalizeGains(null)).toEqual(new Array(10).fill(0));
  });

  it('pads missing bands with zero and clamps the rest', () => {
    expect(normalizeGains([99, -99])).toEqual([12, -12, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('presets', () => {
  it('always includes a flat preset that is actually flat', () => {
    expect(gainsForPreset('flat')).toEqual(new Array(10).fill(0));
  });

  it('gives every preset a label and ten valid gains', () => {
    for (const [name, preset] of Object.entries(EQ_PRESETS)) {
      expect(preset.label, `${name} needs a label`).toBeTruthy();
      expect(preset.gains, `${name} needs 10 gains`).toHaveLength(10);
      for (const g of preset.gains) {
        expect(g).toBeGreaterThanOrEqual(EQ_MIN_GAIN);
        expect(g).toBeLessThanOrEqual(EQ_MAX_GAIN);
      }
    }
  });

  it('falls back to flat for an unknown preset', () => {
    expect(gainsForPreset('nonsense')).toEqual(new Array(10).fill(0));
  });

  it('recognises gains that match a preset', () => {
    expect(matchPreset(new Array(10).fill(0))).toBe('flat');
    expect(matchPreset(EQ_PRESETS.rock.gains)).toBe('rock');
  });

  it('reports null for a custom curve', () => {
    expect(matchPreset([1, -7, 3, 0, 0, 0, 0, 0, 0, 11])).toBeNull();
  });
});

describe('formatFrequency', () => {
  it('writes hertz plainly and kilohertz with a K', () => {
    expect(formatFrequency(31)).toBe('31');
    expect(formatFrequency(500)).toBe('500');
    expect(formatFrequency(1000)).toBe('1K');
    expect(formatFrequency(16000)).toBe('16K');
  });
});
