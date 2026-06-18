// ============================================================
// 实时协作编辑 — CRDT 基础结构 (Yjs)
// ============================================================
import * as Y from 'yjs';

// ─── Types ─────────────────────────────────────────────────
export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { line: number; column: number };
  selection?: { startLine: number; startCol: number; endLine: number; endCol: number };
}

export interface CollabSession {
  id: string;
  name: string;
  users: Map<string, CollabUser>;
  ydoc: Y.Doc;
  ytext: Y.Text;
}

export interface CollabState {
  roomId: string | null;
  username: string;
  color: string;
  connected: boolean;
  collaborators: CollabUser[];
}

// ─── Color palette for users ──────────────────────────────
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9',
];

export function getColorForUser(index: number): string {
  return COLORS[index % COLORS.length];
}

// ─── Collab Manager ───────────────────────────────────────
class CollabManager {
  private roomId: string | null = null;
  private username: string = `User-${Math.floor(Math.random() * 10000)}`;
  private color: string = COLORS[Math.floor(Math.random() * COLORS.length)];
  private connected = false;
  private collaborators: CollabUser[] = [];
  private listeners: Array<(state: CollabState) => void> = [];
  private sessions: Map<string, CollabSession> = new Map();

  // Yjs integration (optional)
  private ydocs: Map<string, Y.Doc> = new Map();
  private ytexts: Map<string, Y.Text> = new Map();

  /** Get current room ID */
  getRoomId(): string | null {
    return this.roomId;
  }

  /** Check if connected */
  isConnected(): boolean {
    return this.connected;
  }

  /** Get username */
  getUsername(): string {
    return this.username;
  }

  /** Set username */
  setUsername(name: string): void {
    this.username = name;
    this.notifySubscribers();
  }

  /** Get color */
  getColor(): string {
    return this.color;
  }

  /** Get current state (immutable copy) */
  getState(): CollabState {
    return {
      roomId: this.roomId,
      username: this.username,
      color: this.color,
      connected: this.connected,
      collaborators: [...this.collaborators],
    };
  }

  /** Generate random room ID */
  generateRoomId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /** Leave current room */
  leaveRoom(): void {
    this.roomId = null;
    this.connected = false;
    this.collaborators = [];
    this.notifySubscribers();
  }

  /** Subscribe to state changes */
  subscribe(listener: (state: CollabState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  /** Notify all subscribers */
  private notifySubscribers(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  // ─── Yjs integration (Phase 6.3.1) ──────────────────────

  /** Initialize Yjs for a file */
  initYjsForFile(filePath: string, initialContent: string): Y.Text {
    if (this.ydocs.has(filePath)) {
      return this.ytexts.get(filePath)!;
    }

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('monaco');

    // Set initial content if empty
    if (ytext.length === 0 && initialContent) {
      ytext.insert(0, initialContent);
    }

    this.ydocs.set(filePath, ydoc);
    this.ytexts.set(filePath, ytext);

    return ytext;
  }

  /** Get Yjs text for a file */
  getYjsText(filePath: string): Y.Text | undefined {
    return this.ytexts.get(filePath);
  }

  /** Destroy all Yjs sessions */
  destroyAll(): void {
    for (const ydoc of this.ydocs.values()) {
      ydoc.destroy();
    }
    this.ydocs.clear();
    this.ytexts.clear();
    this.sessions.clear();
  }
}

// ─── Singleton ─────────────────────────────────────────────
export const collabManager = new CollabManager();

export function getCollabManager(): CollabManager {
  return collabManager;
}

/** Initialize collaboration (call on app start) */
export function initCollab(userName?: string): void {
  if (userName) {
    collabManager.setUsername(userName);
  }
  console.log(`[Collab] Initialized as ${collabManager.getUsername()}`);
}

/** Get Yjs text for a file (creates if not exists) */
export function getCollabText(filePath: string, initialContent: string = ''): Y.Text {
  return collabManager.initYjsForFile(filePath, initialContent);
}

/** Sync content from Yjs text */
export function getContentFromYjs(ytext: Y.Text): string {
  return ytext.toString();
}

/** Apply content to Yjs text (full replace) */
export function setContentToYjs(ytext: Y.Text, content: string): void {
  const current = ytext.toString();
  if (current !== content) {
    ytext.delete(0, ytext.length);
    ytext.insert(0, content);
  }
}
