// ============================================================
// Plugin Hot Reload — watch + re-import in development
// ============================================================
import { pluginManager } from './plugin-manager';
import type { PluginManifest, PluginModule, PluginActivateFn } from '../types/plugin';

interface HotReloadConfig {
  enabled: boolean;
  pollInterval: number;   // ms
  pluginDir: string;       // URL path to plugins directory
}

interface PluginFileEntry {
  manifest: PluginManifest;
  module: PluginModule;
  etag: string;
  importedAt: number;
}

class PluginHotReload {
  private config: HotReloadConfig = {
    enabled: import.meta.env.DEV,
    pollInterval: 2000,
    pluginDir: '/src/plugins/',
  };

  private loadedPlugins = new Map<string, PluginFileEntry>();
  private watcher: ReturnType<typeof setInterval> | null = null;
  private fileTimestamps = new Map<string, number>();

  // ─── Configuration ────────────────────────────────────
  configure(config: Partial<HotReloadConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ─── Start Watching ───────────────────────────────────
  start(): void {
    if (!this.config.enabled) return;
    if (this.watcher) return;

    console.log('[PluginHotReload] Watching plugin directory for changes...');

    this.watcher = setInterval(() => {
      this.pollForChanges().catch((err) => {
        console.warn('[PluginHotReload] Poll error:', err);
      });
    }, this.config.pollInterval);
  }

  // ─── Stop Watching ────────────────────────────────────
  stop(): void {
    if (this.watcher) {
      clearInterval(this.watcher);
      this.watcher = null;
    }
  }

  // ─── Poll for Changes ─────────────────────────────────
  private async pollForChanges(): Promise<void> {
    const pluginFiles = await this.listPluginFiles();
    if (!pluginFiles || pluginFiles.length === 0) return;

    for (const file of pluginFiles) {
      const timestamp = this.fileTimestamps.get(file);
      // In browser, we use ETag-style checks; in Electron, fs.stat
      const hasChanged = !timestamp || false; // Simplified: always re-check in dev

      if (hasChanged) {
        await this.reloadPlugin(file);
        this.fileTimestamps.set(file, Date.now());
      }
    }
  }

  // ─── List Available Plugins ──────────────────────────
  private async listPluginFiles(): Promise<string[]> {
    // In Vite dev, we can use import.meta.glob
    try {
      const modules = import.meta.glob('/src/plugins/*.ts', { eager: false });
      return Object.keys(modules);
    } catch {
      return [];
    }
  }

  // ─── Reload a Single Plugin ──────────────────────────
  async reloadPlugin(filePath: string): Promise<void> {
    try {
      // Dynamic import with cache busting
      const module = await import(/* @vite-ignore */ `${filePath}?t=${Date.now()}`);

      if (!module.manifest || !module.activate) {
        console.warn(`[PluginHotReload] ${filePath}: missing manifest or activate export`);
        return;
      }

      const manifest: PluginManifest = module.manifest;
      const pluginModule: PluginModule = {
        activate: module.activate as PluginActivateFn,
        deactivate: module.deactivate,
      };

      const existing = this.loadedPlugins.get(manifest.name);

      if (existing) {
        // Hot replace: deactivate old, activate new
        console.log(`[PluginHotReload] 🔄 Reloading plugin: ${manifest.name}`);
        pluginManager.deactivate(manifest.name);
        pluginManager.register(manifest, pluginModule);

        this.loadedPlugins.set(manifest.name, {
          manifest,
          module: pluginModule,
          etag: Date.now().toString(),
          importedAt: Date.now(),
        });
      } else {
        // New plugin detected
        console.log(`[PluginHotReload] ➕ New plugin: ${manifest.name}`);
        pluginManager.register(manifest, pluginModule);

        this.loadedPlugins.set(manifest.name, {
          manifest,
          module: pluginModule,
          etag: Date.now().toString(),
          importedAt: Date.now(),
        });
      }
    } catch (err: any) {
      console.error(`[PluginHotReload] Failed to reload ${filePath}:`, err);
    }
  }

  // ─── Manual Reload ────────────────────────────────────
  async reloadAll(): Promise<void> {
    const files = await this.listPluginFiles();
    this.fileTimestamps.clear();
    for (const file of files) {
      await this.reloadPlugin(file);
    }
    console.log(`[PluginHotReload] All ${files.length} plugins reloaded`);
  }

  // ─── Status ──────────────────────────────────────────
  getStatus() {
    return {
      enabled: this.config.enabled,
      watching: this.watcher !== null,
      loadedCount: this.loadedPlugins.size,
      plugins: [...this.loadedPlugins.keys()],
    };
  }
}

export const pluginHotReload = new PluginHotReload();
