// ============================================================
// Plugin System — Type Definitions
// ============================================================

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  entry: string;
  api: 1;
  contributes: {
    themes?: ThemeContribution[];
    commands?: CommandContribution[];
    sidebars?: SidebarContribution[];
    agents?: AgentContribution[];
  };
  permissions?: PluginPermission[];
}

export interface ThemeContribution {
  id: string;
  name: string;
  colors: Record<string, string>;
}

export interface CommandContribution {
  id: string;
  title: string;
  shortcut?: string;
}

export interface SidebarContribution {
  id: string;
  title: string;
  icon: string;
}

export interface AgentContribution {
  id: string;
  name: string;
  systemPrompt: string;
  model?: string;
}

export type PluginPermission = 'filesystem' | 'network' | 'ai' | 'terminal' | 'editor';

export type PluginStatus = 'inactive' | 'active' | 'error';

export interface PluginInstance {
  manifest: PluginManifest;
  status: PluginStatus;
  error?: string;
  activatedAt?: number;
}

export interface PluginAPI {
  registerTheme(theme: ThemeContribution): void;
  registerCommand(cmd: CommandContribution, handler: () => void): void;
  registerSidebar(panel: SidebarContribution, render: (container: HTMLElement) => void): void;
  registerAgent(agent: AgentContribution): void;
  log(message: string): void;
}

export type PluginActivateFn = (api: PluginAPI) => void;
export type PluginDeactivateFn = () => void;

export interface PluginModule {
  activate: PluginActivateFn;
  deactivate?: PluginDeactivateFn;
}
