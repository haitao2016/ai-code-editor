// ============================================================
// LSP Protocol Types — subset of LSP 3.17 spec
// ============================================================

export interface LSPPosition {
  line: number;
  character: number;
}

export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

export interface LSPLocation {
  uri: string;
  range: LSPRange;
}

export interface LSPDiagnostic {
  range: LSPRange;
  severity?: 1 | 2 | 3 | 4; // 1=Error 2=Warning 3=Info 4=Hint
  code?: string | number;
  source?: string;
  message: string;
  relatedInformation?: LSPDiagnosticRelatedInfo[];
}

export interface LSPDiagnosticRelatedInfo {
  location: LSPLocation;
  message: string;
}

export interface LSPTextEdit {
  range: LSPRange;
  newText: string;
}

export interface LSPTextDocumentIdentifier {
  uri: string;
}

export interface LSPVersionedTextDocumentIdentifier extends LSPTextDocumentIdentifier {
  version: number;
}

export interface LSPPositionParams {
  textDocument: LSPTextDocumentIdentifier;
  position: LSPPosition;
}

export interface LSPReferenceParams extends LSPPositionParams {
  context: { includeDeclaration: boolean };
}

export interface LSPCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: 1 | 2; // 1=plain 2=snippet
  textEdit?: LSPTextEdit;
  additionalTextEdits?: LSPTextEdit[];
  commitCharacters?: string[];
  data?: any;
}

export interface LSPCompletionList {
  isIncomplete: boolean;
  items: LSPCompletionItem[];
}

export interface LSPHover {
  contents: LSPMarkupContent | LSPMarkedString | (LSPMarkupContent | LSPMarkedString)[];
  range?: LSPRange;
}

export interface LSPMarkupContent {
  kind: 'markdown' | 'plaintext';
  value: string;
}

export type LSPMarkedString = string | { language: string; value: string };

export interface LSPSignatureHelp {
  signatures: LSPSignatureInfo[];
  activeSignature: number;
  activeParameter: number;
}

export interface LSPSignatureInfo {
  label: string;
  documentation?: string | LSPMarkupContent;
  parameters?: LSPParameterInfo[];
}

export interface LSPParameterInfo {
  label: string | [number, number];
  documentation?: string | LSPMarkupContent;
}

export interface LSPCodeAction {
  title: string;
  kind?: string;
  diagnostics?: LSPDiagnostic[];
  isPreferred?: boolean;
  edit?: LSPWorkspaceEdit;
  command?: LSPCommand;
}

export interface LSPCommand {
  title: string;
  command: string;
  arguments?: any[];
}

export interface LSPWorkspaceEdit {
  changes?: Record<string, LSPTextEdit[]>;
  documentChanges?: any[];
}

export interface LSPDocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: LSPRange;
  selectionRange: LSPRange;
  children?: LSPDocumentSymbol[];
}

export interface LSPInitializeParams {
  processId: number | null;
  rootUri: string | null;
  capabilities: {};
  workspaceFolders?: { uri: string; name: string }[] | null;
}

export interface LSPInitializeResult {
  capabilities: LSPServerCapabilities;
  serverInfo?: { name: string; version?: string };
}

export interface LSPServerCapabilities {
  textDocumentSync?: number | { openClose?: boolean; change?: number; save?: boolean };
  hoverProvider?: boolean;
  completionProvider?: { resolveProvider?: boolean; triggerCharacters?: string[] };
  signatureHelpProvider?: { triggerCharacters?: string[] };
  definitionProvider?: boolean;
  referencesProvider?: boolean;
  documentSymbolProvider?: boolean;
  codeActionProvider?: boolean;
  renameProvider?: boolean;
}

export interface LSPDocumentLink {
  range: LSPRange;
  target?: string;
}

export type DiagnosticSeverity = 1 | 2 | 3 | 4;
export const DiagnosticSeverity = { Error: 1, Warning: 2, Information: 3, Hint: 4 } as const;

export type CompletionItemKind = number;
export type SymbolKind = number;

export interface LSPServerConfig {
  id: string;
  name: string;
  languages: string[];
  command: string;
  args?: string[];
  env?: Record<string, string>;
  initializationOptions?: any;
  rootPattern?: string;
}
