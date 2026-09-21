import { $, $$, el, toast } from '../util/dom.js';
import { folderName, trackCount } from '../util/format.js';
import {
  state, on, setView, setStore, createPlaylist, deletePlaylist,
  addToPlaylist, playlistById,
} from '../state.js';
import { showContextMenu } from './context-menu.js';
import { TRACK_DRAG_TYPE } from './tracklist.js';

/** Folders, playlists and the two fixed views. Also a drop target: dragging
 *  tracks onto a playlist adds them to it. */

export function createSidebar({ playback, exportDialog, onScanStart, onScanEnd }) {
  const folderList = $('#folder-list');
  const playlistList = $('#playlist-list');

  function countTracksInFolder(folder) {
    const prefix = `${folder.replace(/\\/g, '/').toLowerCase()}/`;
    return Object.values(state.store.tracks)
      .filter((t) => t.path.replace(/\\/g, '/').toLowerCase().startsWith(prefix)).length;
  }

  function markActive() {
    for (const button of $$('.nav-item')) {
      button.classList.toggle('is-active', button.dataset.view === state.view.kind);
    }
    for (const item of $$('#folder-list li')) {
      item.classList.toggle('is-active', state.view.kind === 'folder' && state.view.id === item.dataset.path);
    }
    for (const item of $$('#playlist-list li')) {
      item.classList.toggle('is-active', state.view.kind === 'playlist' && state.view.id === item.dataset.id);
    }
  }

  /** Wire a playlist row so tracks can be dropped onto it. */
  function makeDropTarget(node, playlistId) {
    node.addEventListener('dragover', (event) => {
      if (!event.dataTransfer.types.includes(TRACK_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      node.classList.add('is-drop-target');
    });
    node.addEventListener('dragleave', () => node.classList.remove('is-drop-target'));
    node.addEventListener('drop', async (event) => {
      node.classList.remove('is-drop-target');
      const raw = event.dataTransfer.getData(TRACK_DRAG_TYPE);
      if (!raw) return;
      event.preventDefault();
      event.stopPropagation();

      const trackIds = JSON.parse(raw);
      const added = await addToPlaylist(playlistId, trackIds);
      const name = playlistById(playlistId)?.name ?? 'playlisty';
      toast(added ? `Dodano ${trackCount(added)} do „${name}”` : `Wszystko już jest na „${name}”`);
    });
  }

  async function removeFolder(folder) {
    onScanStart?.('Usuwanie…');
    setStore(await window.api.removeFolder(folder));
    playback.pruneMissing();
    if (state.view.kind === 'folder' && state.view.id === folder) {
      setView({ kind: 'library', id: null });
    }
    onScanEnd?.();
    toast(`Usunięto folder ${folderName(folder)} z biblioteki`);
  }

  function renderFolders() {
    const items = state.store.folders.map((folder) => {
      const node = el('li', {
        dataset: { path: folder },
        title: folder,
        onClick: () => setView({ kind: 'folder', id: folder }),
        onContextmenu: (event) => {
          event.preventDefault();
          showContextMenu(event.clientX, event.clientY, [
            { header: folderName(folder) },
            { label: 'Odtwórz ten folder', action: () => playFolder(folder) },
            { label: 'Pokaż w Eksploratorze', action: () => window.api.reveal(folder) },
            'separator',
            { label: 'Usuń z biblioteki', danger: true, action: () => removeFolder(folder) },
          ]);
        },
      }, [
        el('span', { class: 'item-name', text: folderName(folder) }),
        el('span', { class: 'item-count', text: String(countTracksInFolder(folder)) }),
        el('button', {
          class: 'item-remove',
          type: 'button',
          title: 'Usuń folder z biblioteki',
          text: '×',
          onClick: (event) => { event.stopPropagation(); removeFolder(folder); },
        }),
      ]);
      return node;
    });

    folderList.replaceChildren(...(items.length ? items : [
      el('li', { class: 'muted', text: 'Brak folderów' }),
    ]));
  }

  function renderPlaylists() {
    const items = state.store.playlists.map((playlist) => {
      const node = el('li', {
        dataset: { id: playlist.id },
        title: playlist.name,
        onClick: () => setView({ kind: 'playlist', id: playlist.id }),
        onContextmenu: (event) => {
          event.preventDefault();
          showContextMenu(event.clientX, event.clientY, [
            { header: playlist.name },
            {
              label: 'Odtwórz playlistę',
              action: () => playback.playList(playlist.trackIds),
            },
            {
              label: 'Eksportuj na urządzenie…',
              action: () => exportDialog.open({
                trackIds: playlist.trackIds,
                folderName: playlist.name,
                sourceLabel: `Playlista „${playlist.name}”`,
              }),
            },
            'separator',
            { label: 'Usuń playlistę', danger: true, action: () => deletePlaylist(playlist.id) },
          ]);
        },
      }, [
        el('span', { class: 'item-name', text: playlist.name }),
        el('span', { class: 'item-count', text: String(playlist.trackIds.length) }),
        el('button', {
          class: 'item-remove',
          type: 'button',
          title: 'Usuń playlistę',
          text: '×',
          onClick: (event) => { event.stopPropagation(); deletePlaylist(playlist.id); },
        }),
      ]);
      makeDropTarget(node, playlist.id);
      return node;
    });

    playlistList.replaceChildren(...(items.length ? items : [
      el('li', { class: 'muted', text: 'Brak playlist' }),
    ]));
  }

  function playFolder(folder) {
    const prefix = `${folder.replace(/\\/g, '/').toLowerCase()}/`;
    const ids = Object.values(state.store.tracks)
      .filter((t) => t.path.replace(/\\/g, '/').toLowerCase().startsWith(prefix))
      .sort((a, b) => a.path.localeCompare(b.path, 'pl', { numeric: true }))
      .map((t) => t.id);
    if (ids.length) playback.playList(ids);
    else toast('Ten folder nie zawiera utworów');
  }

  function renderCounts() {
    $('[data-count="library"]').textContent = String(Object.keys(state.store.tracks).length);
    $('[data-count="favorites"]').textContent = String(state.store.favorites.length);
  }

  function render() {
    renderCounts();
    renderFolders();
    renderPlaylists();
    markActive();
  }

  for (const button of $$('.nav-item')) {
    button.addEventListener('click', () => setView({ kind: button.dataset.view, id: null }));
  }

  // Favourites are a view rather than a list the user built, so they had no
  // menu of their own until there was something worth putting in one.
  $('[data-view="favorites"]').addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const trackIds = [...state.store.favorites];
    showContextMenu(event.clientX, event.clientY, [
      { header: 'Ulubione' },
      { label: 'Odtwórz ulubione', action: () => playback.playList(trackIds) },
      {
        label: 'Eksportuj na urządzenie…',
        action: () => exportDialog.open({
          trackIds,
          folderName: 'Ulubione',
          sourceLabel: 'Ulubione',
        }),
      },
    ]);
  });

  $('#btn-new-playlist').addEventListener('click', async () => {
    const playlist = await createPlaylist('Nowa playlista');
    setView({ kind: 'playlist', id: playlist.id });
    toast(`Utworzono „${playlist.name}”`);
  });

  on('library', render);
  on('favorites', renderCounts);
  on('view', markActive);

  return { render, playFolder };
}
