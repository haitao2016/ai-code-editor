// ============================================================
// Built-in Plugin: Dracula Theme
// ============================================================
import type { PluginManifest, PluginModule } from '../types/plugin';

export const manifest: PluginManifest = {
  name: 'dracula-theme',
  version: '1.0.0',
  description: 'Dracula dark theme for AI Code Editor',
  author: 'AI Code Editor',
  entry: 'index.js',
  api: 1,
  contributes: {
    themes: [
      {
        id: 'dracula',
        name: 'Dracula',
        colors: {
          '--bg-primary': '#282a36',
          '--bg-secondary': '#21222c',
          '--bg-hover': '#44475a',
          '--bg-active': '#44475a',
          '--text-primary': '#f8f8f2',
          '--text-secondary': '#bdbfca',
          '--text-muted': '#6272a4',
          '--border-color': '#44475a',
          '--accent': '#bd93f9',
          '--accent-light': '#caa9fa',
          '--success': '#50fa7b',
          '--warning': '#f1fa8c',
          '--error': '#ff5555',
          '--info': '#8be9fd',
        },
      },
    ],
  },
};

export const module: PluginModule = {
  activate(api) {
    manifest.contributes.themes?.forEach((theme) => {
      api.registerTheme(theme);
    });
    api.log('Dracula theme registered');
  },
  deactivate() {
    // Cleanup handled by PluginManager
  },
};
