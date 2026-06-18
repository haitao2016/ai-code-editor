// ============================================================
// DAP Client — JSON-RPC client for Debug Adapter Protocol
// ============================================================
import type {
  DAPThread, DAPStackFrame, DAPScope, DAPVariable,
  DAPSourceBreakpoint, DAPBreakpoint, DAPCapabilities,
  DAPLaunchRequest, DAPAttachRequest, DAPEvaluateArguments,
} from './dap-types';

export class DAPClient {
  private transport: DAPTransport | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private eventCallbacks = new Map<string, ((params: any) => void)[]>();
  private buffer = '';

  connect(transport: DAPTransport): void {
    this.transport = transport;
    this.transport.onMessage((data: string) => this.handleMessage(data));
    this.transport.onClose(() => this.handleClose());
  }

  // ─── Core Methods ────────────────────────────────────────
  async initialize(params: {
    clientID?: string; clientName?: string; adapterID?: string;
    locale?: string; linesStartAt1?: boolean; columnsStartAt1?: boolean;
    pathFormat?: string; supportsVariableType?: boolean;
    supportsVariablePaging?: boolean; supportsRunInTerminalRequest?: boolean;
  } = {}): Promise<DAPCapabilities> {
    return this.request('initialize', {
      clientID: 'ai-code-editor',
      clientName: 'AI Code Editor',
      adapterID: 'node',
      locale: 'zh-CN',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      ...params,
    });
  }

  async launch(config: DAPLaunchRequest): Promise<void> {
    return this.request('launch', config);
  }

  async attach(config: DAPAttachRequest): Promise<void> {
    return this.request('attach', config);
  }

  async configurationDone(): Promise<void> {
    return this.request('configurationDone');
  }

  disconnect(terminateDebuggee: boolean = true): void {
    this.request('disconnect', { terminateDebuggee, restart: false }).catch(() => {});
  }

  // ─── Execution Control ───────────────────────────────────
  async setBreakpoints(source: { path: string }, breakpoints: DAPSourceBreakpoint[]): Promise<{ breakpoints: DAPBreakpoint[] }> {
    return this.request('setBreakpoints', {
      source: { path: source.path },
      breakpoints,
    });
  }

  async setFunctionBreakpoints(breakpoints: { name: string; condition?: string }[]): Promise<any> {
    return this.request('setFunctionBreakpoints', { breakpoints });
  }

  async setExceptionBreakpoints(filters: string[]): Promise<void> {
    return this.request('setExceptionBreakpoints', { filters });
  }

  async continue(threadId: number): Promise<void> {
    return this.request('continue', { threadId });
  }

  async next(threadId: number): Promise<void> {
    return this.request('next', { threadId });
  }

  async stepIn(threadId: number): Promise<void> {
    return this.request('stepIn', { threadId });
  }

  async stepOut(threadId: number): Promise<void> {
    return this.request('stepOut', { threadId });
  }

  async pause(threadId: number): Promise<void> {
    return this.request('pause', { threadId });
  }

  async restart(): Promise<void> {
    return this.request('restart', {});
  }

  // ─── State Inspection ────────────────────────────────────
  async threads(): Promise<{ threads: DAPThread[] }> {
    return this.request('threads');
  }

  async stackTrace(threadId: number, levels?: number): Promise<{ stackFrames: DAPStackFrame[] }> {
    return this.request('stackTrace', { threadId, levels: levels || 20 });
  }

  async scopes(frameId: number): Promise<{ scopes: DAPScope[] }> {
    return this.request('scopes', { frameId });
  }

  async variables(variablesReference: number): Promise<{ variables: DAPVariable[] }> {
    return this.request('variables', { variablesReference });
  }

  async evaluate(args: DAPEvaluateArguments): Promise<{
    result: string; type?: string; variablesReference: number;
  }> {
    return this.request('evaluate', args);
  }

  // ─── Events ──────────────────────────────────────────────
  on(event: string, callback: (params: any) => void): () => void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, []);
    }
    this.eventCallbacks.get(event)!.push(callback);
    return () => {
      const arr = this.eventCallbacks.get(event);
      if (arr) {
        const idx = arr.indexOf(callback);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  // ─── Internal ────────────────────────────────────────────
  private request(method: string, params?: any): Promise<any> {
    if (!this.transport) throw new Error('DAP client not connected');
    const id = ++this.messageId;
    const message = JSON.stringify({ type: 'request', seq: id, command: method, arguments: params });
    this.transport.send(message);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`DAP request timeout: ${method}`));
        }
      }, 15000);
    });
  }

  private sendResponse(requestSeq: number, success: boolean, body?: any): void {
    if (!this.transport) return;
    const msg = JSON.stringify({
      type: 'response',
      request_seq: requestSeq,
      success,
      command: '',
      body,
    });
    this.transport.send(msg);
  }

  private handleMessage(data: string): void {
    this.buffer += data;

    // Parse Content-Length header format (stdio transport)
    const headerMatch = this.buffer.match(/^Content-Length: (\d+)\r\n\r\n/);
    if (headerMatch) {
      const contentLength = parseInt(headerMatch[1]);
      const headerEnd = headerMatch[0].length;
      if (this.buffer.length >= headerEnd + contentLength) {
        const content = this.buffer.substring(headerEnd, headerEnd + contentLength);
        this.buffer = this.buffer.substring(headerEnd + contentLength);
        this.processMessage(content);
        return;
      }
      return;
    }

    // Try raw JSON line
    const newlineIdx = this.buffer.indexOf('\n');
    if (newlineIdx === -1) return;
    const line = this.buffer.substring(0, newlineIdx).trim();
    this.buffer = this.buffer.substring(newlineIdx + 1);
    if (!line) return;
    this.processMessage(line);
  }

  private processMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'response') {
        const pending = this.pendingRequests.get(msg.request_seq);
        if (pending) {
          this.pendingRequests.delete(msg.request_seq);
          if (msg.success) {
            pending.resolve(msg.body || {});
          } else {
            pending.reject(new Error(msg.message || 'DAP error'));
          }
        }
      } else if (msg.type === 'event') {
        const callbacks = this.eventCallbacks.get(msg.event) || [];
        for (const cb of callbacks) { cb(msg.body); }
      } else if (msg.type === 'request') {
        // Server-to-client requests (e.g., runInTerminal)
        this.sendResponse(msg.seq, true);
      }
    } catch {}
  }

  private handleClose(): void {
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('DAP connection closed'));
    }
    this.pendingRequests.clear();
    const callbacks = this.eventCallbacks.get('terminated') || [];
    for (const cb of callbacks) { cb({}); }
  }
}

// ─── Transport ─────────────────────────────────────────────
export interface DAPTransport {
  send(data: string): void;
  onMessage(callback: (data: string) => void): void;
  onClose(callback: () => void): void;
  close(): void;
}
