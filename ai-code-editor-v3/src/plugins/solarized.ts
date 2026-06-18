// ============================================================
// Built-in Plugin: Solarized Light Theme
// ============================================================
import type { PluginManifest, PluginModule } from '../types/plugin';

export const manifest: PluginManifest = {
  name: 'solarized-light',
  version: '1.0.0',
  description: 'Solarized Light theme for AI Code Editor',
  author: 'AI Code Editor',
  entry: 'index.js',
  api: 1,
  contributes: {
    themes: [
      {
        id: 'solarized-light',
        name: 'Solarized Light',
        colors: {
          '--bg-primary': '#fdf6e3',
          '--bg-secondary': '#eee8d5',
          '--bg-hover': '#eee8d5',
          '--bg-active': '#93a1a1',
          '--text-primary': '#586e75',
          '--text-secondary': '#657b83',
          '--text-muted': '#93a1a1',
          '--border-color': '#93a1a140',
          '--accent': '#268bd2',
          '--accent-light': '#3aa3e8',
          '--success': '#859900',
          '--warning': '#b58900',
          '--error': '#dc322f',
          '--info': '#2aa198',
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
    api.log('Solarized Light theme registered');
  },
};
