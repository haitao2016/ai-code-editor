// ============================================================
// composer.js — Composer 多文件编辑模式
// Phase 3: Composer Mode
// ============================================================

// ─── Composer 状态 ───────────────────────────────────
let composerActive = false;
let composerPlan = null; // { files: [{path, original, proposed, status}] }
let composerContainer = null;

// ─── Composer UI ─────────────────────────────────────
function initComposerUI() {
  if (composerContainer) return;
  
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  composerContainer = document.createElement('div');
  composerContainer.id = 'composerPanel';
  composerContainer.className = 'composer-panel';
  composerContainer.style.display = 'none';
  composerContainer.innerHTML = `
    <div class="composer-header">
      <span class="composer-title">📝 Composer — 多文件编辑</span>
      <div class="composer-actions">
        <button onclick="composerDiscard()" title="放弃">✕</button>
      </div>
    </div>
    <div class="composer-plan" id="composerFileList"></div>
    <div class="composer-footer" id="composerFooter" style="display:none;">
      <div class="composer-summary" id="composerSummary"></div>
      <div class="composer-buttons">
        <button class="composer-btn composer-btn-reject" onclick="composerDiscard()">放弃</button>
        <button class="composer-btn composer-btn-apply" onclick="composerApplyAll()">✓ 应用所有变更</button>
      </div>
    </div>
  `;
  chatMessages.appendChild(composerContainer);

  // CSS
  if (!document.getElementById('composer-styles')) {
    const style = document.createElement('style');
    style.id = 'composer-styles';
    style.textContent = `
      .composer-panel {
        background: var(--bg-tertiary);
        border: 1px solid var(--accent);
        border-radius: 10px;
        overflow: hidden;
        margin: 8px 0;
        animation: composerSlideIn 0.3s ease;
      }
      @keyframes composerSlideIn {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .composer-header {
        background: var(--accent);
        color: white;
        padding: 8px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 13px;
        font-weight: 600;
      }
      .composer-actions button {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 3px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
      }
      .composer-actions button:hover {
        background: rgba(255,255,255,0.3);
      }
      .composer-plan {
        padding: 8px;
        max-height: 350px;
        overflow-y: auto;
      }
      .composer-file-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        margin-bottom: 6px;
        overflow: hidden;
        transition: all 0.2s;
      }
      .composer-file-card.accepted {
        border-color: var(--success);
      }
      .composer-file-card.rejected {
        border-color: var(--error);
      }
      .composer-file-header {
        padding: 8px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: background 0.15s;
      }
      .composer-file-header:hover {
        background: var(--bg-hover);
      }
      .composer-file-header .file-info {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--text-secondary);
      }
      .composer-file-header .file-icon {
        font-size: 14px;
      }
      .composer-file-header .file-status {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 3px;
      }
      .composer-file-header .file-status.modified {
        background: rgba(249,226,175,0.15);
        color: var(--warning);
      }
      .composer-file-header .file-status.created {
        background: rgba(166,227,161,0.15);
        color: var(--success);
      }
      .composer-file-header .file-status.deleted {
        background: rgba(243,139,168,0.15);
        color: var(--error);
      }
      .composer-file-header .file-actions {
        display: flex;
        gap: 4px;
      }
      .composer-file-header .file-actions button {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        color: var(--text-muted);
        cursor: pointer;
        transition: all 0.15s;
      }
      .composer-file-header .file-actions button:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .composer-file-header .file-actions button.accept-file {
        border-color: var(--success);
        color: var(--success);
      }
      .composer-file-header .file-actions button.accept-file:hover {
        background: rgba(166,227,161,0.1);
      }
      .composer-file-header .file-actions button.reject-file {
        border-color: var(--error);
        color: var(--error);
      }
      .composer-file-header .file-actions button.reject-file:hover {
        background: rgba(243,139,168,0.1);
      }
      .composer-file-diff {
        display: none;
        padding: 4px 8px 8px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 11px;
        background: var(--bg-secondary);
        max-height: 200px;
        overflow-y: auto;
      }
      .composer-file-card.expanded .composer-file-diff {
        display: block;
      }
      .composer-file-diff .diff-line {
        padding: 1px 4px;
      }
      .composer-file-diff .diff-line.removed {
        background: rgba(243,139,168,0.1);
        color: var(--error);
      }
      .composer-file-diff .diff-line.added {
        background: rgba(166,227,161,0.1);
        color: var(--success);
      }
      .composer-file-diff .diff-line.unchanged {
        color: var(--text-muted);
      }
      .composer-footer {
        border-top: 1px solid var(--border-color);
        padding: 12px 14px;
      }
      .composer-summary {
        font-size: 11px;
        color: var(--text-muted);
        margin-bottom: 10px;
      }
      .composer-buttons {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .composer-btn {
        font-size: 11px;
        padding: 6px 16px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
        border: 1px solid var(--border-color);
      }
      .composer-btn-reject {
        background: var(--bg-primary);
        color: var(--text-secondary);
      }
      .composer-btn-reject:hover {
        background: var(--bg-hover);
      }
      .composer-btn-apply {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
      }
      .composer-btn-apply:hover {
        background: var(--accent-hover);
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Composer 入口 ───────────────────────────────────
async function startComposer(intent) {
  initComposerUI();
  composerActive = true;
  composerPlan = null;

  const panel = document.getElementById('composerPanel');
  panel.style.display = 'block';

  const fileList = document.getElementById('composerFileList');
  fileList.innerHTML = `
    <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">
      AI 正在分析需求并生成变更计划...
      <div style="margin-top:8px;">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);animation:composerDot 1.4s infinite;"></span>
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);animation:composerDot 1.4s infinite 0.2s;margin:0 4px;"></span>
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);animation:composerDot 1.4s infinite 0.4s;margin:0 4px;"></span>
      </div>
    </div>
  `;

  // CSS animation
  if (!document.getElementById('composer-dot-anim')) {
    const s = document.createElement('style');
    s.id = 'composer-dot-anim';
    s.textContent = '@keyframes composerDot{0%,80%,100%{opacity:0.2}40%{opacity:1}}';
    document.head.appendChild(s);
  }

  try {
    const plan = await generateComposerPlan(intent);
    if (!composerActive) return;
    composerPlan = plan;
    renderComposerFiles();
  } catch (e) {
    fileList.innerHTML = `
      <div style="padding:12px;color:var(--error);font-size:12px;text-align:center;">
        错误: ${e.message}
      </div>`;
    composerActive = false;
  }

  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── 生成 Composer 计划 ──────────────────────────────
async function generateComposerPlan(intent) {
  // 收集工作区文件信息
  const fileInfo = [];
  function walk(node, path) {
    if (node.type === 'file') {
      fileInfo.push(`${path} (${node.content ? node.content.split('\n').length : 0} 行)`);
    }
    if (node.children) {
      for (const [k, v] of Object.entries(node.children)) {
        walk(v, path === '/' ? '/' + k : path + '/' + k);
      }
    }
  }
  if (fileSystem && fileSystem['/']) walk(fileSystem['/'], '/');

  const prompt = `你是 Composer 编辑器。根据需求生成多文件变更计划。

需求: ${intent}

当前工作区文件:
${fileInfo.join('\n')}

当前打开的文件: ${activeFile || '无'}
当前文件内容:
\`\`\`
${getFileContent(activeFile)}
\`\`\`

请以 JSON 格式返回变更计划:
{
  "summary": "变更总览",
  "files": [
    {
      "path": "/path/to/file",
      "operation": "create|modify|delete",
      "reason": "为什么要修改这个文件",
      "content": "完整的新文件内容（create/modify时）"
    }
  ]
}

注意：
- 每个文件给出完整的文件内容，不要省略
- 最多修改 5 个文件
- operation: create（创建新文件）、modify（修改现有文件）、delete（删除文件）
- 只返回 JSON，不要其他内容`;

  const resp = await callAI([{ role: 'user', content: prompt }], { temperature: 0.2, maxTokens: 8192 });
  
  let jsonStr = resp.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\w*\n/, '').replace(/\n```$/, '');
  }

  try {
    const plan = JSON.parse(jsonStr);
    // 添加原始内容和状态
    plan.files = (plan.files || []).map(f => {
      f.status = 'pending'; // pending | accepted | rejected
      if (f.operation === 'modify') {
        f.original = getFileContent(f.path);
      }
      return f;
    });
    return plan;
  } catch (e) {
    throw new Error('AI 返回了无效的 JSON，请重试');
  }
}

// ─── 渲染 Composer 文件列表 ───────────────────────────
function renderComposerFiles() {
  if (!composerPlan) return;

  const fileList = document.getElementById('composerFileList');
  const footer = document.getElementById('composerFooter');
  const summary = document.getElementById('composerSummary');

  if (composerPlan.files.length === 0) {
    fileList.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px;text-align:center;">无需修改文件</div>';
    return;
  }

  let html = '';
  if (composerPlan.summary) {
    html += `<div style="padding:6px 8px;font-size:12px;color:var(--text-secondary);border-bottom:1px solid var(--border-color);margin-bottom:4px;">${escapeHtml(composerPlan.summary)}</div>`;
  }

  composerPlan.files.forEach((f, i) => {
    const opIcon = f.operation === 'create' ? '＋' : f.operation === 'delete' ? '−' : '~';
    const opLabel = f.operation === 'create' ? '新建' : f.operation === 'delete' ? '删除' : '修改';
    const fileIcon = f.path.endsWith('/') ? '📁' : getFileIcon(f.path);

    html += `
      <div class="composer-file-card ${f.status === 'accepted' ? 'accepted' : f.status === 'rejected' ? 'rejected' : ''}" id="composer-file-${i}">
        <div class="composer-file-header" onclick="composerToggleFile(${i})">
          <div class="file-info">
            <span class="file-icon">${fileIcon}</span>
            <span>${escapeHtml(f.path)}</span>
            <span class="file-status ${f.operation}">${opIcon} ${opLabel}</span>
          </div>
          <div class="file-actions" onclick="event.stopPropagation();">
            <button class="accept-file" onclick="composerAcceptFile(${i})" title="接受">✓</button>
            <button class="reject-file" onclick="composerRejectFile(${i})" title="拒绝">✕</button>
          </div>
        </div>
        ${generateDiffHtml(f, i)}
      </div>`;
  });

  fileList.innerHTML = html;

  // 显示底部操作栏
  footer.style.display = 'block';
  const accepted = composerPlan.files.filter(f => f.status === 'accepted').length;
  const total = composerPlan.files.length;
  summary.textContent = `已接受 ${accepted}/${total} 个文件变更${accepted > 0 ? ' — 点击"应用所有变更"来执行' : ''}`;
}

function generateDiffHtml(file, index) {
  const operation = file.operation;

  if (operation === 'create') {
    const lines = (file.content || '').split('\n');
    return `<div class="composer-file-diff">
      ${lines.map(l => `<div class="diff-line added">+ ${escapeHtml(l)}</div>`).join('')}
    </div>`;
  }

  if (operation === 'delete') {
    const original = file.original || getFileContent(file.path) || '';
    const lines = original.split('\n');
    return `<div class="composer-file-diff">
      ${lines.map(l => `<div class="diff-line removed">- ${escapeHtml(l)}</div>`).join('')}
    </div>`;
  }

  // modify: show side-by-side-ish
  const oldLines = (file.original || '').split('\n');
  const newLines = (file.content || '').split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  let diffHtml = '';
  for (let i = 0; i < maxLen; i++) {
    const oldL = oldLines[i] || '';
    const newL = newLines[i] || '';
    if (oldL === newL) {
      diffHtml += `<div class="diff-line unchanged">  ${escapeHtml(oldL)}</div>`;
    } else {
      if (oldL !== undefined) diffHtml += `<div class="diff-line removed">- ${escapeHtml(oldL)}</div>`;
      if (newL !== undefined) diffHtml += `<div class="diff-line added">+ ${escapeHtml(newL)}</div>`;
    }
  }
  return `<div class="composer-file-diff">${diffHtml}</div>`;
}

// ─── Composer 操作 ───────────────────────────────────
function composerToggleFile(index) {
  const card = document.getElementById('composer-file-' + index);
  if (card) card.classList.toggle('expanded');
}

function composerAcceptFile(index) {
  if (!composerPlan || !composerPlan.files[index]) return;
  composerPlan.files[index].status = 'accepted';
  renderComposerFiles();
  // 保持展开
  setTimeout(() => {
    const card = document.getElementById('composer-file-' + index);
    if (card) card.classList.add('expanded');
  }, 50);
}

function composerRejectFile(index) {
  if (!composerPlan || !composerPlan.files[index]) return;
  composerPlan.files[index].status = 'rejected';
  renderComposerFiles();
}

function composerApplyAll() {
  if (!composerPlan) return;

  let applied = 0;
  composerPlan.files.forEach(f => {
    if (f.status !== 'accepted') return;

    const path = f.path;
    switch (f.operation) {
      case 'create': {
        const parts = path.split('/');
        const name = parts.pop();
        const dirPath = parts.join('/') || '/';
        const dir = findNode(dirPath);
        if (!dir || dir.type !== 'folder') break;
        if (!dir.children) dir.children = {};
        const ext = name.split('.').pop();
        const langMap = { js:'javascript', jsx:'javascriptreact', ts:'typescript', tsx:'typescriptreact', py:'python', html:'html', css:'css', json:'json', md:'markdown' };
        dir.children[name] = {
          name, type: 'file', content: f.content || '',
          language: langMap[ext] || 'plaintext'
        };
        applied++;
        break;
      }
      case 'modify': {
        const node = findNode(path);
        if (node && node.type === 'file') {
          node.content = f.content || '';
          if (openFiles.has(path)) {
            const model = editor.getModel();
            if (model) model.setValue(f.content || '');
          }
          applied++;
        }
        break;
      }
      case 'delete': {
        const parts = path.split('/');
        const name = parts.pop();
        const dirPath = parts.join('/') || '/';
        const dir = findNode(dirPath);
        if (dir?.children?.[name]) {
          delete dir.children[name];
          if (openFiles.has(path)) {
            closeTab(path);
          }
          applied++;
        }
        break;
      }
    }
  });

  persistFileSystem();
  renderFileTree();

  composerDiscard();
  showToast(`✅ 已应用 ${applied} 个文件变更`);
}

function composerDiscard() {
  const panel = document.getElementById('composerPanel');
  if (panel) panel.style.display = 'none';
  composerActive = false;
  composerPlan = null;
}

// ─── Chat 集成 ───────────────────────────────────────
function startComposerFromChat(intent) {
  if (!intent || intent.length < 5) {
    showToast('请提供更详细的任务描述');
    return;
  }
  if (!settings.apiEndpoint || !settings.apiKey) {
    showToast('请先在设置中配置 AI API');
    return;
  }
  startComposer(intent);
}

function getFileIcon(path) {
  const ext = path.split('.').pop()?.toLowerCase();
  const icons = { js:'🟨', jsx:'⚛️', ts:'🔷', tsx:'⚛️', py:'🐍', html:'🌐', css:'🎨', json:'📋', md:'📝', svg:'🖼', gitignore:'⚙' };
  return icons[ext] || '📄';
}

// 导出
window.startComposer = startComposer;
window.startComposerFromChat = startComposerFromChat;
window.composerToggleFile = composerToggleFile;
window.composerAcceptFile = composerAcceptFile;
window.composerRejectFile = composerRejectFile;
window.composerApplyAll = composerApplyAll;
window.composerDiscard = composerDiscard;
window.initComposerUI = initComposerUI;
