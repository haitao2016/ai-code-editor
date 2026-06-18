// ============================================================
// PluginManager — Plugin Lifecycle Management
// ============================================================
import type {
  PluginManifest,
  PluginInstance,
  PluginAPI,
  PluginModule,
  ThemeContribution,
  CommandContribution,
  SidebarContribution,
  AgentContribution,
  PluginStatus,
} from '../types/plugin';

interface RegisteredTheme extends ThemeContribution {
  pluginName: string;
}
interface RegisteredCommand extends CommandContribution {
  pluginName: string;
  handler: () => void;
}
interface RegisteredSidebar extends SidebarContribution {
  pluginName: string;
  render: (container: HTMLElement) => void;
}
interface RegisteredAgent extends AgentContribution {
  pluginName: string;
}

class PluginManager {
  private plugins = new Map<string, PluginInstance>();
  private modules = new Map<string, PluginModule>();

  private themes = new Map<string, RegisteredTheme>();
  private commands = new Map<string, RegisteredCommand>();
  private sidebars = new Map<string, RegisteredSidebar>();
  private agents = new Map<string, RegisteredAgent>();

  private listeners: (() => void)[] = [];

  // ─── Plugin Registration ───────────────────────────────
  register(manifest: PluginManifest, module: PluginModule): void {
    if (this.plugins.has(manifest.name)) {
      console.warn(`[Plugins] "${manifest.name}" already registered`);
      return;
    }

    this.plugins.set(manifest.name, {
      manifest,
      status: 'inactive',
    });
    this.modules.set(manifest.name, module);

    // Auto-activate from stored state
    const enabled = this.getEnabledList();
    if (enabled.includes(manifest.name)) {
      this.activate(manifest.name);
    }

    this.notify();
  }

  // ─── Activate / Deactivate ─────────────────────────────
  activate(name: string): boolean {
    const plugin = this.plugins.get(name);
    const mod = this.modules.get(name);
    if (!plugin || !mod) return false;

    try {
      const api = this.createAPI(name);
      mod.activate(api);
      plugin.status = 'active';
      plugin.activatedAt = Date.now();
      plugin.error = undefined;
      this.saveEnabledList();
      this.notify();
      return true;
    } catch (err: any) {
      plugin.status = 'error';
      plugin.error = err.message;
      this.notify();
      return false;
    }
  }

  deactivate(name: string): void {
    const plugin = this.plugins.get(name);
    const mod = this.modules.get(name);
    if (!plugin || !mod) return;

    try {
      mod.deactivate?.();
    } catch {
      /* ignore */
    }

    // Remove all contributions
    this.themes.forEach((t, id) => {
      if (t.pluginName === name) this.themes.delete(id);
    });
    this.commands.forEach((c, id) => {
      if (c.pluginName === name) this.commands.delete(id);
    });
    this.sidebars.forEach((s, id) => {
      if (s.pluginName === name) this.sidebars.delete(id);
    });
    this.agents.forEach((a, id) => {
      if (a.pluginName === name) this.agents.delete(id);
    });

    plugin.status = 'inactive';
    this.saveEnabledList();
    this.notify();
  }

  // ─── Plugin API Factory ────────────────────────────────
  private createAPI(pluginName: string): PluginAPI {
    return {
      registerTheme: (theme: ThemeContribution) => {
        this.themes.set(theme.id, { ...theme, pluginName });
      },
      registerCommand: (cmd: CommandContribution, handler: () => void) => {
        this.commands.set(cmd.id, { ...cmd, pluginName, handler });
      },
      registerSidebar: (panel: SidebarContribution, render: (container: HTMLElement) => void) => {
        this.sidebars.set(panel.id, { ...panel, pluginName, render });
      },
      registerAgent: (agent: AgentContribution) => {
        this.agents.set(agent.id, { ...agent, pluginName });
      },
      log: (message: string) => {
        console.log(`[Plugin:${pluginName}] ${message}`);
      },
    };
  }

  // ─── Getters ───────────────────────────────────────────
  getPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  getStatus(name: string): PluginStatus | undefined {
    return this.plugins.get(name)?.status;
  }

  getThemes(): RegisteredTheme[] {
    return Array.from(this.themes.values());
  }

  getCommands(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }

  getSidebars(): RegisteredSidebar[] {
    return Array.from(this.sidebars.values());
  }

  getAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  executeCommand(id: string): boolean {
    const cmd = this.commands.get(id);
    if (cmd) {
      cmd.handler();
      return true;
    }
    return false;
  }

  applyTheme(themeId: string): boolean {
    const theme = this.themes.get(themeId);
    if (!theme) return false;

    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    localStorage.setItem('aice:theme', themeId);
    return true;
  }

  // ─── Persistence ───────────────────────────────────────
  private getEnabledList(): string[] {
    try {
      return JSON.parse(localStorage.getItem('aice:enabledPlugins') || '[]');
    } catch {
      return [];
    }
  }

  private saveEnabledList(): void {
    const enabled = Array.from(this.plugins.entries())
      .filter(([, p]) => p.status === 'active')
      .map(([name]) => name);
    localStorage.setItem('aice:enabledPlugins', JSON.stringify(enabled));
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

export const pluginManager = new PluginManager();
