// ============================================================
// LSP JSON-RPC Client — transport layer for LSP protocol
// ============================================================
import type {
  LSPInitializeParams, LSPInitializeResult, LSPCompletionList, LSPCompletionItem,
  LSPHover, LSPLocation, LSPSignatureHelp, LSPCodeAction, LSPDocumentSymbol,
  LSPWorkspaceEdit, LSPDiagnostic,
} from './lsp-types';

type MessageHandler = (method: string, params: any) => void;
type ResponseHandler = (id: number, result: any) => void;
type ErrorHandler = (id: number, error: any) => void;
type NotificationHandler = (method: string, params: any) => void;

export class LSPClient {
  private transport: LSPTransport | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private messageHandlers = new Map<string, MessageHandler[]>();
  private notificationHandlers = new Map<string, NotificationHandler[]>();
  private onErrorCallbacks: ErrorHandler[] = [];
  private buffer = '';

  constructor(private projectRoot: string) {}

  connect(transport: LSPTransport): void {
    this.transport = transport;
    this.transport.onMessage((data: string) => this.handleMessage(data));
    this.transport.onClose(() => this.handleClose());
  }

  async initialize(params: LSPInitializeParams): Promise<LSPInitializeResult> {
    return this.request('initialize', params);
  }

  initialized(): void {
    this.notify('initialized', {});
  }

  // ─── Core Request ─────────────────────────────────────────
  async request(method: string, params?: any): Promise<any> {
    if (!this.transport) throw new Error('LSP client not connected');
    const id = ++this.messageId;
    const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    this.transport.send(message);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`LSP request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  notify(method: string, params?: any): void {
    if (!this.transport) return;
    const message = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.transport.send(message);
  }

  // ─── Handler Registration ─────────────────────────────────
  onMessage(method: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(method)) {
      this.messageHandlers.set(method, []);
    }
    this.messageHandlers.get(method)!.push(handler);
  }

  onNotification(method: string, handler: NotificationHandler): void {
    if (!this.notificationHandlers.has(method)) {
      this.notificationHandlers.set(method, []);
    }
    this.notificationHandlers.get(method)!.push(handler);
  }

  onError(handler: ErrorHandler): void {
    this.onErrorCallbacks.push(handler);
  }

  // ─── Message Parsing ─────────────────────────────────────
  private handleMessage(data: string): void {
    this.buffer += data;

    // Parse complete JSON-RPC messages from buffer
    while (true) {
      // Try Content-Length header style (stdio transport)
      const headerMatch = this.buffer.match(/^Content-Length: (\d+)\r\n\r\n/);
      if (headerMatch) {
        const contentLength = parseInt(headerMatch[1]);
        const headerEnd = headerMatch[0].length;
        if (this.buffer.length >= headerEnd + contentLength) {
          const content = this.buffer.substring(headerEnd, headerEnd + contentLength);
          this.buffer = this.buffer.substring(headerEnd + contentLength);
          this.processMessage(content);
          continue;
        }
        break; // Wait for more data
      }

      // Try raw JSON (WebSocket transport)
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx === -1) break;
      const line = this.buffer.substring(0, newlineIdx).trim();
      this.buffer = this.buffer.substring(newlineIdx + 1);
      if (!line) continue;
      this.processMessage(line);
    }
  }

  private processMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      if (msg.id && msg.result !== undefined) {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          pending.resolve(msg.result);
        }
      } else if (msg.id && msg.error) {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          pending.reject(new Error(msg.error.message || 'LSP error'));
        }
        for (const cb of this.onErrorCallbacks) { cb(msg.id, msg.error); }
      } else if (msg.method && msg.id) {
        // Server request
        const handlers = this.messageHandlers.get(msg.method) || [];
        for (const handler of handlers) { handler(msg.method, msg.params); }
      } else if (msg.method) {
        // Notification
        const handlers = this.notificationHandlers.get(msg.method) || [];
        for (const handler of handlers) { handler(msg.method, msg.params); }
      }
    } catch {
      // Skip malformed messages
    }
  }

  private handleClose(): void {
    for (const [_id, pending] of this.pendingRequests) {
      pending.reject(new Error('LSP connection closed'));
    }
    this.pendingRequests.clear();
  }

  // ─── Text Document Methods ────────────────────────────────
  didOpen(uri: string, languageId: string, text: string, version: number = 1): void {
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text },
    });
  }

  didChange(uri: string, text: string, version: number): void {
    this.notify('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  didClose(uri: string): void {
    this.notify('textDocument/didClose', { textDocument: { uri } });
  }

  async completion(uri: string, line: number, character: number): Promise<LSPCompletionList | null> {
    return this.request('textDocument/completion', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async hover(uri: string, line: number, character: number): Promise<LSPHover | null> {
    return this.request('textDocument/hover', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async definition(uri: string, line: number, character: number): Promise<LSPLocation | LSPLocation[] | null> {
    return this.request('textDocument/definition', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async references(uri: string, line: number, character: number, includeDecl: boolean = true): Promise<LSPLocation[] | null> {
    return this.request('textDocument/references', {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: includeDecl },
    });
  }

  async rename(uri: string, line: number, character: number, newName: string): Promise<LSPWorkspaceEdit | null> {
    return this.request('textDocument/rename', {
      textDocument: { uri },
      position: { line, character },
      newName,
    });
  }

  async signatureHelp(uri: string, line: number, character: number): Promise<LSPSignatureHelp | null> {
    return this.request('textDocument/signatureHelp', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async documentSymbol(uri: string): Promise<LSPDocumentSymbol[] | null> {
    return this.request('textDocument/documentSymbol', { textDocument: { uri } });
  }

  async codeAction(uri: string, range: { start: { line: number; character: number }; end: { line: number; character: number } }, diagnostics: LSPDiagnostic[] = []): Promise<LSPCodeAction[] | null> {
    return this.request('textDocument/codeAction', {
      textDocument: { uri },
      range,
      context: { diagnostics },
    });
  }

  shutdown(): void {
    this.notify('shutdown', null);
  }

  exit(): void {
    this.notify('exit', null);
  }
}

// ─── Transport Interface ────────────────────────────────────
export interface LSPTransport {
  send(data: string): void;
  onMessage(callback: (data: string) => void): void;
  onClose(callback: () => void): void;
  close(): void;
}

// ─── WebSocket Transport ────────────────────────────────────
export class WebSocketTransport implements LSPTransport {
  private ws: WebSocket | null = null;
  private messageCallbacks: ((data: string) => void)[] = [];
  private closeCallbacks: (() => void)[] = [];

  constructor(private url: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error(`WebSocket connection failed: ${this.url}`));
      this.ws.onmessage = (event) => {
        for (const cb of this.messageCallbacks) { cb(event.data.toString()); }
      };
      this.ws.onclose = () => {
        for (const cb of this.closeCallbacks) { cb(); }
      };
    });
  }

  send(data: string): void { this.ws?.send(data); }
  onMessage(cb: (data: string) => void): void { this.messageCallbacks.push(cb); }
  onClose(cb: () => void): void { this.closeCallbacks.push(cb); }
  close(): void { this.ws?.close(); }
}

// ─── IPC Transport (Electron main<->renderer) ───────────────
export class IPCTransport implements LSPTransport {
  private messageCallbacks: ((data: string) => void)[] = [];
  private closeCallbacks: (() => void)[] = [];
  private channel: string;
  private cleanup: (() => void) | null = null;

  constructor(private electronAPI: any, serverId: string) {
    this.channel = `lsp:${serverId}`;
  }

  connect(): void {
    this.cleanup = this.electronAPI.lsp?.onData?.(this.channel, (data: string) => {
      for (const cb of this.messageCallbacks) { cb(data); }
    }) || null;

    this.electronAPI.lsp?.onClosed?.(this.channel, () => {
      for (const cb of this.closeCallbacks) { cb(); }
    });
  }

  send(data: string): void {
    this.electronAPI.lsp?.write?.(this.channel, data);
  }

  onMessage(cb: (data: string) => void): void { this.messageCallbacks.push(cb); }
  onClose(cb: () => void): void { this.closeCallbacks.push(cb); }

  close(): void {
    this.electronAPI.lsp?.close?.(this.channel);
    this.cleanup?.();
  }
}

// ─── Stdio Transport (for direct spawning) ──────────────────
export class StdioTransport implements LSPTransport {
  private messageCallbacks: ((data: string) => void)[] = [];
  private closeCallbacks: (() => void)[] = [];

  constructor(private writeFn: (data: string) => void) {}

  connect(onData: (data: string) => void, onClose: () => void): void {
    this.messageCallbacks.push(onData);
    this.closeCallbacks.push(onClose);
  }

  feedData(data: string): void {
    for (const cb of this.messageCallbacks) { cb(data); }
  }

  feedClose(): void {
    for (const cb of this.closeCallbacks) { cb(); }
  }

  send(data: string): void { this.writeFn(data); }
  onMessage(cb: (data: string) => void): void { this.messageCallbacks.push(cb); }
  onClose(cb: () => void): void { this.closeCallbacks.push(cb); }
  close(): void { this.feedClose(); }
}
