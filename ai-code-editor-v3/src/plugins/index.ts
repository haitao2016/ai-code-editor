// ============================================================
// Plugin Loader — Register all built-in plugins
// ============================================================
import { pluginManager } from '../core/plugin-manager';
import { manifest as draculaManifest, module as draculaModule } from './dracula';
import { manifest as solarizedManifest, module as solarizedModule } from './solarized';
import { manifest as codeStatsManifest, module as codeStatsModule } from './code-stats';

export function initPlugins(): void {
  pluginManager.register(draculaManifest, draculaModule);
  pluginManager.register(solarizedManifest, solarizedModule);
  pluginManager.register(codeStatsManifest, codeStatsModule);

  // Apply saved theme on startup
  const savedTheme = localStorage.getItem('aice:theme');
  if (savedTheme) {
    // Defer to allow themes to register first
    setTimeout(() => pluginManager.applyTheme(savedTheme), 100);
  }

  console.log('[Plugins] Initialized', pluginManager.getPlugins().length, 'plugins');
}

export { pluginManager };
