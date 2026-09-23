import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { AUDIO_EXTENSIONS } from '../shared/audio-files.js';
import { normalizeStore } from '../shared/store-schema.js';
import { scanFolder, scanFiles } from './library.js';
import { planExport, runExport } from './export.js';
import { getStore, updateStore, flushStore } from './store.js';

/**
 * The renderer's entire view of the outside world.
 *
 * Everything the window can do to the disk goes through one of these channels.
 * The renderer keeps its own copy of the library for display, but the copy in
 * the main process is the one that gets written, so each handler returns the
 * updated store and the renderer adopts it wholesale. That avoids the two
 * copies quietly drifting apart.
 */

function windowFor(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function reportProgress(event, phase) {
  return (done, total) => {
    if (event.sender.isDestroyed()) return;
    event.sender.send('library:progress', { phase, done, total });
  };
}

/** Merge freshly scanned tracks in, keeping the original "added" date of
 *  anything already known so a rescan does not reshuffle the library. */
function mergeTracks(existing, incoming) {
  const merged = { ...existing };
  let addedCount = 0;
  for (const track of incoming) {
    if (merged[track.id]) {
      merged[track.id] = { ...track, addedAt: merged[track.id].addedAt };
    } else {
      merged[track.id] = track;
      addedCount += 1;
    }
  }
  return { merged, addedCount };
}

function withinFolder(filePath, folder) {
  const normalizedFolder = path.resolve(folder).replace(/\\/g, '/').toLowerCase();
  const normalizedFile = path.resolve(filePath).replace(/\\/g, '/').toLowerCase();
  return normalizedFile.startsWith(`${normalizedFolder}/`);
}

/** Drop tracks and every reference to them, so no playlist keeps a dead entry. */
function purgeTracks(store, idsToRemove) {
  const doomed = new Set(idsToRemove);
  const tracks = Object.fromEntries(
    Object.entries(store.tracks).filter(([id]) => !doomed.has(id)),
  );
  return {
    tracks,
    favorites: store.favorites.filter((id) => !doomed.has(id)),
    playlists: store.playlists.map((p) => ({
      ...p,
      trackIds: p.trackIds.filter((id) => !doomed.has(id)),
    })),
  };
}

async function importFolder(event, folderPath) {
  const tracks = await scanFolder(folderPath, reportProgress(event, 'scan'));
  const store = getStore();
  const { merged, addedCount } = mergeTracks(store.tracks, tracks);
  const folders = store.folders.includes(folderPath)
    ? store.folders
    : [...store.folders, folderPath];

  updateStore({ tracks: merged, folders });
  await flushStore();
  return { store: getStore(), addedCount, scannedCount: tracks.length, folder: folderPath };
}

export function registerIpcHandlers() {
  ipcMain.handle('store:load', () => getStore());

  ipcMain.handle('store:save-settings', (_event, settings) => {
    const next = normalizeStore({ ...getStore(), settings });
    updateStore({ settings: next.settings });
    return next.settings;
  });

  ipcMain.handle('store:save-playlists', (_event, playlists) => {
    const next = normalizeStore({ ...getStore(), playlists });
    updateStore({ playlists: next.playlists });
    return next.playlists;
  });

  ipcMain.handle('store:save-favorites', (_event, favorites) => {
    const next = normalizeStore({ ...getStore(), favorites });
    updateStore({ favorites: next.favorites });
    return next.favorites;
  });

  ipcMain.handle('library:pick-folder', async (event) => {
    const result = await dialog.showOpenDialog(windowFor(event), {
      title: 'Wybierz folder z muzyka',
      properties: ['openDirectory'],
      buttonLabel: 'Dodaj folder',
    });
    if (result.canceled || !result.filePaths.length) return null;
    return importFolder(event, result.filePaths[0]);
  });

  // Used by drag-and-drop, where the path is already known.
  ipcMain.handle('library:add-folder', (event, folderPath) => importFolder(event, folderPath));

  ipcMain.handle('library:pick-files', async (event) => {
    const result = await dialog.showOpenDialog(windowFor(event), {
      title: 'Wybierz pliki muzyczne',
      properties: ['openFile', 'multiSelections'],
      buttonLabel: 'Dodaj pliki',
      filters: [
        { name: 'Pliki muzyczne', extensions: AUDIO_EXTENSIONS.map((e) => e.slice(1)) },
        { name: 'Wszystkie pliki', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return addFilePaths(event, result.filePaths);
  });

  ipcMain.handle('library:add-files', (event, filePaths) => addFilePaths(event, filePaths));

  async function addFilePaths(event, filePaths) {
    const tracks = await scanFiles(filePaths, reportProgress(event, 'scan'));
    const { merged, addedCount } = mergeTracks(getStore().tracks, tracks);
    updateStore({ tracks: merged });
    await flushStore();
    return { store: getStore(), addedCount, scannedCount: tracks.length, folder: null };
  }

  ipcMain.handle('library:remove-folder', async (_event, folderPath) => {
    const store = getStore();
    const doomed = Object.values(store.tracks)
      .filter((t) => withinFolder(t.path, folderPath))
      .map((t) => t.id);

    updateStore({
      ...purgeTracks(store, doomed),
      folders: store.folders.filter((f) => f !== folderPath),
    });
    await flushStore();
    return getStore();
  });

  ipcMain.handle('library:remove-tracks', async (_event, ids) => {
    updateStore(purgeTracks(getStore(), ids ?? []));
    await flushStore();
    return getStore();
  });

  ipcMain.handle('library:rescan', async (event) => {
    const folders = [...getStore().folders];
    let addedCount = 0;
    for (const folder of folders) {
      const result = await importFolder(event, folder);
      addedCount += result.addedCount;
    }
    return { store: getStore(), addedCount, scannedCount: 0, folder: null };
  });

  // A drag from Explorer can mix folders and loose files, and the renderer
  // cannot tell them apart, so the sorting happens here.
  ipcMain.handle('library:add-paths', async (event, paths) => {
    const folders = [];
    const files = [];
    for (const candidate of paths ?? []) {
      try {
        const info = await stat(candidate);
        (info.isDirectory() ? folders : files).push(candidate);
      } catch {
        // Vanished between the drop and the read; nothing useful to do.
      }
    }

    let addedCount = 0;
    for (const folder of folders) {
      addedCount += (await importFolder(event, folder)).addedCount;
    }
    if (files.length) {
      addedCount += (await addFilePaths(event, files)).addedCount;
    }
    return { store: getStore(), addedCount, scannedCount: 0, folder: null };
  });

  ipcMain.handle('shell:reveal', (_event, filePath) => {
    shell.showItemInFolder(filePath);
  });

  /* ------------------------------------------------------------- export */

  /**
   * Copying onto a device is planned and run from the same three inputs, so
   * the renderer never has to hold - or hand back - a list of hundreds of
   * file names. Planning is cheap enough to repeat, and repeating it means
   * the copy works from what the disk looks like now rather than from what
   * it looked like when the window drew the dialog.
   */
  function tracksToExport(trackIds) {
    const { tracks } = getStore();
    return (trackIds ?? []).map((id) => tracks[id]).filter(Boolean);
  }

  ipcMain.handle('export:plan', async (event, { trackIds, folderName, targetRoot }) => {
    let root = targetRoot;
    if (!root) {
      const result = await dialog.showOpenDialog(windowFor(event), {
        title: 'Wybierz urzadzenie lub folder docelowy',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Wybierz',
      });
      if (result.canceled || !result.filePaths.length) return null;
      root = result.filePaths[0];
    }

    const plan = await planExport({ tracks: tracksToExport(trackIds), targetRoot: root, folderName });
    return {
      targetRoot: root,
      targetDir: plan.targetDir,
      count: plan.items.length,
      totalBytes: plan.totalBytes,
      freeBytes: plan.freeBytes,
      missing: plan.missing,
      // Enough of the naming for the dialog to show what it will look like.
      sampleNames: plan.items.slice(0, 3).map((item) => item.name),
    };
  });

  let exportAbort = null;

  ipcMain.handle('export:run', async (event, { trackIds, folderName, targetRoot }) => {
    const plan = await planExport({
      tracks: tracksToExport(trackIds),
      targetRoot,
      folderName,
    });

    exportAbort = new AbortController();
    try {
      const result = await runExport(plan, {
        signal: exportAbort.signal,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send('export:progress', progress);
        },
      });
      return { ...result, targetDir: plan.targetDir };
    } finally {
      exportAbort = null;
    }
  });

  ipcMain.handle('export:cancel', () => {
    exportAbort?.abort();
  });
}
