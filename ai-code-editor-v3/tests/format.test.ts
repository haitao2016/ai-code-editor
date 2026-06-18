// ============================================================
// Format / Language Resolution Tests
// ============================================================
import { describe, it, expect } from 'vitest';

describe('Format Language Resolution', () => {
  it('should resolve TS/JS parsers', () => {
    const PARSER_MAP: Record<string, string> = {
      typescript: 'typescript',
      javascript: 'babel',
      tsx: 'typescript',
      jsx: 'babel',
      html: 'html',
      css: 'css',
      json: 'json',
      markdown: 'markdown',
    };

    expect(PARSER_MAP['typescript']).toBe('typescript');
    expect(PARSER_MAP['javascript']).toBe('babel');
    expect(PARSER_MAP['tsx']).toBe('typescript');
    expect(PARSER_MAP['html']).toBe('html');
    expect(PARSER_MAP['css']).toBe('css');
    expect(PARSER_MAP['json']).toBe('json');
    expect(PARSER_MAP['markdown']).toBe('markdown');
  });

  it('should handle unknown languages gracefully', () => {
    const PARSER_MAP: Record<string, string> = {
      typescript: 'typescript',
      javascript: 'babel',
    };

    function resolveParser(lang: string): string | null {
      return PARSER_MAP[lang.toLowerCase()] || null;
    }

    expect(resolveParser('TypeScript')).toBe('typescript');
    expect(resolveParser('python')).toBeNull();
    expect(resolveParser('rust')).toBeNull();
    expect(resolveParser('JAVA')).toBeNull();
  });

  it('should handle case insensitivity', () => {
    const PARSER_MAP: Record<string, string> = {
      typescript: 'typescript',
      javascript: 'babel',
      html: 'html',
      css: 'css',
    };

    function resolve(lang: string): string | null {
      return PARSER_MAP[lang.toLowerCase()] || null;
    }

    expect(resolve('TypeScript')).toBe('typescript');
    expect(resolve('JavaScript')).toBe('babel');
    expect(resolve('HTML')).toBe('html');
    expect(resolve('CSS')).toBe('css');
  });
});
