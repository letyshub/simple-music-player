import { $, el, toast } from '../util/dom.js';
import { formatTime, trackCount, formatTotalDuration } from '../util/format.js';
import {
  state, on, tracksForView, isFavorite, toggleFavorite,
  addToPlaylist, removeFromPlaylist, reorderPlaylist, playlistById, setStore,
} from '../state.js';
import { showContextMenu } from './context-menu.js';

/** The main list of tracks, and everything you can do to a row. */

export const TRACK_DRAG_TYPE = 'application/x-smp-tracks';

export function createTrackList({ playback, exportDialog }) {
  const container = $('#track-list');
  const emptyState = $('#empty-state');
  const titleNode = $('#view-title');
  const metaNode = $('#view-meta');

  /** The rows currently on screen, so playback highlighting can skip a rebuild. */
  let rendered = [];
  let lastAnchorIndex = 0;

  function viewTitle() {
    const { kind, id } = state.view;
    if (kind === 'favorites') return 'Ulubione';
    if (kind === 'playlist') return playlistById(id)?.name ?? 'Playlista';
    if (kind === 'folder') return id;
    return 'Biblioteka';
  }

  function selectedIds() {
    // Selection order does not matter for playlists, but list order does,
    // so read it back off the rendered list.
    return rendered.filter((t) => state.selection.has(t.id)).map((t) => t.id);
  }

  function targetsFor(track) {
    return state.selection.has(track.id) && state.selection.size > 1
      ? selectedIds()
      : [track.id];
  }

  function applySelectionClasses() {
    for (const row of container.children) {
      row.classList.toggle('is-selected', state.selection.has(row.dataset.id));
    }
  }

  function handleRowClick(event, track, index) {
    if (event.shiftKey && rendered.length) {
      const [from, to] = [lastAnchorIndex, index].sort((a, b) => a - b);
      state.selection.clear();
      for (let i = from; i <= to; i += 1) state.selection.add(rendered[i].id);
    } else if (event.ctrlKey || event.metaKey) {
      if (state.selection.has(track.id)) state.selection.delete(track.id);
      else state.selection.add(track.id);
      lastAnchorIndex = index;
    } else {
      state.selection.clear();
      state.selection.add(track.id);
      lastAnchorIndex = index;
    }
    applySelectionClasses();
  }

  function playlistMenuItems(trackIds) {
    const playlists = state.store.playlists;
    if (!playlists.length) {
      return [{ label: 'Brak playlist — utwórz najpierw', action: () => {} }];
    }
    return playlists.map((p) => ({
      label: p.name,
      action: async () => {
        const added = await addToPlaylist(p.id, trackIds);
        toast(added
          ? `Dodano ${trackCount(added)} do „${p.name}”`
          : `Wszystko już jest na „${p.name}”`);
      },
    }));
  }

  function openRowMenu(event, track) {
    event.preventDefault();
    if (!state.selection.has(track.id)) {
      state.selection.clear();
      state.selection.add(track.id);
      applySelectionClasses();
    }

    const targets = targetsFor(track);
    const label = targets.length > 1 ? `${trackCount(targets.length)}` : track.title;

    const items = [
      { header: label },
      { label: 'Odtwórz teraz', action: () => playback.playList(rendered.map((t) => t.id), track.id) },
      {
        label: isFavorite(track.id) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych',
        action: () => targets.forEach((id) => toggleFavorite(id)),
      },
      'separator',
      { header: 'Dodaj do playlisty' },
      ...playlistMenuItems(targets),
      'separator',
      {
        label: 'Eksportuj na urządzenie…',
        action: () => exportDialog.open({
          trackIds: targets,
          folderName: 'Wybrane utwory',
          sourceLabel: targets.length > 1 ? 'Wybrane utwory' : track.title,
        }),
      },
      'separator',
    ];

    if (state.view.kind === 'playlist') {
      items.push({
        label: 'Usuń z tej playlisty',
        action: async () => {
          for (const id of targets) await removeFromPlaylist(state.view.id, id);
        },
      });
    }

    items.push(
      { label: 'Pokaż w Eksploratorze', action: () => window.api.reveal(track.path) },
      {
        label: 'Usuń z biblioteki',
        danger: true,
        action: async () => {
          setStore(await window.api.removeTracks(targets));
          playback.pruneMissing();
          toast(`Usunięto ${trackCount(targets.length)} z biblioteki`);
        },
      },
    );

    showContextMenu(event.clientX, event.clientY, items);
  }

  function buildRow(track, index) {
    const favourite = isFavorite(track.id);

    const favButton = el('button', {
      class: `t-fav${favourite ? ' is-on' : ''}`,
      type: 'button',
      title: favourite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych',
      text: favourite ? '♥' : '♡',
      onClick: (event) => { event.stopPropagation(); toggleFavorite(track.id); },
    });

    const menuButton = el('button', {
      class: 't-menu',
      type: 'button',
      title: 'Więcej',
      text: '⋯',
      onClick: (event) => { event.stopPropagation(); openRowMenu(event, track); },
    });

    const row = el('div', {
      class: 'track-row',
      draggable: 'true',
      dataset: { id: track.id, index: String(index) },
      onClick: (event) => handleRowClick(event, track, index),
      onDblclick: () => playback.playList(rendered.map((t) => t.id), track.id),
      onContextmenu: (event) => openRowMenu(event, track),
    }, [
      favButton,
      el('span', { class: 't-num', text: String(index + 1) }),
      el('span', { class: 't-title', text: track.title, title: track.title }),
      el('span', { class: 't-artist', text: track.artist, title: track.artist }),
      el('span', { class: 't-album', text: track.album, title: track.album }),
      el('span', { class: 't-time', text: formatTime(track.duration) }),
      menuButton,
    ]);

    row.addEventListener('dragstart', (event) => {
      const payload = targetsFor(track);
      event.dataTransfer.setData(TRACK_DRAG_TYPE, JSON.stringify(payload));
      event.dataTransfer.setData('text/plain', track.title);
      event.dataTransfer.effectAllowed = 'copyMove';
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('is-dragging'));

    return row;
  }

  /** Reordering by drag, available only where the order is the user's own. */
  function enablePlaylistReorder() {
    if (state.view.kind !== 'playlist' || state.search.trim()) return;

    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
  }

  function rowIndexAt(clientY) {
    for (const row of container.children) {
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return Number(row.dataset.index);
    }
    return rendered.length - 1;
  }

  function onDragOver(event) {
    if (!event.dataTransfer.types.includes(TRACK_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  async function onDrop(event) {
    const raw = event.dataTransfer.getData(TRACK_DRAG_TYPE);
    if (!raw) return;
    event.preventDefault();

    const dragged = JSON.parse(raw);
    if (dragged.length !== 1) return;

    const from = rendered.findIndex((t) => t.id === dragged[0]);
    const to = rowIndexAt(event.clientY);
    if (from >= 0 && to >= 0 && from !== to) {
      await reorderPlaylist(state.view.id, from, to);
    }
  }

  function highlightPlaying() {
    const playingId = playback.currentId();
    for (const row of container.children) {
      row.classList.toggle('is-playing', row.dataset.id === playingId);
    }
  }

  function render() {
    container.removeEventListener('dragover', onDragOver);
    container.removeEventListener('drop', onDrop);

    rendered = tracksForView();
    titleNode.textContent = viewTitle();

    const totalSeconds = rendered.reduce((sum, t) => sum + t.duration, 0);
    const duration = formatTotalDuration(totalSeconds);
    metaNode.textContent = rendered.length
      ? `${trackCount(rendered.length)}${duration ? ` · ${duration}` : ''}`
      : '';

    const fragment = document.createDocumentFragment();
    rendered.forEach((track, index) => fragment.append(buildRow(track, index)));
    container.replaceChildren(fragment);

    const libraryEmpty = Object.keys(state.store.tracks).length === 0;
    emptyState.hidden = rendered.length > 0 || !libraryEmpty;
    container.hidden = rendered.length === 0 && libraryEmpty;

    if (!rendered.length && !libraryEmpty) {
      container.append(el('p', {
        class: 'list-note',
        text: state.search.trim()
          ? 'Nic nie pasuje do wyszukiwania.'
          : 'Ta lista jest pusta. Przeciągnij tu utwory z biblioteki.',
      }));
    }

    // Playlist and folder headers get their own actions in the toolbar.
    $('#btn-rename-playlist').hidden = state.view.kind !== 'playlist';
    $('#btn-delete-playlist').hidden = state.view.kind !== 'playlist';

    enablePlaylistReorder();
    highlightPlaying();
    applySelectionClasses();
  }

  on('library', render);
  on('view', render);
  on('search', render);
  on('playback', highlightPlaying);

  return {
    render,
    /** Ids in the order shown, for "play everything in this view". */
    visibleIds: () => rendered.map((t) => t.id),
    selectedIds,
  };
}
