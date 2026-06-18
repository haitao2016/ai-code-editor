// ============================================================
// Debug Panel UI — Toolbar, Call Stack, Variables, Watch, Console
// ============================================================
import { DAPSession } from '../core/dap-session';
import { bus } from '../core/event-bus';
import { getEditor, getMonaco } from '../core/editor';
import { useEditorStore, useFilesStore } from '../core/stores';
import type { DebugConfig, DAPStackFrame, DAPScope, DAPVariable, DAPStoppedEvent } from '../core/dap-types';

let activeSession: DAPSession | null = null;
let sessionCounter = 0;
let breakpointDecorations: string[] = [];
let stoppedLineDecoration: string | null = null;
let panelContainer: HTMLElement | null = null;
let currentStackFrame: DAPStackFrame | null = null;

export function getActiveSession(): DAPSession | null { return activeSession; }

// ─── Start Debug Session ───────────────────────────────────
export async function startDebugSession(config: DebugConfig, electronAPI?: any): Promise<void> {
  if (activeSession) {
    await activeSession.stop();
    activeSession = null;
  }

  sessionCounter++;
  const session = new DAPSession(config, electronAPI);
  activeSession = session;

  // Wire callbacks
  session.onStateChange = (state) => {
    updateDebugToolbar(state);
    if (state === 'stopped') showDebugPanel();
    if (state === 'terminated') hideDebugPanel();
  };

  session.onStopped = async (event: DAPStoppedEvent, threadId?: number) => {
    await session.refreshStackFrames();
    if (session.stackFrames.length > 0) {
      currentStackFrame = session.stackFrames[0];
      highlightStoppedLine(currentStackFrame);
    }
    renderCallStack(session);
    renderVariables(session);
    updateDebugToolbar('stopped');
  };

  session.onOutput = (output: string, category: string) => {
    appendDebugConsole(output, category);
  };

  session.onBreakpointUpdate = () => {
    refreshBreakpointGlyphs();
  };

  // Subscribe to EventBus debug actions
  bus.on('debug:continue', () => session.continue());
  bus.on('debug:step-over', () => session.stepOver());
  bus.on('debug:step-into', () => session.stepInto());
  bus.on('debug:step-out', () => session.stepOut());
  bus.on('debug:restart', () => session.restart());
  bus.on('debug:stop', () => stopDebugSession());

  try {
    await session.start();
  } catch (err: any) {
    appendDebugConsole(`Start error: ${err.message}`, 'stderr');
  }
}

export async function stopDebugSession(): Promise<void> {
  if (activeSession) {
    await activeSession.stop();
    activeSession = null;
  }
  clearStoppedLine();
  clearBreakpointGlyphs();
  hideDebugPanel();
  currentStackFrame = null;
}

// ─── Debug Toolbar ──────────────────────────────────────────
function ensureToolbar(): HTMLElement {
  let toolbar = document.getElementById('debugToolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'debugToolbar';
    toolbar.style.cssText = 'display:none;position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:100;background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:4px 8px;display:flex;gap:4px;align-items:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(toolbar);
  }
  return toolbar;
}

function updateDebugToolbar(state: string): void {
  const toolbar = ensureToolbar();

  if (state === 'terminated' || state === 'initial') {
    toolbar.style.display = 'none';
    return;
  }

  toolbar.style.display = 'flex';
  const isStopped = state === 'stopped';

  toolbar.innerHTML = `
    <button onclick="window._debugContinue()" ${!isStopped ? 'disabled' : ''} style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-btn);color:var(--text);cursor:${isStopped ? 'pointer' : 'not-allowed'};font-size:13px;" title="继续 (F5)">▶ 继续</button>
    <button onclick="window._debugStepOver()" ${!isStopped ? 'disabled' : ''} style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-btn);color:var(--text);cursor:${isStopped ? 'pointer' : 'not-allowed'};font-size:13px;" title="单步跳过 (F10)">↷ 跳过</button>
    <button onclick="window._debugStepInto()" ${!isStopped ? 'disabled' : ''} style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-btn);color:var(--text);cursor:${isStopped ? 'pointer' : 'not-allowed'};font-size:13px;" title="单步进入 (F11)">↓ 进入</button>
    <button onclick="window._debugStepOut()" ${!isStopped ? 'disabled' : ''} style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-btn);color:var(--text);cursor:${isStopped ? 'pointer' : 'not-allowed'};font-size:13px;" title="单步跳出 (Shift+F11)">↑ 跳出</button>
    <span style="width:1px;height:20px;background:var(--border);margin:0 4px;"></span>
    <button onclick="window._debugRestart()" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-btn);color:var(--text);cursor:pointer;font-size:13px;" title=i18n.t('debug.重启')>↺</button>
    <button onclick="window._debugStop()" style="padding:4px 8px;border:1px solid #e24b4a;border-radius:4px;background:transparent;color:#e24b4a;cursor:pointer;font-size:13px;" title="停止 (Shift+F5)">■ 停止</button>
  `;

  // Register global handlers (delegate to EventBus for HTML onclick compatibility)
  window._debugContinue = () => bus.emit('debug:continue');
  window._debugStepOver = () => bus.emit('debug:step-over');
  window._debugStepInto = () => bus.emit('debug:step-into');
  window._debugStepOut = () => bus.emit('debug:step-out');
  window._debugRestart = () => bus.emit('debug:restart');
  window._debugStop = () => bus.emit('debug:stop');
}

// ─── Debug Panel ─────────────────────────────────────────────
function ensureDebugPanel(): HTMLElement {
  let panel = document.getElementById('debugPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'debugPanel';
    panel.style.cssText = 'display:none;position:fixed;bottom:0;left:0;right:0;height:220px;background:var(--bg-panel);border-top:2px solid var(--border);z-index:50;display:flex;flex-direction:column;';
    document.body.appendChild(panel);
  }
  panel.style.display = 'flex';
  return panel;
}

function showDebugPanel(): void {
  const panel = ensureDebugPanel();
  panel.innerHTML = `
    <div style="display:flex;border-bottom:1px solid var(--border);background:var(--bg-sidebar);">
      <div class="debug-tab active" onclick="window._switchDebugTab('variables')" id="debugTabVars" style="padding:6px 12px;cursor:pointer;font-size:12px;border-right:1px solid var(--border);background:var(--bg-panel);">变量</div>
      <div class="debug-tab" onclick="window._switchDebugTab('watch')" id="debugTabWatch" style="padding:6px 12px;cursor:pointer;font-size:12px;border-right:1px solid var(--border);">监视</div>
      <div class="debug-tab" onclick="window._switchDebugTab('callstack')" id="debugTabCallStack" style="padding:6px 12px;cursor:pointer;font-size:12px;border-right:1px solid var(--border);">调用堆栈</div>
      <div class="debug-tab" onclick="window._switchDebugTab('console')" id="debugTabConsole" style="padding:6px 12px;cursor:pointer;font-size:12px;">调试控制台</div>
      <div style="flex:1;"></div>
      <div onclick="window._debugStop()" style="padding:6px 12px;cursor:pointer;font-size:12px;color:#e24b4a;" title=i18n.t('debug.停止')>✕</div>
    </div>
    <div id="debugPanelContent" style="flex:1;overflow-y:auto;padding:8px;font-family:monospace;font-size:12px;">
      <div id="debugVarContent"></div>
      <div id="debugWatchContent" style="display:none;"></div>
      <div id="debugCallStackContent" style="display:none;"></div>
      <div id="debugConsoleContent" style="display:none;"></div>
    </div>
  `;

  panelContainer = panel;
  window._switchDebugTab = switchDebugTab;
  switchDebugTab('variables');
}

function hideDebugPanel(): void {
  const panel = document.getElementById('debugPanel');
  if (panel) panel.style.display = 'none';
  panelContainer = null;

  // Also hide toolbar
  const toolbar = document.getElementById('debugToolbar');
  if (toolbar) toolbar.style.display = 'none';
}

function switchDebugTab(tab: string): void {
  document.querySelectorAll('.debug-tab').forEach((t) => (t as HTMLElement).style.background = 'var(--bg-sidebar)');
  const activeTab = document.getElementById(`debugTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (activeTab) (activeTab as HTMLElement).style.background = 'var(--bg-panel)';

  const varContent = document.getElementById('debugVarContent');
  const watchContent = document.getElementById('debugWatchContent');
  const callStackContent = document.getElementById('debugCallStackContent');
  const consoleContent = document.getElementById('debugConsoleContent');

  if (varContent) varContent.style.display = tab === 'variables' ? 'block' : 'none';
  if (watchContent) watchContent.style.display = tab === 'watch' ? 'block' : 'none';
  if (callStackContent) callStackContent.style.display = tab === 'callstack' ? 'block' : 'none';
  if (consoleContent) consoleContent.style.display = tab === 'console' ? 'block' : 'none';

  if (tab === 'watch') renderWatchPanel();
}

// ─── Call Stack ──────────────────────────────────────────────
function renderCallStack(session: DAPSession): void {
  const el = document.getElementById('debugCallStackContent');
  if (!el) return;

  const frames = session.stackFrames;
  el.innerHTML = frames.length === 0
    ? '<div style="color:var(--text-muted);padding:4px;">无调用堆栈</div>'
    : frames.map((f, i) => `
      <div onclick="window._selectStackFrame(${f.id})" style="padding:4px 8px;cursor:pointer;border-radius:4px;${i === 0 ? 'background:var(--accent-bg);' : ''}hover:background:var(--hover-bg);" data-frame-id="${f.id}">
        <span style="color:var(--text-muted);">${f.id}</span>
        <span style="margin-left:8px;">${escapeHtml(f.name)}</span>
        <span style="color:var(--text-muted);float:right;font-size:11px;">${f.source?.name || f.source?.path?.split('/').pop() || ''}:${f.line}</span>
      </div>
    `).join('');

  window._selectStackFrame = (frameId: number) => {
    const frame = session.stackFrames.find((f) => f.id === frameId);
    if (frame) {
      currentStackFrame = frame;
      renderVariables(session);
      highlightStoppedLine(frame);

      // Highlight selected frame
      el.querySelectorAll('[data-frame-id]').forEach((d) => {
        (d as HTMLElement).style.background = '';
      });
      const selected = el.querySelector(`[data-frame-id="${frameId}"]`);
      if (selected) (selected as HTMLElement).style.background = 'var(--accent-bg)';
    }
  };
}

// ─── Variables ───────────────────────────────────────────────
async function renderVariables(session: DAPSession): Promise<void> {
  const el = document.getElementById('debugVarContent');
  if (!el) return;

  el.innerHTML = '<div style="color:var(--text-muted);padding:4px;">加载变量...</div>';

  const frame = currentStackFrame;
  if (!frame) {
    el.innerHTML = '<div style="color:var(--text-muted);padding:4px;">无框架（调试未暂停）</div>';
    return;
  }

  try {
    const scopes = await session.refreshScopes(frame.id);
    let html = '';

    for (const scope of scopes) {
      html += `<div style="font-weight:500;padding:4px 0;color:var(--accent);">${scope.name}</div>`;
      const vars = await session.refreshVariables(scope.variablesReference, scope.name);
      for (const v of vars) {
        const hasChildren = v.variablesReference > 0;
        html += `<div style="padding:2px 0 2px 12px;${hasChildren ? 'cursor:pointer;' : ''}" ${
          hasChildren ? `onclick="window._expandVar(${v.variablesReference},'${escapeHtml(v.name)}')"` : ''
        }>
          <span style="color:#9cdcfe;">${escapeHtml(v.name)}</span>
          <span style="color:var(--text-muted);margin:0 4px;">${v.type ? ': ' + v.type : ''}</span>
          <span style="color:#ce9178;">= ${escapeHtml(v.value || 'undefined')}</span>
        </div>`;
      }
    }

    el.innerHTML = html;
  } catch {
    el.innerHTML = '<div style="color:var(--text-muted);padding:4px;">无法加载变量</div>';
  }

  window._expandVar = async (ref: number, name: string) => {
    const vars = await session.refreshVariables(ref, name);
    let subHtml = '';
    for (const v of vars) {
      const hasChildren = v.variablesReference > 0;
      subHtml += `<div style="padding:2px 0 2px 24px;">
        <span style="color:#9cdcfe;">${escapeHtml(v.name)}</span>
        <span style="color:var(--text-muted);margin:0 4px;">${v.type ? ': ' + v.type : ''}</span>
        <span style="color:#ce9178;">= ${escapeHtml(v.value || 'undefined')}</span>
      </div>`;
    }
    if (el) el.innerHTML += subHtml;
  };
}

// ─── Watch Expressions ───────────────────────────────────────
const watchExpressions: string[] = [];

function renderWatchPanel(): void {
  const el = document.getElementById('debugWatchContent');
  if (!el) return;

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <input id="watchInput" placeholder="添加监视表达式..." style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text);font-size:12px;" onkeydown="if(event.key==='Enter')window._addWatch()">
      <button onclick="window._addWatch()" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-btn);color:var(--text);cursor:pointer;font-size:12px;">+</button>
    </div>
    <div id="watchList">
      ${watchExpressions.map((expr, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;border-bottom:1px solid var(--border);">
          <span style="color:var(--accent);">${escapeHtml(expr)}</span>
          <span id="watchVal${i}" style="color:var(--text-muted);">-</span>
          <span onclick="window._removeWatch(${i})" style="cursor:pointer;color:var(--text-muted);margin-left:8px;">✕</span>
        </div>
      `).join('')}
    </div>
  `;

  window._addWatch = () => {
    const input = document.getElementById('watchInput') as HTMLInputElement;
    if (!input?.value.trim()) return;
    watchExpressions.push(input.value.trim());
    input.value = '';
    renderWatchPanel();
    evaluateAllWatch();
  };

  window._removeWatch = (i: number) => {
    watchExpressions.splice(i, 1);
    renderWatchPanel();
  };

  // Evaluate existing expressions
  evaluateAllWatch();
}

async function evaluateAllWatch(): Promise<void> {
  if (!activeSession) return;
  for (let i = 0; i < watchExpressions.length; i++) {
    const result = await activeSession.evaluate(watchExpressions[i], undefined, 'watch');
    const valEl = document.getElementById(`watchVal${i}`);
    if (valEl) {
      valEl.textContent = result ? result.result : 'eval error';
      valEl.style.color = result ? '#ce9178' : 'var(--text-muted)';
    }
  }
}

// ─── Debug Console ──────────────────────────────────────────
function appendDebugConsole(text: string, category: string): void {
  const el = document.getElementById('debugConsoleContent');
  if (!el) return;

  const color = category === 'stderr' ? '#e24b4a' : category === 'stdout' ? '#cdd6f4' : 'var(--text-muted)';
  const line = document.createElement('div');
  line.style.cssText = `color:${color};white-space:pre-wrap;word-break:break-all;font-family:monospace;font-size:12px;padding:1px 0;`;
  line.textContent = text;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// ─── Breakpoint Glyphs ──────────────────────────────────────
export function toggleBreakpointAtCursor(): void {
  const editor = getEditor();
  if (!editor || !activeSession) return;

  const pos = editor.getPosition();
  if (!pos) return;

  const activeFile = useEditorStore.getState().activeFile;
  if (!activeFile) return;

  activeSession.toggleBreakpoint(activeFile, pos.lineNumber);
  refreshBreakpointGlyphs();
}

export function refreshBreakpointGlyphs(): void {
  const editor = getEditor();
  const monaco = getMonaco();
  if (!editor || !monaco || !activeSession) return;

  const activeFile = useEditorStore.getState().activeFile;
  if (!activeFile) return;

  // Clear old decorations
  if (breakpointDecorations.length > 0) {
    editor.deltaDecorations(breakpointDecorations, []);
    breakpointDecorations = [];
  }

  const bpLines = activeSession.getBreakpointsForFile(activeFile);
  const newDecorations = bpLines.map((line) => ({
    range: new monaco.Range(line, 1, line, 1),
    options: {
      glyphMarginClassName: 'debug-breakpoint',
      glyphMarginHoverMessage: { value: '断点' },
      isWholeLine: false,
    },
  }));

  breakpointDecorations = editor.deltaDecorations([], newDecorations);
}

function clearBreakpointGlyphs(): void {
  const editor = getEditor();
  if (!editor || breakpointDecorations.length === 0) return;
  editor.deltaDecorations(breakpointDecorations, []);
  breakpointDecorations = [];
}

// ─── Stopped Line Highlight ─────────────────────────────────
function highlightStoppedLine(frame: DAPStackFrame): void {
  const editor = getEditor();
  const monaco = getMonaco();
  if (!editor || !monaco) return;

  // Clear previous
  clearStoppedLine();

  if (frame.line <= 0) return;

  stoppedLineDecoration = editor.deltaDecorations([], [{
    range: new monaco.Range(frame.line, 1, frame.line, 1),
    options: {
      className: 'debug-stopped-line',
      isWholeLine: true,
      overviewRuler: { color: '#f0c040', position: monaco.editor.OverviewRulerLane.Full },
    },
  }])[0] || null;

  // Reveal line
  editor.revealLineInCenter(frame.line);

  // Open file if different
  if (frame.source?.path) {
    const activeFile = useEditorStore.getState().activeFile;
    if (frame.source.path !== activeFile) {
      const files = useFilesStore.getState().files;
      const entry = files.get(frame.source.path);
      if (entry) {
        import('../core/editor').then(({ openFileTab }) => {
          openFileTab(frame.source!.path!, entry.content);
        });
      }
    }
  }
}

function clearStoppedLine(): void {
  const editor = getEditor();
  if (!editor || !stoppedLineDecoration) return;
  editor.deltaDecorations([stoppedLineDecoration], []);
  stoppedLineDecoration = null;
}

// ─── Quick Debug (F5) ───────────────────────────────────────
export async function quickDebug(): Promise<void> {
  if (activeSession) {
    if (activeSession.state === 'stopped') {
      await activeSession.continue();
    }
    return;
  }

  const activeFile = useEditorStore.getState().activeFile;
  if (!activeFile) return;

  const ext = activeFile.split('.').pop() || '';
  const config: DebugConfig = {
    type: ext === 'py' ? 'python' : 'node',
    name: 'Quick Debug',
    request: 'launch',
    program: activeFile,
    cwd: activeFile.split('/').slice(0, -1).join('/') || '/',
    console: 'integratedTerminal',
  };

  const electronAPI = window.electronAPI;
  await startDebugSession(config, electronAPI);
}

// ─── Helpers ────────────────────────────────────────────────
function escapeHtml(s: string): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
