import { createEqualizer } from './equalizer.js';

/**
 * The audio element and the Web Audio graph around it.
 *
 * Knows nothing about playlists or the library. It is handed a file path,
 * plays it, and exposes the two analysers the display draws from:
 *
 *   audio -> source -> [equaliser] -> preamp -+-> analyser -> destination
 *                                             |
 *                                             +-> splitter -> L/R analysers -> silent sink
 *
 * The L/R branch ends in a zero-gain node connected to the destination. An
 * analyser that dead-ends is not guaranteed to be pulled by the audio graph,
 * so without that sink the VU meters could sit still while music plays.
 */

export function createPlayer(audioElement) {
  let context = null;
  let equalizer = null;
  let analyser = null;
  let analyserLeft = null;
  let analyserRight = null;

  let spectrumData = null;
  let leftData = null;
  let rightData = null;

  const handlers = { ended: null, timeupdate: null, statechange: null, error: null };

  /**
   * Build the graph. Deferred until the first play because a browser audio
   * context created before any user gesture starts suspended.
   */
  function ensureGraph() {
    if (context) return;

    context = new AudioContext();
    const source = context.createMediaElementSource(audioElement);
    equalizer = createEqualizer(context);

    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    // Smoothing keeps the bars from flickering frame to frame while still
    // dropping fast enough to look like they are following the music.
    analyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -78;
    analyser.maxDecibels = -12;

    const splitter = context.createChannelSplitter(2);
    analyserLeft = context.createAnalyser();
    analyserRight = context.createAnalyser();
    for (const a of [analyserLeft, analyserRight]) {
      a.fftSize = 1024;
      a.smoothingTimeConstant = 0.3;
    }

    const silentSink = context.createGain();
    silentSink.gain.value = 0;

    source.connect(equalizer.input);
    equalizer.output.connect(analyser);
    analyser.connect(context.destination);

    equalizer.output.connect(splitter);
    splitter.connect(analyserLeft, 0);
    splitter.connect(analyserRight, 1);
    analyserLeft.connect(silentSink);
    analyserRight.connect(silentSink);
    silentSink.connect(context.destination);

    spectrumData = new Uint8Array(analyser.frequencyBinCount);
    leftData = new Uint8Array(analyserLeft.fftSize);
    rightData = new Uint8Array(analyserRight.fftSize);
  }

  audioElement.addEventListener('ended', () => handlers.ended?.());
  audioElement.addEventListener('timeupdate', () => handlers.timeupdate?.());
  audioElement.addEventListener('play', () => handlers.statechange?.('playing'));
  audioElement.addEventListener('pause', () => handlers.statechange?.('paused'));
  audioElement.addEventListener('loadedmetadata', () => handlers.timeupdate?.());
  audioElement.addEventListener('error', () => {
    // Only meaningful once a source is set; clearing src also fires this.
    if (audioElement.getAttribute('src')) handlers.error?.(audioElement.error);
  });

  return {
    /** Register callbacks: ended, timeupdate, statechange, error. */
    on(event, handler) {
      handlers[event] = handler;
    },

    /** Point the element at a file and, unless told otherwise, start it. */
    async load(filePath, { autoplay = true } = {}) {
      ensureGraph();
      audioElement.src = window.api.trackUrl(filePath);
      audioElement.load();
      if (autoplay) await this.play();
    },

    async play() {
      ensureGraph();
      // A context can be suspended by the browser's autoplay policy or by the
      // machine going to sleep; resuming is harmless when it is already running.
      if (context.state === 'suspended') await context.resume();
      try {
        await audioElement.play();
      } catch (error) {
        if (error.name !== 'AbortError') handlers.error?.(error);
      }
    },

    pause() {
      audioElement.pause();
    },

    stop() {
      audioElement.pause();
      audioElement.currentTime = 0;
    },

    isPaused() {
      return audioElement.paused;
    },

    hasSource() {
      return Boolean(audioElement.getAttribute('src'));
    },

    currentTime() {
      return audioElement.currentTime || 0;
    },

    duration() {
      return Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
    },

    seekToFraction(fraction) {
      const total = this.duration();
      if (total > 0) audioElement.currentTime = Math.min(total, Math.max(0, fraction * total));
    },

    setVolume(value) {
      audioElement.volume = Math.min(1, Math.max(0, value));
    },

    setMuted(muted) {
      audioElement.muted = Boolean(muted);
    },

    /** The equaliser, once the graph exists. Null before the first play. */
    equalizer() {
      return equalizer;
    },

    /** Build the graph early so equaliser settings can be applied on startup. */
    prepare() {
      ensureGraph();
      return equalizer;
    },

    /** Latest frequency magnitudes, or null before the graph exists. */
    spectrum() {
      if (!analyser) return null;
      analyser.getByteFrequencyData(spectrumData);
      return spectrumData;
    },

    /** Latest stereo waveforms for the VU meters. */
    channels() {
      if (!analyserLeft) return null;
      analyserLeft.getByteTimeDomainData(leftData);
      analyserRight.getByteTimeDomainData(rightData);
      return { left: leftData, right: rightData };
    },

    sampleRate() {
      return context ? context.sampleRate : 48000;
    },
  };
}
