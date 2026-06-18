// ============================================================
// Electron Main Process — Auto Update Support
// ============================================================
import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildMenu } from './menu';
import { setupFsHandlers } from './fs-handlers';
import { setupTerminal } from './terminal-handlers';
import { setupLSPHandlers } from './lsp-handlers';
import { setupDAPHandlers } from './dap-handlers';
import { autoUpdater } from 'electron-updater';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Distinguish between dev and production
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'AI Code Editor v3.0',
    backgroundColor: '#1e1e2e',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Build and apply menu
  const menu = buildMenu(mainWindow);
  Menu.setApplicationMenu(menu);

  // Load URL
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ─────────────────────────────────────────
app.whenReady().then(() => {
  // Workspace root for path validation
  const workspaceRoot = process.cwd();
  ipcMain.handle('app:getWorkspaceRoot', () => workspaceRoot);

  // Setup IPC handlers
  setupFsHandlers();
  setupTerminal();
  setupLSPHandlers();
  setupDAPHandlers();

  // Setup auto-updater
  setupAutoUpdater();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─── Window Controls ───────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.on('window:isMaximized', (event) => {
  event.returnValue = mainWindow?.isMaximized() ?? false;
});

// ─── File Dialogs ─────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:openFile', async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters,
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_event, options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  });
  return result.canceled ? null : result.filePath;
});

// ─── Shell ─────────────────────────────────────────────────
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url);
});

// ─── App Info ──────────────────────────────────────────────
ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion(),
  name: app.getName(),
  platform: process.platform,
  arch: process.arch,
  isPackaged: app.isPackaged,
}));

// ─── Auto Update ───────────────────────────────────────────
let updateDownloaded = false;

function setupAutoUpdater(): void {
  // Configure auto updater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;

  // Check for updates
  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('update:checking', {});
  });

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update:not-available', {});
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update:download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    sendToRenderer('update:downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (error) => {
    sendToRenderer('update:error', {
      message: error.message,
    });
  });

  // Check for updates after a short delay
  setTimeout(() => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch((err) => {
        console.log('Update check failed:', err.message);
      });
    }
  }, 10000); // 10 second delay after startup
}

function sendToRenderer(channel: string, data: any): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// IPC: Check for updates manually
ipcMain.handle('update:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      success: true,
      version: result?.updateInfo?.version,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// IPC: Download update
ipcMain.handle('update:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// IPC: Install update (quit and install)
ipcMain.handle('update:install', () => {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall(false, true);
  }
  return { success: updateDownloaded };
});
