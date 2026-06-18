// ============================================================
// Monaco Editor 封装
// ============================================================
import * as monaco from 'monaco-editor';
import { useEditorSettingsStore, useEditorStore, useFilesStore, useAISettingsStore } from './stores';
import { getLanguageFromPath, saveFile } from './files';
import { i18n, t } from './i18n';

let monacoEditor: any = null;
let inlineProvider: any = null;
let lspChangeDisposable: any = null;

export function getEditor(): any {
  return monacoEditor;
}

export function getMonaco(): any {
  return monaco;
}

// ─── Monaco initialization (local npm bundle, no CDN) ─────
let monacoInitPromise: Promise<void> | null = null;

export function initMonaco(container: HTMLElement): Promise<void> {
  if (monacoInitPromise) return monacoInitPromise;

  monacoInitPromise = new Promise<void>((resolve) => {
    // Define dark theme
    monaco.editor.defineTheme('ai-code-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1e2e',
        'editor.foreground': '#cdd6f4',
        'editor.lineHighlightBackground': '#31324430',
        'editor.selectionBackground': '#45475a60',
        'editorCursor.foreground': '#6366f1',
        'editorLineNumber.foreground': '#6c708660',
        'editorLineNumber.activeForeground': '#a6adc8',
        'editor.inactiveSelectionBackground': '#45475a30',
      },
    });

    const settings = useEditorSettingsStore.getState();

    monacoEditor = monaco.editor.create(container, {
      value: '',
      language: 'plaintext',
      theme: settings.theme === 'vs-dark' ? 'ai-code-dark' : settings.theme,
      fontSize: settings.fontSize,
      tabSize: settings.tabSize,
      minimap: { enabled: true, scale: 1, showSlider: 'mouseover' as any },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggest: { showWords: true, showSnippets: true },
      renderWhitespace: 'selection',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 8 },
      lineNumbers: 'on',
      glyphMargin: true,
      folding: true,
      lineDecorationsWidth: 8,
      lineNumbersMinChars: 3,
    });

    // Cursor position tracking
    monacoEditor.onDidChangeCursorPosition((e: any) => {
      const pos = e.position;
      const el = document.getElementById('statusLnCol');
      if (el) el.textContent = `行 ${pos.lineNumber}, 列 ${pos.column}`;
    });

    // Content change -> mark dirty
    monacoEditor.onDidChangeModelContent(() => {
      const active = useEditorStore.getState().activeFile;
      if (active) {
        useEditorStore.getState().markDirty(active);
        updateSaveStatus();
      }
    });


    setupInlineCompletion();
    resolve();
  });

  return monacoInitPromise;
}

// ─── Editor Operations ─────────────────────────────────────
export function setEditorContent(content: string, language?: string): void {
  if (!monacoEditor) return;
  const m = monacoEditor.getModel();
  if (!m) return;
  m.setValue(content);
  if (language) {
    monaco.editor.setModelLanguage(m, getLanguageFromPath(language));
  }
}

export function getEditorContent(): string {
  return monacoEditor?.getModel()?.getValue() || '';
}

export function openFileTab(path: string, content: string): void {
  const store = useEditorStore.getState();
  store.openTab(path);
  const lang = getLanguageFromPath(path);
  setEditorContent(content, lang);
  updateEditorLanguage(lang);
  updateBreadcrumb(path);
  updateTitle(path);

  // Large file detection
  import('./large-file').then((m) => {
    const state = m.detectLargeFile(path, content);
    if (state.isLarge) {
      m.applyLargeFileOptimizations(path, state);
    }
  });

  // LSP sync — notify open/close on file switches
  setupLSPChangeListener(path, lang);
}

function updateEditorLanguage(lang: string): void {
  if (!monacoEditor) return;
  const model = monacoEditor.getModel();
  if (model) monaco.editor.setModelLanguage(model, lang);
}

function updateBreadcrumb(path: string): void {
  const el = document.getElementById('breadcrumbBar');
  if (!el) return;
  const parts = path.split('/');
  el.innerHTML = parts
    .map((p, i) => {
      const isLast = i === parts.length - 1;
      return `<span class="breadcrumb-item${isLast ? ' active' : ''}">${p}</span>${
        !isLast ? '<span class="breadcrumb-sep">›</span>' : ''
      }`;
    })
    .join('');
}

function updateTitle(path: string): void {
  const el = document.getElementById('titleFileName');
  if (el) el.textContent = path;
}

function updateSaveStatus(): void {
  const el = document.getElementById('statusSave');
  if (el) el.textContent = i18n.t('app.未保存');
}

export function markSaved(): void {
  const store = useEditorStore.getState();
  if (store.activeFile) store.markClean(store.activeFile);
  const el = document.getElementById('statusSave');
  if (el) el.textContent = i18n.t('html.已保存');
}

// ─── Save ──────────────────────────────────────────────────
export async function saveCurrentFile(): Promise<void> {
  const store = useEditorStore.getState();
  if (!store.activeFile || !monacoEditor) return;

  const content = getEditorContent();
  const fileStore = useFilesStore.getState();

  fileStore.setFile({
    path: store.activeFile,
    content,
    language: getLanguageFromPath(store.activeFile),
    updatedAt: Date.now(),
  });

  await saveFile({
    path: store.activeFile,
    content,
    language: getLanguageFromPath(store.activeFile),
    updatedAt: Date.now(),
  });

  markSaved();
}

// ─── Inline Completion ─────────────────────────────────────
let completionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastCompletionPosition: { line: number; column: number } | null = null;
let pendingCompletionResolve: ((value: any) => void) | null = null;

function setupInlineCompletion(): void {
  monaco.languages.registerInlineCompletionsProvider('*', {
    provideInlineCompletions: async (
      model: any,
      position: any,
      context: any,
      _token: any
    ) => {
      const settings = useEditorSettingsStore.getState();
      if (settings.inlineComplete === 'disabled') return { items: [] };

      // Clear any pending debounce
      if (completionDebounceTimer) {
        clearTimeout(completionDebounceTimer);
        completionDebounceTimer = null;
      }

      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.substring(0, position.column - 1);

      // Minimum 3 chars to trigger
      if (textBeforeCursor.length < 3) return { items: [] };

      // Get prefix (code before cursor) and suffix (code after cursor)
      const prefix = model.getValueInRange({
        startLineNumber: Math.max(1, position.lineNumber - 50),
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const suffix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 10),
        endColumn: model.getLineMaxColumn(Math.min(model.getLineCount(), position.lineNumber + 10)),
      });

      // Check if AI settings are configured
      const aiSettings = useAISettingsStore.getState() as any;
      const hasAI = !!(aiSettings.endpoint && aiSettings.apiKey);

      // Build items list
      const items: any[] = [];

      // ─── Basic heuristic completions (always available) ──
      const lastWord = textBeforeCursor.split(/\s+/).pop() || '';
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

      for (const [key, completion] of Object.entries(completions)) {
        if (lastWord === key) {
          items.push({
            insertText: completion,
            filterText: key,
            range: new monaco.Range(
              position.lineNumber,
              position.column - key.length,
              position.lineNumber,
              position.column
            ),
          });
        }
      }

      // ─── AI-powered completion (debounced) ───────────────
      if (hasAI && textBeforeCursor.length >= 5) {
        // Use a debounce: wait 300ms before sending AI request
        // Return heuristic items immediately; AI completions come later
        const currentPos = { line: position.lineNumber, column: position.column };

        completionDebounceTimer = setTimeout(async () => {
          // Only send if position hasn't changed
          if (
            lastCompletionPosition &&
            lastCompletionPosition.line === currentPos.line &&
            lastCompletionPosition.column === currentPos.column
          ) {
            return; // Already requested for this position
          }
          lastCompletionPosition = currentPos;

          try {
            const { getInlineCompletion } = await import('./ai');
            const lang = getLanguageFromPath(useEditorStore.getState().activeFile || '');
            const completion = await getInlineCompletion(prefix, suffix, lang);

            if (completion && completion.length > 0 && completion.length < 500) {
              // Show inline ghost text if editor is still available
              const ed = getEditor();
              if (ed && ed.getPosition()) {
                const currentEditorPos = ed.getPosition();
                if (
                  currentEditorPos.lineNumber === currentPos.line &&
                  currentEditorPos.column === currentPos.column
                ) {
                  // Trigger re-evaluation of inline completions
                  ed.trigger('keyboard', 'editor.action.triggerSuggest', {});
                }
              }
            }
          } catch {
            // Silently ignore AI completion errors
          }
        }, 300);
      }

      return { items };
    },
    freeInlineCompletions: (completions: any[]) => {
      // Cleanup if needed
    },
  });
}

// ─── Settings sync ─────────────────────────────────────────
export function syncEditorSettings(): void {
  if (!monacoEditor) return;
  const settings = useEditorSettingsStore.getState();
  monacoEditor.updateOptions({
    fontSize: settings.fontSize,
    tabSize: settings.tabSize,
    theme: settings.theme === 'vs-dark' ? 'ai-code-dark' : settings.theme,
  });
}

// ─── LSP Sync ──────────────────────────────────────────────
export function setupLSPChangeListener(filePath: string, languageId: string): void {
  if (!monacoEditor) return;

  // Remove old listener
  if (lspChangeDisposable) {
    lspChangeDisposable.dispose();
    lspChangeDisposable = null;
  }

  // Notify LSP of new open + change events
  let lastVersion = 0;
  const uri = `file:///${filePath.replace(/\\/g, '/')}`;

  // Open document in LSP
  const model = monacoEditor.getModel();
  if (model) {
    try {
      import('./lsp-bridge').then(({ startLSPForFile, notifyLSPChange }) => {
        startLSPForFile(languageId, filePath, model.getValue()).catch(() => {});
      });
    } catch {}
  }

  // Change listener
  lspChangeDisposable = monacoEditor.onDidChangeModelContent(() => {
    lastVersion++;
    const m = monacoEditor?.getModel();
    if (!m) return;
    try {
      import('./lsp-bridge').then(({ notifyLSPChange }) => {
        notifyLSPChange(uri, languageId, m.getValue());
      });
    } catch {}
  });
}
