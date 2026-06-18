// ============================================================
// Event Bus — 类型安全的事件发布/订阅，替代 (window as any) 全局函数
// ============================================================

// ─── Event types ───────────────────────────────────────────
export interface AppEvents {
  // File operations
  'file:opened': { path: string };
  'file:saved': { path: string; content: string };
  'file:deleted': { path: string };
  'file:created': { path: string };
  'file:changed': { path: string; content: string };
  'file-tree:refresh': void;

  // Editor
  'editor:ready': void;
  'code:applied': { code: string };
  'tab:switched': { path: string };
  'tab:closed': { path: string };

  // AI
  'ai:stream-start': void;
  'ai:stream-chunk': { text: string };
  'ai:stream-end': { fullText: string };
  'ai:stream-cancel': void;
  'ai:quota-updated': void;

  // UI
  'toast:show': { message: string; type?: 'info' | 'success' | 'error' | 'warning'; duration?: number; persistent?: boolean };
  'toast:dismiss': void;
  'notification:show': { title: string; message: string; progress?: number };
  'notification:dismiss': { id: string };
  'panel:toggle': { panel: 'sidebar' | 'chat' | 'terminal' | 'preview' };
  'modal:open': { id: string };
  'modal:close': { id: string };

  // Git
  'git:status-changed': void;

  // LSP
  'lsp:diagnostics': { path: string; diagnostics: any[] };

  // Debug
  'debug:started': void;
  'debug:stopped': void;
  'debug:breakpoint-hit': { file: string; line: number };
  'debug:step': void;

  // Plugin
  'plugin:activated': { pluginId: string };
  'plugin:deactivated': { pluginId: string };

  // Collaboration
  'collab:connected': void;
  'collab:disconnected': void;
  'collab:user-joined': { userId: string; name: string };
  'collab:user-left': { userId: string };

  // Settings
  'settings:changed': { key: string; value: any };
  'theme:changed': { theme: 'dark' | 'light' };
}

type EventCallback<T> = (data: T) => void;
type Unsubscribe = () => void;

class EventBus {
  private listeners = new Map<string, Set<EventCallback<any>>>();

  /** Subscribe to an event. Returns unsubscribe function. */
  on<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): Unsubscribe {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /** Subscribe to an event, fire once, then auto-unsubscribe. */
  once<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): Unsubscribe {
    const unsub = this.on(event, (data) => {
      unsub();
      callback(data);
    });
    return unsub;
  }

  /** Emit an event to all listeners. */
  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[EventBus] Error handling "${event}":`, err);
      }
    }
  }

  /** Remove all listeners for an event, or all events if none specified. */
  clear(event?: keyof AppEvents): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /** Get listener count for debugging. */
  listenerCount(event: keyof AppEvents): number {
    return this.listeners.get(event)?.size || 0;
  }
}

// ─── Singleton ─────────────────────────────────────────────
export const bus = new EventBus();

// ─── Migration helpers: bridge window globals → event bus ──
/** Bridge a (window as any) function to emit an event */
export function registerWindowBridge(
  name: string,
  event: keyof AppEvents,
  transform?: (...args: any[]) => AppEvents[typeof event],
): void {
  (window as any)[name] = (...args: any[]) => {
    const data = transform ? transform(...args) : args[0];
    bus.emit(event, data);
  };
}
