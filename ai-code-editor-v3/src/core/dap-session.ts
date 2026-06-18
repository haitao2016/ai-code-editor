// ============================================================
// DAP Session — debug session lifecycle management
// ============================================================
import { DAPClient } from './dap-client';
import { createDAPElectronTransport } from './dap-transport';
import type { DAPTransport } from './dap-client';
import type {
  DebugSessionState, DebugConfig, DAPThread,
  DAPStackFrame, DAPScope, DAPVariable,
  DAPStoppedEvent, DAPBreakpoint, DAPSourceBreakpoint,
} from './dap-types';

interface SessionBreakpoint {
  file: string;
  line: number;
  column?: number;
  condition?: string;
  logMessage?: string;
  id?: number;
  verified: boolean;
}

export class DAPSession {
  client = new DAPClient();
  config: DebugConfig;
  state: DebugSessionState = 'initial';
  threads: DAPThread[] = [];
  stackFrames: DAPStackFrame[] = [];
  variables: Map<string, DAPVariable[]> = new Map();
  scopes: DAPScope[] = [];
  breakpoints: SessionBreakpoint[] = [];
  private disposers: (() => void)[] = [];
  private electronAPI: any;

  // Callbacks
  onStateChange?: (state: DebugSessionState) => void;
  onStopped?: (event: DAPStoppedEvent, threadId?: number) => void;
  onOutput?: (output: string, category: string) => void;
  onBreakpointUpdate?: () => void;

  constructor(config: DebugConfig, electronAPI?: any) {
    this.config = config;
    this.electronAPI = electronAPI;
  }

  // ─── Lifecycle ───────────────────────────────────────────
  async start(): Promise<void> {
    this.setState('launching');

    // Connect to debug adapter
    let transport: DAPTransport | null = null;

    if (this.electronAPI?.dap) {
      // Generate session ID
      const sessionId = `dap-${Date.now()}`;

      try {
        // Start the debug adapter via IPC (now uses invoke)
        const result = await this.electronAPI.dap.start(this.config, sessionId);
        if (result?.error) {
          this.setState('terminated');
          this.onOutput?.(`Debug session error: ${result.error}`, 'stderr');
          return;
        }

        // Create IPC transport for reading/writing DAP messages
        transport = createDAPElectronTransport(this.electronAPI, sessionId);
        this.client.connect(transport);
      } catch (err: any) {
        this.setState('terminated');
        this.onOutput?.(`Failed to start debug adapter: ${err.message}`, 'stderr');
        return;
      }
    }

    // Register events
    this.disposers.push(this.client.on('stopped', (body: DAPStoppedEvent) => {
      this.setState('stopped');
      this.onStopped?.(body, body.threadId);
      // Auto-fetch threads and stack
      this.refreshThreads();
    }));

    this.disposers.push(this.client.on('output', (body: any) => {
      this.onOutput?.(body.output, body.category || 'console');
    }));

    this.disposers.push(this.client.on('terminated', () => {
      this.setState('terminated');
    }));

    this.disposers.push(this.client.on('continued', () => {
      this.setState('running');
    }));

    this.disposers.push(this.client.on('breakpoint', (body: any) => {
      const bp = this.breakpoints.find((b) => b.id === body.breakpoint.id);
      if (bp) {
        bp.verified = body.breakpoint.verified;
        bp.line = body.breakpoint.line || bp.line;
        this.onBreakpointUpdate?.();
      }
    }));

    try {
      await this.client.initialize();
      if (this.config.request === 'launch') {
        await this.client.launch(this.config as any);
      } else {
        await this.client.attach(this.config as any);
      }
      await this.client.configurationDone();
      this.setState('running');
    } catch (err: any) {
      this.setState('terminated');
      this.onOutput?.(`Debug session error: ${err.message}`, 'stderr');
    }
  }

  async stop(): Promise<void> {
    this.client.disconnect(true);
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.setState('terminated');
  }

  // ─── Execution Control ───────────────────────────────────
  async continue(): Promise<void> {
    if (this.threads.length > 0) {
      await this.client.continue(this.threads[0].id);
    }
  }

  async stepOver(): Promise<void> {
    if (this.threads.length > 0) {
      await this.client.next(this.threads[0].id);
    }
  }

  async stepInto(): Promise<void> {
    if (this.threads.length > 0) {
      await this.client.stepIn(this.threads[0].id);
    }
  }

  async stepOut(): Promise<void> {
    if (this.threads.length > 0) {
      await this.client.stepOut(this.threads[0].id);
    }
  }

  async pause(): Promise<void> {
    if (this.threads.length > 0) {
      await this.client.pause(this.threads[0].id);
    }
  }

  async restart(): Promise<void> {
    try { await this.client.restart(); } catch {}
  }

  // ─── State Inspection ────────────────────────────────────
  async refreshThreads(): Promise<void> {
    try {
      const result = await this.client.threads();
      this.threads = result.threads;
    } catch {}
  }

  async refreshStackFrames(): Promise<void> {
    if (this.threads.length === 0) return;
    try {
      const result = await this.client.stackTrace(this.threads[0].id);
      this.stackFrames = result.stackFrames;
    } catch {}
  }

  async refreshScopes(frameId: number): Promise<DAPScope[]> {
    try {
      const result = await this.client.scopes(frameId);
      this.scopes = result.scopes;
      return result.scopes;
    } catch { return []; }
  }

  async refreshVariables(ref: number, key: string): Promise<DAPVariable[]> {
    try {
      const result = await this.client.variables(ref);
      this.variables.set(key, result.variables);
      return result.variables;
    } catch { return []; }
  }

  async evaluate(expression: string, frameId?: number, context?: 'watch' | 'repl' | 'hover'): Promise<{ result: string; variablesReference: number } | null> {
    try {
      return await this.client.evaluate({
        expression,
        frameId: frameId || this.stackFrames[0]?.id,
        context,
      });
    } catch { return null; }
  }

  // ─── Breakpoints ─────────────────────────────────────────
  addBreakpoint(file: string, line: number, condition?: string, logMessage?: string): void {
    if (this.breakpoints.some((b) => b.file === file && b.line === line)) return;
    this.breakpoints.push({ file, line, condition, logMessage, verified: false });
    this.syncBreakpoints(file);
  }

  removeBreakpoint(file: string, line: number): void {
    this.breakpoints = this.breakpoints.filter((b) => !(b.file === file && b.line === line));
    this.syncBreakpoints(file);
  }

  toggleBreakpoint(file: string, line: number): boolean {
    const existing = this.breakpoints.find((b) => b.file === file && b.line === line);
    if (existing) {
      this.removeBreakpoint(file, line);
      return false;
    } else {
      this.addBreakpoint(file, line);
      return true;
    }
  }

  getBreakpointsForFile(file: string): number[] {
    return this.breakpoints.filter((b) => b.file === file).map((b) => b.line);
  }

  private async syncBreakpoints(file: string): Promise<void> {
    const fileBps = this.breakpoints.filter((b) => b.file === file);
    const sourceBps: DAPSourceBreakpoint[] = fileBps.map((b) => ({
      line: b.line - 1, // DAP uses 0-based
      column: b.column,
      condition: b.condition,
      logMessage: b.logMessage,
    }));

    try {
      const result = await this.client.setBreakpoints({ path: file }, sourceBps);
      fileBps.forEach((bp, i) => {
        if (result.breakpoints[i]) {
          bp.id = result.breakpoints[i].id;
          bp.verified = result.breakpoints[i].verified;
          bp.line = (result.breakpoints[i].line ?? bp.line - 1) + 1;
        }
      });
      this.onBreakpointUpdate?.();
    } catch {}
  }

  // ─── State ───────────────────────────────────────────────
  private setState(state: DebugSessionState): void {
    this.state = state;
    this.onStateChange?.(state);
  }
}
