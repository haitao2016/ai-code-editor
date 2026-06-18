// ============================================================
// Split View — 多编辑器分屏 (左右/上下)
// ============================================================
import { useEditorStore, useFilesStore } from '../core/stores';
import { openFileTab, getEditor, getEditorContent } from '../core/editor';
import { bus } from '../core/event-bus';

export type SplitDirection = 'horizontal' | 'vertical';
export type SplitOrientation = 'left' | 'right' | 'top' | 'bottom';

interface SplitState {
  active: boolean;
  direction: SplitDirection;
  ratio: number; // 50 = 50%
  secondaryPath: string | null;
}

const state: SplitState = {
  active: false,
  direction: 'horizontal',
  ratio: 50,
  secondaryPath: null,
};

export function isSplitActive(): boolean {
  return state.active;
}

export function getSplitState(): SplitState {
  return { ...state };
}

// ─── Create Split View ────────────────────────────────────
export function createSplitView(
  direction: SplitDirection = 'horizontal',
  filePath?: string,
): void {
  if (state.active) {
    // Already split — update file in secondary
    if (filePath) {
      openFileInSecondary(filePath);
    }
    return;
  }

  state.active = true;
  state.direction = direction;
  state.ratio = 50;

  const editorArea = document.querySelector('.editor-area') as HTMLElement;
  if (!editorArea) return;

  // Remove existing split if any
  const existingSplit = document.getElementById('splitContainer');
  if (existingSplit) existingSplit.remove();

  // Create split container
  const splitContainer = document.createElement('div');
  splitContainer.id = 'splitContainer';
  splitContainer.className = `split-container split-${direction}`;

  // Get current editor area content (breadcrumb + tabs + editor)
  const tabsBar = document.getElementById('tabsBar');
  const editorContainer = document.getElementById('editorContainer');
  const breadcrumbBar = document.getElementById('breadcrumbBar');

  // Panel 1 (primary) — wrap existing editor
  const panel1 = document.createElement('div');
  panel1.className = 'split-panel split-panel-primary';
  panel1.id = 'splitPanel1';
  panel1.style.cssText = direction === 'horizontal'
    ? `flex:0 0 ${state.ratio}%;overflow:hidden;display:flex;flex-direction:column;`
    : `flex:0 0 ${state.ratio}%;overflow:hidden;display:flex;flex-direction:column;`;

  // Move existing elements into panel1
  if (breadcrumbBar) panel1.appendChild(breadcrumbBar);
  if (tabsBar) panel1.appendChild(tabsBar);
  if (editorContainer) panel1.appendChild(editorContainer);

  // Panel 2 (secondary) — new editor
  const panel2 = document.createElement('div');
  panel2.className = 'split-panel split-panel-secondary';
  panel2.id = 'splitPanel2';
  panel2.style.cssText = direction === 'horizontal'
    ? `flex:0 0 ${100 - state.ratio - 1}%;overflow:hidden;display:flex;flex-direction:column;`
    : `flex:0 0 ${100 - state.ratio - 1}%;overflow:hidden;display:flex;flex-direction:column;`;

  // Secondary breadcrumb
  const secBreadcrumb = document.createElement('div');
  secBreadcrumb.className = 'breadcrumb-bar';
  secBreadcrumb.id = 'splitBreadcrumbBar';
  secBreadcrumb.innerHTML = '<span class="breadcrumb-item active">分屏编辑器</span>';
  panel2.appendChild(secBreadcrumb);

  // Secondary tabs
  const secTabs = document.createElement('div');
  secTabs.className = 'tabs-bar';
  secTabs.id = 'splitTabsBar';
  panel2.appendChild(secTabs);

  // Secondary editor container
  const secEditor = document.createElement('div');
  secEditor.className = 'editor-container';
  secEditor.id = 'splitEditorContainer';
  secEditor.innerHTML = `
    <div class="empty-state" id="splitEmptyState">
      <p>选择文件以在分屏中打开</p>
      <div class="split-empty-actions">
        <button id="splitSwitchDoc">📄 切换主编辑器文件</button>
        <button id="splitCloseView">✕ 关闭分屏</button>
      </div>
    </div>
  `;
  panel2.appendChild(secEditor);

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = `split-resize-handle split-resize-${direction}`;
  resizeHandle.id = 'splitResizeHandle';

  // Assemble
  splitContainer.appendChild(panel1);
  splitContainer.appendChild(resizeHandle);
  splitContainer.appendChild(panel2);

  // Replace editor area content
  editorArea.innerHTML = '';
  editorArea.appendChild(splitContainer);

  // Wire resize
  setupSplitResize();

  // Wire secondary empty state actions
  setupSecondaryActions();

  // If filePath provided, open in secondary
  if (filePath) {
    openFileInSecondary(filePath);
  }

  bus.emit('splitview:changed', { active: true, direction });
}

// ─── Close Split View ─────────────────────────────────────
export function closeSplitView(): void {
  if (!state.active) return;

  state.active = false;
  state.secondaryPath = null;

  const editorArea = document.querySelector('.editor-area') as HTMLElement;
  const splitContainer = document.getElementById('splitContainer');
  if (!editorArea || !splitContainer) return;

  // Move elements back to editor area
  const panel1 = document.getElementById('splitPanel1');
  if (panel1) {
    const breadcrumbBar = panel1.querySelector('#breadcrumbBar');
    const tabsBar = panel1.querySelector('#tabsBar');
    const editorContainer = panel1.querySelector('#editorContainer');

    editorArea.innerHTML = '';
    if (breadcrumbBar) editorArea.appendChild(breadcrumbBar);
    if (tabsBar) editorArea.appendChild(tabsBar);
    if (editorContainer) editorArea.appendChild(editorContainer);
  }

  bus.emit('splitview:changed', { active: false, direction: state.direction });
}

// ─── Toggle Split View ────────────────────────────────────
export function toggleSplitView(direction: SplitDirection = 'horizontal'): void {
  if (state.active) {
    closeSplitView();
  } else {
    createSplitView(direction);
  }
}

// ─── Open file in secondary pane ──────────────────────────
export function openFileInSecondary(path: string): void {
  if (!state.active) {
    createSplitView(state.direction || 'horizontal', path);
    return;
  }

  state.secondaryPath = path;
  const entry = useFilesStore.getState().files.get(path);
  if (!entry) return;

  // Hide empty state
  const emptyState = document.getElementById('splitEmptyState');
  if (emptyState) emptyState.style.display = 'none';

  // Show secondary editor
  const secContainer = document.getElementById('splitEditorContainer');
  if (secContainer) {
    secContainer.innerHTML = '<div id="splitMonacoEditor" style="width:100%;height:100%;"></div>';
  }

  // Initialize Monaco in secondary
  initSplitMonaco(path, entry.content);

  // Update tabs
  renderSplitTabs();
}

// ─── Initialize Monaco in secondary panel ─────────────────
function initSplitMonaco(path: string, content: string): void {
  const container = document.getElementById('splitMonacoEditor');
  if (!container) return;

  // Use existing Monaco instance or create new
  const monaco = window.monaco;
  if (!monaco) {
    // Monaco not yet loaded, wait
    setTimeout(() => initSplitMonaco(path, content), 200);
    return;
  }

  // Create new model for split view
  const uri = monaco.Uri.parse(`split://${path}`);
  let model = monaco.editor.getModel(uri);
  if (!model) {
    model = monaco.editor.createModel(content, undefined, uri);
  }

  // Remove existing editor if any
  const existingEditor = (container as any).__monacoEditor;
  if (existingEditor) existingEditor.dispose();

  const editor = monaco.editor.create(container, {
    model,
    theme: 'vs-dark',
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    minimap: { enabled: true },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    tabSize: 4,
  });

  (container as any).__monacoEditor = editor;
  window.__splitMonacoEditor = editor;

  // Listen for content changes
  editor.onDidChangeModelContent(() => {
    // Mark as dirty if needed
  });
}

// ─── Render split tabs ────────────────────────────────────
function renderSplitTabs(): void {
  const bar = document.getElementById('splitTabsBar');
  if (!bar || !state.secondaryPath) return;

  const name = state.secondaryPath.split('/').pop() || state.secondaryPath;
  bar.innerHTML = `
    <div class="tab active" data-split-tab="${escapeHtml(state.secondaryPath)}">
      <span class="tab-icon">📄</span>
      <span class="tab-label">${escapeHtml(name)}</span>
      <span class="tab-close" data-split-close="${escapeHtml(state.secondaryPath)}">×</span>
    </div>
  `;

  bar.onclick = (e) => {
    const closeBtn = (e.target as HTMLElement).closest('[data-split-close]') as HTMLElement;
    if (closeBtn) {
      e.stopPropagation();
      closeSecondaryFile();
    }
  };
}

function closeSecondaryFile(): void {
  state.secondaryPath = null;
  const bar = document.getElementById('splitTabsBar');
  if (bar) bar.innerHTML = '';

  const secContainer = document.getElementById('splitEditorContainer');
  if (secContainer) {
    const editor = (secContainer as any).__monacoEditor;
    if (editor) editor.dispose();
    secContainer.innerHTML = `
      <div class="empty-state" id="splitEmptyState">
        <p>选择文件以在分屏中打开</p>
        <div class="split-empty-actions">
          <button id="splitSwitchDoc">📄 切换主编辑器文件</button>
          <button id="splitCloseView">✕ 关闭分屏</button>
        </div>
      </div>
    `;
    setupSecondaryActions();
  }
}

// ─── Split resize ─────────────────────────────────────────
function setupSplitResize(): void {
  const handle = document.getElementById('splitResizeHandle');
  const panel1 = document.getElementById('splitPanel1');
  const panel2 = document.getElementById('splitPanel2');
  if (!handle || !panel1 || !panel2) return;

  let startPos = 0;
  let startRatio = state.ratio;

  handle.addEventListener('mousedown', (e) => {
    startPos = state.direction === 'horizontal' ? e.clientX : e.clientY;
    startRatio = state.ratio;
    handle.classList.add('active');
    document.body.style.cursor = state.direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const container = document.getElementById('splitContainer');
      if (!container) return;

      const containerSize = state.direction === 'horizontal'
        ? container.getBoundingClientRect().width
        : container.getBoundingClientRect().height;
      const delta = state.direction === 'horizontal' ? ev.clientX - startPos : ev.clientY - startPos;
      const ratioPx = (delta / containerSize) * 100;
      state.ratio = Math.max(20, Math.min(80, startRatio + ratioPx));

      panel1.style.flex = `0 0 ${state.ratio}%`;
      panel2.style.flex = `0 0 ${100 - state.ratio - 1}%`;

      // Trigger layout update for Monaco
      const editor = getEditor();
      if (editor) editor.layout();
      const splitEditor = (document.getElementById('splitMonacoEditor') as any)?.__monacoEditor;
      if (splitEditor) splitEditor.layout();
    };

    const onUp = () => {
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ─── Secondary empty state actions ─────────────────────────
function setupSecondaryActions(): void {
  document.getElementById('splitSwitchDoc')?.addEventListener('click', () => {
    // Copy active file from primary to secondary
    const activeFile = useEditorStore.getState().activeFile;
    if (activeFile) {
      openFileInSecondary(activeFile);
    }
  });

  document.getElementById('splitCloseView')?.addEventListener('click', () => {
    closeSplitView();
  });
}

// ─── Utility ──────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Get secondary editor content ─────────────────────────
export function getSecondaryEditorContent(): string {
  const container = document.getElementById('splitEditorContainer');
  if (!container) return '';
  const editor = (container as any).__monacoEditor;
  if (editor) return editor.getValue();
  return '';
}

// ─── Save secondary editor ────────────────────────────────
export async function saveSecondaryEditor(): Promise<void> {
  if (!state.secondaryPath) return;
  const content = getSecondaryEditorContent();
  if (!content && content !== '') return;

  const entry = useFilesStore.getState().files.get(state.secondaryPath);
  if (entry) {
    const { saveFile } = await import('../core/files');
    await saveFile({
      path: state.secondaryPath,
      content,
      language: entry.language,
      updatedAt: Date.now(),
    });
    useFilesStore.getState().setFile({
      path: state.secondaryPath,
      content,
      language: entry.language,
      updatedAt: Date.now(),
    });
  }
}
