// ============================================================
// 终端面板 — TypeScript 版本
// ============================================================
import { useUIStore, useFilesStore } from '../core/stores';
import { getEditorContent } from '../core/editor';
import type { FileEntry } from '../types';

let termLines: string[] = [];
let termHistory: string[] = [];
let termHistoryIdx = -1;
let termCwd = '/';

export function initTerminal(): void {
  termLines = [];
  termHistory = [];
  termHistoryIdx = -1;
  termCwd = '/';
  const container = document.getElementById('terminalContainer');
  if (container) {
    container.innerHTML = '';
    container.setAttribute('tabindex', '0');
    container.style.cssText = 'background:#11111b;color:#cdd6f4;font-family:"JetBrains Mono",monospace;font-size:12px;padding:8px;height:100%;overflow-y:auto;white-space:pre-wrap;cursor:text;outline:none;';
    container.addEventListener('keydown', handleTermKey);
    container.addEventListener('click', () => container.focus());
    writeTerm(`AI Code Editor Terminal v3.0\r\nType 'help' for available commands.\r\n\r\n`);
    writePrompt();
  }
}

function handleTermKey(e: KeyboardEvent): void {
  const container = e.target as HTMLElement;
  e.preventDefault();

  if (e.key === 'Enter') {
    const line = getCurrentInput();
    executeCommand(line);
  } else if (e.key === 'Backspace') {
    if (termLines.length > 0 && termLines[termLines.length - 1].length > 0) {
      termLines[termLines.length - 1] = termLines[termLines.length - 1].slice(0, -1);
    }
  } else if (e.key === 'ArrowUp') {
    if (termHistory.length > 0) {
      termHistoryIdx = Math.min(termHistoryIdx + 1, termHistory.length - 1);
      setCurrentInput(termHistory[termHistory.length - 1 - termHistoryIdx]);
    }
  } else if (e.key === 'ArrowDown') {
    if (termHistoryIdx > 0) {
      termHistoryIdx--;
      setCurrentInput(termHistory[termHistory.length - 1 - termHistoryIdx]);
    } else {
      termHistoryIdx = -1;
      setCurrentInput('');
    }
  } else if (e.key === 'l' && e.ctrlKey) {
    termLines = [];
    container.innerHTML = '';
  } else if (e.key.length === 1) {
    if (termLines.length === 0) termLines.push('');
    termLines[termLines.length - 1] += e.key;
  }

  renderTerm(container);
}

function getCurrentInput(): string {
  const input = termLines.length > 0 ? termLines[termLines.length - 1] : '';
  termLines = termLines.slice(0, -1);

  // Add full line to history
  const fullLine = `$ ${input}`;
  termLines.push(fullLine);
  writeTerm('\r\n');

  if (input.trim()) {
    termHistory.unshift(input.trim());
    termHistoryIdx = -1;
  }

  return input.trim();
}

function setCurrentInput(text: string): void {
  if (termLines.length === 0) termLines.push('');
  termLines[termLines.length - 1] = text;
}

function writeTerm(text: string): void {
  termLines.push(text);
}

function writePrompt(): void {
  termLines.push(`\x1b[36m${termCwd}\x1b[0m $ `);
}

function renderTerm(container: HTMLElement): void {
  container.innerHTML = termLines.join('');
  container.scrollTop = container.scrollHeight;
}

function executeCommand(cmd: string): void {
  const [name, ...args] = cmd.split(/\s+/);

  switch (name) {
    case 'help':
      writeTerm('Available commands:\r\n');
      writeTerm('  help      - Show this help\r\n');
      writeTerm('  ls        - List files\r\n');
      writeTerm('  cat <f>   - Show file content\r\n');
      writeTerm('  echo <t>  - Print text\r\n');
      writeTerm('  pwd       - Print working directory\r\n');
      writeTerm('  clear     - Clear terminal\r\n');
      writeTerm('  mkdir <d> - Create directory\r\n');
      writeTerm('  touch <f> - Create file\r\n');
      writeTerm('  rm <f>    - Delete file\r\n');
      writeTerm('  node <f>  - "Run" JS file\r\n');
      writeTerm('  git       - Git commands\r\n');
      writeTerm('  date      - Show date\r\n');
      break;

    case 'ls':
      const files = useFilesStore.getState().files;
      const entries: string[] = [];
      files.forEach((_: FileEntry, path: string) => {
        const dir = path.includes('/') ? path.split('/')[0] + '/' : '';
        if (dir && !entries.includes(dir)) entries.push(dir);
        if (!path.includes('/')) entries.push(path);
      });
      writeTerm(entries.join('  ') + '\r\n');
      break;

    case 'cat':
      if (args[0]) {
        const file = useFilesStore.getState().files.get(args[0]);
        if (file) {
          writeTerm(file.content + '\r\n');
        } else {
          writeTerm(`cat: ${args[0]}: No such file\r\n`);
        }
      } else {
        writeTerm('Usage: cat <filename>\r\n');
      }
      break;

    case 'echo':
      writeTerm(args.join(' ') + '\r\n');
      break;

    case 'pwd':
      writeTerm(termCwd + '\r\n');
      break;

    case 'clear':
      termLines = [];
      break;

    case 'date':
      writeTerm(new Date().toString() + '\r\n');
      break;

    case 'node':
      if (args[0]) {
        const file = useFilesStore.getState().files.get(args[0]);
        if (file && file.language === 'javascript') {
          writeTerm(`[Node.js] Running ${args[0]}...\r\n`);
          writeTerm(`[Node.js] Output would appear here\r\n`);
          writeTerm(`[Node.js] Process exited with code 0\r\n`);
        } else {
          writeTerm(`node: ${args[0]}: Not a JS file\r\n`);
        }
      }
      break;

    case 'touch':
      if (args[0]) {
        useFilesStore.getState().setFile({
          path: args[0],
          content: '',
          language: args[0].split('.').pop() || 'plaintext',
          updatedAt: Date.now(),
        });
        writeTerm(`Created: ${args[0]}\r\n`);
      }
      break;

    case 'rm':
      if (args[0]) {
        useFilesStore.getState().deleteFile(args[0]);
        writeTerm(`Deleted: ${args[0]}\r\n`);
      }
      break;

    case 'mkdir':
      writeTerm(`Created directory: ${args[0] || 'newdir'}\r\n`);
      break;

    case 'git':
      handleGitCommand(args);
      break;

    default:
      if (name) writeTerm(`command not found: ${name}\r\n`);
  }

  const container = document.getElementById('terminalContainer');
  if (container) {
    writePrompt();
    renderTerm(container);
  }
}

function handleGitCommand(args: string[]): void {
  const sub = args[0];
  switch (sub) {
    case 'status':
      writeTerm('On branch main\r\nnothing to commit, working tree clean\r\n');
      break;
    case 'log':
      writeTerm('commit abc1234 (HEAD -> main)\r\nAuthor: AI Code Editor\r\nDate:   ' + new Date().toDateString() + '\r\n\r\n    Initial commit\r\n');
      break;
    case 'branch':
      writeTerm('* main\r\n');
      break;
    default:
      writeTerm(`git: '${sub}' is not a git command.\r\n`);
  }
}

export function toggleTerminal(): void {
  const store = useUIStore.getState();
  store.toggleTerminal();
  const panel = document.getElementById('terminalPanel');
  if (panel) {
    panel.classList.toggle('collapsed', store.terminalCollapsed);
  }
}

export function runActiveFileInTerminal(): void {
  const content = getEditorContent();
  const store = useUIStore.getState();
  if (store.terminalCollapsed) toggleTerminal();

  writeTerm(`\r\n[Running active file...]\r\n`);
  if (content) {
    writeTerm(content.substring(0, 500) + (content.length > 500 ? '...' : '') + '\r\n');
  }
  writeTerm('[Done]\r\n');
  writePrompt();

  const container = document.getElementById('terminalContainer');
  if (container) renderTerm(container);
}
