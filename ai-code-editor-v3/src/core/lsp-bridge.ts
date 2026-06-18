// ============================================================
// Monaco-LSP Bridge — connect LSP features to Monaco editor
// ============================================================
import type { LSPManager } from './lsp-manager';
import type { LSPDiagnostic, LSPDocumentSymbol, LSPCodeAction } from './lsp-types';
import { getEditor, getMonaco } from './editor';
import { useFilesStore, useEditorStore, useLinterStore } from './stores';

let lspManager: LSPManager | null = null;
let activeLSPUri: string | null = null;
let activeLanguageId: string | null = null;
let documentVersion = 1;
const diagnosticMarkers = new Map<string, string[]>(); // uri -> monaco model marker IDs

export function setLSPManager(manager: LSPManager): void {
  lspManager = manager;
  setupLSPProviders();
  setupDiagnostics();
}

// ─── Diagnostics Registration ──────────────────────────────
function setupDiagnostics(): void {
  if (!lspManager) return;

  lspManager.onDiagnostics((uri: string, diagnostics: LSPDiagnostic[]) => {
    const monaco = getMonaco();
    if (!monaco) return;

    // Find the model for this URI
    const models = monaco.editor.getModels();
    const model = models.find((m) => m.uri.toString() === uri || m.uri.path === uri);
    if (!model) return;

    // Clear old markers
    const oldIds = diagnosticMarkers.get(uri) || [];
    const editor = getEditor();
    if (!editor) return;
    monaco.editor.removeMarkers(oldIds.filter(Boolean));

    // Set new markers
    const markers = diagnostics.map((d) => ({
      severity: d.severity === 1 ? monaco.MarkerSeverity.Error
        : d.severity === 2 ? monaco.MarkerSeverity.Warning
        : d.severity === 3 ? monaco.MarkerSeverity.Info
        : monaco.MarkerSeverity.Hint,
      message: d.message,
      startLineNumber: (d.range?.start?.line ?? 0) + 1,
      startColumn: (d.range?.start?.character ?? 0) + 1,
      endLineNumber: (d.range?.end?.line ?? 0) + 1,
      endColumn: (d.range?.end?.character ?? 0) + 1,
      source: d.source,
      code: String(d.code || ''),
    }));

    const newIds = monaco.editor.setModelMarkers(model, 'lsp', markers);
    diagnosticMarkers.set(uri, newIds);

    // ═══ Sync diagnostics to Linter Store (P0 fix) ═══════
    syncAllDiagnosticsToLinter(monaco);
  });
}

// Sync all Monaco editor markers (LSP + built-in) to Linter Store
function syncAllDiagnosticsToLinter(monaco: any): void {
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
        source: m.source || 'lsp',
      });
    }
  }

  useLinterStore.getState().setProblems(problems as any);

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

// ─── Provider Registration ─────────────────────────────────
function setupLSPProviders(): void {
  const monaco = getMonaco();
  if (!monaco) return;

  // Hover Provider
  monaco.languages.registerHoverProvider('*', {
    provideHover: async (model, position) => {
      if (!lspManager) return null;
      const langId = model.getLanguageId();
      const client = lspManager.getClient(langId);
      if (!client) return null;

      const uri = model.uri.toString();
      try {
        const result = await client.hover(uri, position.lineNumber - 1, position.column - 1);
        if (!result) return null;

        const contents = Array.isArray(result.contents) ? result.contents : [result.contents];
        const markdownContents = contents.map((c: any) => {
          if (typeof c === 'string') return { value: c };
          if (c.kind === 'markdown') return { value: c.value };
          if (c.value) return c;
          return { value: typeof c === 'string' ? c : JSON.stringify(c) };
        });

        const range = result.range ? new monaco.Range(
          result.range.start.line + 1, result.range.start.character + 1,
          result.range.end.line + 1, result.range.end.character + 1,
        ) : undefined;

        return { contents: markdownContents, range };
      } catch { return null; }
    },
  });

  // Definition Provider
  monaco.languages.registerDefinitionProvider('*', {
    provideDefinition: async (model, position) => {
      if (!lspManager) return null;
      const langId = model.getLanguageId();
      const client = lspManager.getClient(langId);
      if (!client) return null;

      try {
        const result = await client.definition(
          model.uri.toString(), position.lineNumber - 1, position.column - 1,
        );
        if (!result) return null;

        const locations = Array.isArray(result) ? result : [result];
        return locations.map((loc) => ({
          uri: monaco.Uri.parse(loc.uri),
          range: new monaco.Range(
            loc.range.start.line + 1, loc.range.start.character + 1,
            loc.range.end.line + 1, loc.range.end.character + 1,
          ),
        }));
      } catch { return null; }
    },
  });

  // Reference Provider
  monaco.languages.registerReferenceProvider('*', {
    provideReferences: async (model, position, _context) => {
      if (!lspManager) return null;
      const langId = model.getLanguageId();
      const client = lspManager.getClient(langId);
      if (!client) return null;

      try {
        const result = await client.references(
          model.uri.toString(), position.lineNumber - 1, position.column - 1, true,
        );
        if (!result) return null;

        return result.map((loc) => ({
          uri: monaco.Uri.parse(loc.uri),
          range: new monaco.Range(
            loc.range.start.line + 1, loc.range.start.character + 1,
            loc.range.end.line + 1, loc.range.end.character + 1,
          ),
        }));
      } catch { return null; }
    },
  });

  // Rename Provider
  monaco.languages.registerRenameProvider('*', {
    provideRenameEdits: async (model, position, newName) => {
      if (!lspManager) return null;
      const langId = model.getLanguageId();
      const client = lspManager.getClient(langId);
      if (!client) return null;

      try {
        const result = await client.rename(
          model.uri.toString(), position.lineNumber - 1, position.column - 1, newName,
        );
        if (!result?.changes) return null;

        const edits: monaco.languages.WorkspaceEdit = { edits: [] };
        for (const [uri, textEdits] of Object.entries(result.changes)) {
          for (const edit of textEdits) {
            edits.edits!.push({
              resource: monaco.Uri.parse(uri),
              textEdit: {
                range: new monaco.Range(
                  edit.range.start.line + 1, edit.range.start.character + 1,
                  edit.range.end.line + 1, edit.range.end.character + 1,
                ),
                text: edit.newText,
              },
              versionId: undefined,
            });
          }
        }
        return edits;
      } catch { return null; }
    },
  });

  // Signature Help Provider
  monaco.languages.registerSignatureHelpProvider('*', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp: async (model, position) => {
      if (!lspManager) return null;
      const langId = model.getLanguageId();
      const client = lspManager.getClient(langId);
      if (!client) return null;

      try {
        const result = await client.signatureHelp(
          model.uri.toString(), position.lineNumber - 1, position.column - 1,
        );
        if (!result?.signatures?.length) return null;

        return {
          value: {
            signatures: result.signatures.map((s) => ({
              label: s.label,
              documentation: s.documentation
                ? (typeof s.documentation === 'string' ? s.documentation : (s.documentation as any).value || '')
                : '',
              parameters: (s.parameters || []).map((p) => ({
                label: typeof p.label === 'string' ? p.label : String(p.label),
                documentation: p.documentation
                  ? (typeof p.documentation === 'string' ? p.documentation : (p.documentation as any).value || '')
                  : '',
              })),
            })),
            activeSignature: result.activeSignature,
            activeParameter: result.activeParameter,
          },
          dispose: () => {},
        };
      } catch { return null; }
    },
  });

  // Code Action Provider
  monaco.languages.registerCodeActionProvider('*', {
    provideCodeActions: async (model, range, _context) => {
      if (!lspManager) return null;
      const langId = model.getLanguageId();
      const client = lspManager.getClient(langId);
      if (!client) return null;

      try {
        // Collect diagnostics in range
        const markers = monaco.editor.getModelMarkers({ resource: model.uri });
        const rangeDiagnostics = markers
          .filter((m) => range.containsRange(m))
          .map((m) => ({
            range: {
              start: { line: m.startLineNumber - 1, character: m.startColumn - 1 },
              end: { line: m.endLineNumber - 1, character: m.endColumn - 1 },
            },
            severity: m.severity === monaco.MarkerSeverity.Error ? 1 as const
              : m.severity === monaco.MarkerSeverity.Warning ? 2 as const
              : m.severity === monaco.MarkerSeverity.Info ? 3 as const
              : 4 as const,
            message: m.message,
            code: String(m.code || ''),
            source: 'lsp',
          }));

        const result = await client.codeAction(
          model.uri.toString(),
          {
            start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
            end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
          },
          rangeDiagnostics,
        );

        if (!result) return { actions: [], dispose: () => {} };

        return {
          actions: result.map((action) => ({
            title: action.title,
            kind: action.kind,
            isPreferred: action.isPreferred,
            diagnostics: [],
            command: action.command ? {
              id: action.command.command,
              title: action.command.title,
              arguments: action.command.arguments,
            } : undefined,
            edit: action.edit ? {
              edits: Object.entries(action.edit.changes || {}).flatMap(([uri, textEdits]) =>
                textEdits.map((edit) => ({
                  resource: monaco.Uri.parse(uri),
                  textEdit: {
                    range: new monaco.Range(
                      edit.range.start.line + 1, edit.range.start.character + 1,
                      edit.range.end.line + 1, edit.range.end.character + 1,
                    ),
                    text: edit.newText,
                  },
                  versionId: undefined,
                }))
              ),
            } : undefined,
          })),
          dispose: () => {},
        };
      } catch { return { actions: [], dispose: () => {} }; }
    },
  });

  // Document Symbol Provider (overrides built-in)
  monaco.languages.registerDocumentSymbolProvider('*', {
    provideDocumentSymbols: async (model) => {
      if (!lspManager) return null;
      const langId = model.getLanguageId();
      const client = lspManager.getClient(langId);
      if (!client) return null;

      try {
        const result = await client.documentSymbol(model.uri.toString());
        if (!result) return null;

        function convertSymbol(symbol: LSPDocumentSymbol): monaco.languages.DocumentSymbol {
          return {
            name: symbol.name,
            detail: symbol.detail || '',
            kind: symbol.kind as monaco.languages.SymbolKind,
            range: new monaco.Range(
              symbol.range.start.line + 1, symbol.range.start.character + 1,
              symbol.range.end.line + 1, symbol.range.end.character + 1,
            ),
            selectionRange: new monaco.Range(
              symbol.selectionRange.start.line + 1, symbol.selectionRange.start.character + 1,
              symbol.selectionRange.end.line + 1, symbol.selectionRange.end.character + 1,
            ),
            children: (symbol.children || []).map(convertSymbol),
          };
        }

        return result.map(convertSymbol);
      } catch { return null; }
    },
  });

  // Completion Provider
  monaco.languages.registerCompletionItemProvider('*', {
    triggerCharacters: ['.', '(', '"', "'", '/', '@', '<'],
    provideCompletionItems: async (model, position) => {
      if (!lspManager) return null;
      const langId = model.getLanguageId();
      const client = lspManager.getClient(langId);
      if (!client) return null;

      try {
        const result = await client.completion(
          model.uri.toString(), position.lineNumber - 1, position.column - 1,
        );
        if (!result) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(
          position.lineNumber, word.startColumn,
          position.lineNumber, word.endColumn,
        );

        const suggestions = result.items.map((item) => ({
          label: item.label,
          kind: item.kind as monaco.languages.CompletionItemKind,
          detail: item.detail,
          documentation: item.documentation,
          sortText: item.sortText,
          filterText: item.filterText,
          insertText: item.insertText,
          insertTextRules: item.insertTextFormat === 2
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          range,
        }));

        return { suggestions, incomplete: result.isIncomplete };
      } catch {
        return { suggestions: [] };
      }
    },
  });
}

// ─── Document Sync Helpers ──────────────────────────────────
export function notifyLSPSync(languageId: string, uri: string, content: string, isOpen: boolean): void {
  if (!lspManager) return;

  if (isOpen) {
    lspManager.notifyOpen(uri, languageId, content);
    activeLSPUri = uri;
    activeLanguageId = languageId;
    documentVersion = 1;
  }
}

export function notifyLSPChange(uri: string, languageId: string, content: string): void {
  if (!lspManager) return;
  documentVersion++;
  lspManager.notifyChange(uri, languageId, content, documentVersion);
}

export function notifyLSPClose(): void {
  if (!lspManager || !activeLSPUri || !activeLanguageId) return;
  lspManager.notifyClose(activeLSPUri, activeLanguageId);
  activeLSPUri = null;
  activeLanguageId = null;
}

export function getLSPManager(): LSPManager | null { return lspManager; }

// ─── Auto-start LSP for active file ────────────────────────
export async function startLSPForFile(languageId: string, filePath: string, content: string): Promise<void> {
  if (!lspManager) return;
  await lspManager.startForLanguage(languageId);
  const uri = `file:///${filePath.replace(/\\/g, '/')}`;
  notifyLSPSync(languageId, uri, content, true);
}
