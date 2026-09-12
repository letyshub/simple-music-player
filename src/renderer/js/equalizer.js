import { EQ_BANDS, normalizeGains, clampGain } from '../../shared/eq-presets.js';

/**
 * The ten-band filter chain.
 *
 * Turning the equaliser "off" flattens every band rather than rewiring the
 * graph: a peaking or shelving filter at 0 dB passes audio through unchanged,
 * and leaving the nodes in place means the switch cannot click or drop a
 * sample mid-song.
 */

/** Gain changes ramp over this long. Short enough to feel instant, long
 *  enough that dragging a fader does not produce zipper noise. */
const RAMP_SECONDS = 0.04;

export function createEqualizer(context) {
  const filters = EQ_BANDS.map((band) => {
    const filter = context.createBiquadFilter();
    filter.type = band.type;
    filter.frequency.value = band.freq;
    filter.Q.value = band.q;
    filter.gain.value = 0;
    return filter;
  });

  // Chain them nose to tail: 31 Hz -> 62 Hz -> ... -> 16 kHz -> preamp.
  for (let i = 0; i < filters.length - 1; i += 1) filters[i].connect(filters[i + 1]);

  const preamp = context.createGain();
  filters[filters.length - 1].connect(preamp);

  let gains = new Array(EQ_BANDS.length).fill(0);
  let enabled = true;

  function ramp(param, value) {
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + RAMP_SECONDS);
  }

  function apply() {
    filters.forEach((filter, i) => ramp(filter.gain, enabled ? gains[i] : 0));
  }

  return {
    input: filters[0],
    output: preamp,

    setGain(index, decibels) {
      if (index < 0 || index >= gains.length) return;
      gains[index] = clampGain(decibels);
      if (enabled) ramp(filters[index].gain, gains[index]);
    },

    setGains(values) {
      gains = normalizeGains(values);
      apply();
    },

    getGains() {
      return [...gains];
    },

    setEnabled(on) {
      enabled = Boolean(on);
      apply();
    },

    isEnabled() {
      return enabled;
    },

    /** Preamp trim, in dB. Lets a heavily boosted curve be pulled back
     *  below clipping without touching the individual bands. */
    setPreamp(decibels) {
      ramp(preamp.gain, 10 ** (clampGain(decibels) / 20));
    },
  };
}
