// ============================================================
// preview.js — 实时预览 + Linter + Problem 面板
// Phase 5: Live Preview & Linter
// ============================================================

// ─── 预览状态 ───────────────────────────────────────
let previewActive = false;
let previewUrl = '';
let previewMode = 'html'; // html | web

// ─── 初始化预览 ───────────────────────────────────────
function initPreview() {
  // 创建预览面板
  let previewPanel = document.getElementById('previewPanel');
  if (!previewPanel) {
    previewPanel = document.createElement('div');
    previewPanel.id = 'previewPanel';
    previewPanel.className = 'preview-panel';
    previewPanel.style.display = 'none';
    previewPanel.innerHTML = `
      <div class="preview-toolbar">
        <div class="preview-toolbar-left">
          <select id="previewMode" onchange="switchPreviewMode(this.value)">
            <option value="html">HTML 预览</option>
            <option value="web">网页预览</option>
          </select>
          <button onclick="refreshPreview()" title="刷新">↻</button>
          <span class="preview-url" id="previewUrlLabel"></span>
        </div>
        <div class="preview-toolbar-right">
          <button onclick="openPreviewInNewTab()" title="在新标签页打开">↗</button>
          <button onclick="togglePreviewPanel()" title="关闭">✕</button>
        </div>
      </div>
      <div class="preview-container">
        <iframe id="previewFrame" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
    `;

    // 插入到 main-container 和 terminal-panel 之间
    const workspace = document.getElementById('workspace');
    if (workspace) {
      // 找到 terminal panel 并在其前面插入
      const terminalPanel = document.getElementById('terminalPanel');
      if (terminalPanel) {
        workspace.insertBefore(previewPanel, terminalPanel);
      } else {
        workspace.appendChild(previewPanel);
      }
    }

    // CSS
    const style = document.createElement('style');
    style.textContent = `
      .preview-panel {
        height: 300px;
        background: var(--bg-tertiary);
        border-top: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        transition: height 0.2s;
      }
      .preview-toolbar {
        height: 32px;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 8px;
        font-size: 11px;
      }
      .preview-toolbar-left,
      .preview-toolbar-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .preview-toolbar select {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        outline: none;
      }
      .preview-toolbar button {
        background: none;
        border: none;
        color: var(--text-muted);
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
      }
      .preview-toolbar button:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .preview-url {
        color: var(--text-muted);
        font-size: 10px;
        font-family: monospace;
        max-width: 300px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .preview-container {
        flex: 1;
        overflow: hidden;
        background: white;
      }
      .preview-container iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: white;
      }

      /* Problem 面板 */
      .problem-panel {
        position: fixed;
        bottom: 60px;
        right: 20px;
        width: 420px;
        max-height: 300px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 100;
        display: none;
        flex-direction: column;
        overflow: hidden;
      }
      .problem-panel.show {
        display: flex;
      }
      .problem-header {
        padding: 8px 14px;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
      }
      .problem-header .problem-count {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 10px;
      }
      .problem-header .problem-count.errors {
        background: rgba(243,139,168,0.15);
        color: var(--error);
      }
      .problem-header .problem-count.warnings {
        background: rgba(249,226,175,0.15);
        color: var(--warning);
      }
      .problem-header .problem-count.info {
        background: rgba(137,180,250,0.15);
        color: var(--info);
      }
      .problem-header button {
        background: none;
        border: none;
        color: var(--text-muted);
        width: 22px;
        height: 22px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .problem-header button:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .problem-list {
        flex: 1;
        overflow-y: auto;
        padding: 4px;
      }
      .problem-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.1s;
      }
      .problem-item:hover {
        background: var(--bg-hover);
      }
      .problem-item .problem-icon {
        font-size: 13px;
        margin-top: 1px;
        flex-shrink: 0;
      }
      .problem-item .problem-icon.error { color: var(--error); }
      .problem-item .problem-icon.warning { color: var(--warning); }
      .problem-item .problem-icon.info { color: var(--info); }
      .problem-item .problem-content {
        flex: 1;
        min-width: 0;
      }
      .problem-item .problem-message {
        color: var(--text-secondary);
      }
      .problem-item .problem-location {
        font-size: 10px;
        color: var(--text-muted);
        margin-top: 2px;
      }
      .problem-empty {
        padding: 20px;
        text-align: center;
        color: var(--text-muted);
        font-size: 12px;
      }

      /* Linter 配置面板 */
      .linter-config {
        margin-top: 12px;
        padding: 12px;
        background: var(--bg-primary);
        border-radius: 8px;
        border: 1px solid var(--border-color);
      }
      .linter-config .linter-title {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--text-primary);
      }
      .linter-config .linter-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 0;
        border-bottom: 1px solid var(--border-color);
      }
      .linter-config .linter-row:last-child {
        border-bottom: none;
      }
      .linter-config label {
        font-size: 11px;
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .linter-config input[type="checkbox"] {
        accent-color: var(--accent);
      }
      .linter-config select {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        outline: none;
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── 预览功能 ───────────────────────────────────────
function togglePreviewPanel() {
  initPreview();
  const panel = document.getElementById('previewPanel');
  if (!panel) return;

  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'flex';
    previewActive = true;
    refreshPreview();
    document.getElementById('btnPreview')?.classList.add('active');
  } else {
    panel.style.display = 'none';
    previewActive = false;
    document.getElementById('btnPreview')?.classList.remove('active');
  }
}

function switchPreviewMode(mode) {
  previewMode = mode;
  refreshPreview();
}

function refreshPreview() {
  const frame = document.getElementById('previewFrame');
  if (!frame) return;

  if (previewMode === 'html') {
    // 使用当前编辑器的 HTML 内容
    if (activeFile && activeFile.endsWith('.html')) {
      const node = findNode(activeFile);
      if (node?.content) {
        frame.srcdoc = node.content;
        document.getElementById('previewUrlLabel').textContent = activeFile;
        return;
      }
    }

    // 查找项目中的 HTML 文件
    const htmlFiles = [];
    function walk(node, path) {
      if (node.type === 'file' && (node.name.endsWith('.html') || node.name.endsWith('.htm'))) {
        htmlFiles.push({ path, node });
      }
      if (node.children) {
        for (const [k, v] of Object.entries(node.children)) {
          walk(v, path === '/' ? '/' + k : path + '/' + k);
        }
      }
    }
    if (fileSystem && fileSystem['/']) walk(fileSystem['/'], '/');

    if (htmlFiles.length > 0) {
      frame.srcdoc = htmlFiles[0].node.content;
      document.getElementById('previewUrlLabel').textContent = htmlFiles[0].path;
    } else {
      frame.srcdoc = '<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:sans-serif;color:#666;"><div>没有找到 HTML 文件<br><small>创建一个 .html 文件来预览</small></div></body></html>';
      document.getElementById('previewUrlLabel').textContent = '—';
    }
  } else {
    // Web 预览模式：组合 HTML + CSS + JS
    const htmlCollection = buildWebPreview();
    frame.srcdoc = htmlCollection;
    document.getElementById('previewUrlLabel').textContent = activeFile || '网页预览';
  }
}

function buildWebPreview() {
  // 查找项目中的 HTML, CSS, JS 文件并组合
  function findFileByExt(ext) {
    const results = [];
    function walk(node, path) {
      if (node.type === 'file' && node.name.endsWith(ext)) {
        results.push({ path, content: node.content || '' });
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

  const htmlFiles = findFileByExt('.html');
  const cssFiles = findFileByExt('.css');
  const jsFiles = findFileByExt('.js');

  // 使用第一个 HTML 文件作为基础
  let html = htmlFiles[0]?.content || '<!DOCTYPE html>\n<html><head></head><body></body></html>';

  // 内联 CSS
  let cssContent = '';
  cssFiles.forEach(f => {
    cssContent += `/* ${f.path} */\n${f.content}\n`;
  });
  if (cssContent) {
    html = html.replace('</head>', `<style>\n${cssContent}\n</style>\n</head>`);
  }

  // 内联 JS
  let jsContent = '';
  jsFiles.forEach(f => {
    jsContent += `// ${f.path}\n${f.content};\n`;
  });
  if (jsContent) {
    html = html.replace('</body>', `<script>\n${jsContent}\n</script>\n</body>`);
  }

  return html;
}

function openPreviewInNewTab() {
  const frame = document.getElementById('previewFrame');
  if (!frame || !frame.srcdoc) return;

  const blob = new Blob([frame.srcdoc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// ─── Linter ──────────────────────────────────────────
let linterConfig = {
  enabled: true,
  strictMode: false,
  maxLineLength: 120,
  noConsole: false,
  checkIndentation: true,
  checkSemicolons: true
};

let problems = [];

function initLinter() {
  // 创建 Problem 面板
  let problemPanel = document.getElementById('problemPanel');
  if (!problemPanel) {
    problemPanel = document.createElement('div');
    problemPanel.id = 'problemPanel';
    problemPanel.className = 'problem-panel';
    problemPanel.innerHTML = `
      <div class="problem-header">
        <span>🔍 问题</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="problem-count" id="problemCountErrors">0</span>
          <span class="problem-count" id="problemCountWarnings">0</span>
          <button onclick="runLinter()" title="重新检查">↻</button>
          <button onclick="toggleProblemPanel()" title="关闭">✕</button>
        </div>
      </div>
      <div class="problem-list" id="problemList"></div>
    `;
    document.body.appendChild(problemPanel);
  }

  // 监听编辑器变化（自动 lint）
  if (editor) {
    editor.onDidChangeModelContent(() => {
      if (linterConfig.enabled) {
        clearTimeout(window._lintTimeout);
        window._lintTimeout = setTimeout(() => runLinter(), 800);
      }
    });

    editor.onDidChangeModel(() => {
      if (linterConfig.enabled) {
        clearTimeout(window._lintTimeout);
        window._lintTimeout = setTimeout(() => runLinter(), 300);
      }
    });
  }
}

function runLinter() {
  if (!editor || !activeFile) {
    problems = [];
    renderProblems();
    return;
  }

  problems = [];
  const code = editor.getValue();
  const lines = code.split('\n');
  const lang = openFiles.get(activeFile)?.language || '';

  // 通用检查
  lines.forEach((line, i) => {
    const lineNum = i + 1;

    // 行长度
    if (linterConfig.maxLineLength && line.length > linterConfig.maxLineLength) {
      problems.push({
        type: 'warning',
        message: `行太长 (${line.length}/${linterConfig.maxLineLength})`,
        line: lineNum,
        column: linterConfig.maxLineLength + 1,
        file: activeFile
      });
    }

    // 尾随空格
    if (line.match(/[ \t]+$/)) {
      problems.push({
        type: 'info',
        message: '行尾多余空格',
        line: lineNum,
        column: line.length,
        file: activeFile
      });
    }

    // 缩进检查
    if (linterConfig.checkIndentation && line.match(/^\t/)) {
      problems.push({
        type: 'info',
        message: '检测到 Tab 缩进，建议使用空格',
        line: lineNum,
        column: 1,
        file: activeFile
      });
    }
  });

  // 语言特定检查
  switch (lang) {
    case 'javascript':
    case 'typescript':
    case 'javascriptreact':
    case 'typescriptreact':
      lintJavaScript(code, lines, lang);
      break;
    case 'python':
      lintPython(code, lines);
      break;
    case 'html':
      lintHTML(code, lines);
      break;
    case 'css':
      lintCSS(code, lines);
      break;
  }

  renderProblems();
  updateStatusBarProblems();
}

function lintJavaScript(code, lines, lang) {
  // 检查 console.log
  if (linterConfig.noConsole && code.includes('console.')) {
    const re = /console\./g;
    let match;
    while ((match = re.exec(code)) !== null) {
      const lineNum = code.substring(0, match.index).split('\n').length;
      problems.push({
        type: 'warning',
        message: '检测到 console 语句',
        line: lineNum,
        column: match.index,
        file: activeFile
      });
    }
  }

  // 检查分号
  if (linterConfig.checkSemicolons) {
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') &&
          !trimmed.startsWith('*') && !trimmed.startsWith('import') &&
          !trimmed.startsWith('export') && !trimmed.endsWith('{') &&
          !trimmed.endsWith('}') && !trimmed.endsWith(';') &&
          !trimmed.endsWith(',') && !trimmed.endsWith(':') &&
          !trimmed.endsWith('[') && !trimmed.endsWith('(') &&
          !trimmed.endsWith('`') && !trimmed.startsWith('//') &&
          !trimmed.match(/^(if|for|while|switch|catch|function|class|try|else)$/)) {
        problems.push({
          type: 'info',
          message: '语句可能缺少分号',
          line: i + 1,
          column: line.length,
          file: activeFile
        });
      }
    });
  }

  // 检查 var 使用
  if (code.includes('var ')) {
    const re = /\bvar\s+/g;
    let match;
    while ((match = re.exec(code)) !== null) {
      const lineNum = code.substring(0, match.index).split('\n').length;
      problems.push({
        type: 'warning',
        message: '建议使用 const 或 let 代替 var',
        line: lineNum,
        column: match.index,
        file: activeFile
      });
    }
  }

  // 检查 ==
  if (code.match(/[^=!<>]==[^=]/)) {
    const re = /(?<![=!<>])==(?!=)/g;
    let match;
    while ((match = re.exec(code)) !== null) {
      const lineNum = code.substring(0, match.index).split('\n').length;
      problems.push({
        type: 'warning',
        message: '建议使用 === 代替 ==',
        line: lineNum,
        column: match.index,
        file: activeFile
      });
    }
  }
}

function lintPython(code, lines) {
  // 空行过多
  let emptyCount = 0;
  lines.forEach((line, i) => {
    if (line.trim() === '') {
      emptyCount++;
      if (emptyCount > 2) {
        problems.push({
          type: 'info',
          message: '连续空行过多',
          line: i + 1,
          column: 1,
          file: activeFile
        });
      }
    } else {
      emptyCount = 0;
    }
  });

  // __main__ 检查
  lines.forEach((line, i) => {
    if (line.includes('__name__') && !line.includes("'__main__'")) {
      problems.push({
        type: 'info',
        message: '建议使用 if __name__ == "__main__" 块',
        line: i + 1,
        column: 1,
        file: activeFile
      });
    }
  });
}

function lintHTML(code, lines) {
  // 检查 DOCTYPE
  if (!code.trim().toLowerCase().startsWith('<!doctype')) {
    problems.push({
      type: 'warning',
      message: '建议添加 DOCTYPE 声明',
      line: 1,
      column: 1,
      file: activeFile
    });
  }

  // 检查 viewport meta
  if (code.includes('<head>') && !code.includes('viewport')) {
    problems.push({
      type: 'info',
      message: '建议添加 viewport meta 标签以支持移动端',
      line: 1,
      column: 1,
      file: activeFile
    });
  }
}

function lintCSS(code, lines) {
  // 检查空规则集
  const emptyRuleRe = /[^{}]+\{\s*\}/g;
  let match;
  while ((match = emptyRuleRe.exec(code)) !== null) {
    const lineNum = code.substring(0, match.index).split('\n').length;
    problems.push({
      type: 'warning',
      message: '空的 CSS 规则集',
      line: lineNum,
      column: match.index,
      file: activeFile
    });
  }
}

function renderProblems() {
  const list = document.getElementById('problemList');
  if (!list) return;

  if (problems.length === 0) {
    list.innerHTML = '<div class="problem-empty">✓ 没有问题</div>';
  } else {
    list.innerHTML = problems.map((p, i) => `
      <div class="problem-item" onclick="goToProblem(${i})">
        <div class="problem-icon ${p.type}">${p.type === 'error' ? '✕' : p.type === 'warning' ? '⚠' : 'ℹ'}</div>
        <div class="problem-content">
          <div class="problem-message">${escapeHtml(p.message)}</div>
          <div class="problem-location">${p.file || activeFile} — 第 ${p.line} 行</div>
        </div>
      </div>
    `).join('');
  }
}

function goToProblem(index) {
  const p = problems[index];
  if (!p) return;

  if (p.file !== activeFile) {
    pickFile(p.file);
    // 等待文件打开后再跳转
    setTimeout(() => {
      editor.revealLineInCenter(p.line);
      editor.setPosition({ lineNumber: p.line, column: p.column || 1 });
    }, 300);
  } else {
    editor.revealLineInCenter(p.line);
    editor.setPosition({ lineNumber: p.line, column: p.column || 1 });
    editor.focus();
  }
}

function updateStatusBarProblems() {
  const errors = problems.filter(p => p.type === 'error').length;
  const warnings = problems.filter(p => p.type === 'warning').length;
  const statusErrors = document.getElementById('statusErrors');

  if (errors > 0) {
    statusErrors.innerHTML = `<span style="color:#f38ba8;">✕ ${errors} 错误</span>`;
    if (warnings > 0) statusErrors.innerHTML += ` <span style="color:rgba(255,255,255,0.5);">⚠ ${warnings}</span>`;
  } else if (warnings > 0) {
    statusErrors.innerHTML = `<span style="color:rgba(255,255,255,0.7);">⚠ ${warnings} 警告</span>`;
  } else {
    statusErrors.textContent = '✓ 0 问题';
  }

  // 更新 Problem 面板计数
  document.getElementById('problemCountErrors').textContent = errors;
  document.getElementById('problemCountWarnings').textContent = warnings;
  document.getElementById('problemCountErrors').className = 'problem-count ' + (errors > 0 ? 'errors' : '');
  document.getElementById('problemCountWarnings').className = 'problem-count ' + (warnings > 0 ? 'warnings' : '');
}

function toggleProblemPanel() {
  const panel = document.getElementById('problemPanel');
  if (!panel) return;
  panel.classList.toggle('show');
  if (panel.classList.contains('show')) {
    runLinter();
  }
}

// ─── Linter 设置注入设置面板 ─────────────────────────
function initLinterConfigUI() {
  const settingsBody = document.querySelector('#settingsModal .modal-body');
  if (!settingsBody) return;

  // 检查是否已添加
  if (document.getElementById('linterConfigGroup')) return;

  const group = document.createElement('div');
  group.id = 'linterConfigGroup';
  group.className = 'setting-group';
  group.innerHTML = `
    <div class="setting-label">Linter 配置</div>
    <div class="linter-config">
      <div class="linter-row">
        <label><input type="checkbox" id="lintEnabled" ${linterConfig.enabled ? 'checked' : ''}> 启用 Linter</label>
      </div>
      <div class="linter-row">
        <label><input type="checkbox" id="lintStrict" ${linterConfig.strictMode ? 'checked' : ''}> 严格模式</label>
      </div>
      <div class="linter-row">
        <label><input type="checkbox" id="lintNoConsole" ${linterConfig.noConsole ? 'checked' : ''}> 禁止 console</label>
      </div>
      <div class="linter-row">
        <label><input type="checkbox" id="lintSemicolons" ${linterConfig.checkSemicolons ? 'checked' : ''}> 检查分号</label>
      </div>
      <div class="linter-row">
        <label><input type="checkbox" id="lintIndentation" ${linterConfig.checkIndentation ? 'checked' : ''}> 检查缩进</label>
      </div>
      <div class="linter-row">
        <label>最大行长度</label>
        <select id="lintMaxLine">
          <option value="80" ${linterConfig.maxLineLength === 80 ? 'selected' : ''}>80</option>
          <option value="100" ${linterConfig.maxLineLength === 100 ? 'selected' : ''}>100</option>
          <option value="120" ${linterConfig.maxLineLength === 120 ? 'selected' : ''}>120</option>
          <option value="0" ${linterConfig.maxLineLength === 0 ? 'selected' : ''}>不限</option>
        </select>
      </div>
    </div>
  `;
  settingsBody.appendChild(group);

  // 事件绑定
  document.getElementById('lintEnabled').onchange = (e) => { linterConfig.enabled = e.target.checked; saveLinterConfig(); };
  document.getElementById('lintStrict').onchange = (e) => { linterConfig.strictMode = e.target.checked; saveLinterConfig(); };
  document.getElementById('lintNoConsole').onchange = (e) => { linterConfig.noConsole = e.target.checked; saveLinterConfig(); };
  document.getElementById('lintSemicolons').onchange = (e) => { linterConfig.checkSemicolons = e.target.checked; saveLinterConfig(); };
  document.getElementById('lintIndentation').onchange = (e) => { linterConfig.checkIndentation = e.target.checked; saveLinterConfig(); };
  document.getElementById('lintMaxLine').onchange = (e) => { linterConfig.maxLineLength = parseInt(e.target.value); saveLinterConfig(); };
}

function saveLinterConfig() {
  localStorage.setItem('ai-code-editor-linter', JSON.stringify(linterConfig));
}

function loadLinterConfig() {
  try {
    const saved = localStorage.getItem('ai-code-editor-linter');
    if (saved) linterConfig = { ...linterConfig, ...JSON.parse(saved) };
  } catch(e) {}
}

// 导出
window.togglePreviewPanel = togglePreviewPanel;
window.refreshPreview = refreshPreview;
window.switchPreviewMode = switchPreviewMode;
window.openPreviewInNewTab = openPreviewInNewTab;
window.runLinter = runLinter;
window.toggleProblemPanel = toggleProblemPanel;
window.goToProblem = goToProblem;
window.initPreview = initPreview;
window.initLinter = initLinter;
window.initLinterConfigUI = initLinterConfigUI;
window.loadLinterConfig = loadLinterConfig;
