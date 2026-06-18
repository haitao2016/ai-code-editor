// ============================================================
// Preload Script — Secure Bridge between Main and Renderer
// ============================================================
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // ─── Window Controls ───────────────────────────────────
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.sendSync('window:isMaximized'),

  // ─── File Dialogs ──────────────────────────────────────
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:saveFile', options),

  // ─── Native File System ────────────────────────────────
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
    readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
    stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
    mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    unlink: (path: string) => ipcRenderer.invoke('fs:unlink', path),
    rmdir: (path: string) => ipcRenderer.invoke('fs:rmdir', path),
    exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
    watch: (path: string) => {
      ipcRenderer.send('fs:watch', path);
      return {
        on: (channel: string, callback: (...args: any[]) => void) => {
          const sub = (_event: any, ...args: any[]) => callback(...args);
          ipcRenderer.on(`fs:change:${channel}`, sub);
          return () => ipcRenderer.removeListener(`fs:change:${channel}`, sub);
        },
      };
    },
  },

  // ─── Terminal ──────────────────────────────────────────
  terminal: {
    create: (cols: number, rows: number) => ipcRenderer.invoke('terminal:create', cols, rows),
    write: (id: number, data: string) => ipcRenderer.send('terminal:write', id, data),
    resize: (id: number, cols: number, rows: number) => ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id: number) => ipcRenderer.send('terminal:kill', id),
    onData: (id: number, callback: (data: string) => void) => {
      const handler = (_event: any, termId: number, data: string) => {
        if (termId === id) callback(data);
      };
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
    onExit: (id: number, callback: (code: number) => void) => {
      const handler = (_event: any, termId: number, code: number) => {
        if (termId === id) callback(code);
      };
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.removeListener('terminal:exit', handler);
    },
  },

  // ─── Shell ─────────────────────────────────────────────
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // ─── App Info ──────────────────────────────────────────
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),

  // ─── Platform ──────────────────────────────────────────
  platform: process.platform,
  isElectron: true,

  // ─── Main → Renderer Event Listener ────────────────────
  on(channel: string, callback: (...args: any[]) => void): () => void {
    const handler = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
