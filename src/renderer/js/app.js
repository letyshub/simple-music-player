import { $, el, toast } from './util/dom.js';
import { trackCount } from './util/format.js';
import {
  state, initState, setStore, setSearch, setView,
  deletePlaylist, renamePlaylistById, removeFromPlaylist, playlistById,
} from './state.js';
import { createPlayer } from './player.js';
import { createPlayback } from './playback.js';
import { createVisualizer } from './visualizer.js';
import { createTrackList } from './views/tracklist.js';
import { createSidebar } from './views/sidebar.js';
import { createDeck } from './views/deck.js';
import { createEqPanel } from './views/eq-panel.js';
import { createExportDialog } from './views/export-dialog.js';

/** Start-up and the wiring that does not belong to any single view. */

const scanStatus = $('#scan-status');

function showScanStatus(text) {
  scanStatus.textContent = text;
}

/** Run an import, showing progress and adopting whatever store comes back. */
async function runImport(task, { onDone } = {}) {
  showScanStatus('SKANOWANIE…');
  try {
    const result = await task();
    if (!result) return;
    setStore(result.store);
    onDone?.();
    toast(result.addedCount
      ? `Dodano ${trackCount(result.addedCount)}`
      : 'Nie znaleziono nowych utworów');
  } catch (error) {
    console.error(error);
    toast('Nie udało się wczytać plików');
  } finally {
    showScanStatus('');
  }
}

/** Turn the view title into a text field so a playlist can be renamed inline
 *  (Electron windows have no window.prompt). */
function beginRename(playlistId, afterRename) {
  const playlist = playlistById(playlistId);
  if (!playlist) return;

  const titleNode = $('#view-title');
  const input = el('input', {
    type: 'text',
    class: 'rename-input',
    value: playlist.name,
    'aria-label': 'Nazwa playlisty',
  });

  let settled = false;
  const finish = async (commit) => {
    if (settled) return;
    settled = true;
    const name = input.value;
    input.replaceWith(titleNode);
    if (commit) {
      await renamePlaylistById(playlistId, name);
      afterRename?.();
    }
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));

  titleNode.replaceWith(input);
  input.focus();
  input.select();
}

function bindDropTarget(onPaths) {
  const overlay = $('#drop-overlay');
  let depth = 0;

  window.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    depth += 1;
    overlay.hidden = false;
  });

  window.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.hidden = true;
  });

  window.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    depth = 0;
    overlay.hidden = true;

    const paths = [...event.dataTransfer.files]
      .map((file) => window.api.pathForFile(file))
      .filter(Boolean);
    if (paths.length) onPaths(paths);
  });
}

function bindShortcuts({ playback }) {
  document.addEventListener('keydown', (event) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);

    if (event.key === ' ' && !inField) {
      event.preventDefault();
      playback.toggle();
      return;
    }

    if (event.ctrlKey && event.key === 'ArrowRight') { event.preventDefault(); playback.next(); }
    if (event.ctrlKey && event.key === 'ArrowLeft') { event.preventDefault(); playback.prev(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'f') { event.preventDefault(); $('#search').focus(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'e') { event.preventDefault(); $('#btn-eq-toggle').click(); }

    if (event.key === 'Delete' && !inField && state.view.kind === 'playlist') {
      event.preventDefault();
      const ids = [...state.selection];
      Promise.all(ids.map((id) => removeFromPlaylist(state.view.id, id)));
    }
  });
}

async function main() {
  await initState();

  const player = createPlayer($('#audio'));
  const equalizer = player.prepare();
  const playback = createPlayback(player);

  const visualizer = createVisualizer({
    spectrumCanvas: $('#spectrum'),
    leftCanvas: $('#vu-left'),
    rightCanvas: $('#vu-right'),
    player,
  });

  const exportDialog = createExportDialog();
  const trackList = createTrackList({ playback, exportDialog });
  const deck = createDeck({ player, playback, visualizer });
  const eqPanel = createEqPanel({ equalizer, onFlagsChanged: () => deck.updateModeButtons() });
  const sidebar = createSidebar({
    playback,
    exportDialog,
    onScanStart: showScanStatus,
    onScanEnd: () => showScanStatus(''),
  });

  /* --------------------------------------------------------- toolbar */

  $('#search').addEventListener('input', (event) => setSearch(event.target.value));

  $('#btn-play-all').addEventListener('click', () => {
    const ids = trackList.visibleIds();
    if (ids.length) playback.playList(ids);
    else toast('Nie ma czego odtwarzać');
  });

  $('#btn-shuffle-all').addEventListener('click', () => {
    const ids = trackList.visibleIds();
    if (!ids.length) { toast('Nie ma czego odtwarzać'); return; }
    if (!state.store.settings.shuffle) {
      playback.setShuffle(true);
      deck.updateModeButtons();
    }
    playback.playList(ids);
  });

  $('#btn-rename-playlist').addEventListener('click', () => {
    beginRename(state.view.id, () => trackList.render());
  });

  $('#btn-delete-playlist').addEventListener('click', async () => {
    const playlist = playlistById(state.view.id);
    if (!playlist) return;
    await deletePlaylist(playlist.id);
    toast(`Usunięto „${playlist.name}”`);
  });

  /* ------------------------------------------------------- importing */

  const addFolder = () => runImport(() => window.api.pickFolder());
  $('#btn-add-folder').addEventListener('click', addFolder);
  $('#btn-empty-add').addEventListener('click', addFolder);
  $('#btn-add-files').addEventListener('click', () => runImport(() => window.api.pickFiles()));
  $('#btn-rescan').addEventListener('click', () => {
    if (!state.store.folders.length) { toast('Brak folderów do odświeżenia'); return; }
    runImport(() => window.api.rescan());
  });

  bindDropTarget((paths) => runImport(() => window.api.addPaths(paths)));
  bindShortcuts({ playback });

  window.api.onProgress(({ done, total }) => {
    showScanStatus(total ? `SKANOWANIE ${done}/${total}` : 'SKANOWANIE…');
  });

  /* ------------------------------------------------------ first paint */

  sidebar.render();
  trackList.render();
  eqPanel.render();
  deck.render();

  // Restore the last view the user was looking at only if it still exists.
  if (state.view.kind === 'playlist' && !playlistById(state.view.id)) {
    setView({ kind: 'library', id: null });
  }
}

main().catch((error) => {
  console.error(error);
  toast('Aplikacja nie wystartowała poprawnie');
});
