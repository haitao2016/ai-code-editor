// ============================================================
// Diff 查看器 — Split/Inline 双模式 + Git 集成
// ============================================================
import { getMonaco } from '../core/editor';
import { useEditorStore, useFilesStore } from '../core/stores';

type DiffMode = 'split' | 'inline';

let diffPanel: HTMLDivElement | null = null;
let diffEditor: any = null;
let currentMode: DiffMode = 'split';

export function showDiffViewer(
  originalPath?: string,
  modifiedPath?: string,
  originalContent?: string,
  modifiedContent?: string
): void {
  if (diffPanel) {
    diffPanel.classList.toggle('collapsed');
    if (!diffPanel.classList.contains('collapsed')) {
      if (diffEditor && originalContent !== undefined && modifiedContent !== undefined) {
        updateDiffContent(originalContent, modifiedContent, originalPath, modifiedPath);
      }
    }
    return;
  }

  diffPanel = document.createElement('div');
  diffPanel.id = 'diffPanel';
  diffPanel.style.cssText = `
    position:fixed;top:60px;left:50%;transform:translateX(-50%);
    width:90%;max-width:1200px;height:70vh;
    background:var(--bg-primary);border:1px solid var(--border-color);
    border-radius:8px;z-index:1001;display:flex;flex-direction:column;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
  `;

  diffPanel.innerHTML = `
    <div style="padding:8px 14px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">📊 差异对比</span>
        <div style="display:flex;gap:2px;background:var(--bg-secondary);border-radius:4px;padding:2px">
          <button id="diffModeSplit" class="diff-mode-btn active" style="padding:3px 10px;border:none;border-radius:3px;font-size:11px;cursor:pointer">分屏</button>
          <button id="diffModeInline" class="diff-mode-btn" style="padding:3px 10px;border:none;border-radius:3px;font-size:11px;cursor:pointer">内联</button>
        </div>
        <div style="display:flex;align-items:center;gap:4px;font-size:11px">
          <span id="diffOrigLabel" style="color:var(--error)">原始</span>
          <span style="color:var(--text-muted)">→</span>
          <span id="diffModLabel" style="color:var(--success)">修改后</span>
        </div>
      </div>
      <button id="btnDiffClose" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px;padding:0 4px">✕</button>
    </div>
    <div id="diffEditorContainer" style="flex:1;min-height:0"></div>
    <div style="padding:6px 14px;border-top:1px solid var(--border-color);display:flex;gap:8px;justify-content:flex-end;font-size:11px">
      <button id="btnDiffPrev" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-primary);padding:4px 12px;border-radius:4px;cursor:pointer">▲ 上一个更改</button>
      <button id="btnDiffNext" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-primary);padding:4px 12px;border-radius:4px;cursor:pointer">下一个更改 ▼</button>
      <input id="diffSearchInput" type="text" placeholder="在差异中搜索..." style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);padding:4px 8px;border-radius:4px;width:150px;font-size:11px;outline:none">
    </div>
  `;

  document.body.appendChild(diffPanel);

  // Initialize Monaco Diff Editor
  initDiffEditor(originalContent || '', modifiedContent || '', originalPath, modifiedPath);

  // Mode switching
  document.getElementById('diffModeSplit')?.addEventListener('click', () => setDiffMode('split'));
  document.getElementById('diffModeInline')?.addEventListener('click', () => setDiffMode('inline'));

  // Navigation
  document.getElementById('btnDiffPrev')?.addEventListener('click', () => {
    if (diffEditor) {
      monacoNavigateDiff(-1);
    }
  });
  document.getElementById('btnDiffNext')?.addEventListener('click', () => {
    if (diffEditor) {
      monacoNavigateDiff(1);
    }
  });

  // Background close (escape)
  document.addEventListener('keydown', function diffEsc(e) {
    if (e.key === 'Escape') {
      diffPanel?.classList.toggle('collapsed');
      document.removeEventListener('keydown', diffEsc);
    }
  });

  // Close button
  document.getElementById('btnDiffClose')?.addEventListener('click', () => {
    diffPanel?.classList.toggle('collapsed');
  });
}

function initDiffEditor(
  original: string,
  modified: string,
  originalPath?: string,
  modifiedPath?: string
): void {
  const monaco = getMonaco();
  const container = document.getElementById('diffEditorContainer');
  if (!monaco || !container) return;

  const origUri = monaco.Uri.parse(`diff-original://${originalPath || 'original'}`);
  const modUri = monaco.Uri.parse(`diff-modified://${modifiedPath || 'modified'}`);

  // Register models
  let origModel = monaco.editor.getModel(origUri);
  let modModel = monaco.editor.getModel(modUri);

  if (!origModel) {
    origModel = monaco.editor.createModel(original, undefined, origUri);
  } else {
    origModel.setValue(original);
  }

  if (!modModel) {
    modModel = monaco.editor.createModel(modified, undefined, modUri);
  } else {
    modModel.setValue(modified);
  }

  // Dispose old editor
  if (diffEditor) {
    diffEditor.dispose();
  }

  diffEditor = monaco.editor.createDiffEditor(container, {
    theme: 'ai-code-dark',
    renderSideBySide: currentMode === 'split',
    readOnly: true,
    enableSplitViewResizing: true,
    renderIndicators: true,
    ignoreTrimWhitespace: false,
    maxComputationTime: 5000,
    maxFileSize: 50,
    automaticLayout: true,
    fontSize: 13,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    diffWordWrap: 'on',
    padding: { top: 8, bottom: 8 },
  });

  diffEditor.setModel({
    original: origModel,
    modified: modModel,
  });

  // Track changes count
  diffEditor.onDidUpdateDiff(() => {
    const changes = diffEditor.getLineChanges();
    updateDiffStats(changes?.length || 0);
  });

  // Click on diff to scroll to change
  (window as any)._navigateDiff = monacoNavigateDiff;
  (window as any)._diffEditor = diffEditor;
}

function monacoNavigateDiff(direction: number): void {
  if (!diffEditor) return;

  const actions = direction > 0
    ? 'editor.action.diffReview.next'
    : 'editor.action.diffReview.prev';

  diffEditor.getModifiedEditor()?.trigger('keyboard', actions, {});
}

function updateDiffStats(count: number): void {
  const el = document.getElementById('diffStats');
  if (el) {
    el.textContent = `${count} 处更改`;
  }

  // Also update the label area if available
  const modLabel = document.getElementById('diffModLabel');
  if (modLabel && count > 0) {
    modLabel.textContent = `修改后 (${count}处)`;
  }
}

function setDiffMode(mode: DiffMode): void {
  currentMode = mode;

  // Update button active states
  document.querySelectorAll('.diff-mode-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById(mode === 'split' ? 'diffModeSplit' : 'diffModeInline')?.classList.add('active');

  if (diffEditor) {
    diffEditor.updateOptions({
      renderSideBySide: mode === 'split',
    });
  }
}

export function updateDiffContent(
  original: string,
  modified: string,
  originalPath?: string,
  modifiedPath?: string
): void {
  const monaco = getMonaco();
  if (!monaco || !diffEditor) {
    // Re-initialize
    initDiffEditor(original, modified, originalPath, modifiedPath);
    return;
  }

  const model = diffEditor.getModel();
  if (model) {
    model.original.setValue(original);
    model.modified.setValue(modified);
  }
}

// ─── Git Diff ──────────────────────────────────────────────
export function showGitDiffForFile(
  filePath: string, 
  originalContent: string, 
  currentContent: string
): void {
  showDiffViewer(
    `HEAD:${filePath}`,
    filePath,
    originalContent,
    currentContent
  );
}

// ─── Toggle ────────────────────────────────────────────────
export function toggleDiffViewer(): void {
  if (diffPanel) {
    diffPanel.classList.toggle('collapsed');
  } else {
    showDiffViewer();
  }
}

// ─── Active styles for mode buttons ────────────────────────
const styleEl = document.createElement('style');
styleEl.textContent = `
  .diff-mode-btn {
    background: transparent !important;
    color: var(--text-secondary) !important;
  }
  .diff-mode-btn.active {
    background: var(--info) !important;
    color: white !important;
  }
  .diff-mode-btn:hover:not(.active) {
    background: var(--bg-hover) !important;
  }
`;
document.head.appendChild(styleEl);
