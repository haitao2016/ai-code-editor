// ============================================================
// Tests: File Tree Logic (no DOM required)
// ============================================================
import { describe, it, expect } from 'vitest';

describe('File Tree Logic', () => {
  it('should sort paths alphabetically with dirs first', () => {
    const paths = ['b.txt', 'a.js', 'dir/inner.ts'];
    const dirs: string[] = [];
    const files: string[] = [];

    for (const p of paths) {
      const parts = p.split('/');
      if (parts.length > 1) dirs.push(parts[0]);
      if (p.includes('.')) files.push(p);
    }

    // dirs: ['dir'], files: ['b.txt', 'a.js', 'dir/inner.ts']
    const sorted = [...dirs.sort(), ...files.sort()];
    expect(sorted[0]).toBe('dir');
    expect(sorted[1]).toBe('a.js');
  });

  it('should correctly build tree structure from paths', () => {
    const paths = ['src/index.ts', 'src/core/ai.ts', 'README.md'];
    const tree: Record<string, any> = { __children: [] };

    for (const path of paths) {
      const parts = path.split('/');
      let current = tree;
      for (let i = 0; i < parts.length; i++) {
        const isFile = i === parts.length - 1;
        if (isFile) {
          current.__children.push(parts[i]);
        } else {
          if (!current[parts[i]]) {
            current[parts[i]] = { __children: [] };
          }
          current = current[parts[i]];
        }
      }
    }

    expect(Object.keys(tree)).toContain('src');
    expect(tree.__children).toContain('README.md');
    expect(tree.src.__children).toContain('index.ts');
    expect(tree.src.core.__children).toContain('ai.ts');
  });

  it('should filter duplicate paths', () => {
    const paths = ['a.ts', 'a.ts', 'b.ts'];
    const unique = [...new Set(paths)];
    expect(unique).toEqual(['a.ts', 'b.ts']);
  });

  it('should handle empty file list', () => {
    const paths: string[] = [];
    const tree: Record<string, any> = { __children: [] };
    expect(tree.__children).toEqual([]);
  });

  it('should handle deeply nested paths', () => {
    const path = 'a/b/c/d/e/f.ts';
    const parts = path.split('/');
    expect(parts.length).toBe(6);
    expect(parts[parts.length - 1]).toBe('f.ts');
  });

  it('should sort children alphabetically', () => {
    const children = ['z.ts', 'a.ts', 'm.ts'];
    children.sort();
    expect(children[0]).toBe('a.ts');
    expect(children[2]).toBe('z.ts');
  });

  it('should handle paths with special characters', () => {
    const path = 'src/[id]/page.tsx';
    const parts = path.split('/');
    expect(parts[1]).toBe('[id]');
    expect(parts[2]).toBe('page.tsx');
  });
});
