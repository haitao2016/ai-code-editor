// ============================================================
// Plugin API Extensions — Linter, Formatter, Completion providers
// ============================================================
import type {
  PluginAPI, ThemeContribution, CommandContribution,
  SidebarContribution, AgentContribution,
} from '../types/plugin';

// ─── Extended Plugin Manifest ─────────────────────────────
export interface LinterContribution {
  id: string;
  name: string;
  languages: string[];
  lint: (code: string, path: string) => Promise<LintResult[]>;
}

export interface LintResult {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  ruleId: string;
  fix?: string;
}

export interface FormatterContribution {
  id: string;
  name: string;
  languages: string[];
  format: (code: string, options?: FormatOptions) => Promise<string>;
}

export interface FormatOptions {
  tabSize?: number;
  insertSpaces?: boolean;
  printWidth?: number;
}

export interface CompletionProviderContribution {
  id: string;
  name: string;
  languages: string[];
  triggerCharacters: string[];
  provideCompletions: (params: {
    code: string;
    position: { line: number; column: number };
    language: string;
  }) => Promise<CompletionItem[]>;
}

export interface CompletionItem {
  label: string;
  kind: 'function' | 'method' | 'class' | 'variable' | 'keyword' | 'snippet' | 'module';
  detail?: string;
  documentation?: string;
  insertText: string;
  sortText?: string;
}

export interface StatusBarContribution {
  id: string;
  align: 'left' | 'right';
  priority: number;
  text: string;
  tooltip?: string;
  command?: string;
}

export interface MenuContribution {
  id: string;
  label: string;
  when?: string;  // context key expression
  command: string;
  group?: string;
}

// ─── Extended PluginAPI ──────────────────────────────────
export interface ExtendedPluginAPI extends PluginAPI {
  // Standard extensions
  registerLinter(linter: LinterContribution): void;
  registerFormatter(formatter: FormatterContribution): void;
  registerCompletionProvider(provider: CompletionProviderContribution): void;
  registerStatusBarItem(item: StatusBarContribution): void;
  registerMenuItem(menu: MenuContribution): void;

  // Standard utilities
  getWorkspacePath(): string;
  showMessage(message: string, type?: 'info' | 'warning' | 'error'): void;
  createTerminal(name: string): { write: (data: string) => void; dispose: () => void };

  // Event subscriptions
  onDidChangeActiveTextEditor(cb: (path: string | null) => void): () => void;
  onDidSaveTextDocument(cb: (path: string) => void): () => void;
  onDidChangeTextDocument(cb: (path: string, content: string) => void): () => void;
}

// ─── Contribution Registry ───────────────────────────────
class ContributionRegistry {
  linters = new Map<string, { pluginName: string; linter: LinterContribution }>();
  formatters = new Map<string, { pluginName: string; formatter: FormatterContribution }>();
  completionProviders = new Map<string, { pluginName: string; provider: CompletionProviderContribution }>();
  statusBarItems = new Map<string, { pluginName: string; item: StatusBarContribution }>();
  menuItems = new Map<string, { pluginName: string; item: MenuContribution }>();

  registerLinter(pluginName: string, linter: LinterContribution): void {
    this.linters.set(linter.id, { pluginName, linter });
  }

  registerFormatter(pluginName: string, formatter: FormatterContribution): void {
    this.formatters.set(formatter.id, { pluginName, formatter });
  }

  registerCompletionProvider(pluginName: string, provider: CompletionProviderContribution): void {
    this.completionProviders.set(provider.id, { pluginName, provider });
  }

  registerStatusBarItem(pluginName: string, item: StatusBarContribution): void {
    this.statusBarItems.set(item.id, { pluginName, item });
  }

  registerMenuItem(pluginName: string, item: MenuContribution): void {
    this.menuItems.set(item.id, { pluginName, item });
  }

  // Query helpers
  getLintersForLanguage(language: string): { pluginName: string; linter: LinterContribution }[] {
    return [...this.linters.values()].filter((l) =>
      l.linter.languages.includes(language) || l.linter.languages.includes('*'),
    );
  }

  getFormattersForLanguage(language: string): { pluginName: string; formatter: FormatterContribution }[] {
    return [...this.formatters.values()].filter((f) =>
      f.formatter.languages.includes(language) || f.formatter.languages.includes('*'),
    );
  }

  getCompletionProvidersForLanguage(language: string): { pluginName: string; provider: CompletionProviderContribution }[] {
    return [...this.completionProviders.values()].filter((p) =>
      p.provider.languages.includes(language) || p.provider.languages.includes('*'),
    );
  }

  removePluginContributions(pluginName: string): void {
    for (const [id, entry] of this.linters) {
      if (entry.pluginName === pluginName) this.linters.delete(id);
    }
    for (const [id, entry] of this.formatters) {
      if (entry.pluginName === pluginName) this.formatters.delete(id);
    }
    for (const [id, entry] of this.completionProviders) {
      if (entry.pluginName === pluginName) this.completionProviders.delete(id);
    }
    for (const [id, entry] of this.statusBarItems) {
      if (entry.pluginName === pluginName) this.statusBarItems.delete(id);
    }
    for (const [id, entry] of this.menuItems) {
      if (entry.pluginName === pluginName) this.menuItems.delete(id);
    }
  }
}

export const contributionRegistry = new ContributionRegistry();

// ─── Plugin API Standard Factory ─────────────────────────
export function createStandardPluginAPI(pluginName: string): ExtendedPluginAPI {
  return {
    // Base capabilities
    registerTheme(theme: ThemeContribution): void {
      // Delegated to pluginManager
      window.__pluginManager?.createAPI?.(pluginName).registerTheme(theme);
    },
    registerCommand(cmd: CommandContribution, handler: () => void): void {
      window.__pluginManager?.createAPI?.(pluginName).registerCommand(cmd, handler);
    },
    registerSidebar(panel: SidebarContribution, render: (container: HTMLElement) => void): void {
      window.__pluginManager?.createAPI?.(pluginName).registerSidebar(panel, render);
    },
    registerAgent(agent: AgentContribution): void {
      window.__pluginManager?.createAPI?.(pluginName).registerAgent(agent);
    },
    log(message: string): void {
      console.log(`[Plugin:${pluginName}] ${message}`);
    },

    // Extended capabilities
    registerLinter(linter: LinterContribution): void {
      contributionRegistry.registerLinter(pluginName, linter);
    },
    registerFormatter(formatter: FormatterContribution): void {
      contributionRegistry.registerFormatter(pluginName, formatter);
    },
    registerCompletionProvider(provider: CompletionProviderContribution): void {
      contributionRegistry.registerCompletionProvider(pluginName, provider);
    },
    registerStatusBarItem(item: StatusBarContribution): void {
      contributionRegistry.registerStatusBarItem(pluginName, item);
    },
    registerMenuItem(menu: MenuContribution): void {
      contributionRegistry.registerMenuItem(pluginName, menu);
    },

    // Utilities
    getWorkspacePath(): string {
      return window.__workspaceRoot || '/workspace';
    },
    showMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
      window.__showToast?.(message);
    },
    createTerminal(name: string) {
      const terminalAPI = window.__terminalAPI;
      return terminalAPI?.createTerminal?.(name) || {
        write: () => {},
        dispose: () => {},
      };
    },

    // Events
    onDidChangeActiveTextEditor(cb: (path: string | null) => void) {
      return window.__eventBus?.on?.('tab:switched', ({ path }: any) => cb(path)) || (() => {});
    },
    onDidSaveTextDocument(cb: (path: string) => void) {
      return window.__eventBus?.on?.('file:saved', ({ path }: any) => cb(path)) || (() => {});
    },
    onDidChangeTextDocument(cb: (path: string, content: string) => void) {
      return window.__eventBus?.on?.('file:changed', ({ path, content }: any) => cb(path, content)) || (() => {});
    },
  };
}
