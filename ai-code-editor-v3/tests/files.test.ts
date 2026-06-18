import { describe, it, expect } from 'vitest';
import { getLanguageFromPath, getFileIcon } from '../src/core/files';

describe('getLanguageFromPath', () => {
  it('detects HTML', () => {
    expect(getLanguageFromPath('index.html')).toBe('html');
  });

  it('detects JavaScript', () => {
    expect(getLanguageFromPath('app.js')).toBe('javascript');
  });

  it('detects TypeScript', () => {
    expect(getLanguageFromPath('app.ts')).toBe('typescript');
  });

  it('detects JSX', () => {
    expect(getLanguageFromPath('App.jsx')).toBe('javascript');
  });

  it('detects TSX', () => {
    expect(getLanguageFromPath('App.tsx')).toBe('typescript');
  });

  it('detects CSS', () => {
    expect(getLanguageFromPath('style.css')).toBe('css');
  });

  it('detects Python', () => {
    expect(getLanguageFromPath('main.py')).toBe('python');
  });

  it('detects JSON', () => {
    expect(getLanguageFromPath('config.json')).toBe('json');
  });

  it('detects Markdown', () => {
    expect(getLanguageFromPath('README.md')).toBe('markdown');
  });

  it('returns plaintext for unknown extensions', () => {
    expect(getLanguageFromPath('file.xyz')).toBe('plaintext');
  });
});

describe('getFileIcon', () => {
  it('returns folder icon for folders', () => {
    expect(getFileIcon('src', true)).toBe('📁');
  });

  it('returns HTML icon', () => {
    expect(getFileIcon('index.html', false)).toBe('🌐');
  });

  it('returns JS icon', () => {
    expect(getFileIcon('app.js', false)).toBe('📜');
  });

  it('returns TS icon', () => {
    expect(getFileIcon('app.ts', false)).toBe('📘');
  });

  it('returns default icon for unknown', () => {
    expect(getFileIcon('file.xyz', false)).toBe('📄');
  });
});
