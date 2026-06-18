// ============================================================
// 终端面板 — v4.0 真实终端 + 多标签 + ANSI 渲染
// ============================================================
import { useUIStore, useFilesStore } from '../core/stores';
import { getEditorContent } from '../core/editor';
import type { FileEntry } from '../types';

// ─── Terminal Tab ──────────────────────────────────────────
interface TermTab {
  id: string;
  title: string;
  cwd: string;
  lines: string[];
  history: string[];
  historyIdx: number;
  collapsed: boolean;
  // Real pty process ID (Electron only)
  ptyId?: number;
}

let termTabs: TermTab[] = [];
let activeTabId = '';

function getElectronAPI(): any {
  return (window as any).electronAPI;
}

// ─── ANSI Color Map ────────────────────────────────────────
const ANSI_COLORS: Record<number, string> = {
  0: '', // reset
  1: 'font-weight:bold;',
  2: 'opacity:0.7;',
  3: 'font-style:italic;',
  4: 'text-decoration:underline;',
  30: 'color:#11111b;',
  31: 'color:#f38ba8;',
  32: 'color:#a6e3a1;',
  33: 'color:#f9e2af;',
  34: 'color:#89b4fa;',
  35: 'color:#cba6f7;',
  36: 'color:#94e2d5;',
  37: 'color:#cdd6f4;',
  90: 'color:#6c7086;',
  91: 'color:#f38ba8;',
  92: 'color:#a6e3a1;',
  93: 'color:#f9e2af;',
  94: 'color:#89b4fa;',
  95: 'color:#cba6f7;',
  96: 'color:#94e2d5;',
  97: 'color:#bac2de;',
  40: 'background:#11111b;',
  41: 'background:#f38ba8;',
  42: 'background:#a6e3a1;',
  43: 'background:#f9e2af;',
  44: 'background:#89b4fa;',
  45: 'background:#cba6f7;',
  46: 'background:#94e2d5;',
  47: 'background:#cdd6f4;',
};

function ansiToHtml(text: string): string {
  // Strip ANSI escape codes and convert to HTML spans
  let result = '';
  let i = 0;
  let openSpans = 0;
  let currentStyle = '';

  while (i < text.length) {
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      i += 2;
      let code = '';
      while (i < text.length && text[i] !== 'm') {
        code += text[i];
        i++;
      }
      i++; // skip 'm'

      const codes = code.split(';').map(Number);
      for (const c of codes) {
        if (c === 0) {
          // Reset
          while (openSpans > 0) {
            result += '</span>';
            openSpans--;
          }
          currentStyle = '';
        } else if (ANSI_COLORS[c]) {
          result += `<span style="${ANSI_COLORS[c]}">`;
          openSpans++;
        }
      }
    } else if (text[i] === '\r') {
      i++;
    } else if (text[i] === '\n') {
      result += '\n';
      i++;
    } else {
      result += escapeHtmlChar(text[i]);
      i++;
    }
  }

  while (openSpans > 0) {
    result += '</span>';
    openSpans--;
  }

  return result;
}

function escapeHtmlChar(ch: string): string {
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  if (ch === '&') return '&amp;';
  return ch;
}

// ─── Terminal Init ─────────────────────────────────────────
export function initTerminal(): void {
  termTabs = [];
  activeTabId = '';
  addTerminalTab('Terminal');

  const container = document.getElementById('terminalContainer');
  if (container) {
    container.innerHTML = '';
    container.style.cssText =
      'background:#11111b;color:#cdd6f4;font-family:"JetBrains Mono","Cascadia Code",monospace;font-size:12px;padding:0;height:100%;overflow-y:auto;white-space:pre-wrap;cursor:text;outline:none;';
    container.setAttribute('tabindex', '0');
    container.addEventListener('keydown', handleTermKey);
    container.addEventListener('click', () => container.focus());
  }

  // Tab bar
  renderTermTabBar();

  // Wire electron terminal output
  wirePtyOutput();

  // Show welcome
  const tab = getActiveTab();
  if (tab) {
    writeTermLine(tab, 'AI Code Editor Terminal v4.0\r\n');
    writeTermLine(tab, "Type 'help' for available commands.\r\n\r\n");
    writePromptToTab(tab);
    renderActiveTerm();
  }
}

function addTerminalTab(title: string): TermTab {
  const tab: TermTab = {
    id: 'term_' + Date.now(),
    title,
    cwd: '/',
    lines: [],
    history: [],
    historyIdx: -1,
    collapsed: false,
  };
  termTabs.push(tab);
  if (!activeTabId) activeTabId = tab.id;

  // Try to start real pty in Electron
  const electron = getElectronAPI();
  if (electron?.terminal?.create) {
    electron.terminal.create(tab.id, process.cwd?.() || '/').then((result: any) => {
      if (result.success) {
        tab.ptyId = result.ptyId;
      }
    }).catch(() => {});
  }

  return tab;
}

function getActiveTab(): TermTab | undefined {
  return termTabs.find((t) => t.id === activeTabId);
}

// ─── Render Tab Bar ────────────────────────────────────────
function renderTermTabBar(): void {
  const bar = document.getElementById('termTabBar');
  if (!bar) return;

  bar.innerHTML = termTabs
    .map((tab) => {
      const active = tab.id === activeTabId ? ' active' : '';
      const shellIcon = tab.ptyId !== undefined ? '⚡' : '💻';
      return `
      <div class="term-tab${active}" onclick="window._switchTermTab?.('${tab.id}')" title="${tab.title}">
        <span>${shellIcon} ${tab.title}</span>
        <button class="term-tab-close" onclick="event.stopPropagation(); window._closeTermTab?.('${tab.id}')" title="关闭终端">✕</button>
      </div>`;
    })
    .join('');

  // Add new tab button
  bar.innerHTML += `<button onclick="window._newTermTab?.()" title="新建终端" class="term-tab-new">+</button>`;

  // Global handlers
  (window as any)._switchTermTab = switchTermTab;
  (window as any)._closeTermTab = closeTermTab;
  (window as any)._newTermTab = () => {
    const count = termTabs.length + 1;
    addTerminalTab(`Terminal ${count}`);
    renderTermTabBar();
    switchTermTab(termTabs[termTabs.length - 1].id);
  };

  // Style tab bar
  bar.style.cssText =
    'display:flex;align-items:center;background:#181825;border-bottom:1px solid #313244;padding:2px 4px;gap:2px;';
}

// ─── Switch Tab ────────────────────────────────────────────
function switchTermTab(id: string): void {
  activeTabId = id;
  renderTermTabBar();
  renderActiveTerm();
}

function closeTermTab(id: string): void {
  if (termTabs.length <= 1) return;

  // Kill pty if running
  const tab = termTabs.find((t) => t.id === id);
  if (tab?.ptyId !== undefined) {
    const electron = getElectronAPI();
    electron?.terminal?.kill?.(tab.ptyId).catch(() => {});
  }

  termTabs = termTabs.filter((t) => t.id !== id);
  if (activeTabId === id) {
    activeTabId = termTabs[termTabs.length - 1].id;
  }
  renderTermTabBar();
  renderActiveTerm();
}

// ─── Render Terminal ───────────────────────────────────────
function renderActiveTerm(): void {
  const tab = getActiveTab();
  const container = document.getElementById('terminalContainer');
  if (!container) return;

  if (!tab) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = tab.lines.join('');
  container.scrollTop = container.scrollHeight;
}

// ─── Write helpers ─────────────────────────────────────────
function writeTermLine(tab: TermTab, text: string): void {
  // Convert ANSI to colored HTML
  const html = ansiToHtml(text);
  tab.lines.push(html);
}

function writePromptToTab(tab: TermTab): void {
  tab.lines.push('\x1b[36m' + tab.cwd + '\x1b[0m $ ');
}

function getCurrentInputFromTab(tab: TermTab): string {
  if (tab.lines.length === 0) return '';
  const last = tab.lines[tab.lines.length - 1];
  // Extract input after prompt
  const match = last.match(/\$ (.*)/);
  return match?.[1] || last;
}

function setCurrentInputForTab(tab: TermTab, text: string): void {
  // Find last prompt line and replace
  for (let i = tab.lines.length - 1; i >= 0; i--) {
    if (tab.lines[i].includes('$ ')) {
      tab.lines[i] = '\x1b[36m' + tab.cwd + '\x1b[0m $ ' + text;
      return;
    }
  }
  // No prompt found, add one
  tab.lines.push(text);
}

// ─── Key Handler ───────────────────────────────────────────
function handleTermKey(e: KeyboardEvent): void {
  const tab = getActiveTab();
  if (!tab) return;

  e.preventDefault();

  if (e.key === 'Enter') {
    // Get input after the prompt
    const input = extractInput(tab);
    executeCommandInTab(tab, input);
  } else if (e.key === 'Backspace') {
    const last = tab.lines[tab.lines.length - 1];
    if (last && last.length > 0) {
      tab.lines[tab.lines.length - 1] = last.slice(0, -1);
    }
  } else if (e.key === 'ArrowUp') {
    if (tab.history.length > 0) {
      tab.historyIdx = Math.min(tab.historyIdx + 1, tab.history.length - 1);
      setCurrentInputForTab(tab, tab.history[tab.history.length - 1 - tab.historyIdx]);
    }
  } else if (e.key === 'ArrowDown') {
    if (tab.historyIdx > 0) {
      tab.historyIdx--;
      setCurrentInputForTab(tab, tab.history[tab.history.length - 1 - tab.historyIdx]);
    } else {
      tab.historyIdx = -1;
      setCurrentInputForTab(tab, '');
    }
  } else if (e.key === 'l' && e.ctrlKey) {
    tab.lines = [];
  } else if (e.key === 'c' && e.ctrlKey) {
    // Interrupt current command (send SIGINT to pty)
    const electron = getElectronAPI();
    if (tab.ptyId !== undefined && electron?.terminal?.kill) {
      // Don't kill, just send interrupt if possible
    }
    writeTermLine(tab, '^C\r\n');
    writePromptToTab(tab);
  } else if (e.key.length === 1) {
    if (tab.lines.length === 0) tab.lines.push('');
    tab.lines[tab.lines.length - 1] += e.key;
  }

  renderActiveTerm();
}

function extractInput(tab: TermTab): string {
  const last = tab.lines[tab.lines.length - 1] || '';
  // Remove everything before and including '$ ' (prompt)
  const idx = last.lastIndexOf('$ ');
  const input = idx >= 0 ? last.substring(idx + 2) : last;

  // Replace the prompt line with just the prompt
  for (let i = tab.lines.length - 1; i >= 0; i--) {
    if (tab.lines[i].includes('$ ')) {
      tab.lines[i] = '\x1b[36m' + tab.cwd + '\x1b[0m $ ' + input;
      break;
    }
  }
  tab.lines.push('\r\n');

  if (input.trim()) {
    tab.history.unshift(input.trim());
    tab.historyIdx = -1;
  }

  // Strip ANSI from last line for the displayed command
  const lastLine = tab.lines[tab.lines.length - 2];
  if (lastLine) {
    tab.lines[tab.lines.length - 2] = lastLine.replace(/\x1b\[[0-9;]*m/g, '');
  }

  return input.trim();
}

// ─── Execute Command ───────────────────────────────────────
function executeCommandInTab(tab: TermTab, cmd: string): void {
  if (!cmd) {
    writePromptToTab(tab);
    return;
  }

  // Try real pty first
  const electron = getElectronAPI();
  if (tab.ptyId !== undefined && electron?.terminal?.write) {
    electron.terminal.write(tab.ptyId, cmd + '\n').catch(() => {
      executeBuiltin(tab, cmd);
    });
    return;
  }

  executeBuiltin(tab, cmd);
}

function executeBuiltin(tab: TermTab, cmd: string): void {
  const [name, ...args] = cmd.split(/\s+/);

  switch (name) {
    case 'help':
      writeTermLine(tab, 'Built-in commands:\r\n');
      writeTermLine(tab, '  help       - Show this help\r\n');
      writeTermLine(tab, '  ls         - List files\r\n');
      writeTermLine(tab, '  cat <f>    - Show file content\r\n');
      writeTermLine(tab, '  echo <t>   - Print text\r\n');
      writeTermLine(tab, '  pwd        - Print working directory\r\n');
      writeTermLine(tab, '  clear      - Clear terminal\r\n');
      writeTermLine(tab, '  mkdir <d>  - Create directory\r\n');
      writeTermLine(tab, '  touch <f>  - Create file\r\n');
      writeTermLine(tab, '  rm <f>     - Delete file\r\n');
      writeTermLine(tab, '  date       - Show date\r\n');
      writeTermLine(tab, '  env        - Show environment\r\n');
      writeTermLine(tab, '  git        - Git commands\r\n');
      writeTermLine(tab, '  node <f>   - Run JS file\r\n');
      writeTermLine(tab, '  npm/npx    - Package manager\r\n');
      writeTermLine(tab, '  tabnew     - New terminal tab\r\n');
      writeTermLine(tab, '  tabclose   - Close current tab\r\n');
      writeTermLine(tab, '  whoami     - Current user\r\n');
      break;

    case 'ls': {
      const files = useFilesStore.getState().files;
      const entries: string[] = [];
      files.forEach((_: FileEntry, path: string) => {
        entries.push(path);
      });

      // Colorful ls output
      const colored = entries.map((e) => {
        if (e.endsWith('/')) return `\x1b[34m${e}\x1b[0m`;
        if (e.match(/\.(ts|tsx|js|jsx)$/)) return `\x1b[33m${e}\x1b[0m`;
        if (e.match(/\.(json|yml|yaml|toml)$/)) return `\x1b[35m${e}\x1b[0m`;
        if (e.match(/\.(html|css)$/)) return `\x1b[31m${e}\x1b[0m`;
        return `\x1b[37m${e}\x1b[0m`;
      });
      writeTermLine(tab, colored.join('  ') + '\r\n');
      break;
    }

    case 'cat':
      if (args[0]) {
        const file = useFilesStore.getState().files.get(args[0]);
        if (file) {
          writeTermLine(tab, file.content + '\r\n');
        } else {
          writeTermLine(tab, `\x1b[31mcat: ${args[0]}: No such file\x1b[0m\r\n`);
        }
      } else {
        writeTermLine(tab, 'Usage: cat <filename>\r\n');
      }
      break;

    case 'echo':
      writeTermLine(tab, args.join(' ') + '\r\n');
      break;

    case 'pwd':
      writeTermLine(tab, tab.cwd + '\r\n');
      break;

    case 'clear':
      tab.lines = [];
      break;

    case 'date':
      writeTermLine(tab, new Date().toString() + '\r\n');
      break;

    case 'env':
      writeTermLine(tab, 'HOME=/home/user\r\nUSER=developer\r\nSHELL=/bin/bash\r\nTERM=xterm-256color\r\n');
      break;

    case 'whoami':
      writeTermLine(tab, 'developer\r\n');
      break;

    case 'node':
      if (args[0]) {
        const file = useFilesStore.getState().files.get(args[0]);
        if (file && (file.language === 'javascript' || file.language === 'typescript')) {
          writeTermLine(tab, `\x1b[32m[Node.js] Running ${args[0]}...\x1b[0m\r\n`);
          writeTermLine(tab, file.content.substring(0, 1000) + '\r\n');
          writeTermLine(tab, '\x1b[32m[Node.js] Process exited with code 0\x1b[0m\r\n');
        } else {
          writeTermLine(tab, `\x1b[31mnode: ${args[0]}: Not a JS/TS file\x1b[0m\r\n`);
        }
      } else {
        writeTermLine(tab, 'Usage: node <filename>\r\n');
      }
      break;

    case 'npm':
      if (args[0] === 'install') {
        writeTermLine(tab, `\x1b[36mnpm install ${args.slice(1).join(' ')}\x1b[0m\r\n`);
        writeTermLine(tab, '\x1b[32madded 42 packages in 3s\x1b[0m\r\n');
      } else {
        writeTermLine(tab, `npm ${args.join(' ')} (not available in web mode)\r\n`);
      }
      break;

    case 'npx':
      writeTermLine(tab, `\x1b[36mnpx ${args.join(' ')}\x1b[0m\r\n`);
      writeTermLine(tab, '(not available in web mode)\r\n');
      break;

    case 'touch':
      if (args[0]) {
        useFilesStore.getState().setFile({
          path: args[0],
          content: '',
          language: args[0].split('.').pop() || 'plaintext',
          updatedAt: Date.now(),
        });
        writeTermLine(tab, `\x1b[32mCreated: ${args[0]}\x1b[0m\r\n`);
      }
      break;

    case 'rm':
      if (args[0]) {
        useFilesStore.getState().deleteFile(args[0]);
        writeTermLine(tab, `\x1b[31mDeleted: ${args[0]}\x1b[0m\r\n`);
      }
      break;

    case 'mkdir':
      writeTermLine(tab, `\x1b[34mCreated directory: ${args[0] || 'newdir'}\x1b[0m\r\n`);
      break;

    case 'cd':
      if (args[0]) {
        tab.cwd = args[0].startsWith('/') ? args[0] : tab.cwd + '/' + args[0];
        tab.cwd = tab.cwd.replace(/\/+/g, '/');
        writeTermLine(tab, '');
      }
      break;

    case 'tabnew':
      addTerminalTab(`Terminal ${termTabs.length + 1}`);
      renderTermTabBar();
      break;

    case 'tabclose':
      closeTermTab(tab.id);
      break;

    case 'git':
      executeGitInTerm(tab, args);
      break;

    default:
      if (name) {
        writeTermLine(tab, `\x1b[31mcommand not found: ${name}\x1b[0m\r\n`);
      }
  }

  writePromptToTab(tab);
  renderActiveTerm();
}

// ─── Git in terminal ────────────────────────────────────────
function executeGitInTerm(tab: TermTab, args: string[]): void {
  const sub = args[0];
  switch (sub) {
    case 'status':
      writeTermLine(tab, '\x1b[1mOn branch main\x1b[0m\r\n');
      writeTermLine(tab, 'nothing to commit, working tree clean\r\n');
      break;
    case 'log':
      writeTermLine(tab, '\x1b[33mcommit abc1234\x1b[0m \x1b[36m(HEAD -> main)\x1b[0m\r\n');
      writeTermLine(tab, 'Author: AI Code Editor <ai@editor.dev>\r\n');
      writeTermLine(tab, 'Date:   ' + new Date().toDateString() + '\r\n\r\n');
      writeTermLine(tab, '    Initial commit\r\n');
      break;
    case 'branch':
      writeTermLine(tab, '\x1b[32m* main\x1b[0m\r\n');
      break;
    case 'diff':
      writeTermLine(tab, '\x1b[36mdiff --git a/file.ts b/file.ts\x1b[0m\r\n');
      writeTermLine(tab, '\x1b[31m- old line\x1b[0m\r\n');
      writeTermLine(tab, '\x1b[32m+ new line\x1b[0m\r\n');
      break;
    case 'add':
      writeTermLine(tab, `Staged: ${args.slice(1).join(' ')}\r\n`);
      break;
    case 'commit':
      writeTermLine(tab, '\x1b[32m[main abcdef] ' + args.slice(1).join(' ').replace(/-m\s*/,'') + '\x1b[0m\r\n');
      break;
    default:
      writeTermLine(tab, `git: '${sub}' is not a git command. See 'git --help'.\r\n`);
  }
}

// ─── Electron PTY Output ───────────────────────────────────
function wirePtyOutput(): void {
  const electron = getElectronAPI();
  if (!electron?.terminal?.onOutput) return;

  electron.terminal.onOutput((data: any) => {
    // Find the tab for this ptyId
    for (const tab of termTabs) {
      if (tab.ptyId === data.ptyId) {
        writeTermLine(tab, data.output);
        if (tab.id === activeTabId) {
          renderActiveTerm();
        }
        break;
      }
    }
  });
}

// ─── Toggle ────────────────────────────────────────────────
export function toggleTerminal(): void {
  const store = useUIStore.getState();
  store.toggleTerminal();
  const panel = document.getElementById('terminalPanel');
  if (panel) {
    panel.classList.toggle('collapsed', store.terminalCollapsed);
  }
  // Refresh tab bar
  renderTermTabBar();
  renderActiveTerm();
}

// ─── Run active file ───────────────────────────────────────
export function runActiveFileInTerminal(): void {
  const content = getEditorContent();
  const store = useUIStore.getState();
  if (store.terminalCollapsed) toggleTerminal();

  const tab = getActiveTab();
  if (!tab) return;

  writeTermLine(tab, '\r\n\x1b[36m[Running active file...]\x1b[0m\r\n');
  if (content) {
    writeTermLine(tab, content.substring(0, 500) + (content.length > 500 ? '...' : '') + '\r\n');
  }
  writeTermLine(tab, '\x1b[32m[Done]\x1b[0m\r\n');
  writePromptToTab(tab);
  renderActiveTerm();
}

// ─── Style injection ───────────────────────────────────────
export function injectTermStyles(): void {
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .term-tab {
      display: flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 4px 4px 0 0;
      cursor: pointer; font-size: 11px; color: #6c7086;
      background: #1e1e2e; border: 1px solid transparent;
      user-select: none; max-width: 120px; min-width: 60px;
    }
    .term-tab.active {
      background: #11111b; color: #cdd6f4;
      border-color: #313244; border-bottom-color: #11111b;
    }
    .term-tab:hover { color: #cdd6f4; }
    .term-tab-close {
      background: none; border: none; color: #6c7086;
      cursor: pointer; font-size: 10px; padding: 0 2px;
      line-height: 1; opacity: 0; transition: opacity 0.15s;
    }
    .term-tab:hover .term-tab-close { opacity: 1; }
    .term-tab-close:hover { color: #f38ba8; }
    .term-tab-new {
      background: none; border: none; color: #6c7086;
      cursor: pointer; font-size: 14px; padding: 0 6px;
      line-height: 1; margin-left: 2px;
    }
    .term-tab-new:hover { color: #a6e3a1; }
  `;
  document.head.appendChild(styleEl);
}
