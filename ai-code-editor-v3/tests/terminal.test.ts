// ============================================================
// Terminal Feature Tests — ANSI, tab management, commands
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';

// ─── Recreated pure functions from src/features/terminal.ts ───────

const ANSI_COLORS: Record<number, string> = {
  0: '',
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

function escapeHtmlChar(ch: string): string {
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  if (ch === '&') return '&amp;';
  return ch;
}

function ansiToHtml(text: string): string {
  let result = '';
  let i = 0;
  let openSpans = 0;

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
          while (openSpans > 0) {
            result += '</span>';
            openSpans--;
          }
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

// ─── Tab interface ─────────────────────────────────────────
interface TermTab {
  id: string;
  title: string;
  cwd: string;
  lines: string[];
  history: string[];
  historyIdx: number;
  collapsed: boolean;
  ptyId?: number;
}

let _tabCounter = 0;
function createTab(title: string, id?: string): TermTab {
  return {
    id: id || 'term_test_' + (++_tabCounter),
    title,
    cwd: '/',
    lines: [],
    history: [],
    historyIdx: -1,
    collapsed: false,
  };
}

function writePromptToTab(tab: TermTab): void {
  tab.lines.push('\x1b[36m' + tab.cwd + '\x1b[0m $ ');
}

function getCurrentInputFromTab(tab: TermTab): string {
  if (tab.lines.length === 0) return '';
  const last = tab.lines[tab.lines.length - 1];
  const match = last.match(/\$ (.*)/);
  return match?.[1] || last;
}

function setCurrentInputForTab(tab: TermTab, text: string): void {
  for (let i = tab.lines.length - 1; i >= 0; i--) {
    if (tab.lines[i].includes('$ ')) {
      tab.lines[i] = '\x1b[36m' + tab.cwd + '\x1b[0m $ ' + text;
      return;
    }
  }
  tab.lines.push(text);
}

function extractInput(tab: TermTab): string {
  const last = tab.lines[tab.lines.length - 1] || '';
  const idx = last.lastIndexOf('$ ');
  const input = idx >= 0 ? last.substring(idx + 2) : last;

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

  const lastLine = tab.lines[tab.lines.length - 2];
  if (lastLine) {
    tab.lines[tab.lines.length - 2] = lastLine.replace(/\x1b\[[0-9;]*m/g, '');
  }

  return input.trim();
}

// ─── Command dispatch (without store/DOM deps) ─────────────
function executeBuiltin(tab: TermTab, cmd: string): string[] {
  const output: string[] = [];
  const [name, ...args] = cmd.split(/\s+/);

  const write = (s: string) => output.push(s);

  switch (name) {
    case 'help':
      write('Built-in commands:\r\n');
      write('  help       - Show this help\r\n');
      break;
    case 'echo':
      write(args.join(' ') + '\r\n');
      break;
    case 'pwd':
      write(tab.cwd + '\r\n');
      break;
    case 'clear':
      tab.lines = [];
      break;
    case 'date':
      write(new Date().toString() + '\r\n');
      break;
    case 'whoami':
      write('developer\r\n');
      break;
    case 'env':
      write('HOME=/home/user\r\nUSER=developer\r\nSHELL=/bin/bash\r\nTERM=xterm-256color\r\n');
      break;
    case 'cd':
      if (args[0]) {
        tab.cwd = args[0].startsWith('/') ? args[0] : tab.cwd + '/' + args[0];
        tab.cwd = tab.cwd.replace(/\/+/g, '/');
        write('');
      }
      break;
    default:
      if (name) {
        write(`command not found: ${name}\r\n`);
      }
  }

  writePromptToTab(tab);
  return output;
}

// ================================================================
describe('Terminal — ANSI to HTML conversion', () => {
  it('should convert plain text without ANSI codes', () => {
    expect(ansiToHtml('hello')).toBe('hello');
  });

  it('should strip ANSI reset codes', () => {
    const result = ansiToHtml('\x1b[0mhello');
    expect(result).toBe('hello');
  });

  it('should convert red foreground (code 31)', () => {
    const result = ansiToHtml('\x1b[31mred text\x1b[0m');
    expect(result).toContain('<span style="color:#f38ba8;">');
    expect(result).toContain('red text');
    expect(result).toContain('</span>');
  });

  it('should convert green foreground (code 32)', () => {
    const result = ansiToHtml('\x1b[32mgreen\x1b[0m');
    expect(result).toContain('color:#a6e3a1');
    expect(result).toContain('green');
  });

  it('should convert blue foreground (code 34)', () => {
    const result = ansiToHtml('\x1b[34mblue\x1b[0m');
    expect(result).toContain('color:#89b4fa');
  });

  it('should convert cyan foreground (code 36)', () => {
    const result = ansiToHtml('\x1b[36mcyan\x1b[0m');
    expect(result).toContain('color:#94e2d5');
  });

  it('should convert yellow foreground (code 33)', () => {
    const result = ansiToHtml('\x1b[33myellow\x1b[0m');
    expect(result).toContain('color:#f9e2af');
  });

  it('should convert magenta foreground (code 35)', () => {
    const result = ansiToHtml('\x1b[35mmagenta\x1b[0m');
    expect(result).toContain('color:#cba6f7');
  });

  it('should convert bold style (code 1)', () => {
    const result = ansiToHtml('\x1b[1mbold\x1b[0m');
    expect(result).toContain('font-weight:bold;');
  });

  it('should convert dim style (code 2)', () => {
    const result = ansiToHtml('\x1b[2mdim\x1b[0m');
    expect(result).toContain('opacity:0.7;');
  });

  it('should convert italic style (code 3)', () => {
    const result = ansiToHtml('\x1b[3mitalic\x1b[0m');
    expect(result).toContain('font-style:italic;');
  });

  it('should convert underline style (code 4)', () => {
    const result = ansiToHtml('\x1b[4munderlined\x1b[0m');
    expect(result).toContain('text-decoration:underline;');
  });

  it('should handle multiple ANSI codes separated by semicolon', () => {
    const result = ansiToHtml('\x1b[1;31mbold red\x1b[0m');
    expect(result).toContain('font-weight:bold;');
    expect(result).toContain('color:#f38ba8;');
  });

  it('should strip carriage returns', () => {
    const result = ansiToHtml('hello\rworld');
    expect(result).toBe('helloworld');
  });

  it('should convert newlines as-is', () => {
    const result = ansiToHtml('line1\nline2');
    expect(result).toBe('line1\nline2');
  });

  it('should handle mixed ANSI and plain text', () => {
    const result = ansiToHtml('\x1b[32mOK\x1b[0m Something');
    expect(result).toContain('OK');
    expect(result).toContain('Something');
    // Opening tag contains '<span ', reset only adds '</span>'
    expect(result.match(/<span /g)?.length).toBe(1); // one opening span
    expect(result.match(/<\/span>/g)?.length).toBe(1); // one closing span
  });

  it('should auto-close unclosed spans at end', () => {
    const result = ansiToHtml('\x1b[31munclosed');
    expect(result).toContain('</span>');
  });

  it('should handle empty input', () => {
    expect(ansiToHtml('')).toBe('');
  });

  it('should handle bright foreground colors (codes 90-97)', () => {
    const result = ansiToHtml('\x1b[90mdim gray\x1b[0m');
    expect(result).toContain('color:#6c7086');
  });

  it('should handle background colors (codes 40-47)', () => {
    const result = ansiToHtml('\x1b[41mred bg\x1b[0m');
    expect(result).toContain('background:#f38ba8');
  });
});

describe('Terminal — escapeHtmlChar', () => {
  it('should escape <', () => {
    expect(escapeHtmlChar('<')).toBe('&lt;');
  });

  it('should escape >', () => {
    expect(escapeHtmlChar('>')).toBe('&gt;');
  });

  it('should escape &', () => {
    expect(escapeHtmlChar('&')).toBe('&amp;');
  });

  it('should pass through normal characters', () => {
    expect(escapeHtmlChar('a')).toBe('a');
    expect(escapeHtmlChar('1')).toBe('1');
    expect(escapeHtmlChar(' ')).toBe(' ');
  });
});

describe('Terminal — Tab management', () => {
  let tab: TermTab;

  beforeEach(() => {
    tab = createTab('Terminal 1');
  });

  it('should create tab with default values', () => {
    expect(tab.title).toBe('Terminal 1');
    expect(tab.cwd).toBe('/');
    expect(tab.lines).toEqual([]);
    expect(tab.history).toEqual([]);
    expect(tab.historyIdx).toBe(-1);
    expect(tab.collapsed).toBe(false);
  });

  it('should generate unique IDs for each tab', () => {
    const tab1 = createTab('T1');
    const tab2 = createTab('T2');
    expect(tab1.id).not.toBe(tab2.id);
  });

  it('should write prompt line to tab', () => {
    writePromptToTab(tab);
    expect(tab.lines.length).toBe(1);
    expect(tab.lines[0]).toContain('$ ');
    expect(tab.lines[0]).toContain(tab.cwd);
  });

  it('should get current input after prompt', () => {
    writePromptToTab(tab);
    tab.lines[0] += 'echo hello';
    const input = getCurrentInputFromTab(tab);
    expect(input).toBe('echo hello');
  });

  it('should return empty string for empty tab', () => {
    const input = getCurrentInputFromTab(tab);
    expect(input).toBe('');
  });

  it('should set current input on prompt line', () => {
    writePromptToTab(tab);
    setCurrentInputForTab(tab, 'npm install');
    const input = getCurrentInputFromTab(tab);
    expect(input).toBe('npm install');
  });

  it('should extract input and add to history', () => {
    writePromptToTab(tab);
    tab.lines[0] += 'ls -la';
    const input = extractInput(tab);
    expect(input).toBe('ls -la');
    expect(tab.history).toContain('ls -la');
  });

  it('should not add empty input to history', () => {
    writePromptToTab(tab);
    const input = extractInput(tab);
    expect(input).toBe('');
    expect(tab.history.length).toBe(0);
  });

  it('should handle history navigation (ArrowUp/ArrowDown)', () => {
    tab.history = ['cmd1', 'cmd2', 'cmd3'];
    tab.historyIdx = -1;

    // ArrowUp: navigate to cmd3 (most recent)
    tab.historyIdx = Math.min(tab.historyIdx + 1, tab.history.length - 1);
    expect(tab.history[tab.history.length - 1 - tab.historyIdx]).toBe('cmd3');

    // ArrowUp again: navigate to cmd2
    tab.historyIdx = Math.min(tab.historyIdx + 1, tab.history.length - 1);
    expect(tab.history[tab.history.length - 1 - tab.historyIdx]).toBe('cmd2');

    // ArrowDown: back to cmd3
    if (tab.historyIdx > 0) tab.historyIdx--;
    expect(tab.history[tab.history.length - 1 - tab.historyIdx]).toBe('cmd3');

    // ArrowDown again: back to empty
    if (tab.historyIdx > 0) tab.historyIdx--;
    else tab.historyIdx = -1;
    expect(tab.historyIdx).toBe(-1);
  });
});

describe('Terminal — Built-in commands', () => {
  let tab: TermTab;

  beforeEach(() => {
    tab = createTab('Test');
  });

  it('should respond to help command', () => {
    const output = executeBuiltin(tab, 'help');
    expect(output.some((l) => l.includes('Built-in commands'))).toBe(true);
    expect(output.some((l) => l.includes('help'))).toBe(true);
  });

  it('should respond to echo command', () => {
    const output = executeBuiltin(tab, 'echo hello world');
    expect(output.some((l) => l.includes('hello world'))).toBe(true);
  });

  it('should respond to pwd command', () => {
    const output = executeBuiltin(tab, 'pwd');
    expect(output.some((l) => l.includes('/'))).toBe(true);
  });

  it('should clear terminal on clear command', () => {
    tab.lines.push('some output');
    executeBuiltin(tab, 'clear');
    // clear sets lines to [], then writePromptToTab adds a prompt line back
    expect(tab.lines.length).toBe(1);
    expect(tab.lines[0]).toContain('$ ');
  });

  it('should respond to date command', () => {
    const now = new Date();
    const output = executeBuiltin(tab, 'date');
    expect(output.some((l) => l.includes(now.getFullYear().toString()))).toBe(true);
  });

  it('should respond to whoami command', () => {
    const output = executeBuiltin(tab, 'whoami');
    expect(output.some((l) => l.includes('developer'))).toBe(true);
  });

  it('should respond to env command', () => {
    const output = executeBuiltin(tab, 'env');
    expect(output.some((l) => l.includes('HOME=/home/user'))).toBe(true);
    expect(output.some((l) => l.includes('USER=developer'))).toBe(true);
  });

  it('should handle cd command with absolute path', () => {
    executeBuiltin(tab, 'cd /home');
    expect(tab.cwd).toBe('/home');
  });

  it('should handle cd command with relative path', () => {
    executeBuiltin(tab, 'cd projects');
    expect(tab.cwd).toBe('/projects');
  });

  it('should normalize cd path (remove double slashes)', () => {
    tab.cwd = '/home';
    executeBuiltin(tab, 'cd /user//docs');
    expect(tab.cwd).toBe('/user/docs');
  });

  it('should handle unknown command', () => {
    const output = executeBuiltin(tab, 'unknowncmd');
    expect(output.some((l) => l.includes('command not found'))).toBe(true);
  });

  it('should handle empty command', () => {
    const output = executeBuiltin(tab, '');
    expect(output.length).toBe(0);
  });

  it('should always write a prompt after command execution', () => {
    const output = executeBuiltin(tab, 'echo test');
    const lastLine = tab.lines[tab.lines.length - 1];
    expect(lastLine).toContain('$ ');
  });
});
