// ============================================================
// IndexedDB 文件系统 — TypeScript 封装
// ============================================================
import type { FileEntry } from '../types';

const DB_NAME = 'ai-code-editor-v3';
const DB_VERSION = 1;

let dbCache: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbCache) return Promise.resolve(dbCache);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'path' });
      }
      if (!db.objectStoreNames.contains('chatHistory')) {
        db.createObjectStore('chatHistory', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      dbCache = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbPut(storeName: string, data: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetAll(storeName: string): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbClear(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── File Operations ───────────────────────────────────────
export async function saveFile(entry: FileEntry): Promise<void> {
  await dbPut('files', { ...entry, updatedAt: Date.now() });
}

export async function loadAllFiles(): Promise<FileEntry[]> {
  return dbGetAll('files');
}

export async function deleteFile(path: string): Promise<void> {
  await dbDelete('files', path);
}

export async function clearAllFiles(): Promise<void> {
  await dbClear('files');
}

// ─── Default Project Files ─────────────────────────────────
const DEFAULT_FILES: FileEntry[] = [
  {
    path: 'index.html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <h1>Hello, AI Code Editor!</h1>
    <p>Start editing to see the magic.</p>
  </div>
  <script src="main.js"></script>
</body>
</html>`,
    language: 'html',
    updatedAt: Date.now(),
  },
  {
    path: 'style.css',
    content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: #1e1e2e;
  color: #cdd6f4;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
#app {
  text-align: center;
  padding: 40px;
}
h1 { font-size: 2.5rem; margin-bottom: 1rem; color: #6366f1; }
p { color: #a6adc8; font-size: 1.1rem; }`,
    language: 'css',
    updatedAt: Date.now(),
  },
  {
    path: 'main.js',
    content: `// Main application entry
console.log('AI Code Editor v3.0 — Ready!');

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (app) {
    app.addEventListener('click', () => {
      app.style.transform = 'scale(1.02)';
      setTimeout(() => app.style.transform = 'scale(1)', 150);
    });
    app.style.transition = 'transform 0.15s ease';
    app.style.cursor = 'pointer';
  }
});`,
    language: 'javascript',
    updatedAt: Date.now(),
  },
];

export async function initDefaultFiles(): Promise<FileEntry[]> {
  const existing = await loadAllFiles();
  if (existing.length === 0) {
    for (const file of DEFAULT_FILES) {
      await saveFile(file);
    }
    return DEFAULT_FILES;
  }
  return existing;
}

export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', less: 'less',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', md: 'markdown', py: 'python',
    java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp',
    go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
    vue: 'html', svelte: 'html',
    sql: 'sql', sh: 'shell', yaml: 'yaml', yml: 'yaml',
    xml: 'xml', svg: 'xml', toml: 'ini',
  };
  return langMap[ext] || 'plaintext';
}

export function getFileIcon(path: string, isFolder: boolean): string {
  if (isFolder) return '📁';
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    html: '🌐', htm: '🌐', css: '🎨', scss: '🎨', less: '🎨',
    js: '📜', jsx: '⚛️', mjs: '📜', ts: '📘', tsx: '⚛️',
    json: '📋', md: '📝', py: '🐍', java: '☕', c: '⚙️',
    go: '🔷', rs: '🦀', rb: '💎', php: '🐘', sql: '🗄️',
    sh: '💻', yaml: '📄', yml: '📄', xml: '📰', svg: '🖼️',
    vue: '💚', svelte: '🧡',
  };
  return icons[ext] || '📄';
}
