/**
 * The lit part of the front panel: a segmented spectrum analyser and a pair
 * of stereo level meters.
 *
 * Both are drawn as discrete LED blocks rather than smooth bars, because that
 * blockiness is most of what makes the display read as 1990s hardware. The
 * analyser also carries peak-hold markers that hang for a moment and then
 * fall, the way the caps on those displays behaved.
 */

const BAR_COUNT = 24;
const SEGMENTS = 18;
const SEGMENT_GAP = 2;
const BAR_GAP = 3;

/** Range the bars span. Below 30 Hz there is nothing to see and above 16 kHz
 *  most material is empty, so spending display width there wastes it. */
const MIN_HZ = 30;
const MAX_HZ = 16000;

/** Peak markers hold, then fall, in segments per second. */
const PEAK_HOLD_MS = 620;
const PEAK_FALL_PER_SEC = 11;

/** Level below which a VU meter reads as silent. */
const VU_FLOOR_DB = -52;
const VU_SEGMENTS = 28;

const COLORS = {
  litGreen: '#3ddc6b',
  litAmber: '#f5c542',
  litRed: '#f4523f',
  dim: '#161b20',
  dimEdge: '#1d242b',
  peak: '#d6f5e2',
};

function segmentColor(index, total) {
  const ratio = index / (total - 1);
  if (ratio > 0.86) return COLORS.litRed;
  if (ratio > 0.62) return COLORS.litAmber;
  return COLORS.litGreen;
}

/** Keep the backing store matched to the CSS size and the display density. */
function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return ratio;
}

export function createVisualizer({ spectrumCanvas, leftCanvas, rightCanvas, player }) {
  const spectrumCtx = spectrumCanvas.getContext('2d');
  const leftCtx = leftCanvas.getContext('2d');
  const rightCtx = rightCanvas.getContext('2d');

  const levels = new Float32Array(BAR_COUNT);
  const peaks = new Float32Array(BAR_COUNT);
  const peakSetAt = new Float64Array(BAR_COUNT);
  let vuLevel = { left: 0, right: 0 };

  let binRanges = null;
  let binRangeRate = 0;
  let running = false;
  let frame = 0;
  let lastFrameTime = 0;

  /** Which FFT bins feed each bar, spaced logarithmically like the ear. */
  function computeBinRanges(sampleRate, binCount) {
    if (binRanges && binRangeRate === sampleRate) return binRanges;
    const nyquist = sampleRate / 2;
    const ranges = [];
    for (let i = 0; i < BAR_COUNT; i += 1) {
      const lowHz = MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / BAR_COUNT);
      const highHz = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((i + 1) / BAR_COUNT);
      const low = Math.floor((lowHz / nyquist) * binCount);
      const high = Math.max(low + 1, Math.ceil((highHz / nyquist) * binCount));
      ranges.push([Math.min(low, binCount - 1), Math.min(high, binCount)]);
    }
    binRanges = ranges;
    binRangeRate = sampleRate;
    return ranges;
  }

  function readSpectrum(now, deltaSeconds) {
    const data = player.spectrum();
    const ranges = data ? computeBinRanges(player.sampleRate(), data.length) : null;

    for (let i = 0; i < BAR_COUNT; i += 1) {
      let value = 0;
      if (data && ranges) {
        const [low, high] = ranges[i];
        let sum = 0;
        for (let bin = low; bin < high; bin += 1) sum += data[bin];
        value = sum / (high - low) / 255;
      }

      // Rise immediately, fall smoothly: an instant drop looks twitchy.
      levels[i] = value > levels[i] ? value : levels[i] + (value - levels[i]) * Math.min(1, deltaSeconds * 9);

      const asSegments = levels[i] * SEGMENTS;
      if (asSegments >= peaks[i]) {
        peaks[i] = asSegments;
        peakSetAt[i] = now;
      } else if (now - peakSetAt[i] > PEAK_HOLD_MS) {
        peaks[i] = Math.max(0, peaks[i] - PEAK_FALL_PER_SEC * deltaSeconds);
      }
    }
  }

  function drawSpectrum() {
    const ratio = fitCanvas(spectrumCanvas);
    const { width, height } = spectrumCanvas;
    spectrumCtx.clearRect(0, 0, width, height);

    const gap = BAR_GAP * ratio;
    const barWidth = (width - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    const segGap = SEGMENT_GAP * ratio;
    const segHeight = (height - segGap * (SEGMENTS - 1)) / SEGMENTS;

    for (let bar = 0; bar < BAR_COUNT; bar += 1) {
      const x = bar * (barWidth + gap);
      const lit = levels[bar] * SEGMENTS;
      const peakSegment = Math.min(SEGMENTS - 1, Math.floor(peaks[bar]));

      for (let seg = 0; seg < SEGMENTS; seg += 1) {
        const y = height - (seg + 1) * segHeight - seg * segGap;
        const isLit = seg < lit;
        const isPeak = seg === peakSegment && peaks[bar] > 0.4;

        if (isPeak && !isLit) {
          spectrumCtx.fillStyle = COLORS.peak;
          spectrumCtx.globalAlpha = 0.75;
        } else if (isPeak) {
          spectrumCtx.fillStyle = COLORS.peak;
          spectrumCtx.globalAlpha = 1;
        } else if (isLit) {
          spectrumCtx.fillStyle = segmentColor(seg, SEGMENTS);
          spectrumCtx.globalAlpha = 1;
        } else {
          spectrumCtx.fillStyle = COLORS.dim;
          spectrumCtx.globalAlpha = 1;
        }

        spectrumCtx.fillRect(x, y, barWidth, segHeight);
      }
      spectrumCtx.globalAlpha = 1;
    }
  }

  /** Root-mean-square of one channel, mapped to 0..1 on a decibel scale. */
  function channelLevel(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const centred = (samples[i] - 128) / 128;
      sum += centred * centred;
    }
    const rms = Math.sqrt(sum / samples.length);
    if (rms <= 0.0001) return 0;
    const db = 20 * Math.log10(rms);
    return Math.min(1, Math.max(0, (db - VU_FLOOR_DB) / -VU_FLOOR_DB));
  }

  function readVu(deltaSeconds) {
    const data = player.channels();
    const target = data
      ? { left: channelLevel(data.left), right: channelLevel(data.right) }
      : { left: 0, right: 0 };

    // Fast attack, slow release, like a real meter's ballistics.
    const smooth = (current, next) => (next > current
      ? next
      : current + (next - current) * Math.min(1, deltaSeconds * 7));

    vuLevel = {
      left: smooth(vuLevel.left, target.left),
      right: smooth(vuLevel.right, target.right),
    };
  }

  function drawVu(ctx, canvas, level) {
    const ratio = fitCanvas(canvas);
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const gap = 1.5 * ratio;
    const segWidth = (width - gap * (VU_SEGMENTS - 1)) / VU_SEGMENTS;
    const lit = level * VU_SEGMENTS;

    for (let i = 0; i < VU_SEGMENTS; i += 1) {
      ctx.fillStyle = i < lit ? segmentColor(i, VU_SEGMENTS) : COLORS.dimEdge;
      ctx.fillRect(i * (segWidth + gap), 0, segWidth, height);
    }
  }

  function tick(now) {
    if (!running) return;
    const deltaSeconds = lastFrameTime ? Math.min(0.1, (now - lastFrameTime) / 1000) : 0.016;
    lastFrameTime = now;

    readSpectrum(now, deltaSeconds);
    readVu(deltaSeconds);
    drawSpectrum();
    drawVu(leftCtx, leftCanvas, vuLevel.left);
    drawVu(rightCtx, rightCanvas, vuLevel.right);

    frame = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastFrameTime = 0;
      frame = requestAnimationFrame(tick);
    },

    stop() {
      running = false;
      cancelAnimationFrame(frame);
    },

    /** Draw one dark frame, for when playback stops. */
    clear() {
      levels.fill(0);
      peaks.fill(0);
      vuLevel = { left: 0, right: 0 };
      drawSpectrum();
      drawVu(leftCtx, leftCanvas, 0);
      drawVu(rightCtx, rightCanvas, 0);
    },
  };
}
