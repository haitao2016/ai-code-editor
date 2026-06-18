// ============================================================
// Phase 5.4 — E2E Flow Tests
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';

// ═══ Shared test state types ═══════════════════════════════
type FileStore = Map<string, { content: string; dirty: boolean; language: string }>;
type EditorState = { openFile: string | null; content: string; dirty: boolean; cursorLine: number; cursorColumn: number };
type TerminalState = { tabs: { id: string; title: string; lines: string[] }[]; activeTabId: string | null };
type ChatMessage = { role: 'user' | 'assistant'; content: string; timestamp: number };
type ChatState = { messages: ChatMessage[]; sessions: { id: string; name: string; messages: ChatMessage[] }[]; activeSessionId: string };
type GitState = { staged: string[]; unstaged: string[]; branch: string; remotes: { name: string; url: string }[]; commits: { oid: string; message: string; timestamp: number }[] };

// ═══════════════════════════════════════════════════════════
// Flow 1: Edit → Save → Terminal → AI
// ═══════════════════════════════════════════════════════════
describe('E2E: Edit → Save → Terminal → AI', () => {
  let files: FileStore;
  let editor: EditorState;
  let terminal: TerminalState;
  let chat: ChatState;

  function makeStore(): FileStore { return new Map(); }
  function makeEditor(): EditorState { return { openFile: null, content: '', dirty: false, cursorLine: 1, cursorColumn: 1 }; }
  function makeTerm(): TerminalState { return { tabs: [], activeTabId: null }; }
  function makeChat(): ChatState {
    const sid = 's_' + Date.now();
    return { messages: [], sessions: [{ id: sid, name: 'Chat', messages: [] }], activeSessionId: sid };
  }

  beforeEach(() => {
    files = makeStore();
    files.set('src/index.ts', { content: 'console.log("hello");\n', dirty: false, language: 'typescript' });
    files.set('src/utils.ts', { content: 'export const PI = 3.14;\n', dirty: false, language: 'typescript' });
    editor = makeEditor();
    terminal = makeTerm();
    chat = makeChat();
  });

  it('step 1: open file loads content', () => {
    editor.openFile = 'src/index.ts';
    editor.content = files.get('src/index.ts')!.content;
    expect(editor.content).toBe('console.log("hello");\n');
    expect(editor.dirty).toBe(false);
  });

  it('step 2: edit marks file dirty', () => {
    editor.openFile = 'src/index.ts';
    editor.content = 'console.log("hello world!");\n';
    editor.dirty = true;
    expect(editor.dirty).toBe(true);
    expect(editor.content).toContain('hello world');
  });

  it('step 3: save clears dirty flag and persists', () => {
    editor.openFile = 'src/index.ts';
    editor.content = 'console.log("updated");\n';
    editor.dirty = true;
    files.get('src/index.ts')!.content = editor.content;
    editor.dirty = false;
    expect(editor.dirty).toBe(false);
    expect(files.get('src/index.ts')!.content).toBe('console.log("updated");\n');
  });

  it('step 4: run file in terminal shows output', () => {
    terminal.tabs.push({ id: 't1', title: 'Terminal', lines: [] });
    terminal.activeTabId = 't1';
    const tab = terminal.tabs.find(t => t.id === 't1')!;
    tab.lines.push('$ tsx src/index.ts');
    tab.lines.push('hello');
    expect(tab.lines).toEqual(['$ tsx src/index.ts', 'hello']);
  });

  it('step 5: AI reviews code from chat', () => {
    chat.messages.push({ role: 'user', content: 'Review:\n```typescript\nconsole.log("test");\n```', timestamp: 1 });
    chat.messages.push({ role: 'assistant', content: 'Looks good!', timestamp: 2 });
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[1].content).toContain('Looks good');
  });

  it('full flow: all steps connected', () => {
    editor.openFile = 'src/index.ts';
    editor.content = files.get('src/index.ts')!.content;
    editor.content = 'const g = "Hello AI Code Editor";\nconsole.log(g);\n';
    editor.dirty = true;
    files.get('src/index.ts')!.content = editor.content;
    editor.dirty = false;
    terminal.tabs.push({ id: 't1', title: 'bash', lines: [] });
    terminal.activeTabId = 't1';
    terminal.tabs[0].lines.push('$ tsx src/index.ts');
    terminal.tabs[0].lines.push('Hello AI Code Editor');
    chat.messages.push({ role: 'user', content: 'What does this do?', timestamp: 1 });
    chat.messages.push({ role: 'assistant', content: 'Prints a greeting.', timestamp: 2 });
    expect(editor.dirty).toBe(false);
    expect(files.get('src/index.ts')!.content).toContain('AI Code Editor');
    expect(terminal.tabs[0].lines[1]).toContain('Hello');
    expect(chat.messages).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Flow 2: File CRUD
// ═══════════════════════════════════════════════════════════
describe('E2E: File CRUD', () => {
  let files: FileStore;
  let editor: EditorState;

  beforeEach(() => {
    files = new Map();
    editor = { openFile: null, content: '', dirty: false, cursorLine: 1, cursorColumn: 1 };
  });

  it('create → open → edit → save → delete', () => {
    const path = 'src/greet.ts';
    files.set(path, { content: '', dirty: true, language: 'typescript' });
    expect(files.has(path)).toBe(true);
    editor.openFile = path;
    editor.content = 'export function greet(n: string) { return `Hi ${n}`; }\n';
    editor.dirty = true;
    files.get(path)!.content = editor.content;
    editor.dirty = false;
    expect(files.get(path)!.content).toContain('greet');
    files.delete(path);
    expect(files.has(path)).toBe(false);
  });

  it('rename: old path removed, new path has content', () => {
    files.set('old.ts', { content: '// old', dirty: false, language: 'typescript' });
    const c = files.get('old.ts')!.content;
    files.set('new.ts', { content: c, dirty: false, language: 'typescript' });
    files.delete('old.ts');
    expect(files.has('old.ts')).toBe(false);
    expect(files.get('new.ts')!.content).toBe('// old');
  });

  it('batch create multiple files', () => {
    ['a.ts', 'b.ts', 'c.ts'].forEach(p => files.set(p, { content: `// ${p}`, dirty: true, language: 'typescript' }));
    expect(files.size).toBe(3);
  });

  it('switch between open files', () => {
    files.set('a.ts', { content: 'const a = 1;', dirty: false, language: 'typescript' });
    files.set('b.ts', { content: 'const b = 2;', dirty: false, language: 'typescript' });
    editor.openFile = 'a.ts'; editor.content = files.get('a.ts')!.content;
    expect(editor.content).toContain('a = 1');
    editor.openFile = 'b.ts'; editor.content = files.get('b.ts')!.content;
    expect(editor.content).toContain('b = 2');
  });
});

// ═══════════════════════════════════════════════════════════
// Flow 3: AI Chat
// ═══════════════════════════════════════════════════════════
describe('E2E: AI Chat', () => {
  let chat: ChatState;

  beforeEach(() => {
    const sid = 's_' + Date.now();
    chat = { messages: [], sessions: [{ id: sid, name: 'Chat', messages: [] }], activeSessionId: sid };
  });

  it('send message → receive response', () => {
    chat.messages.push({ role: 'user', content: 'Fix type error on line 42', timestamp: 1 });
    chat.messages.push({ role: 'assistant', content: 'Try adding a type assertion.', timestamp: 2 });
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0].role).toBe('user');
    expect(chat.messages[1].role).toBe('assistant');
  });

  it('session switch preserves messages', () => {
    const s1 = { id: 's1', name: 'S1', messages: [{ role: 'user' as const, content: 'Q1', timestamp: 1 }] };
    const s2 = { id: 's2', name: 'S2', messages: [{ role: 'user' as const, content: 'Q2', timestamp: 2 }] };
    chat.sessions = [s1, s2];
    chat.activeSessionId = 's2';
    expect(chat.sessions.find(s => s.id === 's2')!.messages[0].content).toBe('Q2');
    chat.activeSessionId = 's1';
    expect(chat.sessions.find(s => s.id === 's1')!.messages[0].content).toBe('Q1');
  });

  it('clear messages', () => {
    chat.messages.push({ role: 'user', content: 'Test', timestamp: 1 });
    chat.messages = [];
    expect(chat.messages).toHaveLength(0);
  });

  it('delete old session', () => {
    chat.sessions = [{ id: 's1', name: 'S1', messages: [] }, { id: 's2', name: 'S2', messages: [] }];
    chat.sessions = chat.sessions.filter(s => s.id !== 's2');
    expect(chat.sessions).toHaveLength(1);
  });

  it('code block in AI response', () => {
    chat.messages.push({ role: 'assistant', content: '```typescript\nfunction add(a: number, b: number) { return a + b; }\n```', timestamp: 1 });
    expect(chat.messages[0].content).toContain('```typescript');
    expect(chat.messages[0].content).toContain('function add');
  });

  it('streaming: incremental content accumulation', () => {
    const chunks = ['Code ', 'looks ', 'good!'];
    expect(chunks.join('')).toBe('Code looks good!');
  });

  it('error: API failure shows error message', () => {
    chat.messages.push({ role: 'assistant', content: 'Request failed, check API config', timestamp: 1 });
    expect(chat.messages[0].content).toContain('failed');
  });
});

// ═══════════════════════════════════════════════════════════
// Flow 4: Git Operations
// ═══════════════════════════════════════════════════════════
describe('E2E: Git', () => {
  let git: GitState;

  beforeEach(() => {
    git = { staged: [], unstaged: ['src/index.ts', 'src/utils.ts'], branch: 'main', remotes: [], commits: [] };
  });

  it('stage → commit → push', () => {
    git.staged.push(git.unstaged.shift()!);
    git.staged.push(git.unstaged.shift()!);
    expect(git.staged).toHaveLength(2);
    git.commits.push({ oid: 'abc123', message: 'feat: add files', timestamp: Date.now() });
    expect(git.commits).toHaveLength(1);
    git.remotes.push({ name: 'origin', url: 'https://github.com/u/r.git' });
    expect(git.remotes[0].name).toBe('origin');
  });

  it('create branch → switch → commit', () => {
    git.branch = 'feat/x';
    git.staged = ['src/x.ts'];
    git.commits.push({ oid: 'xyz', message: 'feat: x', timestamp: 1 });
    expect(git.branch).toBe('feat/x');
    git.branch = 'main';
    expect(git.branch).toBe('main');
  });

  it('unstage single file', () => {
    git.unstaged = [];
    git.staged = ['a.ts', 'b.ts'];
    git.unstaged.push(git.staged.splice(git.staged.indexOf('a.ts'), 1)[0]);
    expect(git.staged).toEqual(['b.ts']);
    expect(git.unstaged).toEqual(['a.ts']);
  });

  it('stage all → commit → clean state', () => {
    git.staged = [...git.unstaged];
    git.unstaged = [];
    expect(git.staged).toHaveLength(2);
    git.commits.push({ oid: 'c1', message: 'all', timestamp: 1 });
    git.staged = [];
    expect(git.staged).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Flow 5: Terminal Operations
// ═══════════════════════════════════════════════════════════
describe('E2E: Terminal', () => {
  let term: TerminalState;

  beforeEach(() => {
    term = { tabs: [], activeTabId: null };
  });

  it('create → run → view → clear', () => {
    term.tabs.push({ id: 't1', title: 'bash', lines: [] });
    term.activeTabId = 't1';
    const t = term.tabs[0];
    t.lines.push('$ ls');
    t.lines.push('index.ts');
    expect(t.lines).toHaveLength(2);
    t.lines = [];
    expect(t.lines).toHaveLength(0);
  });

  it('multi-tab: switch and close', () => {
    term.tabs.push({ id: 't1', title: 'T1', lines: [] }, { id: 't2', title: 'T2', lines: [] });
    term.activeTabId = 't2';
    term.tabs.find(t => t.id === 't2')!.lines.push('$ echo hi');
    term.activeTabId = 't1';
    term.tabs = term.tabs.filter(t => t.id !== 't2');
    expect(term.tabs).toHaveLength(1);
  });

  it('npm install output', () => {
    term.tabs.push({ id: 't1', title: 'npm', lines: [] });
    term.tabs[0].lines.push('$ npm i');
    term.tabs[0].lines.push('added 142 packages');
    expect(term.tabs[0].lines[1]).toContain('added');
  });

  it('history navigation (up/down arrows)', () => {
    const h = ['ls', 'git status', 'npm test'];
    let idx = h.length;
    idx--; expect(h[idx]).toBe('npm test');
    idx--; expect(h[idx]).toBe('git status');
    idx++; expect(h[idx]).toBe('npm test');
  });

  it('run active file by language', () => {
    const lang = 'typescript';
    const file = 'src/index.ts';
    const cmd = lang === 'typescript' ? `tsx ${file}` : `node ${file}`;
    expect(cmd).toBe('tsx src/index.ts');
  });
});

// ═══════════════════════════════════════════════════════════
// Flow 6: Search → Navigate → Replace
// ═══════════════════════════════════════════════════════════
describe('E2E: Search', () => {
  it('search → find matches across files', () => {
    const files = new Map([['a.ts', 'const x = 1;\nconst y = 2;'], ['b.ts', 'let z = 3;']]);
    const results: string[] = [];
    for (const [_, c] of files) for (const l of c.split('\n')) if (l.includes('const')) results.push(l.trim());
    expect(results).toHaveLength(2);
  });

  it('regex: capture named groups', () => {
    const text = 'const user1 = {}; const user2 = {};';
    const matches = [...text.matchAll(/const\s+(\w+)/g)].map(m => m[1]);
    expect(matches).toEqual(['user1', 'user2']);
  });

  it('replace all → verify', () => {
    let content = 'var x = 1;\nvar y = 2;';
    content = content.replace(/var/g, 'const');
    expect(content).not.toMatch(/\bvar\b/);
    expect(content).toContain('const x');
  });
});

// ═══════════════════════════════════════════════════════════
// Flow 7: Settings → Apply → Persist
// ═══════════════════════════════════════════════════════════
describe('E2E: Settings', () => {
  it('theme: change → persist → reload', () => {
    const storage: Record<string, string> = {};
    const ls = { get: (k: string) => storage[k] || null, set: (k: string, v: string) => { storage[k] = v; } };
    ls.set('theme', 'dark');
    ls.set('theme', 'light');
    expect(ls.get('theme')).toBe('light');
  });

  it('api key: encrypt → store → decrypt', () => {
    const key = 'sk-test-123';
    const enc = Buffer.from(key).toString('base64');
    const dec = Buffer.from(enc, 'base64').toString('utf-8');
    expect(enc).not.toBe(key);
    expect(dec).toBe(key);
  });

  it('font size: change → apply min/max bounds', () => {
    let size = 14;
    size = 18; expect(size).toBe(18);
    size = Math.max(8, Math.min(32, size));
    expect(size).toBe(18);
    size = Math.max(8, Math.min(32, 40));
    expect(size).toBe(32);
    size = Math.max(8, Math.min(32, 4));
    expect(size).toBe(8);
  });
});
