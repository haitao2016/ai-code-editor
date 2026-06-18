// ============================================================
// Context & Import Resolution Tests
// ============================================================
import { describe, it, expect } from 'vitest';

describe('Import Resolution', () => {
  it('should normalize paths with . and ..', () => {
    const normalizePath = (path: string): string => {
      const parts = path.split('/');
      const result: string[] = [];
      for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') { result.pop(); continue; }
        result.push(part);
      }
      return result.join('/');
    };

    expect(normalizePath('src/../lib/utils')).toBe('lib/utils');
    expect(normalizePath('./src/components/../Button')).toBe('src/Button');
    expect(normalizePath('a/b/c/../../d')).toBe('a/d');
    expect(normalizePath('simple/path')).toBe('simple/path');
  });

  it('should parse TS/JS static imports', () => {
    function parseImports(source: string): string[] {
      const re = /import\s+(?:(?:\{[^}]*\}|[\w$]+|\*\s+as\s+\w+)\s*,?\s*)*\s*(?:from\s*)?['"]([^'"]+)['"]/g;
      const matches: string[] = [];
      let m;
      while ((m = re.exec(source)) !== null) {
        matches.push(m[1]);
      }
      return matches;
    }

    const code = `
import React from 'react';
import { useState, useEffect } from 'react';
import * as Utils from './utils';
import './styles.css';
`;

    const imports = parseImports(code);
    expect(imports).toContain('react');
    expect(imports).toContain('./utils');
    expect(imports).toContain('./styles.css');
  });

  it('should parse dynamic imports', () => {
    function parseDynamicImports(source: string): string[] {
      const re = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      const matches: string[] = [];
      let m;
      while ((m = re.exec(source)) !== null) {
        matches.push(m[1]);
      }
      return matches;
    }

    const code = `
const module = await import('./lazy-module');
import('./features/chat').then(m => m.sendChatMessage());
`;

    const imports = parseDynamicImports(code);
    expect(imports).toContain('./lazy-module');
    expect(imports).toContain('./features/chat');
  });

  it('should parse Python imports', () => {
    function parsePythonImports(source: string): string[] {
      const matches: string[] = [];
      let m;

      // import X
      const importRe = /^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;
      while ((m = importRe.exec(source)) !== null) {
        m[1].split(',').forEach((s) => matches.push(s.trim()));
      }

      // from X import Y
      const fromRe = /^from\s+([\w.]+)\s+import\s+/gm;
      while ((m = fromRe.exec(source)) !== null) {
        matches.push(m[1]);
      }

      return matches;
    }

    const code = `
import os
import sys, json
from collections import defaultdict
from .utils import helper
`;

    const imports = parsePythonImports(code);
    expect(imports).toContain('os');
    expect(imports).toContain('sys');
    expect(imports).toContain('json');
    expect(imports).toContain('collections');
    expect(imports).toContain('.utils');
  });

  it('should detect code files by extension', () => {
    const isCodeFile = (path: string): boolean => {
      const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs'];
      return exts.some((ext) => path.endsWith(ext));
    };

    expect(isCodeFile('src/main.ts')).toBe(true);
    expect(isCodeFile('components/App.tsx')).toBe(true);
    expect(isCodeFile('utils/helper.py')).toBe(true);
    expect(isCodeFile('readme.md')).toBe(false);
    expect(isCodeFile('config.json')).toBe(false);
    expect(isCodeFile('styles.css')).toBe(false);
  });

  it('should truncate content preserving head and tail', () => {
    function truncateContent(content: string, maxChars: number): string {
      if (content.length <= maxChars) return content;
      const half = Math.floor(maxChars / 2);
      return content.substring(0, half) + '\n... (truncated) ...\n' +
             content.substring(content.length - half);
    }

    const long = 'a'.repeat(100);
    const truncated = truncateContent(long, 50);
    expect(truncated.length).toBeLessThan(100);
    expect(truncated).toContain('truncated');
  });
});
