// ============================================================
// LSP Fallback — Monaco built-in language services bridge
// Provides TypeScript/JavaScript/CSS/HTML intelligence when
// real LSP servers are unavailable in Web mode
// ============================================================
import { getMonaco } from './editor';
import { useLinterStore } from './stores';

// Track enabled languages for fallback
let fallbackLanguages = new Set<string>();
let diagnosticsListener: any = null;

// ═══ Initialization ════════════════════════════════════════
export function initLSPFallback(): void {
  const monaco = getMonaco();
  if (!monaco) return;

  // Configure TypeScript/JavaScript defaults
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    strict: true,
    esModuleInterop: true,
    allowJs: true,
    checkJs: false,
    jsx: monaco.languages.typescript.JsxEmit.React,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
  });

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    allowJs: true,
    checkJs: false,
  });

  // Add lib declarations for browser/node
  const diagnosticsOptions: monaco.languages.typescript.DiagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  };
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);

  // Enable for default languages
  enableForLanguage('typescript');
  enableForLanguage('javascript');
  enableForLanguage('tsx');
  enableForLanguage('jsx');
  enableForLanguage('html');
  enableForLanguage('css');
  enableForLanguage('scss');
  enableForLanguage('less');
  enableForLanguage('json');

  // ═══ Sync TS diagnostics to Linter Store ═══════════════
  setupTSSync();

  // ═══ CSS/HTML diagnostics ═════════════════════════════
  setupCSSHTMLSync();

  console.log('LSP fallback initialized for:', [...fallbackLanguages].join(', '));
}

// ═══ Language enable/disable ═══════════════════════════════
export function enableForLanguage(languageId: string): void {
  if (fallbackLanguages.has(languageId)) return;
  fallbackLanguages.add(languageId);

  const monaco = getMonaco();
  if (!monaco) return;

  // Register basic providers for non-TS languages
  if (!['typescript', 'javascript', 'tsx', 'jsx'].includes(languageId)) {
    registerBasicProviders(monaco, languageId);
  }
}

export function isFallbackEnabled(languageId: string): boolean {
  return fallbackLanguages.has(languageId);
}

export function getEnabledLanguages(): string[] {
  return [...fallbackLanguages];
}

// ═══ Sync TypeScript diagnostics to Linter Store ══════════
function setupTSSync(): void {
  const monaco = getMonaco();
  if (!monaco) return;

  // Listen to TS/JS diagnostics
  const onDidChange = monaco.languages.typescript.typescriptDefaults.onDidChangeDiagnostics((uri: any) => {
    syncDiagnosticsToLinter();
  });
  diagnosticsListener = onDidChange;
}

// ═══ CSS/HTML diagnostics sync ════════════════════════════
function setupCSSHTMLSync(): void {
  const monaco = getMonaco();
  if (!monaco) return;

  // For CSS/HTML, we poll markers periodically since they don't have
  // a direct diagnostics change event like TypeScript
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const startPoll = () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      const editor = getEditor();
      if (editor) {
        syncAllMarkersToLinter(monaco, editor);
      }
    }, 2000);
  };

  // Start polling when editor content changes
  startPoll();
}

// ═══ Sync helpers ═════════════════════════════════════════
export function syncDiagnosticsToLinter(): void {
  const monaco = getMonaco();
  if (!monaco) return;

  const problems: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    source: string;
  }> = [];

  // Get TypeScript semantic + syntactic diagnostics
  for (const model of monaco.editor.getModels()) {
    const lang = model.getLanguageId();
    if (!['typescript', 'javascript', 'tsx', 'jsx'].includes(lang)) continue;

    try {
      const langService = lang === 'typescript' || lang === 'tsx'
        ? monaco.languages.typescript.typescriptDefaults
        : monaco.languages.typescript.javascriptDefaults;

      const uri = model.uri;
      const syntactic = (langService as any).getSyntacticDiagnostics?.(uri);
      const semantic = (langService as any).getSemanticDiagnostics?.(uri);

      const allDiagnostics = [...(syntactic || []), ...(semantic || [])];

      for (const d of allDiagnostics) {
        const startPos = model.getPositionAt(d.start || 0);
        const filePath = uri.fsPath || uri.path || uri.toString();
        problems.push({
          file: filePath,
          line: startPos.lineNumber,
          column: startPos.column,
          message: typeof d.messageText === 'string'
            ? d.messageText
            : (d.messageText as any).messageText || 'Unknown error',
          severity: d.category === 0 ? 'warning' : 'error',
          source: 'typescript',
        });
      }
    } catch {
      // TS diagnostics not available for this model
    }
  }

  // Update linter store
  const store = useLinterStore.getState();
  store.setProblems(problems as any);

  // Update status bar
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.filter((p) => p.severity === 'warning').length;
  const el = document.getElementById('statusProblems');
  if (el) {
    el.textContent = '';
    if (errors > 0) el.textContent += `\u2716 ${errors} `;
    if (warnings > 0) el.textContent += `\u26A0 ${warnings}`;
  }
}

function syncAllMarkersToLinter(monaco: any, editor: any): void {
  const problems: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    source: string;
  }> = [];

  for (const model of monaco.editor.getModels()) {
    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    for (const m of markers) {
      problems.push({
        file: model.uri.fsPath || model.uri.path || model.uri.toString(),
        line: m.startLineNumber,
        column: m.startColumn,
        message: m.message,
        severity: m.severity === monaco.MarkerSeverity.Error ? 'error'
          : m.severity === monaco.MarkerSeverity.Warning ? 'warning'
          : 'info',
        source: m.source || 'linter',
      });
    }
  }

  if (problems.length > 0) {
    useLinterStore.getState().setProblems(problems as any);
  }
}

// ═══ Basic language providers (fallback for non-TS languages) ═══
function registerBasicProviders(monaco: any, languageId: string): void {
  // Hover — show word under cursor
  monaco.languages.registerHoverProvider(languageId, {
    provideHover: (model: any, position: any) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const content = model.getValueInRange({
        startLineNumber: word.startLineNumber,
        startColumn: word.startColumn,
        endLineNumber: word.endLineNumber,
        endColumn: word.endColumn,
      });
      return { contents: [{ value: `**${content}**\n\n${languageId} symbol` }] };
    },
  });

  // Document symbols via Monaco's built-in bracket matching
  // This is handled by Monaco natively for most languages
}

// ═══ Workspace symbol search ═══════════════════════════════
export async function searchWorkspaceSymbols(query: string): Promise<Array<{
  name: string;
  kind: number;
  file: string;
  line: number;
  column: number;
}>> {
  const monaco = getMonaco();
  if (!monaco) return [];

  const results: Array<{
    name: string;
    kind: number;
    file: string;
    line: number;
    column: number;
  }> = [];

  const allModels = monaco.editor.getModels();

  for (const model of allModels) {
    const symbols = await monaco.languages.getDocumentSymbols(model);
    if (!symbols) continue;

    const filePath = model.uri.fsPath || model.uri.path;

    function collectSymbols(s: any, prefix: string = ''): void {
      if (s.name) {
        const name = prefix ? `${prefix}.${s.name}` : s.name;
        if (name.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            name,
            kind: s.kind || 0,
            file: filePath,
            line: s.selectionRange ? s.selectionRange.startLineNumber : (s.range?.startLineNumber || 1),
            column: s.selectionRange ? s.selectionRange.startColumn : (s.range?.startColumn || 1),
          });
        }
        if (s.children) {
          for (const child of s.children) {
            collectSymbols(child, name);
          }
        }
      }
    }

    for (const symbol of symbols as any[]) {
      collectSymbols(symbol);
    }
  }

  return results;
}

// ═══ Cleanup ══════════════════════════════════════════════
export function disposeLSPFallback(): void {
  if (diagnosticsListener) {
    diagnosticsListener.dispose();
    diagnosticsListener = null;
  }
  fallbackLanguages.clear();
}
