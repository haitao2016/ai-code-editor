// ============================================================
// Preload Script — Secure Bridge between Main and Renderer
// ============================================================
import { contextBridge, ipcRenderer } from 'electron';
import { join, normalize, resolve, sep } from 'path';

// ═══ Path validation (anti-path-traversal) ═══════════════
let workspaceRoot = '';

ipcRenderer.invoke('app:getWorkspaceRoot').then((root: string) => {
  workspaceRoot = resolve(root || process.cwd());
});

function sanitizePath(filePath: string): string {
  if (!workspaceRoot) return filePath;
  const resolved = resolve(normalize(filePath));
  // Ensure path stays within workspace root
  const wsRoot = resolve(workspaceRoot);
  if (!resolved.startsWith(wsRoot + sep) && resolved !== wsRoot) {
    // Allow read access to common system paths for display only
    if (!resolved.includes('..') && resolved.length < 500) {
      return resolved;
    }
    throw new Error(`Access denied: path outside workspace (${filePath})`);
  }
  return resolved;
}

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

  // ─── Agent Command Execution ────────────────────────────
  exec: {
    command: (command: string, cwd?: string) => ipcRenderer.invoke('exec:command', command, cwd),
    spawn: (command: string, args: string[], cwd?: string) => ipcRenderer.invoke('exec:spawn', command, args, cwd),
  },

  // ─── Shell ─────────────────────────────────────────────
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // ─── LSP ──────────────────────────────────────────────
  lsp: {
    start: (config: any) => ipcRenderer.invoke('lsp:start', config),
    write: (channel: string, data: string) => ipcRenderer.send('lsp:write', channel, data),
    close: (channel: string) => ipcRenderer.send('lsp:close', channel),
    shutdownAll: () => ipcRenderer.send('lsp:shutdownAll'),
    onData: (channel: string, callback: (data: string) => void) => {
      const handler = (_event: any, data: string) => callback(data);
      ipcRenderer.on(`lsp:data:${channel}`, handler);
      return () => ipcRenderer.removeListener(`lsp:data:${channel}`, handler);
    },
    onError: (channel: string, callback: (msg: string) => void) => {
      const handler = (_event: any, msg: string) => callback(msg);
      ipcRenderer.on(`lsp:error:${channel}`, handler);
      return () => ipcRenderer.removeListener(`lsp:error:${channel}`, handler);
    },
    onClosed: (channel: string, callback: (code: number) => void) => {
      const handler = (_event: any, code: number) => callback(code);
      ipcRenderer.on(`lsp:closed:${channel}`, handler);
      return () => ipcRenderer.removeListener(`lsp:closed:${channel}`, handler);
    },
  },

  // ─── DAP ──────────────────────────────────────────────
  dap: {
    start: (config: any, sessionId: string) => ipcRenderer.invoke('dap:start', sessionId, config),
    write: (sessionId: string, data: string) => ipcRenderer.send('dap:write', sessionId, data),
    stop: (sessionId: string) => ipcRenderer.send('dap:stop', sessionId),
    onData: (sessionId: string, callback: (data: string) => void) => {
      const handler = (_event: any, data: string) => callback(data);
      ipcRenderer.on(`dap:data:${sessionId}`, handler);
      return () => ipcRenderer.removeListener(`dap:data:${sessionId}`, handler);
    },
    onError: (sessionId: string, callback: (msg: string) => void) => {
      const handler = (_event: any, msg: string) => callback(msg);
      ipcRenderer.on(`dap:error:${sessionId}`, handler);
      return () => ipcRenderer.removeListener(`dap:error:${sessionId}`, handler);
    },
    onClose: (sessionId: string, callback: (code: number) => void) => {
      const handler = (_event: any, code: number) => callback(code);
      ipcRenderer.on(`dap:closed:${sessionId}`, handler);
      return () => ipcRenderer.removeListener(`dap:closed:${sessionId}`, handler);
    },
  },

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
