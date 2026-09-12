import { makeOrder, step, STOP } from '../../shared/queue-logic.js';
import { state, emit, saveSettings, trackById } from './state.js';
import { toast } from './util/dom.js';

/**
 * What is playing and what plays next.
 *
 * Holds the queue as a flat list of track ids plus a play order over it, so
 * that switching shuffle on and off rearranges the order without losing the
 * track that is currently sounding.
 */

export function createPlayback(player) {
  let ids = [];
  let order = [];
  let position = -1;
  /** Tracks that failed to load, so a broken file cannot trap the queue. */
  let consecutiveFailures = 0;

  function currentId() {
    if (position < 0 || position >= order.length) return null;
    return ids[order[position]] ?? null;
  }

  function currentTrack() {
    const id = currentId();
    return id ? trackById(id) : null;
  }

  function announce() {
    emit('playback', { trackId: currentId(), playing: !player.isPaused() });
  }

  async function playAtPosition(newPosition) {
    position = newPosition;
    const track = currentTrack();
    if (!track) {
      announce();
      return;
    }
    await player.load(track.path);
    announce();
  }

  /** Rebuild the play order around whatever is playing now. */
  function rebuildOrder(shuffle) {
    const playingIndex = position >= 0 ? order[position] : 0;
    order = makeOrder(ids.length, shuffle, playingIndex);
    position = ids.length ? order.indexOf(playingIndex) : -1;
    if (position < 0) position = ids.length ? 0 : -1;
  }

  function advance(direction, auto) {
    const result = step({
      orderLength: order.length,
      pos: position,
      direction,
      repeat: state.store.settings.repeat,
      auto,
    });

    if (result.restart) {
      player.seekToFraction(0);
      void player.play();
      announce();
      return;
    }

    if (result.pos === STOP) {
      player.stop();
      announce();
      return;
    }

    void playAtPosition(result.pos);
  }

  player.on('ended', () => {
    consecutiveFailures = 0;
    advance(1, true);
  });

  player.on('statechange', () => announce());

  player.on('error', () => {
    const track = currentTrack();
    if (track) toast(`Nie udało się odtworzyć: ${track.title}`);

    // Skip past a run of unplayable files, but give up rather than spin
    // through an entire library of them.
    consecutiveFailures += 1;
    if (consecutiveFailures < 5 && order.length > 1) {
      advance(1, true);
    } else {
      consecutiveFailures = 0;
      player.stop();
      announce();
    }
  });

  return {
    currentId,
    currentTrack,

    /** Start a fresh queue, optionally from a particular track. */
    async playList(trackIds, startId = null) {
      ids = [...trackIds];
      if (!ids.length) return;

      const startIndex = startId ? Math.max(0, ids.indexOf(startId)) : 0;
      order = makeOrder(ids.length, state.store.settings.shuffle, startIndex);
      consecutiveFailures = 0;
      await playAtPosition(order.indexOf(startIndex));
      saveSettings({ lastTrackId: currentId() });
    },

    next() { advance(1, false); },
    prev() {
      // Pressing back a few seconds in restarts the track, as on a CD player.
      if (player.currentTime() > 3) {
        player.seekToFraction(0);
        return;
      }
      advance(-1, false);
    },

    async toggle() {
      if (!player.hasSource()) return false;
      if (player.isPaused()) await player.play();
      else player.pause();
      return true;
    },

    stop() {
      player.stop();
      announce();
    },

    setShuffle(on) {
      saveSettings({ shuffle: on });
      if (ids.length) rebuildOrder(on);
    },

    /** Is this track the one currently loaded? Used to highlight the row. */
    isCurrent(id) {
      return currentId() === id;
    },

    queueLength() {
      return ids.length;
    },

    /** Remove tracks that no longer exist from the live queue. */
    pruneMissing() {
      const playingId = currentId();
      ids = ids.filter((id) => trackById(id));
      const playingIndex = ids.indexOf(playingId);
      order = makeOrder(ids.length, state.store.settings.shuffle, Math.max(0, playingIndex));
      position = playingIndex >= 0 ? order.indexOf(playingIndex) : -1;
    },
  };
}
