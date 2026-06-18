// ============================================================
// Search Feature Tests — regex, glob, highlighting
// ============================================================
import { describe, it, expect } from 'vitest';

// ─── Recreated pure functions from src/features/search.ts ────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchGlob(filePath: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    'i'
  );
  return regex.test(filePath);
}

function highlightMatch(content: string, start: number, end: number): string {
  if (start >= content.length) return escapeHtml(content);
  const before = escapeHtml(content.substring(0, start));
  const match = escapeHtml(content.substring(start, Math.min(end, content.length)));
  const after = escapeHtml(content.substring(Math.min(end, content.length)));
  return `${before}<mark style="background:var(--info);color:white;padding:0 1px;border-radius:1px">${match}</mark>${after}`;
}

interface SearchMatch {
  file: string;
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  replaceText: string;
  includePattern: string;
  excludePattern: string;
}

function performGlobalSearch(
  query: string,
  options: SearchOptions,
  files: Map<string, { content: string }>
): SearchMatch[] {
  const results: SearchMatch[] = [];

  let pattern: RegExp;
  try {
    let flags = 'g';
    if (!options.caseSensitive) flags += 'i';
    const escapedQuery = options.useRegex ? query : escapeRegex(query);
    const wordBoundary = options.wholeWord ? '\\b' : '';
    pattern = new RegExp(`${wordBoundary}${escapedQuery}${wordBoundary}`, flags);
  } catch {
    return [];
  }

  for (const [path, entry] of files.entries()) {
    if (options.includePattern) {
      const patterns = options.includePattern.split(',').map((p) => p.trim());
      const matches = patterns.some((p) => {
        if (p.startsWith('!')) return false;
        return matchGlob(path, p);
      });
      if (!matches && patterns.length > 0 && !patterns.some((p) => p === '*')) continue;
    }

    const lines = entry.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(lines[i])) !== null) {
        results.push({
          file: path,
          line: i + 1,
          content: lines[i].trim().substring(0, 150),
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
        });
        if (!options.useRegex && match.index === pattern.lastIndex) break;
      }
    }
  }

  return results;
}

// ================================================================
describe('Search — escapeRegex', () => {
  it('should escape dot', () => {
    expect(escapeRegex('.')).toBe('\\.');
  });

  it('should escape asterisk', () => {
    expect(escapeRegex('*')).toBe('\\*');
  });

  it('should escape plus sign', () => {
    expect(escapeRegex('+')).toBe('\\+');
  });

  it('should escape question mark', () => {
    expect(escapeRegex('?')).toBe('\\?');
  });

  it('should escape parentheses', () => {
    expect(escapeRegex('()')).toBe('\\(\\)');
  });

  it('should escape square brackets', () => {
    expect(escapeRegex('[]')).toBe('\\[\\]');
  });

  it('should escape caret and dollar', () => {
    expect(escapeRegex('^$')).toBe('\\^\\$');
  });

  it('should escape pipe', () => {
    expect(escapeRegex('|')).toBe('\\|');
  });

  it('should escape backslash', () => {
    expect(escapeRegex('\\')).toBe('\\\\');
  });

  it('should escape curly braces', () => {
    expect(escapeRegex('{}')).toBe('\\{\\}');
  });

  it('should not escape normal characters', () => {
    expect(escapeRegex('hello')).toBe('hello');
  });
});

describe('Search — matchGlob', () => {
  it('should match exact filename', () => {
    expect(matchGlob('index.ts', 'index.ts')).toBe(true);
  });

  it('should match with asterisk wildcard', () => {
    expect(matchGlob('index.ts', '*.ts')).toBe(true);
  });

  it('should not match different extension', () => {
    expect(matchGlob('index.js', '*.ts')).toBe(false);
  });

  it('should match path with glob pattern', () => {
    expect(matchGlob('src/index.ts', 'src/*')).toBe(true);
  });

  it('should match any path with double asterisk', () => {
    expect(matchGlob('src/components/Button.tsx', 'src/**/*.tsx')).toBe(true);
  });

  it('should match question mark wildcard', () => {
    expect(matchGlob('a.ts', '?.ts')).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(matchGlob('INDEX.TS', 'index.ts')).toBe(true);
  });

  it('should not match completely different path', () => {
    expect(matchGlob('lib/utils.ts', 'src/*.ts')).toBe(false);
  });
});

describe('Search — highlightMatch', () => {
  it('should wrap matched text in mark tags', () => {
    const result = highlightMatch('hello world', 6, 11);
    expect(result).toContain('<mark');
    expect(result).toContain('world');
  });

  it('should keep text before match unchanged', () => {
    const result = highlightMatch('hello world', 6, 11);
    expect(result.startsWith('hello ')).toBe(true);
  });

  it('should keep text after match', () => {
    const result = highlightMatch('hello world!', 6, 11);
    // match="world", after="!" (comes after </mark>)
    expect(result).toContain('world</mark>!');
    expect(result.endsWith('!</mark>')).toBe(false);
  });

  it('should escape HTML in matched text', () => {
    const result = highlightMatch('<div>text</div>', 5, 9);
    expect(result).toContain('&lt;div&gt;');
    expect(result).toContain('&lt;/div&gt;');
  });

  it('should handle match at beginning of string', () => {
    const result = highlightMatch('match_here rest', 0, 10);
    expect(result.startsWith('<mark')).toBe(true);
  });
});

describe('Search — performGlobalSearch', () => {
  const createFiles = () => {
    const files = new Map<string, { content: string }>();
    files.set('src/index.ts', { content: 'const x = 1;\nconsole.log(x);\n' });
    files.set('src/utils.ts', { content: 'export function add(a, b) { return a + b; }\n' });
    files.set('README.md', { content: '# My Project\n\nDescription here.\n' });
    return files;
  };

  const defaultOptions: SearchOptions = {
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    replaceText: '',
    includePattern: '',
    excludePattern: '',
  };

  it('should find literal matches', () => {
    const results = performGlobalSearch('console', defaultOptions, createFiles());
    expect(results.length).toBe(1);
    expect(results[0].file).toBe('src/index.ts');
    expect(results[0].line).toBe(2);
  });

  it('should return empty for no matches', () => {
    const results = performGlobalSearch('nonexistent', defaultOptions, createFiles());
    expect(results.length).toBe(0);
  });

  it('should handle case-insensitive search', () => {
    const opts = { ...defaultOptions };
    const results = performGlobalSearch('CONSOLE', opts, createFiles());
    expect(results.length).toBe(1);
  });

  it('should handle case-sensitive search', () => {
    const opts = { ...defaultOptions, caseSensitive: true };
    const results = performGlobalSearch('CONSOLE', opts, createFiles());
    expect(results.length).toBe(0);
  });

  it('should handle regex search', () => {
    const opts = { ...defaultOptions, useRegex: true };
    const results = performGlobalSearch('console\\.log', opts, createFiles());
    expect(results.length).toBe(1);
  });

  it('should handle invalid regex gracefully', () => {
    const opts = { ...defaultOptions, useRegex: true };
    const results = performGlobalSearch('[invalid', opts, createFiles());
    expect(results.length).toBe(0);
  });

  it('should handle whole word search', () => {
    const files = new Map<string, { content: string }>();
    files.set('test.ts', { content: 'const consoleLog = 1; console;' });
    const opts = { ...defaultOptions, wholeWord: true };
    const results = performGlobalSearch('console', opts, files);
    // Should match 'console' but not 'consoleLog'
    expect(results.length).toBe(1);
  });

  it('should find matches across multiple files', () => {
    const files = new Map<string, { content: string }>();
    files.set('a.ts', { content: 'const x = 1;' });
    files.set('b.ts', { content: 'const y = 2;' });
    const results = performGlobalSearch('const', defaultOptions, files);
    expect(results.length).toBe(2);
  });

  it('should filter by includePattern', () => {
    const opts = { ...defaultOptions, includePattern: '*.ts' };
    const results = performGlobalSearch('const', opts, createFiles());
    // Should only search .ts files
    expect(results.every((r) => r.file.endsWith('.ts'))).toBe(true);
  });

  it('should find multiple matches on same line', () => {
    const files = new Map<string, { content: string }>();
    files.set('test.ts', { content: 'const a = 1; const b = 2;' });
    const results = performGlobalSearch('const', defaultOptions, files);
    expect(results.length).toBe(2);
  });

  it('should include line number in results', () => {
    const results = performGlobalSearch('console', defaultOptions, createFiles());
    expect(results[0].line).toBe(2);
  });

  it('should trim content to 150 chars', () => {
    const files = new Map<string, { content: string }>();
    const longLine = 'a'.repeat(200) + ' match ' + 'b'.repeat(200);
    files.set('test.ts', { content: longLine });
    const results = performGlobalSearch('match', defaultOptions, files);
    expect(results[0].content.length).toBeLessThanOrEqual(150);
  });
});

describe('Search — escapeHtml', () => {
  it('should escape HTML entities', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });
});
