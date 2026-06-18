// ============================================================
// Minimap Enhancer �?搜索结果/错误/变更标记
// ============================================================
import { getEditor, getMonaco } from './editor';

interface MinimapMarker {
  line: number;
  type: 'search' | 'error' | 'warning' | 'info' | 'change-added' | 'change-modified' | 'change-deleted';
  message?: string;
}

let searchDecorations: string[] = [];
let errorDecorations: string[] = [];
let changeDecorations: string[] = [];

const searchDecorationType: any = null;
const errorDecorationType: any = null;
const changeDecorationTypes: Record<string, any> = {};

let decorationTypesInitialized = false;

// ─── Initialize decoration types ───────────────────────────
function initDecorationTypes(): void {
  if (decorationTypesInitialized) return;

  const monaco = getMonaco();
  if (!monaco) return;

  // Search result marker (orange)
  
    ? null
    : monaco.editor.createDecorationsCollection
      ? null
      : null;

  decorationTypesInitialized = true;
}

// ─── Get minimap decoration options ────────────────────────
function getMinimapDecorationOptions(type: string, line: number): any {
  const monaco = getMonaco();
  if (!monaco) return null;

  const colors: Record<string, string> = {
    search: 'rgba(249, 226, 175, 0.6)', // warning/yellow
    error: 'rgba(243, 139, 168, 0.8)',   // red
    warning: 'rgba(249, 226, 175, 0.6)', // yellow
    info: 'rgba(137, 180, 250, 0.5)',     // blue
    'change-added': 'rgba(166, 227, 161, 0.7)',    // green
    'change-modified': 'rgba(249, 226, 175, 0.6)', // yellow
    'change-deleted': 'rgba(243, 139, 168, 0.7)',  // red
  };

  return {
    range: new monaco.Range(line, 1, line, 1),
    options: {
      isWholeLine: true,
      minimap: {
        color: colors[type] || colors.search,
        position: 1, // 1 = minimap (left in minimap)
      },
      // Show full decoration only on the line
      className: `minimap-marker-${type}`,
      glyphMarginClassName: type.startsWith('change') ? undefined : `glyph-${type}`,
    },
  };
}

// ─── Apply search markers on minimap ──────────────────────
export function setMinimapSearchMarkers(lines: number[]): void {
  const editor = getEditor();
  if (!editor) return;
  const monaco = getMonaco();
  if (!monaco) return;

  const monaco = getMonaco();
  if (!monaco) return;

  // Remove existing search decorations
  if (searchDecorations.length > 0) {
    editor.deltaDecorations(searchDecorations, []);
    searchDecorations = [];
  }

  if (lines.length === 0) return;

  // Limit to prevent performance issues
  const cappedLines = lines.slice(0, 200);

  const decorations = cappedLines.map((line) =>
    getMinimapDecorationOptions('search', line),
  ).filter(Boolean);

  if (decorations.length > 0) {
    searchDecorations = editor.deltaDecorations([], decorations);
  }
}

// ─── Apply error/warning markers on minimap ────────────────
export function setMinimapErrorMarkers(
  errors: { line: number; severity: 'error' | 'warning' | 'info'; message: string }[],
): void {
  const editor = getEditor();
  if (!editor) return;

  // Remove existing
  if (errorDecorations.length > 0) {
    editor.deltaDecorations(errorDecorations, []);
    errorDecorations = [];
  }

  if (errors.length === 0) return;

  const decorations = errors
    .slice(0, 500)
    .map((e) => getMinimapDecorationOptions(e.severity, e.line))
    .filter(Boolean);

  if (decorations.length > 0) {
    errorDecorations = editor.deltaDecorations([], decorations);
  }
}

// ─── Apply git change markers on minimap ───────────────────
export function setMinimapChangeMarkers(
  changes: { line: number; type: 'added' | 'modified' | 'deleted' }[],
): void {
  const editor = getEditor();
  if (!editor) return;

  // Remove existing
  if (changeDecorations.length > 0) {
    editor.deltaDecorations(changeDecorations, []);
    changeDecorations = [];
  }

  if (changes.length === 0) return;

  const decorations = changes
    .slice(0, 500)
    .map((c) => getMinimapDecorationOptions(`change-${c.type}`, c.line))
    .filter(Boolean);

  if (decorations.length > 0) {
    changeDecorations = editor.deltaDecorations([], decorations);
  }
}

// ─── Clear all minimap decorations ─────────────────────────
export function clearMinimapDecorations(): void {
  const editor = getEditor();
  if (!editor) return;

  const allDecorations = [
    ...searchDecorations,
    ...errorDecorations,
    ...changeDecorations,
  ];

  if (allDecorations.length > 0) {
    editor.deltaDecorations(allDecorations, []);
  }

  searchDecorations = [];
  errorDecorations = [];
  changeDecorations = [];
}

// ─── Show minimap tooltip on hover ─────────────────────────
export function enableMinimapTooltips(): void {
  const editor = getEditor();
  if (!editor) return;

  // Monaco supports mouse events on the minimap through editor.onMouseMove
  editor.onMouseMove((e: any) => {
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_MINIMAP) {
      // Could show tooltip with more info
      // For now, this is a placeholder for future enhancement
    }
  });
}

// Need monaco reference for MouseTargetType
const monacoRef = getMonaco();
