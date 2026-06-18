// ============================================================
// PluginManager Unit Tests
// ============================================================
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { pluginManager } from '../src/core/plugin-manager';
import type { PluginManifest, PluginModule } from '../src/types/plugin';

// Helper: create a minimal manifest
function makeManifest(name: string, overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name,
    version: '1.0.0',
    description: `Test plugin: ${name}`,
    author: 'Test Author',
    entry: `${name}.js`,
    api: 1,
    contributes: {},
    ...overrides,
  };
}

// Helper: create a minimal module
function makeModule(
  activate?: (api: any) => void,
  deactivate?: () => void
): PluginModule {
  return {
    activate: activate || vi.fn(),
    ...(deactivate ? { deactivate } : {}),
  };
}

describe('PluginManager', () => {
  beforeEach(() => {
    // Reset by deactivating all plugins first
    // Clear localStorage
    localStorage.removeItem('aice:enabledPlugins');
    localStorage.removeItem('aice:theme');

    // Deactivate any remaining plugins to clean state
    const plugins = pluginManager.getPlugins();
    for (const p of plugins) {
      if (p.status === 'active') {
        pluginManager.deactivate(p.manifest.name);
      }
    }
  });

  afterEach(() => {
    localStorage.removeItem('aice:enabledPlugins');
    localStorage.removeItem('aice:theme');
  });

  describe('Registration', () => {
    it('should register a new plugin as inactive', () => {
      const manifest = makeManifest('test-plugin');
      const mod = makeModule();

      pluginManager.register(manifest, mod);

      const plugins = pluginManager.getPlugins();
      const registered = plugins.find(p => p.manifest.name === 'test-plugin');
      expect(registered).toBeDefined();
      expect(registered!.status).toBe('inactive');
    });

    it('should not register duplicate plugin', () => {
      const manifest = makeManifest('test-plugin');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      pluginManager.register(manifest, makeModule());
      pluginManager.register(manifest, makeModule()); // duplicate

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"test-plugin" already registered')
      );
      warnSpy.mockRestore();
    });

    it('should auto-activate if plugin was previously enabled', () => {
      // Pre-set enabled list
      localStorage.setItem('aice:enabledPlugins', JSON.stringify(['auto-plugin']));

      const manifest = makeManifest('auto-plugin');
      const activateSpy = vi.fn();
      const mod = makeModule(activateSpy);

      pluginManager.register(manifest, mod);

      expect(activateSpy).toHaveBeenCalled();
      expect(pluginManager.getStatus('auto-plugin')).toBe('active');
    });
  });

  describe('Activate / Deactivate', () => {
    it('should activate a plugin', () => {
      const manifest = makeManifest('activate-test');
      const activateSpy = vi.fn();
      const mod = makeModule(activateSpy);

      pluginManager.register(manifest, mod);
      const result = pluginManager.activate('activate-test');

      expect(result).toBe(true);
      expect(activateSpy).toHaveBeenCalled();
      expect(pluginManager.getStatus('activate-test')).toBe('active');
    });

    it('should return false for non-existent plugin', () => {
      const result = pluginManager.activate('nonexistent');
      expect(result).toBe(false);
    });

    it('should set error status on activation failure', () => {
      const manifest = makeManifest('error-plugin');
      const mod = makeModule(() => {
        throw new Error('Activation failed!');
      });

      pluginManager.register(manifest, mod);
      const result = pluginManager.activate('error-plugin');

      expect(result).toBe(false);
      expect(pluginManager.getStatus('error-plugin')).toBe('error');
    });

    it('should deactivate a plugin and clean contributions', () => {
      const manifest = makeManifest('deactivate-test');
      const deactivateSpy = vi.fn();
      const activateFn = (api: any) => {
        api.registerTheme({ id: 'my-theme', name: 'My Theme', colors: { '--bg': '#000' } });
        api.registerCommand({ id: 'my-cmd', title: 'My Command' }, () => {});
      };
      const mod = makeModule(activateFn, deactivateSpy);

      pluginManager.register(manifest, mod);
      pluginManager.activate('deactivate-test');

      // Verify contributions exist
      expect(pluginManager.getThemes()).toHaveLength(1);
      expect(pluginManager.getCommands()).toHaveLength(1);

      pluginManager.deactivate('deactivate-test');

      expect(deactivateSpy).toHaveBeenCalled();
      expect(pluginManager.getStatus('deactivate-test')).toBe('inactive');
      expect(pluginManager.getThemes()).toHaveLength(0);
      expect(pluginManager.getCommands()).toHaveLength(0);
    });

    it('should handle deactivate of non-existent plugin gracefully', () => {
      // Should not throw
      expect(() => pluginManager.deactivate('not-there')).not.toThrow();
    });

    it('should handle deactivate with no deactivate function gracefully', () => {
      const manifest = makeManifest('no-deactivate');
      const mod = { activate: vi.fn() };
      pluginManager.register(manifest, mod);
      pluginManager.activate('no-deactivate');
      expect(() => pluginManager.deactivate('no-deactivate')).not.toThrow();
    });

    it('should persist enabled state to localStorage', () => {
      const manifest = makeManifest('persist-test');
      pluginManager.register(manifest, makeModule(vi.fn()));
      pluginManager.activate('persist-test');

      const enabled = JSON.parse(localStorage.getItem('aice:enabledPlugins') || '[]');
      expect(enabled).toContain('persist-test');

      pluginManager.deactivate('persist-test');
      const afterDeactivate = JSON.parse(localStorage.getItem('aice:enabledPlugins') || '[]');
      expect(afterDeactivate).not.toContain('persist-test');
    });
  });

  describe('Contributions', () => {
    it('should register and retrieve themes', () => {
      const manifest = makeManifest('theme-plugin');
      const mod = makeModule((api) => {
        api.registerTheme({ id: 'dark-theme', name: 'Dark', colors: { '--bg': '#111' } });
        api.registerTheme({ id: 'light-theme', name: 'Light', colors: { '--bg': '#fff' } });
      });

      pluginManager.register(manifest, mod);
      pluginManager.activate('theme-plugin');

      const themes = pluginManager.getThemes();
      expect(themes).toHaveLength(2);
      expect(themes[0].pluginName).toBe('theme-plugin');
      expect(themes[1].pluginName).toBe('theme-plugin');
    });

    it('should register and execute commands', () => {
      const manifest = makeManifest('cmd-plugin');
      const handlerSpy = vi.fn();
      const mod = makeModule((api) => {
        api.registerCommand({ id: 'test-cmd', title: 'Test Command' }, handlerSpy);
      });

      pluginManager.register(manifest, mod);
      pluginManager.activate('cmd-plugin');

      const commands = pluginManager.getCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0].id).toBe('test-cmd');

      // Execute
      const executed = pluginManager.executeCommand('test-cmd');
      expect(executed).toBe(true);
      expect(handlerSpy).toHaveBeenCalled();
    });

    it('should return false for unknown command', () => {
      const executed = pluginManager.executeCommand('nonexistent');
      expect(executed).toBe(false);
    });

    it('should register sidebars', () => {
      const manifest = makeManifest('sidebar-plugin');
      const renderFn = vi.fn();
      const mod = makeModule((api) => {
        api.registerSidebar({ id: 'stats-panel', title: 'Stats', icon: '📊' }, renderFn);
      });

      pluginManager.register(manifest, mod);
      pluginManager.activate('sidebar-plugin');

      const sidebars = pluginManager.getSidebars();
      expect(sidebars).toHaveLength(1);
      expect(sidebars[0].id).toBe('stats-panel');
      expect(sidebars[0].title).toBe('Stats');
    });

    it('should register agents', () => {
      const manifest = makeManifest('agent-plugin');
      const mod = makeModule((api) => {
        api.registerAgent({
          id: 'code-reviewer',
          name: 'Code Reviewer',
          systemPrompt: 'You are a code reviewer.',
        });
      });

      pluginManager.register(manifest, mod);
      pluginManager.activate('agent-plugin');

      const agents = pluginManager.getAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('code-reviewer');
      expect(agents[0].systemPrompt).toBe('You are a code reviewer.');
    });
  });

  describe('Theme Application', () => {
    it('should apply theme colors to document root', () => {
      const manifest = makeManifest('theme-apply-plugin');
      const mod = makeModule((api) => {
        api.registerTheme({
          id: 'custom-theme',
          name: 'Custom Theme',
          colors: {
            '--bg-primary': '#1a1a2e',
            '--text-primary': '#e0e0e0',
          },
        });
      });

      pluginManager.register(manifest, mod);
      pluginManager.activate('theme-apply-plugin');

      const result = pluginManager.applyTheme('custom-theme');
      expect(result).toBe(true);

      const root = document.documentElement;
      expect(root.style.getPropertyValue('--bg-primary')).toBe('#1a1a2e');
      expect(root.style.getPropertyValue('--text-primary')).toBe('#e0e0e0');
    });

    it('should return false for unknown theme', () => {
      const result = pluginManager.applyTheme('nonexistent');
      expect(result).toBe(false);
    });

    it('should persist theme ID to localStorage', () => {
      localStorage.removeItem('aice:theme');
      const manifest = makeManifest('theme-persist');
      const mod = makeModule((api) => {
        api.registerTheme({ id: 'persist-theme', name: 'P', colors: {} });
      });

      pluginManager.register(manifest, mod);
      pluginManager.activate('theme-persist');
      pluginManager.applyTheme('persist-theme');

      expect(localStorage.getItem('aice:theme')).toBe('persist-theme');
    });
  });

  describe('Subscription', () => {
    it('should notify subscribers on plugin state changes', () => {
      const listener = vi.fn();
      const unsubscribe = pluginManager.subscribe(listener);

      const manifest = makeManifest('sub-test');
      pluginManager.register(manifest, makeModule(vi.fn()));

      // register triggers notify
      expect(listener).toHaveBeenCalled();

      unsubscribe();
      listener.mockClear();

      // After unsubscribe, no more notifications
      pluginManager.activate('sub-test');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Plugin API', () => {
    it('should provide log function scoped to plugin name', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const manifest = makeManifest('log-plugin');
      const mod = makeModule((api) => {
        api.log('Hello from plugin');
      });

      pluginManager.register(manifest, mod);
      pluginManager.activate('log-plugin');

      expect(logSpy).toHaveBeenCalledWith('[Plugin:log-plugin] Hello from plugin');
      logSpy.mockRestore();
    });
  });

  describe('Plugin Stats', () => {
    it('should track activation timestamp', () => {
      const manifest = makeManifest('timestamp-plugin');
      const before = Date.now();
      pluginManager.register(manifest, makeModule(vi.fn()));

      pluginManager.activate('timestamp-plugin');
      const after = Date.now();

      const plugins = pluginManager.getPlugins();
      const plugin = plugins.find(p => p.manifest.name === 'timestamp-plugin');
      expect(plugin!.activatedAt).toBeDefined();
      expect(plugin!.activatedAt!).toBeGreaterThanOrEqual(before);
      expect(plugin!.activatedAt!).toBeLessThanOrEqual(after);
    });
  });
});
