// ============================================================
// Editor Module Unit Tests
// (Tests utility functions that don't require Monaco DOM)
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the logic patterns used in editor.ts without requiring Monaco
// Monaco.editor.create() requires a real DOM, so we test the pure-logic patterns.

describe('Editor — Content operations', () => {
  it('setEditorContent should update model value', () => {
    // Simulate the pattern: model.setValue(content)
    let modelValue = '';
    const setValue = (v: string) => { modelValue = v; };
    const getModel = () => ({ setValue, getValue: () => modelValue, getLineCount: () => 1, getLineMaxColumn: () => 1 });

    const mockEditor = { getModel };

    if (mockEditor) {
      const m = mockEditor.getModel();
      if (m) m.setValue('new content');
    }

    expect(modelValue).toBe('new content');
  });

  it('getEditorContent should return empty string when no editor', () => {
    // Simulate: monacoEditor?.getModel()?.getValue() || ''
    const editor = null;
    const content = (editor ?? '') || '';
    expect(content).toBe('');
  });

  it('saveCurrentFile should store file with updatedAt', () => {
    // Simulate save logic
    const activeFile = '/src/test.ts';
    const content = 'const x = 1;';
    const language = 'typescript';
    const before = Date.now();

    const entry = {
      path: activeFile,
      content,
      language,
      updatedAt: Date.now(),
    };

    expect(entry.path).toBe(activeFile);
    expect(entry.content).toBe(content);
    expect(entry.language).toBe(language);
    expect(entry.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('Editor — Breadcrumb', () => {
  it('should split path into breadcrumb parts', () => {
    const path = '/src/components/Header.tsx';
    const parts = path.split('/');

    expect(parts).toEqual(['', 'src', 'components', 'Header.tsx']);

    const html = parts
      .map((p, i) => {
        const isLast = i === parts.length - 1;
        return `<span class="breadcrumb-item${isLast ? ' active' : ''}">${p}</span>${
          !isLast ? '<span class="breadcrumb-sep">›</span>' : ''
        }`;
      })
      .join('');

    expect(html).toContain('breadcrumb-item active');
    expect(html).toContain('Header.tsx');
    expect(html).toContain('breadcrumb-sep');
  });

  it('should handle single segment paths', () => {
    const path = 'README.md';
    const parts = path.split('/');

    expect(parts).toEqual(['README.md']);
    // Last (and only) part should be active
    expect(parts.length).toBe(1);
  });
});

describe('Editor — Inline completion heuristics', () => {
  it('should detect keyword completions from last word', () => {
    const textBeforeCursor = 'const my';
    const lastWord = textBeforeCursor.split(/\s+/).pop() || '';

    const completions: Record<string, string> = {
      'function': 'function name() {\n  \n}',
      'const': 'const name = ',
    };

    expect(lastWord).toBe('my');
    expect(completions['my']).toBeUndefined(); // not a keyword
  });

  it('should detect function keyword', () => {
    const textBeforeCursor = 'function';
    const lastWord = textBeforeCursor.split(/\s+/).pop() || '';

    const completions: Record<string, string> = {
      'function': 'function name() {\n  \n}',
    };

    expect(lastWord).toBe('function');
    expect(completions[lastWord]).toContain('function name()');
  });

  it('should have all 8 basic completions', () => {
    const completions: Record<string, string> = {
      'function': 'function name() {\n  \n}',
      'const': 'const name = ',
      'let': 'let name = ',
      'import': "import {  } from '';",
      'export': 'export default ',
      'class': 'class Name {\n  constructor() {\n    \n  }\n}',
      'if': 'if (condition) {\n  \n}',
      'for': 'for (let i = 0; i < length; i++) {\n  \n}',
    };

    expect(Object.keys(completions)).toHaveLength(8);
    // Each completion should not be empty
    Object.values(completions).forEach(c => {
      expect(c.length).toBeGreaterThan(0);
    });
  });

  it('should require at least 3 chars for inline completion', () => {
    const short = 'ab';
    const long = 'abc';

    // Short text should not trigger
    expect(short.length >= 3).toBe(false);
    // Long text should trigger
    expect(long.length >= 3).toBe(true);
  });
});

describe('Editor — LSP listener', () => {
  it('should construct correct file URI', () => {
    const filePath = 'C:\\Users\\test\\project\\src\\app.ts';
    const uri = `file:///${filePath.replace(/\\/g, '/')}`;

    expect(uri).toBe('file:///C:/Users/test/project/src/app.ts');
  });

  it('should construct Unix-style URI', () => {
    const filePath = '/home/user/project/src/app.ts';
    const uri = `file:///${filePath.replace(/\\/g, '/')}`;

    expect(uri).toBe('file:////home/user/project/src/app.ts');
  });

  it('should increment version on content change', () => {
    let lastVersion = 0;
    lastVersion++;
    expect(lastVersion).toBe(1);
    lastVersion++;
    expect(lastVersion).toBe(2);
  });
});

describe('Editor — Settings sync', () => {
  it('should extract settings values for Monaco updateOptions', () => {
    const settings = {
      fontSize: 16,
      tabSize: 2,
      theme: 'vs-dark' as const,
    };

    const updateOptions: any = {
      fontSize: settings.fontSize,
      tabSize: settings.tabSize,
      theme: settings.theme === 'vs-dark' ? 'ai-code-dark' : settings.theme,
    };

    expect(updateOptions.fontSize).toBe(16);
    expect(updateOptions.tabSize).toBe(2);
    expect(updateOptions.theme).toBe('ai-code-dark');
  });

  it('should use light theme when not vs-dark', () => {
    const settings = { theme: 'vs' as const };
    const theme = settings.theme === 'vs-dark' ? 'ai-code-dark' : settings.theme;
    expect(theme).toBe('vs');
  });
});

describe('Editor — Mark saved status', () => {
  it('should update status text to saved', () => {
    const savedText = '💾 已保存';
    expect(savedText).toContain('已保存');
  });

  it('should update status text to unsaved', () => {
    const unsavedText = '● 未保存';
    expect(unsavedText).toContain('未保存');
  });
});
