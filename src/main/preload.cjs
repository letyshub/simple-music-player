'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * The only bridge between the window and the machine.
 *
 * Deliberately a flat list of named actions rather than a general "call this
 * channel" function, so the renderer can never reach a channel that was not
 * meant for it. Written as CommonJS because the package is an ES module and
 * sandboxed preload scripts must be CommonJS.
 */

contextBridge.exposeInMainWorld('api', {
  // Library data
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveSettings: (settings) => ipcRenderer.invoke('store:save-settings', settings),
  savePlaylists: (playlists) => ipcRenderer.invoke('store:save-playlists', playlists),
  saveFavorites: (favorites) => ipcRenderer.invoke('store:save-favorites', favorites),

  // Importing music
  pickFolder: () => ipcRenderer.invoke('library:pick-folder'),
  addFolder: (folderPath) => ipcRenderer.invoke('library:add-folder', folderPath),
  pickFiles: () => ipcRenderer.invoke('library:pick-files'),
  addFiles: (filePaths) => ipcRenderer.invoke('library:add-files', filePaths),
  /** Mixed folders and files, as produced by a drag from Explorer. */
  addPaths: (paths) => ipcRenderer.invoke('library:add-paths', paths),
  removeFolder: (folderPath) => ipcRenderer.invoke('library:remove-folder', folderPath),
  removeTracks: (ids) => ipcRenderer.invoke('library:remove-tracks', ids),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  reveal: (filePath) => ipcRenderer.invoke('shell:reveal', filePath),

  // Copying onto a device. `planExport` opens the folder picker unless a
  // target is already known, and returns null when the user backs out.
  planExport: (request) => ipcRenderer.invoke('export:plan', request),
  runExport: (request) => ipcRenderer.invoke('export:run', request),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),

  /** Subscribe to export progress. Returns an unsubscribe function. */
  onExportProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.off('export:progress', handler);
  },

  /** Subscribe to scan progress. Returns an unsubscribe function. */
  onProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('library:progress', handler);
    return () => ipcRenderer.off('library:progress', handler);
  },

  /** Playable URL for a file. Shares an origin with the page itself, which is
   *  what keeps the Web Audio graph from treating it as foreign and muting
   *  the analyser. Must match the scheme registered in protocol.js. */
  trackUrl: (filePath) => `app://smp/track/${encodeURIComponent(filePath)}`,

  /** Real path of a dropped File, which the renderer cannot read on its own. */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
});
