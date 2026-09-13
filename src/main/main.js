import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAppScheme, installAppProtocol, appUrl } from './protocol.js';
import { registerIpcHandlers } from './ipc.js';
import { loadStore, flushStoreNow } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Privileged schemes have to be declared before the app finishes starting.
registerAppScheme();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0e1012',
    title: 'Simple Music Player',
    // Packaged builds take the icon from the executable; this is what
    // makes the window look right when running from source.
    icon: path.join(here, '..', 'renderer', 'assets', 'icon-256.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // Painting an empty window first looks broken; wait for the first frame.
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Keep F12 for diagnostics even though the menu bar is hidden.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Nothing in this app should ever navigate away or spawn a second window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  mainWindow.on('closed', () => { mainWindow = null; });

  // Loaded over the app scheme rather than from a file, so that the page
  // and the audio it plays share one origin. See protocol.js.
  void mainWindow.loadURL(appUrl('index.html'));
}

// A second copy would fight the first one over the library file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await loadStore();
    installAppProtocol();
    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());

  // The library save is debounced, so force the last one out before exiting.
  app.on('before-quit', async (event) => {
    event.preventDefault();
    await flushStoreNow();
    app.exit(0);
  });
}
