// ============================================================
// Prettier 代码格式化 — 内置格式化 + 多语言支持
// ============================================================
import * as prettier from 'prettier/standalone';
import * as prettierPluginBabel from 'prettier/plugins/babel';
import * as prettierPluginEstree from 'prettier/plugins/estree';
import * as prettierPluginHtml from 'prettier/plugins/html';
import * as prettierPluginCss from 'prettier/plugins/postcss';
import * as prettierPluginMarkdown from 'prettier/plugins/markdown';
import * as prettierPluginTypescript from 'prettier/plugins/typescript';
import { getEditor, getEditorContent, setEditorContent } from '../core/editor';
import { useEditorStore } from '../core/stores';

// ─── Language → Prettier plugin mapping ────────────────────
const PLUGIN_MAP: Record<string, any[]> = {
  typescript: [prettierPluginTypescript, prettierPluginEstree],
  javascript: [prettierPluginBabel, prettierPluginEstree],
  tsx: [prettierPluginTypescript, prettierPluginEstree],
  jsx: [prettierPluginBabel, prettierPluginEstree],
  html: [prettierPluginHtml],
  css: [prettierPluginCss],
  scss: [prettierPluginCss],
  less: [prettierPluginCss],
  json: [prettierPluginBabel, prettierPluginEstree],
  jsonc: [prettierPluginBabel, prettierPluginEstree],
  markdown: [prettierPluginMarkdown],
  md: [prettierPluginMarkdown],
};

const PARSER_MAP: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'babel',
  tsx: 'typescript',
  jsx: 'babel',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  jsonc: 'json',
  markdown: 'markdown',
  md: 'markdown',
};

// ─── Resolve language ──────────────────────────────────────
function resolvePluginsAndParser(lang: string): { plugins: any[]; parser: string } | null {
  const langLower = lang.toLowerCase();
  const plugins = PLUGIN_MAP[langLower];
  const parser = PARSER_MAP[langLower];
  if (!plugins || !parser) return null;
  return { plugins, parser };
}

// ─── Format document ───────────────────────────────────────
export async function formatDocument(): Promise<boolean> {
  const editor = getEditor();
  if (!editor) return false;

  const model = editor.getModel();
  if (!model) return false;

  const language = model.getLanguageId();
  const resolved = resolvePluginsAndParser(language);

  if (!resolved) {
    import('../main').then((m) => m.showToast(`格式化暂不支持 ${language} 语言`));
    return false;
  }

  const code = editor.getValue();
  if (!code.trim()) return false;

  try {
    const formatted = await prettier.format(code, {
      parser: resolved.parser,
      plugins: resolved.plugins,
      tabWidth: 2,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
    });

    if (formatted !== code) {
      const cursorPos = editor.getPosition();
      editor.setValue(formatted);
      if (cursorPos) editor.setPosition(cursorPos);
      // Mark file as dirty
      const active = useEditorStore.getState().activeFile;
      if (active) useEditorStore.getState().markDirty(active);
      import('../main').then((m) => m.showToast('已格式化'));
    }

    return true;
  } catch (err: any) {
    console.error('Format error:', err);
    import('../main').then((m) => m.showToast(`格式化失败: ${err.message?.substring(0, 50)}`));
    return false;
  }
}

// ─── Format selection ──────────────────────────────────────
export async function formatSelection(): Promise<boolean> {
  const editor = getEditor();
  if (!editor) return false;

  const selection = editor.getSelection();
  if (!selection || selection.isEmpty()) {
    // No selection — format whole document
    return formatDocument();
  }

  const model = editor.getModel();
  if (!model) return false;

  const language = model.getLanguageId();
  const resolved = resolvePluginsAndParser(language);
  if (!resolved) {
    return formatDocument(); // fallback
  }

  const selectedText = model.getValueInRange(selection);
  if (!selectedText.trim()) return false;

  try {
    const formatted = await prettier.format(selectedText, {
      parser: resolved.parser,
      plugins: resolved.plugins,
      tabWidth: 2,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
    });

    if (formatted !== selectedText) {
      editor.executeEdits('format', [
        { range: selection, text: formatted },
      ]);
      import('../main').then((m) => m.showToast('已格式化选中区域'));
    }

    return true;
  } catch {
    // If selection formatting fails, try whole document
    return formatDocument();
  }
}
