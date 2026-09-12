import { $ } from '../util/dom.js';
import { formatTime } from '../util/format.js';
import { state, on, saveSettings, toggleFavorite, isFavorite } from '../state.js';
import { REPEAT_MODES } from '../../../shared/queue-logic.js';

/**
 * The front panel: transport buttons, the display and the two sliders.
 *
 * Reads from the player rather than keeping its own idea of the time, so the
 * readout can never disagree with what is actually sounding.
 */

const REPEAT_TITLES = {
  off: 'Powtarzanie wyłączone',
  all: 'Powtarzaj wszystko',
  one: 'Powtarzaj jeden utwór',
};

export function createDeck({ player, playback, visualizer }) {
  const nodes = {
    playLed: $('#power-led'),
    state: $('#lcd-state'),
    title: $('#lcd-title'),
    artist: $('#lcd-artist'),
    elapsed: $('#lcd-elapsed'),
    total: $('#lcd-total'),
    format: $('#lcd-format'),
    flagShuffle: $('#flag-shuffle'),
    flagRepeat: $('#flag-repeat'),
    flagRepeatOne: $('#flag-repeat-one'),
    flagEq: $('#flag-eq'),
    seek: $('#seek'),
    volume: $('#volume'),
    volumeValue: $('#vol-value'),
    btnPlay: $('#btn-play'),
    btnShuffle: $('#btn-shuffle'),
    btnRepeat: $('#btn-repeat'),
    btnFav: $('#btn-fav'),
    btnMute: $('#btn-mute'),
  };

  /** True while the user drags the seek handle, so the clock does not fight them. */
  let scrubbing = false;

  function setSliderFill(input, fraction) {
    input.style.setProperty('--progress', `${Math.round(fraction * 100)}%`);
  }

  /** Scroll the title only when it does not fit, the way a real display did. */
  function updateMarquee() {
    const node = nodes.title;
    node.classList.remove('is-scrolling');
    const overflow = node.scrollWidth - node.parentElement.clientWidth;
    if (overflow > 6) {
      const distance = overflow + 18;
      node.style.setProperty('--scroll-distance', `${-distance}px`);
      node.style.setProperty('--scroll-duration', `${Math.max(8, distance / 22)}s`);
      node.classList.add('is-scrolling');
    }
  }

  function updateNowPlaying() {
    const track = playback.currentTrack();

    if (!track) {
      nodes.title.textContent = '— brak utworu —';
      nodes.artist.textContent = '';
      nodes.format.textContent = '';
      nodes.total.textContent = '0:00';
      nodes.elapsed.textContent = '0:00';
      setSliderFill(nodes.seek, 0);
      nodes.seek.value = '0';
      nodes.btnFav.classList.remove('is-on');
      updateMarquee();
      return;
    }

    nodes.title.textContent = track.title;
    nodes.artist.textContent = track.artist;
    nodes.format.textContent = (track.path.split('.').pop() ?? '').toUpperCase();
    nodes.btnFav.classList.toggle('is-on', isFavorite(track.id));
    updateMarquee();
  }

  function updateTransportState() {
    const playing = player.hasSource() && !player.isPaused();
    nodes.btnPlay.textContent = playing ? '❚❚' : '▶';
    nodes.btnPlay.title = playing ? 'Pauza (spacja)' : 'Odtwórz (spacja)';
    nodes.playLed.classList.toggle('is-on', playing);

    if (!player.hasSource()) nodes.state.textContent = 'STOP';
    else nodes.state.textContent = playing ? 'PLAY' : 'PAUSE';

    if (playing) visualizer.start();
    else {
      visualizer.stop();
      // One last frame so the meters settle at zero instead of freezing lit.
      if (!playing) requestAnimationFrame(() => visualizer.clear());
    }
  }

  function updateClock() {
    const total = player.duration() || playback.currentTrack()?.duration || 0;
    const elapsed = player.currentTime();

    nodes.elapsed.textContent = formatTime(elapsed);
    nodes.total.textContent = formatTime(total);

    if (!scrubbing) {
      const fraction = total > 0 ? elapsed / total : 0;
      nodes.seek.value = String(Math.round(fraction * 1000));
      setSliderFill(nodes.seek, fraction);
    }
  }

  function updateModeButtons() {
    const { shuffle, repeat, eqEnabled } = state.store.settings;

    nodes.btnShuffle.classList.toggle('is-on', shuffle);
    nodes.flagShuffle.classList.toggle('is-on', shuffle);

    nodes.btnRepeat.classList.toggle('is-on', repeat !== 'off');
    nodes.btnRepeat.title = REPEAT_TITLES[repeat];
    nodes.flagRepeat.classList.toggle('is-on', repeat !== 'off');
    nodes.flagRepeatOne.classList.toggle('is-on', repeat === 'one');

    nodes.flagEq.classList.toggle('is-on', eqEnabled);
  }

  function updateVolume() {
    const { volume, muted } = state.store.settings;
    const shown = muted ? 0 : volume;
    nodes.volume.value = String(Math.round(volume * 100));
    nodes.volumeValue.textContent = muted ? '—' : String(Math.round(volume * 100));
    setSliderFill(nodes.volume, shown);
    nodes.btnMute.classList.toggle('is-on', muted);
    nodes.btnMute.textContent = muted ? '⦸' : '◉';
    player.setVolume(volume);
    player.setMuted(muted);
  }

  /* ------------------------------------------------------------- bindings */

  nodes.btnPlay.addEventListener('click', () => playback.toggle());
  $('#btn-stop').addEventListener('click', () => playback.stop());
  $('#btn-prev').addEventListener('click', () => playback.prev());
  $('#btn-next').addEventListener('click', () => playback.next());

  nodes.btnShuffle.addEventListener('click', () => {
    playback.setShuffle(!state.store.settings.shuffle);
    updateModeButtons();
  });

  nodes.btnRepeat.addEventListener('click', () => {
    const next = REPEAT_MODES[(REPEAT_MODES.indexOf(state.store.settings.repeat) + 1) % REPEAT_MODES.length];
    saveSettings({ repeat: next });
    updateModeButtons();
  });

  nodes.btnFav.addEventListener('click', () => {
    const track = playback.currentTrack();
    if (track) toggleFavorite(track.id);
  });

  nodes.btnMute.addEventListener('click', () => {
    saveSettings({ muted: !state.store.settings.muted });
    updateVolume();
  });

  nodes.volume.addEventListener('input', () => {
    saveSettings({ volume: Number(nodes.volume.value) / 100, muted: false });
    updateVolume();
  });

  nodes.seek.addEventListener('pointerdown', () => { scrubbing = true; });
  nodes.seek.addEventListener('input', () => {
    const fraction = Number(nodes.seek.value) / 1000;
    setSliderFill(nodes.seek, fraction);
    const total = player.duration();
    if (total > 0) nodes.elapsed.textContent = formatTime(fraction * total);
  });
  const commitSeek = () => {
    if (!scrubbing) return;
    scrubbing = false;
    player.seekToFraction(Number(nodes.seek.value) / 1000);
  };
  nodes.seek.addEventListener('pointerup', commitSeek);
  nodes.seek.addEventListener('change', commitSeek);

  player.on('timeupdate', updateClock);

  on('playback', () => {
    updateNowPlaying();
    updateTransportState();
    updateClock();
  });
  on('favorites', updateNowPlaying);
  on('settings', updateModeButtons);

  window.addEventListener('resize', updateMarquee);

  return {
    render() {
      updateNowPlaying();
      updateTransportState();
      updateClock();
      updateModeButtons();
      updateVolume();
      visualizer.clear();
    },
    updateVolume,
    updateModeButtons,
  };
}
