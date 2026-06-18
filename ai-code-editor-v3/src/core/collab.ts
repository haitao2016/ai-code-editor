// ============================================================
// Collaboration Engine — Yjs CRDT + y-monaco
// ============================================================
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { getEditor, getMonaco } from './editor';
import { useUIStore } from './stores';

interface CollabState {
  connected: boolean;
  roomId: string | null;
  username: string;
  color: string;
  collaborators: Collaborator[];
}

interface Collaborator {
  clientId: number;
  name: string;
  color: string;
  cursor?: { line: number; column: number };
}

const COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24',
  '#6c5ce7', '#a29bfe', '#fd79a8', '#00cec9',
  '#fdcb6e', '#e17055', '#00b894', '#0984e3',
];

class CollabManager {
  private ydoc: Y.Doc | null = null;
  private provider: WebsocketProvider | null = null;
  private binding: MonacoBinding | null = null;
  private state: CollabState = {
    connected: false,
    roomId: null,
    username: `User-${Math.floor(Math.random() * 1000)}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    collaborators: [],
  };
  private listeners: (() => void)[] = [];

  // ─── Room Management ───────────────────────────────────
  joinRoom(roomId: string, serverUrl: string = 'ws://localhost:4173'): boolean {
    this.leaveRoom();

    try {
      this.ydoc = new Y.Doc();
      this.provider = new WebsocketProvider(serverUrl, roomId, this.ydoc);

      this.provider.on('status', (event: { connected: boolean }) => {
        this.state.connected = event.connected;
        this.notify();
      });

      // Awareness for cursor sync and user info
      this.provider.awareness.setLocalStateField('user', {
        name: this.state.username,
        color: this.state.color,
      });

      this.provider.awareness.on('change', () => {
        this.updateCollaborators();
      });

      // Bind to Monaco editor
      const editor = getEditor();
      const monaco = getMonaco();
      if (editor && monaco) {
        const yText = this.ydoc.getText('monaco');
        const model = editor.getModel();
        if (model) {
          this.binding = new MonacoBinding(
            yText,
            model,
            new Set([editor]),
            this.provider.awareness
          );
        }
      }

      this.state.roomId = roomId;
      this.notify();
      return true;
    } catch (err) {
      console.error('[Collab] Failed to join room:', err);
      return false;
    }
  }

  leaveRoom(): void {
    if (this.binding) {
      this.binding = null;
    }
    if (this.provider) {
      this.provider.disconnect();
      this.provider.destroy();
      this.provider = null;
    }
    if (this.ydoc) {
      this.ydoc.destroy();
      this.ydoc = null;
    }
    this.state.connected = false;
    this.state.roomId = null;
    this.state.collaborators = [];
    this.notify();
  }

  // ─── Collaborators ─────────────────────────────────────
  private updateCollaborators(): void {
    if (!this.provider) return;
    const states = this.provider.awareness.getStates();
    const collaborators: Collaborator[] = [];

    states.forEach((state, clientId) => {
      if (clientId === this.provider!.awareness.clientID) return;
      const user = state.user;
      if (user) {
        collaborators.push({
          clientId,
          name: user.name || `User-${clientId}`,
          color: user.color || '#888',
        });
      }
    });

    this.state.collaborators = collaborators;
    this.notify();
  }

  // ─── Username ──────────────────────────────────────────
  setUsername(name: string): void {
    this.state.username = name;
    if (this.provider) {
      this.provider.awareness.setLocalStateField('user', {
        name: this.state.username,
        color: this.state.color,
      });
    }
    this.notify();
  }

  getUsername(): string {
    return this.state.username;
  }

  getColor(): string {
    return this.state.color;
  }

  // ─── State ─────────────────────────────────────────────
  getState(): CollabState {
    return { ...this.state };
  }

  isConnected(): boolean {
    return this.state.connected;
  }

  getRoomId(): string | null {
    return this.state.roomId;
  }

  generateRoomId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  // ─── Subscription ──────────────────────────────────────
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}

export const collabManager = new CollabManager();
