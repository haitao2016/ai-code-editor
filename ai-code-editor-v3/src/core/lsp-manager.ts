// ============================================================
// LSP Manager — language server lifecycle + configuration
// ============================================================
import { LSPClient, WebSocketTransport, IPCTransport } from './lsp-client';
import type { LSPServerConfig, LSPInitializeResult } from './lsp-types';

interface RunningServer {
  config: LSPServerConfig;
  client: LSPClient;
  transport: any;
  capabilities: LSPInitializeResult['capabilities'] | null;
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
}

// Default language server configurations
export const DEFAULT_LSPS: LSPServerConfig[] = [
  {
    id: 'typescript',
    name: 'TypeScript Language Server',
    languages: ['typescript', 'javascript', 'tsx', 'jsx'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootPattern: 'package.json',
    initializationOptions: {},
  },
  {
    id: 'python',
    name: 'Python Language Server',
    languages: ['python'],
    command: 'pylsp',
    args: [],
    rootPattern: 'requirements.txt',
    initializationOptions: {},
  },
  {
    id: 'html',
    name: 'HTML Language Server',
    languages: ['html'],
    command: 'vscode-html-languageserver',
    args: ['--stdio'],
  },
  {
    id: 'css',
    name: 'CSS Language Server',
    languages: ['css', 'scss', 'less'],
    command: 'vscode-css-languageserver',
    args: ['--stdio'],
  },
  {
    id: 'go',
    name: 'Go Language Server',
    languages: ['go'],
    command: 'gopls',
    args: ['-mode=stdio'],
    rootPattern: 'go.mod',
    initializationOptions: {
      usePlaceholders: true,
      completeUnimported: true,
      staticcheck: true,
    },
  },
  {
    id: 'rust',
    name: 'Rust Language Server',
    languages: ['rust'],
    command: 'rust-analyzer',
    args: [],
    rootPattern: 'Cargo.toml',
    initializationOptions: {
      cargo: { allFeatures: true },
      checkOnSave: { command: 'clippy' },
    },
  },
  {
    id: 'java',
    name: 'Java Language Server',
    languages: ['java'],
    command: 'jdtls',
    args: [],
    rootPattern: 'pom.xml',
    initializationOptions: {
      settings: {
        java: {
          configuration: { runtimes: [] },
          completion: { favoriteStaticMembers: [] },
        },
      },
    },
  },
  {
    id: 'cpp',
    name: 'C/C++ Language Server',
    languages: ['c', 'cpp', 'c++', 'objective-c'],
    command: 'clangd',
    args: ['--background-index'],
    rootPattern: 'compile_commands.json',
    initializationOptions: {
      clangdFileStatus: true,
    },
  },
  {
    id: 'csharp',
    name: 'C# Language Server',
    languages: ['csharp', 'cs'],
    command: 'omnisharp',
    args: ['-lsp'],
    rootPattern: '*.sln',
    initializationOptions: {},
  },
  {
    id: 'php',
    name: 'PHP Language Server',
    languages: ['php'],
    command: 'intelephense',
    args: ['--stdio'],
    rootPattern: 'composer.json',
    initializationOptions: {},
  },
  {
    id: 'ruby',
    name: 'Ruby Language Server',
    languages: ['ruby'],
    command: 'solargraph',
    args: ['stdio'],
    rootPattern: 'Gemfile',
    initializationOptions: {},
  },
  {
    id: 'vue',
    name: 'Vue Language Server',
    languages: ['vue'],
    command: 'vue-language-server',
    args: ['--stdio'],
    rootPattern: 'package.json',
    initializationOptions: {
      vue: { hybridMode: false },
    },
  },
  {
    id: 'yaml',
    name: 'YAML Language Server',
    languages: ['yaml', 'yml'],
    command: 'yaml-language-server',
    args: ['--stdio'],
    initializationOptions: {
      yaml: { schemas: {}, validate: true, hover: true, completion: true },
    },
  },
  {
    id: 'json',
    name: 'JSON Language Server',
    languages: ['json', 'jsonc'],
    command: 'vscode-json-languageserver',
    args: ['--stdio'],
    initializationOptions: {
      provideFormatter: true,
    },
  },
  {
    id: 'markdown',
    name: 'Markdown Language Server',
    languages: ['markdown', 'md'],
    command: 'marksman',
    args: ['server'],
    initializationOptions: {},
  },
  {
    id: 'docker',
    name: 'Docker Language Server',
    languages: ['dockerfile'],
    command: 'docker-langserver',
    args: ['--stdio'],
    initializationOptions: {},
  },
];

export class LSPManager {
  private servers = new Map<string, RunningServer>();
  private rootUri: string;
  private onDiagnosticsCallbacks: ((uri: string, diagnostics: any[]) => void)[] = [];
  private isElectron: boolean;
  private electronAPI: any;

  constructor(rootPath: string, isElectron = false, electronAPI?: any) {
    this.rootUri = `file:///${rootPath.replace(/\\/g, '/')}`;
    this.isElectron = isElectron;
    this.electronAPI = electronAPI;
  }

  getRootUri(): string { return this.rootUri; }

  // ─── Server Management ────────────────────────────────────
  async startServer(config: LSPServerConfig): Promise<void> {
    if (this.servers.has(config.id)) {
      const existing = this.servers.get(config.id)!;
      if (existing.status === 'running') return;
      this.servers.delete(config.id);
    }

    const client = new LSPClient(this.rootUri);
    let transport: any;

    try {
      if (this.isElectron && this.electronAPI?.lsp) {
        // Electron: spawn via main process IPC
        const channel = await this.electronAPI.lsp.start(config);
        transport = new IPCTransport(this.electronAPI, config.id);
        transport.connect();
        client.connect(transport);
      } else {
        // Web: connect via WebSocket to language server
        // In production, this would connect to a local WebSocket server
        transport = new WebSocketTransport(`ws://localhost:2087/lsp/${config.id}`);
        await transport.connect();
        client.connect(transport);
      }
    } catch (err: any) {
      this.servers.set(config.id, {
        config, client,
        transport: null as any,
        capabilities: null,
        status: 'error',
        error: err.message,
      });
      console.warn(`Failed to start LSP ${config.id}: ${err.message}`);
      return;
    }

    this.servers.set(config.id, {
      config, client, transport, capabilities: null,
      status: 'starting',
    });

    // Register diagnostics handler
    client.onNotification('textDocument/publishDiagnostics', (_method, params) => {
      for (const cb of this.onDiagnosticsCallbacks) {
        cb(params.uri, params.diagnostics);
      }
    });

    // Initialize
    try {
      const result = await client.initialize({
        processId: process.pid || null,
        rootUri: this.rootUri,
        capabilities: {
          textDocument: {
            hover: { contentFormat: ['markdown', 'plaintext'] },
            completion: { completionItem: { snippetSupport: true } },
            signatureHelp: {},
            definition: {},
            references: {},
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            codeAction: {},
            rename: {},
          },
        },
        workspaceFolders: [{ uri: this.rootUri, name: 'workspace' }],
      });

      client.initialized();

      this.servers.set(config.id, {
        config, client, transport,
        capabilities: result.capabilities,
        status: 'running',
      });

      console.log(`LSP ${config.id} started`);
    } catch (err: any) {
      this.servers.set(config.id, {
        config, client, transport, capabilities: null,
        status: 'error',
        error: err.message,
      });
    }
  }

  async stopServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) return;

    try {
      server.client.shutdown();
      server.client.exit();
    } catch {}

    server.transport?.close?.();
    this.servers.delete(serverId);
  }

  async startForLanguage(languageId: string): Promise<void> {
    const config = DEFAULT_LSPS.find((c) => c.languages.includes(languageId));
    if (!config) return;
    await this.startServer(config);
  }

  getServer(languageId: string): RunningServer | null {
    const config = DEFAULT_LSPS.find((c) => c.languages.includes(languageId));
    if (!config) return null;
    return this.servers.get(config.id) || null;
  }

  getClient(languageId: string): LSPClient | null {
    return this.getServer(languageId)?.client || null;
  }

  // ─── Diagnostics ──────────────────────────────────────────
  onDiagnostics(callback: (uri: string, diagnostics: any[]) => void): void {
    this.onDiagnosticsCallbacks.push(callback);
  }

  // ─── Document Sync ────────────────────────────────────────
  notifyOpen(uri: string, languageId: string, text: string): void {
    const client = this.getClient(languageId);
    client?.didOpen(uri, languageId, text);
  }

  notifyChange(uri: string, languageId: string, text: string, version: number): void {
    const client = this.getClient(languageId);
    client?.didChange(uri, text, version);
  }

  notifyClose(uri: string, languageId: string): void {
    const client = this.getClient(languageId);
    client?.didClose(uri);
  }

  // ─── Shutdown ─────────────────────────────────────────────
  async shutdownAll(): Promise<void> {
    const ids = [...this.servers.keys()];
    await Promise.all(ids.map((id) => this.stopServer(id)));
  }
}
