// ============================================================
// terminal.js — xterm.js 终端 + 模拟 Shell
// Phase 1: 终端面板
// ============================================================

let terminal = null;
let terminalVisible = false;
let currentDir = '/'; // 当前工作目录（模拟）

// ─── 初始化终端 ─────────────────────────────────────────
function initTerminal() {
  const container = document.getElementById('terminalContainer');
  if (!container) return;

  if (terminal) { terminal.dispose(); terminal = null; }

  terminal = new Terminal({
    theme: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: '#44475a',
      black: '#1e1e2e',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#cdd6f4',
      brightBlack: '#6c7086',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#cdd6f4'
    },
    fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 1000,
    allowProposedApi: true
  });

  // Fit addon
  if (window.FitAddon) {
    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    setTimeout(() => { try { fitAddon.fit(); } catch(e) {} }, 100);
    window.addEventListener('resize', () => { try { fitAddon.fit(); } catch(e) {} });
  }

  terminal.open(container);

  // 显示欢迎信息
  terminal.writeln('\x1b[1;36mAI Code Editor\x1b[0m 内置终端 v2.0');
  terminal.writeln('输入 \x1b[33mhelp\x1b[0m 查看可用命令');
  terminal.writeln('');

  // 提示符
  showPrompt();

  // 命令输入处理
  let currentInput = '';
  terminal.onData(e => {
    if (e === '\r') { // Enter
      terminal.writeln('');
      processCommand(currentInput.trim());
      currentInput = '';
      showPrompt();
    } else if (e === '\x7F') { // Backspace
      if (currentInput.length > 0) {
        currentInput = currentInput.slice(0, -1);
        terminal.write('\b \b');
      }
    } else if (e === '\x03') { // Ctrl+C
      terminal.writeln('^C');
      currentInput = '';
      showPrompt();
    } else if (e >= ' ' || e === '\x1b[A' || e === '\x1b[B') {
      // 方向键（TODO: 历史命令）
      if (e >= ' ') {
        currentInput += e;
        terminal.write(e);
      }
    }
  });
}

function showPrompt() {
  const dir = currentDir === '/' ? '/' : currentDir;
  terminal.write(`\x1b[32m$\x1b[0m:\x1b[34m${dir}\x1b[0m$ `);
}

// ─── 模拟 Shell 命令 ─────────────────────────────────────
const commandHistory = [];
let historyIndex = -1;

function processCommand(cmd) {
  if (!cmd) return;
  commandHistory.push(cmd);
  historyIndex = commandHistory.length;

  const parts = cmd.split(/\s+/);
  const base = parts[0]?.toLowerCase();

  switch (base) {
    case 'ls':
    case 'dir':
      cmdLs(parts);
      break;
    case 'cat':
    case 'type':
      cmdCat(parts);
      break;
    case 'echo':
      cmdEcho(parts);
      break;
    case 'clear':
    case 'cls':
      terminal.clear();
      break;
    case 'help':
    case '?':
      cmdHelp();
      break;
    case 'pwd':
      terminal.writeln(currentDir);
      break;
    case 'cd':
      cmdCd(parts);
      break;
    case 'mkdir':
      cmdMkdir(parts);
      break;
    case 'touch':
      cmdTouch(parts);
      break;
    case 'rm':
    case 'del':
      cmdRm(parts);
      break;
    case 'git':
      cmdGit(parts);
      break;
    case 'node':
      cmdNode(parts);
      break;
    case 'npm':
      cmdNpm(parts);
      break;
    case 'whoami':
      terminal.writeln('user');
      break;
    case 'date':
      terminal.writeln(new Date().toString());
      break;
    case 'uname':
      terminal.writeln('AI-Code-Editor 2.0 (Browser)');
      break;
    default:
      terminal.writeln(`\x1b[31mbash: ${base}: command not found\x1b[0m`);
      terminal.writeln(`输入 \x1b[33mhelp\x1b[0m 查看可用命令`);
  }
}

// ─── 命令实现 ───────────────────────────────────────────
function cmdLs(parts) {
  const path = resolvePath(parts[1] || currentDir);
  const node = findNode(path);
  if (!node || node.type !== 'folder') {
    terminal.writeln(`\x1b[31mls: cannot access '${parts[1] || '.'}': No such file or directory\x1b[0m`);
    return;
  }
  const children = node.children || {};
  const names = Object.keys(children);
  if (names.length === 0) {
    terminal.writeln('\x1b[33m(empty)\x1b[0m');
    return;
  }
  const output = names.map(name => {
    const child = children[name];
    if (child.type === 'folder') {
      return `\x1b[34m${name}/\x1b[0m`;
    }
    return name;
  }).join('  ');
  terminal.writeln(output);
}

function cmdCat(parts) {
  if (!parts[1]) {
    terminal.writeln('\x1b[31mcat: missing file operand\x1b[0m');
    return;
  }
  const path = resolvePath(parts[1]);
  const node = findNode(path);
  if (!node) {
    terminal.writeln(`\x1b[31mcat: ${parts[1]}: No such file or directory\x1b[0m`);
    return;
  }
  if (node.type === 'folder') {
    terminal.writeln(`\x1b[31mcat: ${parts[1]}: Is a directory\x1b[0m`);
    return;
  }
  const lines = (node.content || '').split('\n');
  for (const line of lines) {
    terminal.writeln(line);
  }
}

function cmdEcho(parts) {
  const text = parts.slice(1).join(' ');
  // 支持简单的变量替换
  const result = text.replace(/\$(\w+)/g, (_, name) => {
    if (name === 'PWD') return currentDir;
    if (name === 'HOME') return '/';
    return '$' + name;
  });
  terminal.writeln(result);
}

function cmdCd(parts) {
  if (!parts[1] || parts[1] === '~') {
    currentDir = '/';
    return;
  }
  const path = resolvePath(parts[1]);
  const node = findNode(path);
  if (!node) {
    terminal.writeln(`\x1b[31mcd: ${parts[1]}: No such file or directory\x1b[0m`);
    return;
  }
  if (node.type !== 'folder') {
    terminal.writeln(`\x1b[31mcd: ${parts[1]}: Not a directory\x1b[0m`);
    return;
  }
  currentDir = path === '' ? '/' : path;
}

function cmdMkdir(parts) {
  if (!parts[1]) {
    terminal.writeln('\x1b[31mmkdir: missing operand\x1b[0m');
    return;
  }
  const dirName = parts[1];
  const parentPath = currentDir === '/' ? '/' : currentDir;
  const parent = findNode(parentPath);
  if (!parent || parent.type !== 'folder') {
    terminal.writeln(`\x1b[31mmkdir: cannot create directory '${dirName}': parent is not a directory\x1b[0m`);
    return;
  }
  if (!parent.children) parent.children = {};
  if (parent.children[dirName]) {
    terminal.writeln(`\x1b[31mmkdir: cannot create directory '${dirName}': File exists\x1b[0m`);
    return;
  }
  parent.children[dirName] = { name: dirName, type: 'folder', children: {} };
  terminal.writeln(`\x1b[32mCreated directory: ${dirName}\x1b[0m`);
  renderFileTree();
  persistFileSystem();
}

function cmdTouch(parts) {
  if (!parts[1]) {
    terminal.writeln('\x1b[31mtouch: missing operand\x1b[0m');
    return;
  }
  const fileName = parts[1];
  const parentPath = currentDir === '/' ? '/' : currentDir;
  const parent = findNode(parentPath);
  if (!parent || parent.type !== 'folder') {
    terminal.writeln(`\x1b[31mtouch: cannot touch '${fileName}': parent is not a directory\x1b[0m`);
    return;
  }
  if (!parent.children) parent.children = {};
  if (!parent.children[fileName]) {
    const ext = fileName.split('.').pop();
    const langMap = { js:'javascript', py:'python', html:'html', css:'css', json:'json', md:'markdown' };
    parent.children[fileName] = { name: fileName, type: 'file', content: '', language: langMap[ext] || 'plaintext' };
    terminal.writeln(`\x1b[32mCreated file: ${fileName}\x1b[0m`);
    renderFileTree();
    persistFileSystem();
  } else {
    terminal.writeln(`\x1b[33mtouch: '${fileName}' already exists\x1b[0m`);
  }
}

function cmdRm(parts) {
  if (!parts[1]) {
    terminal.writeln('\x1b[31mrm: missing operand\x1b[0m');
    return;
  }
  const name = parts[1];
  const parentPath = currentDir === '/' ? '/' : currentDir;
  const parent = findNode(parentPath);
  if (!parent?.children?.[name]) {
    terminal.writeln(`\x1b[31mrm: cannot remove '${name}': No such file or directory\x1b[0m`);
    return;
  }
  delete parent.children[name];
  terminal.writeln(`\x1b[32mRemoved: ${name}\x1b[0m`);
  renderFileTree();
  persistFileSystem();
}

function cmdHelp() {
  terminal.writeln('');
  terminal.writeln('\x1b[1;36m  AI Code Editor — 内置终端帮助\x1b[0m');
  terminal.writeln('\x1b[2m  ────────────────────────────────────────\x1b[0m');
  terminal.writeln('');
  terminal.writeln('  \x1b[33m文件操作：\x1b[0m');
  terminal.writeln('    \x1b[34mls\x1b[0m [目录]          列出文件');
  terminal.writeln('    \x1b[34mcat\x1b[0m <文件>         查看文件内容');
  terminal.writeln('    \x1b[34mcd\x1b[0m <目录>          切换目录');
  terminal.writeln('    \x1b[34mpwd\x1b[0m                 显示当前目录');
  terminal.writeln('    \x1b[34mmkdir\x1b[0m <目录>        创建目录');
  terminal.writeln('    \x1b[34mtouch\x1b[0m <文件>        创建文件');
  terminal.writeln('    \x1b[34mrm\x1b[0m <文件>          删除文件');
  terminal.writeln('');
  terminal.writeln('  \x1b[33m其他命令：\x1b[0m');
  terminal.writeln('    \x1b[34mecho\x1b[0m <文本>         输出文本');
  terminal.writeln('    \x1b[34mclear\x1b[0m               清屏');
  terminal.writeln('    \x1b[34mhelp\x1b[0m                显示此帮助');
  terminal.writeln('    \x1b[34mgit\x1b[0m <命令>          Git 操作 (status/diff/log)');
  terminal.writeln('    \x1b[34mnode\x1b[0m <文件>         运行 JS 文件（模拟）');
  terminal.writeln('    \x1b[34mnpm\x1b[0m <命令>          npm 命令（模拟）');
  terminal.writeln('    \x1b[34mwhoami\x1b[0m              显示当前用户');
  terminal.writeln('    \x1b[34mdate\x1b[0m                显示日期');
  terminal.writeln('    \x1b[34muname\x1b[0m                系统信息');
  terminal.writeln('');
  terminal.writeln('\x1b[2m  💡 提示：此终端为模拟 Shell，支持基本文件操作\x1b[0m');
  terminal.writeln('');
}

function cmdGit(parts) {
  const sub = parts[1];
  if (!sub) {
    terminal.writeln('\x1b[33mGit 模拟模式\x1b[0m');
    terminal.writeln('可用命令: \x1b[34mstatus\x1b[0m, \x1b[34mdiff\x1b[0m, \x1b[34mlog\x1b[0m, \x1b[34madd\x1b[0m, \x1b[34mcommit\x1b[0m, \x1b[34mbranch\x1b[0m');
    terminal.writeln('请使用侧边栏的 \x1b[35mGit 面板\x1b[0m 获得完整体验');
    return;
  }
  terminal.writeln(`\x1b[33mgit ${sub} 请在 Git 面板中使用完整功能\x1b[0m`);
}

function cmdNode(parts) {
  if (!parts[1]) {
    terminal.writeln('\x1b[33mNode.js 模拟模式\x1b[0m');
    terminal.writeln('提示：在编辑器中打开 .js 文件，AI 助手可以帮你运行/调试');
    return;
  }
  const path = resolvePath(parts[1]);
  const node = findNode(path);
  if (!node || node.type !== 'file') {
    terminal.writeln(`\x1b[31mError: Cannot find module '${parts[1]}'\x1b[0m`);
    return;
  }
  terminal.writeln(`\x1b[33m[模拟] 运行 ${parts[1]}...\x1b[0m`);
  terminal.writeln('\x1b[32m(模拟输出) 程序执行完成\x1b[0m');
  terminal.writeln('\x1b[2m提示：配置真实 Node.js 环境后可执行实际代码\x1b[0m');
}

function cmdNpm(parts) {
  const sub = parts[1] || 'help';
  terminal.writeln(`\x1b[33mnpm ${sub} (模拟)\x1b[0m`);
  if (sub === 'init') {
    terminal.writeln('Wrote to \x1b[36mpackage.json\x1b[0m:');
    terminal.writeln(JSON.stringify({ name: 'my-app', version: '1.0.0', description: '', main: 'index.js', scripts: { test: 'echo "Error: no test specified" && exit 1' }, author: '', license: 'ISC' }, null, 2));
  } else if (sub === 'install' || sub === 'i') {
    const pkg = parts[2] || '';
    terminal.writeln(`\x1b[32m+ ${pkg || 'all dependencies'}\x1b[0m`);
    terminal.writeln('added 0 packages in 0.5s');
  } else {
    terminal.writeln('Usage: npm <command>');
    terminal.writeln('init, install, run, test, build...');
  }
}

// ─── 路径解析 ───────────────────────────────────────────
function resolvePath(path) {
  if (!path || path === '.') return currentDir;
  if (path === '..') {
    const parts = currentDir.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  }
  if (path.startsWith('/')) return path;
  const base = currentDir === '/' ? '' : currentDir;
  return base + '/' + path;
}

// ─── 终端面板显示/隐藏 ─────────────────────────────────
function toggleTerminal() {
  const panel = document.getElementById('terminalPanel');
  if (!panel) return;
  terminalVisible = !terminalVisible;
  panel.classList.toggle('collapsed', !terminalVisible);
  if (terminalVisible) {
    if (!terminal) {
      // 动态加载 xterm.js
      loadTerminalLibs(() => { initTerminal(); });
    } else {
      setTimeout(() => { try { terminal.focus(); } catch(e) {} }, 100);
    }
    document.getElementById('btnTerminal').classList.add('active');
  } else {
    document.getElementById('btnTerminal').classList.remove('active');
  }
}

function loadTerminalLibs(callback) {
  if (window.Terminal) { callback(); return; }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
  document.head.appendChild(link);

  const script1 = document.createElement('script');
  script1.src = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js';
  script1.onload = () => {
    const script2 = document.createElement('script');
    script2.src = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js';
    script2.onload = callback;
    document.head.appendChild(script2);
  };
  document.head.appendChild(script1);
}

// ─── 将编辑器内容发送到终端（模拟运行）────────────
function runActiveFileInTerminal() {
  if (!activeFile || !editor) {
    if (terminal) terminal.writeln('\x1b[31mNo active file to run\x1b[0m');
    return;
  }
  const node = findNode(activeFile);
  if (!node || node.type !== 'file') return;
  const lang = openFiles.get(activeFile)?.language || '';
  if (terminal) {
    terminal.writeln(`\x1b[36m--- Running ${activeFile} ---\x1b[0m`);
    if (lang === 'javascript' || lang === 'typescript') {
      try {
        const code = editor.getValue();
        // 非常简单的模拟执行
        const logs = [];
        const mockConsole = { log: (...args) => logs.push(args.join(' ')) };
        terminal.writeln('\x1b[33m[模拟执行] 输出：\x1b[0m');
        logs.forEach(l => terminal.writeln(l));
        if (logs.length === 0) terminal.writeln('\x1b[2m(无 console.log 输出)\x1b[0m');
      } catch(e) {
        terminal.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
      }
    } else {
      terminal.writeln(`\x1b[33m不支持的文件类型: ${lang}\x1b[0m`);
    }
    terminal.writeln(`\x1b[36m--- Done ---\x1b[0m`);
  }
  if (!terminalVisible) toggleTerminal();
}

// 导出给全局使用
window.toggleTerminal = toggleTerminal;
window.runActiveFileInTerminal = runActiveFileInTerminal;
window.initTerminal = initTerminal;
window.termNew = termNew;
window.toggleTerminalConsole = toggleTerminalConsole;

function termNew() {
  if (terminal) {
    terminal.clear();
    terminal.writeln('\x1b[1;36m新终端\x1b[0m');
    showPrompt();
  }
}

function toggleTerminalConsole() {
  // 暂时切换到"问题"面板（未来可扩展）
  if (terminal) {
    terminal.writeln('\x1b[33m[问题面板] 暂无输出\x1b[0m');
  }
}
