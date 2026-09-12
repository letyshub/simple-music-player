/**
 * Ten-band graphic equaliser definition.
 *
 * The frequencies are the ones printed on the front of a 1990s mini system,
 * one slider per octave from 31 Hz to 16 kHz. The two outer bands are shelving
 * filters so that pushing them lifts everything beyond them, which is how the
 * hardware behaved; the eight in the middle are peaking filters.
 */

export const EQ_MIN_GAIN = -12;
export const EQ_MAX_GAIN = 12;

/** Peaking-filter width. 1.41 gives roughly one octave per band, so the
 *  neighbouring sliders overlap smoothly instead of leaving notches. */
const PEAK_Q = 1.41;

export const EQ_BANDS = [
  { freq: 31, type: 'lowshelf', q: 0.7 },
  { freq: 62, type: 'peaking', q: PEAK_Q },
  { freq: 125, type: 'peaking', q: PEAK_Q },
  { freq: 250, type: 'peaking', q: PEAK_Q },
  { freq: 500, type: 'peaking', q: PEAK_Q },
  { freq: 1000, type: 'peaking', q: PEAK_Q },
  { freq: 2000, type: 'peaking', q: PEAK_Q },
  { freq: 4000, type: 'peaking', q: PEAK_Q },
  { freq: 8000, type: 'peaking', q: PEAK_Q },
  { freq: 16000, type: 'highshelf', q: 0.7 },
];

export const BAND_COUNT = EQ_BANDS.length;

export const EQ_PRESETS = {
  flat: { label: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  rock: { label: 'Rock', gains: [5, 4, 3, 1, -1, -1, 2, 4, 5, 5] },
  pop: { label: 'Pop', gains: [-1, 1, 3, 4, 4, 2, 0, -1, -1, -1] },
  jazz: { label: 'Jazz', gains: [4, 3, 1, 2, -1, -1, 0, 1, 3, 4] },
  classical: { label: 'Classic', gains: [5, 4, 3, 2, -1, -1, 0, 2, 3, 4] },
  dance: { label: 'Dance', gains: [7, 6, 3, 0, 0, -3, -4, -4, 2, 4] },
  bass: { label: 'Bass', gains: [9, 8, 6, 3, 1, 0, 0, 0, 0, 0] },
  treble: { label: 'Treble', gains: [0, 0, 0, 0, 0, 2, 4, 6, 8, 9] },
  vocal: { label: 'Vocal', gains: [-3, -3, -1, 2, 5, 5, 4, 2, 0, -2] },
  loudness: { label: 'Loud', gains: [8, 6, 2, 0, -1, 0, 1, 3, 6, 8] },
};

/** Force one slider value into the usable range; anything unusable reads as 0 dB. */
export function clampGain(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.min(EQ_MAX_GAIN, Math.max(EQ_MIN_GAIN, n));
}

/** Coerce anything into exactly one valid gain per band. */
export function normalizeGains(gains) {
  const source = Array.isArray(gains) ? gains : [];
  return Array.from({ length: BAND_COUNT }, (_, i) => clampGain(source[i] ?? 0));
}

export function presetNames() {
  return Object.keys(EQ_PRESETS);
}

/** The curve for a named preset, falling back to flat. */
export function gainsForPreset(name) {
  const preset = EQ_PRESETS[name];
  return preset ? [...preset.gains] : [...EQ_PRESETS.flat.gains];
}

/** Which preset these gains correspond to, or null if the user has drifted off one. */
export function matchPreset(gains) {
  const normalized = normalizeGains(gains);
  for (const [name, preset] of Object.entries(EQ_PRESETS)) {
    if (preset.gains.every((g, i) => Math.abs(g - normalized[i]) < 0.01)) return name;
  }
  return null;
}

/** Slider caption: 31 Hz prints as "31", 16 kHz prints as "16K". */
export function formatFrequency(hz) {
  return hz >= 1000 ? `${hz / 1000}K` : String(hz);
}
