// ============================================================
// Electron API Type Declarations for Renderer
// ============================================================

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
}

export interface FileResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface DirResult {
  success: boolean;
  items?: FileEntry[];
  error?: string;
}

export interface AppInfo {
  version: string;
  name: string;
  platform: string;
  arch: string;
  isPackaged: boolean;
}

export interface TerminalAPI {
  create(cols: number, rows: number): Promise<{ success: boolean; id: number; fallback: boolean }>;
  write(id: number, data: string): void;
  resize(id: number, cols: number, rows: number): void;
  kill(id: number): void;
  onData(id: number, callback: (data: string) => void): () => void;
  onExit(id: number, callback: (code: number) => void): () => void;
}

export interface ElectronAPI {
  minimize(): void;
  maximize(): void;
  close(): void;
  isMaximized(): boolean;
  openFolder(): Promise<string | null>;
  openFile(options?: { filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
  saveFileDialog(options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
  fs: {
    readFile(path: string): Promise<FileResult>;
    writeFile(path: string, content: string): Promise<{ success: boolean; error?: string }>;
    readDir(path: string): Promise<DirResult>;
    stat(path: string): Promise<{ success: boolean; stat?: any; error?: string }>;
    mkdir(path: string): Promise<{ success: boolean; error?: string }>;
    rename(oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }>;
    unlink(path: string): Promise<{ success: boolean; error?: string }>;
    rmdir(path: string): Promise<{ success: boolean; error?: string }>;
    exists(path: string): Promise<boolean>;
    watch(path: string): {
      on(channel: string, callback: (...args: any[]) => void): () => void;
    };
  };
  terminal: TerminalAPI;
  openExternal(url: string): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  platform: string;
  isElectron: boolean;
  on(channel: string, callback: (...args: any[]) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
