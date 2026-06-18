// ============================================================
// context.js — @ 上下文引用系统
// Phase 4: @file @folder @symbol @terminal
// ============================================================

// ─── @ 引用解析 ─────────────────────────────────────
function parseContextRefs(text) {
  const refs = {
    files: [],    // @file:path
    folders: [],  // @folder:path
    symbols: [],  // @symbol:name
    terminal: false, // @terminal
    all: []       // 所有引用（顺序保持）
  };

  // @file:path
  const fileRegex = /@file:([^\s]+)/g;
  let match;
  while ((match = fileRegex.exec(text)) !== null) {
    const path = match[1];
    const node = findNode(resolvePathSimple(path));
    if (node && node.type === 'file') {
      refs.files.push({ path: resolvePathSimple(path), content: node.content || '' });
      refs.all.push({ type: 'file', path: resolvePathSimple(path), pos: match.index });
    }
  }

  // @folder:path
  const folderRegex = /@folder:([^\s]+)/g;
  while ((match = folderRegex.exec(text)) !== null) {
    const path = match[1];
    const node = findNode(resolvePathSimple(path));
    if (node && node.type === 'folder') {
      const files = listFolderFiles(resolvePathSimple(path));
      refs.folders.push({ path: resolvePathSimple(path), files: files });
      refs.all.push({ type: 'folder', path: resolvePathSimple(path), pos: match.index });
    }
  }

  // @symbol:name
  const symbolRegex = /@symbol:([^\s]+)/g;
  while ((match = symbolRegex.exec(text)) !== null) {
    const name = match[1];
    const found = findSymbolInWorkspace(name);
    if (found.length > 0) {
      refs.symbols.push({ name, locations: found });
      refs.all.push({ type: 'symbol', name, pos: match.index });
    }
  }

  // @terminal
  if (/@terminal\b/.test(text)) {
    refs.terminal = true;
    refs.all.push({ type: 'terminal', pos: text.indexOf('@terminal') });
  }

  return refs;
}

// ─── 构建引用上下文 ──────────────────────────────────
function buildContextPrompt(text) {
  const refs = parseContextRefs(text);

  let context = '';
  let hasContext = false;

  // 文件引用
  if (refs.files.length > 0) {
    context += '\n\n📁 **引用的文件：**\n';
    refs.files.forEach(f => {
      const lines = f.content.split('\n');
      context += `\n${f.path} (${lines.length} 行):\n\`\`\`${getLangFromPath(f.path)}\n${f.content}\n\`\`\`\n`;
    });
    hasContext = true;
  }

  // 文件夹引用
  if (refs.folders.length > 0) {
    context += '\n\n📂 **引用的文件夹：**\n';
    refs.folders.forEach(f => {
      context += `\n${f.path}:\n`;
      f.files.forEach(fn => context += `  - ${fn}\n`);
    });
    hasContext = true;
  }

  // 符号引用
  if (refs.symbols.length > 0) {
    context += '\n\n🔍 **引用的符号：**\n';
    refs.symbols.forEach(s => {
      context += `\n符号 "${s.name}" 在以下位置找到:\n`;
      s.locations.forEach(loc => context += `  - ${loc.path}: ${loc.context}\n`);
    });
    hasContext = true;
  }

  // 终端引用
  if (refs.terminal) {
    context += '\n\n💻 **终端输出已附加**（最近的命令输出将在提问中体现）\n';
    hasContext = true;
  }

  return hasContext ? context : '';
}

// ─── 文件路径解析（简化版）──────────────────────────
function resolvePathSimple(path) {
  if (!path) return '/';
  if (path === '.') return currentDir || '/';
  if (path === '..') {
    const parts = (currentDir || '/').split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  }
  if (path.startsWith('/')) return path;
  const base = (currentDir || '/') === '/' ? '' : (currentDir || '/');
  return base + '/' + path;
}

function getLangFromPath(path) {
  const ext = (path || '').split('.').pop()?.toLowerCase();
  const map = { js:'javascript', jsx:'jsx', ts:'typescript', tsx:'tsx', py:'python', html:'html', css:'css', json:'json', md:'markdown', sql:'sql', xml:'xml', yaml:'yaml', yml:'yaml', sh:'bash' };
  return map[ext] || '';
}

// ─── 列出文件夹中的文件 ──────────────────────────────
function listFolderFiles(folderPath) {
  const files = [];
  const node = findNode(folderPath);
  if (!node || node.type !== 'folder') return files;

  function walk(n, p) {
    if (n.type === 'file') {
      files.push(p);
    } else if (n.children) {
      for (const [k, v] of Object.entries(n.children)) {
        walk(v, p === '/' ? '/' + k : p + '/' + k);
      }
    }
  }
  walk(node, folderPath);
  return files;
}

// ─── 查找工作区中的符号 ─────────────────────────────
function findSymbolInWorkspace(name) {
  const results = [];

  function walk(node, path) {
    if (node.type === 'file' && node.content) {
      const lines = node.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 检查函数定义
        const funcMatch = line.match(/(?:function|class|const|let|var|def|async)\s+[\w$]*\b('?${name}'?)/);
        // 用字符串包含检测
        if (line.includes(name) && (
          line.includes('function') || line.includes('class ') ||
          line.includes('const ') || line.includes('let ') ||
          line.includes('def ') || line.includes('export ') ||
          line.includes('interface ') || line.includes('type ')
        )) {
          const context = line.trim().substring(0, 80);
          results.push({ path, line: i + 1, context });
        }
      }
    }
    if (node.children) {
      for (const [k, v] of Object.entries(node.children)) {
        walk(v, path === '/' ? '/' + k : path + '/' + k);
      }
    }
  }
  if (fileSystem && fileSystem['/']) walk(fileSystem['/'], '/');
  return results;
}

// ─── @ 自动补全 UI ─────────────────────────────────
let autocompleteVisible = false;
let autocompleteItems = [];
let autocompleteSelected = -1;
let autocompleteTarget = null;
let autocompletePrefix = '';

function initAutocomplete() {
  const input = document.getElementById('chatInput');
  if (!input) return;

  // 创建 autocomplete dropdown
  let dropdown = document.getElementById('atAutocomplete');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'atAutocomplete';
    dropdown.className = 'at-autocomplete';
    document.querySelector('.chat-input-area').appendChild(dropdown);

    const style = document.createElement('style');
    style.textContent = `
      .at-autocomplete {
        position: absolute;
        bottom: 100%;
        left: 14px;
        right: 14px;
        background: var(--bg-tertiary);
        border: 1px solid var(--accent);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        max-height: 200px;
        overflow-y: auto;
        display: none;
        z-index: 100;
      }
      .at-autocomplete.show {
        display: block;
      }
      .at-autocomplete .at-item {
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-secondary);
        transition: all 0.1s;
      }
      .at-autocomplete .at-item:hover,
      .at-autocomplete .at-item.selected {
        background: var(--accent-light);
        color: var(--accent);
      }
      .at-autocomplete .at-item .at-icon {
        font-size: 14px;
        width: 18px;
        text-align: center;
      }
      .at-autocomplete .at-item .at-path {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: var(--text-muted);
        margin-left: auto;
      }
      .at-autocomplete .at-category {
        padding: 4px 12px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-muted);
        letter-spacing: 0.5px;
        border-bottom: 1px solid var(--border-color);
        margin-bottom: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  input.addEventListener('input', (e) => {
    const text = e.target.value;
    const cursorPos = input.selectionStart;
    const beforeCursor = text.substring(0, cursorPos);

    // 检测 @ 触发
    const atMatch = beforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      const prefix = atMatch[1].toLowerCase();
      autocompletePrefix = prefix;
      autocompleteTarget = input;
      showAutocomplete(prefix, cursorPos);
    } else {
      hideAutocomplete();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (!autocompleteVisible) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      autocompleteSelected = Math.min(autocompleteSelected + 1, autocompleteItems.length - 1);
      renderAutocomplete();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      autocompleteSelected = Math.max(autocompleteSelected - 1, 0);
      renderAutocomplete();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (autocompleteSelected >= 0 && autocompleteSelected < autocompleteItems.length) {
        e.preventDefault();
        applyAutocomplete(autocompleteItems[autocompleteSelected]);
      }
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  });
}

function showAutocomplete(prefix, cursorPos) {
  const items = [];
  const lcPrefix = prefix.toLowerCase();

  // @file: 补全
  const fileItems = [];
  function walk(node, path) {
    if (node.name && node.name.toLowerCase().includes(lcPrefix)) {
      if (node.type === 'file') {
        fileItems.push({ type: 'file', name: node.name, path, icon: '📄' });
      } else if (node.type === 'folder') {
        items.push({ type: 'folder', name: node.name, path, icon: '📁' });
      }
    }
    if (node.children) {
      for (const [k, v] of Object.entries(node.children)) {
        walk(v, path === '/' ? '/' + k : path + '/' + k);
      }
    }
  }
  if (fileSystem && fileSystem['/']) walk(fileSystem['/'], '/');

  // 文件优先
  items.push(...fileItems.slice(0, 8));

  // @symbol: 补全（从当前打开文件中查找）
  if (activeFile) {
    const node = findNode(activeFile);
    if (node?.content) {
      const lines = node.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const funcMatch = line.match(/(?:function|class|const|let|var|def|async|export|interface|type)\s+(\w+)/);
        if (funcMatch && funcMatch[1].toLowerCase().includes(lcPrefix)) {
          items.push({ type: 'symbol', name: funcMatch[1], path: activeFile, icon: '🔧' });
        }
      }
    }
  }

  // @terminal
  if ('terminal'.includes(lcPrefix)) {
    items.push({ type: 'terminal', name: '终端输出', icon: '💻' });
  }

  if (items.length === 0) {
    hideAutocomplete();
    return;
  }

  autocompleteItems = items;
  autocompleteSelected = 0;
  autocompleteVisible = true;
  renderAutocomplete();
}

function renderAutocomplete() {
  const dropdown = document.getElementById('atAutocomplete');
  if (!dropdown) return;

  dropdown.classList.add('show');

  let html = '';
  let lastType = '';

  autocompleteItems.forEach((item, i) => {
    const typeLabel = { file: '文件', folder: '文件夹', symbol: '符号', terminal: '系统' }[item.type] || '';
    if (typeLabel !== lastType) {
      html += `<div class="at-category">${typeLabel}</div>`;
      lastType = typeLabel;
    }
    const prefix = item.type === 'file' ? '@file:' : item.type === 'folder' ? '@folder:' : item.type === 'symbol' ? '@symbol:' : '@';
    html += `
      <div class="at-item${i === autocompleteSelected ? ' selected' : ''}"
           onmousedown="event.preventDefault(); applyAutocompleteItem(${i})">
        <span class="at-icon">${item.icon}</span>
        <span>${escapeHtml(item.name)}</span>
        <span class="at-path">${prefix}${escapeHtml(item.path || item.name)}</span>
      </div>`;
  });

  dropdown.innerHTML = html;
}

function hideAutocomplete() {
  autocompleteVisible = false;
  autocompleteItems = [];
  autocompleteSelected = -1;
  const dropdown = document.getElementById('atAutocomplete');
  if (dropdown) dropdown.classList.remove('show');
}

function applyAutocomplete(item) {
  if (!autocompleteTarget) return;
  const input = autocompleteTarget;
  const text = input.value;
  const cursorPos = input.selectionStart;
  const beforeCursor = text.substring(0, cursorPos);
  const afterCursor = text.substring(cursorPos);
  const atIndex = beforeCursor.lastIndexOf('@');

  let replacement = '';
  switch (item.type) {
    case 'file': replacement = `@file:${item.path} `; break;
    case 'folder': replacement = `@folder:${item.path} `; break;
    case 'symbol': replacement = `@symbol:${item.name} `; break;
    case 'terminal': replacement = '@terminal '; break;
  }

  const newBefore = beforeCursor.substring(0, atIndex) + replacement;
  input.value = newBefore + afterCursor;
  const newCursor = newBefore.length;
  input.setSelectionRange(newCursor, newCursor);
  input.focus();
  hideAutocomplete();
}

function applyAutocompleteItem(index) {
  if (index >= 0 && index < autocompleteItems.length) {
    applyAutocomplete(autocompleteItems[index]);
  }
}

// ─── 增强 getChatContext 来支持 @ 引用 ───────────────
function enhancedGetChatContext() {
  const text = document.getElementById('chatInput')?.value || '';
  const refs = parseContextRefs(text);
  const contextParts = [];

  // 当前编辑器上下文
  if (activeFile && editor) {
    const selection = editor.getSelection();
    const selectedText = selection ? editor.getModel().getValueInRange(selection) : '';
    if (selectedText) {
      contextParts.push(`\n当前选中的代码 (${activeFile}):\n\`\`\`\n${selectedText}\n\`\`\``);
    } else {
      const model = editor.getModel();
      if (model) {
        contextParts.push(`\n当前文件 ${activeFile}:\n\`\`\`\n${model.getValue()}\n\`\`\``);
      }
    }
  }

  // @ 引用上下文
  if (refs.files.length > 0) {
    refs.files.forEach(f => {
      contextParts.push(`\n引用文件 ${f.path}:\n\`\`\`\n${f.content}\n\`\`\``);
    });
  }

  if (refs.symbols.length > 0) {
    refs.symbols.forEach(s => {
      contextParts.push(`\n符号 "${s.name}" 引用位置:\n${s.locations.map(l => `  ${l.path}:${l.line} — ${l.context}`).join('\n')}`);
    });
  }

  return contextParts.join('\n');
}

// 导出
window.parseContextRefs = parseContextRefs;
window.buildContextPrompt = buildContextPrompt;
window.initAutocomplete = initAutocomplete;
window.hideAutocomplete = hideAutocomplete;
window.applyAutocompleteItem = applyAutocompleteItem;
window.enhancedGetChatContext = enhancedGetChatContext;
