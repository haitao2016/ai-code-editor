// ============================================================
// 实时预览 + Linter — TypeScript 版本
// ============================================================
import { useFilesStore, useLinterStore, useEditorStore } from '../core/stores';
import { getEditor } from '../core/editor';
import { bus } from '../core/event-bus';
import type { LinterProblem } from '../types';
import { i18n, t } from '../core/i18n';

declare global {
  interface Window {
    _refreshPreview?: () => void;
    _closePreview?: () => void;
    _gotoProblem?: (line: number, column: number) => void;
  }
}

let previewFrame: HTMLIFrameElement | null = null;

export function togglePreviewPanel(): void {
  let panel = document.getElementById('previewPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'previewPanel';
    panel.style.cssText = 'position:fixed;top:36px;right:0;bottom:24px;width:50%;background:#fff;border-left:1px solid var(--border-color);z-index:50;display:flex;flex-direction:column;';
    panel.innerHTML = `
      <div style="padding:6px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-muted);">
        <span>🔍 实时预览</span>
        <div style="display:flex;gap:4px;">
          <button onclick="window._refreshPreview?.()" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-secondary);padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;">🔄 刷新</button>
          <button onclick="window._closePreview?.()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;">✕</button>
        </div>
      </div>
      <div id="previewContent" style="flex:1;"></div>
    `;
    document.body.appendChild(panel);
    refreshPreview();
  } else {
    panel.remove();
    previewFrame = null;
  }
  window._refreshPreview = refreshPreview;
  window._closePreview = togglePreviewPanel;
}

export function refreshPreview(): void {
  const container = document.getElementById('previewContent');
  if (!container) return;

  const files = useFilesStore.getState().files;
  const htmlFile = files.get('index.html');
  const cssFile = files.get('style.css');
  const jsFile = files.get('main.js');

  let html = htmlFile?.content || '<h1>No index.html</h1>';
  if (cssFile) html = html.replace('</head>', `<style>${cssFile.content}</style></head>`);
  if (jsFile) html = html.replace('</body>', `<script>${jsFile.content}</script></body>`);

  if (previewFrame) {
    previewFrame.srcdoc = html;
  } else {
    previewFrame = document.createElement('iframe');
    previewFrame.style.cssText = 'width:100%;height:100%;border:none;';
    previewFrame.srcdoc = html;
    container.innerHTML = '';
    container.appendChild(previewFrame);
  }
}

// ─── Linter ────────────────────────────────────────────────
export function runLinter(filePath?: string): void {
  const store = useEditorStore.getState();
  const path = filePath || store.activeFile;
  if (!path) return;

  const files = useFilesStore.getState().files;
  const entry = files.get(path);
  if (!entry) return;

  const problems: LinterProblem[] = [];
  const lines = entry.content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Line too long
    if (line.length > 120) {
      problems.push({ file: path, line: lineNum, column: 120, message: `Line too long (${line.length} > 120)`, severity: 'warning', ruleId: 'max-len' });
    }

    // Missing semicolons (JS/TS)
    if (['javascript', 'typescript'].includes(entry.language)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') &&
          !trimmed.startsWith('import') && !trimmed.startsWith('export') &&
          !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(';') &&
          !trimmed.endsWith(':') && !trimmed.endsWith(',') && !trimmed.endsWith('(') &&
          !trimmed.startsWith('if') && !trimmed.startsWith('else') &&
          !trimmed.startsWith('for') && !trimmed.startsWith('while') &&
          !trimmed.startsWith('function')) {
        problems.push({ file: path, line: lineNum, column: trimmed.length, message: 'Missing semicolon', severity: 'warning', ruleId: 'semi' });
      }

      // console.log in production
      if (trimmed.includes('console.log')) {
        problems.push({ file: path, line: lineNum, column: trimmed.indexOf('console.log') + 1, message: 'Unexpected console statement', severity: 'warning', ruleId: 'no-console' });
      }

      // var usage
      if (trimmed.match(/^var\s+/)) {
        problems.push({ file: path, line: lineNum, column: 1, message: 'Use const or let instead of var', severity: 'warning', ruleId: 'no-var' });
      }
    }
  });

  useLinterStore.getState().setProblems(problems);
  updateStatusBar(problems);
}

function updateStatusBar(problems: LinterProblem[]): void {
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.filter((p) => p.severity === 'warning').length;
  const el = document.getElementById('statusErrors');
  if (el) {
    if (errors + warnings === 0) {
      el.textContent = i18n.t('problems.zero');
    } else {
      el.textContent = `⚠ ${errors} 错误 ${warnings} 警告`;
    }
    el.style.cursor = 'pointer';
    el.title = i18n.t('preview.点击查看问题列表');
  }
}

export function toggleProblemPanel(): void {
  const problems = useLinterStore.getState().problems;
  if (problems.length === 0) return;

  let panel = document.getElementById('problemPanel');
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'problemPanel';
  Object.assign(panel.style, {
    position: 'fixed', bottom: '24px', left: '304px', right: '0', height: '200px',
    background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)',
    zIndex: '60', overflow: 'auto', display: 'flex', flexDirection: 'column',
  });
  panel.innerHTML = `
    <div style="padding:6px 12px;background:var(--bg-primary);border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-muted);">
      <span>📋 问题 (${problems.length})</span>
      <button onclick="document.getElementById('problemPanel')?.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:14px;">✕</button>
    </div>
    <div style="flex:1;overflow:auto;padding:4px 8px;">
      ${problems.map((p) => `
        <div style="padding:4px 8px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--text-secondary);" onclick="window._gotoProblem?.(${p.line},${p.column})">
          <span style="color:${p.severity === 'error' ? 'var(--error)' : 'var(--warning)'};">${p.severity === 'error' ? '✕' : '⚠'}</span>
          <span style="flex:1;">${p.message}</span>
          <span style="color:var(--text-muted);font-size:10px;">${p.file}:${p.line}:${p.column}</span>
        </div>
      `).join('')}
    </div>
  `;
  document.body.appendChild(panel);

  window._gotoProblem = (line: number, column: number) => {
    const editor = getEditor();
    if (editor) {
      editor.revealLine(line);
      editor.setPosition({ lineNumber: line, column });
      editor.focus();
    }
  };
}
