// ============================================================
// Error Logger — centralized error tracking with severity levels
// ============================================================

type ErrorSeverity = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  id: number;
  timestamp: number;
  severity: ErrorSeverity;
  module: string;
  message: string;
  stack?: string;
  data?: any;
}

const MAX_LOG_ENTRIES = 500;
let nextId = 0;
const logEntries: LogEntry[] = [];

// Callbacks for external monitoring
type LogCallback = (entry: LogEntry) => void;
const logCallbacks: LogCallback[] = [];

// ═══ Core logging ══════════════════════════════════════════
function log(severity: ErrorSeverity, module: string, message: string, data?: any): LogEntry {
  const entry: LogEntry = {
    id: ++nextId,
    timestamp: Date.now(),
    severity,
    module,
    message,
    data,
  };

  // Capture stack for errors/warnings
  if (severity === 'error' || severity === 'warn') {
    try {
      entry.stack = new Error().stack?.replace(/^Error\n/, '').split('\n').slice(2).join('\n');
    } catch {}
  }

  // Store in ring buffer
  logEntries.push(entry);
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.shift();
  }

  // Console output
  const prefix = `[${severity.toUpperCase()}] [${module}]`;
  switch (severity) {
    case 'error':
      console.error(prefix, message, data || '');
      break;
    case 'warn':
      console.warn(prefix, message, data || '');
      break;
    case 'info':
      console.info(prefix, message, data || '');
      break;
    case 'debug':
      console.debug(prefix, message, data || '');
      break;
  }

  // Notify callbacks
  for (const cb of logCallbacks) {
    try { cb(entry); } catch {}
  }

  // Persist errors to IndexedDB
  if (severity === 'error') {
    persistError(entry);
  }

  return entry;
}

// ═══ Convenience methods ═══════════════════════════════════
export function logError(module: string, message: string, data?: any): LogEntry {
  return log('error', module, message, data);
}

export function logWarn(module: string, message: string, data?: any): LogEntry {
  return log('warn', module, message, data);
}

export function logInfo(module: string, message: string, data?: any): LogEntry {
  return log('info', module, message, data);
}

export function logDebug(module: string, message: string, data?: any): LogEntry {
  return log('debug', module, message, data);
}

// ═══ Safe wrappers (never throw) ══════════════════════════
export function safeLogError(module: string, message: string, data?: any): void {
  try { logError(module, message, data); } catch {}
}

export function safeLogWarn(module: string, message: string, data?: any): void {
  try { logWarn(module, message, data); } catch {}
}

// ═══ Query ════════════════════════════════════════════════
export function getErrorLogs(severity?: ErrorSeverity, module?: string, limit = 100): LogEntry[] {
  let filtered = [...logEntries];

  if (severity) {
    filtered = filtered.filter((e) => e.severity === severity);
  }
  if (module) {
    filtered = filtered.filter((e) => e.module === module);
  }

  return filtered.slice(-limit);
}

export function getErrorCount(module?: string): number {
  let errors = logEntries.filter((e) => e.severity === 'error');
  if (module) {
    errors = errors.filter((e) => e.module === module);
  }
  return errors.length;
}

export function getAllLogs(): LogEntry[] {
  return [...logEntries];
}

export function clearLogs(): void {
  logEntries.length = 0;
  clearPersistedErrors();
}

// ═══ Subscription ═════════════════════════════════════════
export function onLog(callback: LogCallback): () => void {
  logCallbacks.push(callback);
  return () => {
    const idx = logCallbacks.indexOf(callback);
    if (idx >= 0) logCallbacks.splice(idx, 1);
  };
}

// ═══ IndexedDB persistence for errors ═════════════════════
let errorDB: IDBDatabase | null = null;

async function openErrorDB(): Promise<IDBDatabase> {
  if (errorDB) return errorDB;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ai-code-editor-errors', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('errors')) {
        const store = db.createObjectStore('errors', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('module', 'module');
      }
    };
    req.onsuccess = () => {
      errorDB = req.result;
      resolve(errorDB!);
    };
    req.onerror = () => reject(req.error);
  });
}

async function persistError(entry: LogEntry): Promise<void> {
  try {
    const db = await openErrorDB();
    const tx = db.transaction('errors', 'readwrite');
    tx.objectStore('errors').put(entry);
    // Prune old entries
    const countReq = tx.objectStore('errors').count();
    await new Promise<void>((resolve) => {
      countReq.onsuccess = () => {
        if (countReq.result > MAX_LOG_ENTRIES) {
          const idx = tx.objectStore('errors').index('timestamp');
          const cursorReq = idx.openCursor();
          let deleted = 0;
          const toDelete = countReq.result - MAX_LOG_ENTRIES;
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor && deleted < toDelete) {
              cursor.delete();
              deleted++;
              cursor.continue();
            }
          };
        }
        resolve();
      };
    });
  } catch {}
}

async function clearPersistedErrors(): Promise<void> {
  try {
    const db = await openErrorDB();
    const tx = db.transaction('errors', 'readwrite');
    tx.objectStore('errors').clear();
  } catch {}
}

export async function loadErrorLogs(): Promise<LogEntry[]> {
  try {
    const db = await openErrorDB();
    const tx = db.transaction('errors', 'readonly');
    const store = tx.objectStore('errors');
    const idx = store.index('timestamp');
    const req = idx.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// ═══ Global error handler ═════════════════════════════════
export function setupGlobalErrorHandler(): void {
  window.addEventListener('error', (event) => {
    logError('global', `${event.message} (${event.filename}:${event.lineno}:${event.colno})`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError('global', `Unhandled rejection: ${event.reason}`, { stack: event.reason?.stack });
  });
}
