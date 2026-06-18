// ============================================================
// Incremental Sync — Collaboration delta sync + offline queue
// ============================================================
import * as Y from 'yjs';

interface PendingChange {
  id: string;
  timestamp: number;
  operation: 'insert' | 'delete' | 'replace';
  path: string;
  offset?: number;
  text?: string;
}

interface SyncState {
  version: number;
  pendingChanges: PendingChange[];
  lastSyncTimestamp: number;
  offline: boolean;
}

class IncrementalSync {
  private queue: PendingChange[] = [];
  private version = 0;
  private lastSync = 0;
  private offline = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  // ─── Queue Management ──────────────────────────────────
  enqueue(change: Omit<PendingChange, 'id' | 'timestamp'>): void {
    this.queue.push({
      id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      ...change,
    });

    // Debounce sync
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.flush(), 300);
  }

  // ─── Flush changes to server ───────────────────────────
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    if (this.offline) {
      this.persistQueue();
      return;
    }

    const batch = [...this.queue];
    this.queue = [];

    try {
      // Send batch to collaboration server
      // In a real implementation, this would send via WebSocket
      this.version++;
      this.lastSync = Date.now();

      // Mark as synced
    } catch (err) {
      // Re-queue on failure
      this.queue.unshift(...batch);
      this.offline = true;
      this.persistQueue();
      console.warn('[IncrementalSync] Sync failed, queued offline');
    }
  }

  // ─── Offline Persistence ────────────────────────────
  private persistQueue(): void {
    try {
      const state: SyncState = {
        version: this.version,
        pendingChanges: this.queue,
        lastSyncTimestamp: this.lastSync,
        offline: true,
      };
      localStorage.setItem('aice:offline-sync', JSON.stringify(state));
    } catch {
      // Silently fail — queue stays in memory
    }
  }

  // ─── Restore from offline ─────────────────────────────
  restoreOfflineQueue(): PendingChange[] {
    try {
      const raw = localStorage.getItem('aice:offline-sync');
      if (!raw) return [];
      const state: SyncState = JSON.parse(raw);
      this.version = state.version;
      this.lastSync = state.lastSyncTimestamp;
      return state.pendingChanges || [];
    } catch {
      return [];
    }
  }

  // ─── Come back online ─────────────────────────────────
  comeOnline(): void {
    this.offline = false;
    const restored = this.restoreOfflineQueue();
    if (restored.length > 0) {
      this.queue = [...restored, ...this.queue];
      localStorage.removeItem('aice:offline-sync');
      this.flush();
    }
  }

  goOffline(): void {
    this.offline = true;
  }

  // ─── Conflict Detection ────────────────────────────
  detectConflict(local: Y.Doc, remote: Y.Doc): boolean {
    // Compare document state vectors
    const localState = Y.encodeStateVector(local);
    const remoteState = Y.encodeStateVector(remote);

    if (localState.byteLength !== remoteState.byteLength) return true;

    const localArr = new Uint8Array(localState);
    const remoteArr = new Uint8Array(remoteState);
    for (let i = 0; i < localArr.length; i++) {
      if (localArr[i] !== remoteArr[i]) return true;
    }
    return false;
  }

  // ─── Merge Strategy ──────────────────────────────────
  mergeChanges(local: PendingChange[], remote: PendingChange[]): PendingChange[] {
    const merged = new Map<string, PendingChange>();

    // Later timestamps win
    for (const change of [...local, ...remote]) {
      const key = `${change.path}:${change.offset}`;
      const existing = merged.get(key);
      if (!existing || change.timestamp > existing.timestamp) {
        merged.set(key, change);
      }
    }

    return [...merged.values()].sort((a, b) => a.timestamp - b.timestamp);
  }

  // ─── Stats ────────────────────────────────────────────
  getStats(): { queued: number; version: number; offline: boolean; lastSyncAgo: number } {
    return {
      queued: this.queue.length,
      version: this.version,
      offline: this.offline,
      lastSyncAgo: this.lastSync ? Date.now() - this.lastSync : -1,
    };
  }

  destroy(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.queue = [];
  }
}

export const incrementalSync = new IncrementalSync();
