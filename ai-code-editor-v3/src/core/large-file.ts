// ============================================================
// Large File Optimization — 分片加载 + 语法关闭 + 虚拟滚动
// ============================================================
import { getEditor } from './editor';
import { bus } from './event-bus';
import { i18n, t } from './i18n';

// ─── Constants ─────────────────────────────────────────────
const LARGE_FILE_THRESHOLD = 500 * 1024; // 500KB
const VERY_LARGE_THRESHOLD = 2 * 1024 * 1024; // 2MB
const CHUNK_SIZE = 100 * 1024; // 100KB per chunk
const MAX_LINES_FOR_SYNTAX = 10000;
const MAX_LINES_FOR_MINIMAP = 5000;
const MAX_LINES_FOR_LSP = 15000;

interface LargeFileState {
  isLarge: boolean;
  isVeryLarge: boolean;
  totalLines: number;
  totalBytes: number;
  syntaxDisabled: boolean;
  minimapDisabled: boolean;
  lspDisabled: boolean;
  partialLoad: boolean;
  loadedChunks: number;
  totalChunks: number;
}

const fileStates: Map<string, LargeFileState> = new Map();

// ─── Detect and configure ──────────────────────────────────
export function detectLargeFile(path: string, content: string): LargeFileState {
  const byteSize = new Blob([content]).size;
  const lineCount = content.split('\n').length;
  const isLarge = byteSize > LARGE_FILE_THRESHOLD || lineCount > MAX_LINES_FOR_SYNTAX;
  const isVeryLarge = byteSize > VERY_LARGE_THRESHOLD || lineCount > MAX_LINES_FOR_SYNTAX * 2;

  const state: LargeFileState = {
    isLarge,
    isVeryLarge,
    totalLines: lineCount,
    totalBytes: byteSize,
    syntaxDisabled: isLarge,
    minimapDisabled: lineCount > MAX_LINES_FOR_MINIMAP,
    lspDisabled: lineCount > MAX_LINES_FOR_LSP,
    partialLoad: isVeryLarge,
    loadedChunks: isVeryLarge ? 0 : 1,
    totalChunks: isVeryLarge ? Math.ceil(byteSize / CHUNK_SIZE) : 1,
  };

  fileStates.set(path, state);

  if (isLarge) {
    bus.emit('toast:show', {
      message: `⚠️ 大文件检测: ${formatSize(byteSize)}, ${lineCount.toLocaleString()} 行 — 已关闭语法高亮和部分特性`,
      type: 'warning',
      duration: 5000,
    });
  }

  if (isVeryLarge) {
    bus.emit('toast:show', {
      message: `🔴 超大文件: ${formatSize(byteSize)} — 使用分片加载，仅显示前 ${CHUNK_SIZE / 1024}KB`,
      type: 'error',
      persistent: true,
    });
  }

  return state;
}

// ─── Apply large file optimizations ───────────────────────
export function applyLargeFileOptimizations(path: string, state: LargeFileState): void {
  const editor = getEditor();
  if (!editor) return;

  const monaco = getMonaco();
  if (!monaco) return;

  // Update editor options
  if (state.syntaxDisabled) {
    editor.updateOptions({
      // Reduce features for performance
      renderWhitespace: 'none',
      renderControlCharacters: false,
      renderIndentGuides: false,
      matchBrackets: 'never',
      autoClosingBrackets: 'never',
      autoClosingQuotes: 'never',
      autoSurround: 'never',
      colorDecorators: false,
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
    });
  }

  if (state.minimapDisabled) {
    editor.updateOptions({ minimap: { enabled: false } });
  }

  if (state.partialLoad) {
    // Load only first chunk
    loadFileChunks(path, 0);
  }
}

// ─── Chunked loading ──────────────────────────────────────
export async function loadFileChunks(path: string, startChunk: number = 0): Promise<string> {
  const state = fileStates.get(path);
  if (!state || !state.partialLoad) return '';

  const { useFilesStore } = await import('./stores');
  const entry = useFilesStore.getState().files.get(path);
  if (!entry) return '';

  const content = entry.content;
  const end = Math.min((startChunk + 1) * CHUNK_SIZE, content.length);
  const chunk = content.slice(0, end);

  state.loadedChunks = startChunk + 1;

  // Update editor with partial content
  const editor = getEditor();
  if (editor) {
    const model = editor.getModel();
    if (model) {
      model.setValue(chunk);
    }
  }

  // Show loading status in status bar
  updateStatusBarLargeFile(path, state);

  return chunk;
}

export async function loadMoreChunks(path: string): Promise<boolean> {
  const state = fileStates.get(path);
  if (!state || !state.partialLoad) return false;

  if (state.loadedChunks >= state.totalChunks) {
    bus.emit('toast:show', {
      message: '✅ 文件已完全加载',
      type: 'success',
      duration: 2000,
    });
    return false;
  }

  if (!confirm(
    `当前仅加载了前 ${state.loadedChunks * CHUNK_SIZE / 1024}KB，\n继续加载可能影响性能。是否继续？`
  )) return false;

  const { useFilesStore } = await import('./stores');
  const entry = useFilesStore.getState().files.get(path);
  if (!entry) return false;

  const content = entry.content;
  const end = Math.min((state.loadedChunks + 1) * CHUNK_SIZE, content.length);
  const chunk = content.slice(0, end);
  state.loadedChunks++;

  const editor = getEditor();
  if (editor) {
    const model = editor.getModel();
    if (model) {
      model.setValue(chunk);
    }
  }

  updateStatusBarLargeFile(path, state);

  if (state.loadedChunks >= state.totalChunks) {
    state.partialLoad = false;
    bus.emit('toast:show', {
      message: '✅ 文件已完全加载，可启用完整功能',
      type: 'success',
      duration: 3000,
    });

    // Ask if user wants to enable full features
    enableFullFeatures(path);
  }

  return true;
}

function enableFullFeatures(path: string): void {
  const state = fileStates.get(path);
  if (!state) return;

  const editor = getEditor();
  if (!editor) return;

  // Re-enable features for fully loaded file
  if (state.syntaxDisabled && state.loadedChunks >= state.totalChunks) {
    state.syntaxDisabled = false;
    editor.updateOptions({
      renderWhitespace: 'selection',
      renderControlCharacters: true,
      renderIndentGuides: true,
      matchBrackets: 'always',
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoSurround: 'always',
      colorDecorators: true,
      glyphMargin: true,
      folding: true,
      lineDecorationsWidth: 10,
    });
  }

  if (state.minimapDisabled && state.totalLines <= MAX_LINES_FOR_MINIMAP) {
    state.minimapDisabled = false;
    editor.updateOptions({ minimap: { enabled: true } });
  }
}

// ─── Status bar updates ────────────────────────────────────
function updateStatusBarLargeFile(path: string, state: LargeFileState): void {
  const statusBar = document.querySelector('.statusbar .left');
  if (!statusBar) return;

  let existing = document.getElementById('largeFileStatus');
  if (!existing) {
    existing = document.createElement('span');
    existing.id = 'largeFileStatus';
    existing.className = 'item';
    existing.style.color = 'var(--warning)';
    statusBar.appendChild(existing);
  }

  const loadedKB = Math.min(state.loadedChunks * CHUNK_SIZE, state.totalBytes) / 1024;
  existing.textContent = state.partialLoad
    ? `⚠ ${loadedKB.toFixed(0)}KB / ${(state.totalBytes / 1024).toFixed(0)}KB (点击加载更多)`
    : `⚠ ${formatSize(state.totalBytes)}`;

  existing.title = i18n.t('common.点击加载更多内容');
  existing.style.cursor = 'pointer';

  existing.onclick = () => {
    if (state.partialLoad) {
      loadMoreChunks(path);
    }
  };
}

// ─── Get file state ────────────────────────────────────────
export function getLargeFileState(path: string): LargeFileState | undefined {
  return fileStates.get(path);
}

// ─── Check if file is large ────────────────────────────────
export function isLargeFile(path: string): boolean {
  return fileStates.get(path)?.isLarge || false;
}

// ─── Format file size ──────────────────────────────────────
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Estimate lines without loading full content ───────────
export function estimateLineCount(content: string): number {
  // Fast line count using indexOf
  let count = 1;
  let pos = content.indexOf('\n');
  while (pos !== -1 && pos < content.length) {
    count++;
    pos = content.indexOf('\n', pos + 1);
  }
  return count;
}
