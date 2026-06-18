// ============================================================
// git.js — isomorphic-git Git 集成
// Phase1: Git 面板
// ============================================================

// ── Git 状态 ──────────────────────────────────────
let gitInitialized = false;
let gitCurrentBranch = 'main';
let gitStagedFiles = [];
let gitUnstagedFiles = [];

// ── 初始化 Git（模拟）────────────────────────────
function initGitPanel() {
  renderGitPanel();
}

function renderGitPanel() {
  const container = document.getElementById('gitPanel');
  if (!container) return;

  if (!gitInitialized) {
    container.innerHTML = `
      <div style="padding:16px 12px; color:var(--text-muted); font-size:12px; text-align:center;">
        <div style="font-size:28px; margin-bottom:8px; opacity:0.4;">⌥</div>
        <div style="margin-bottom:8px;">此工作区尚未初始化 Git</div>
        <button onclick="gitInit()" style="background:var(--accent); color:white; border:none; padding:6px 16px; border-radius:6px; cursor:pointer; font-size:12px;">初始化 Git 仓库</button>
      </div>`;
    return;
  }

  // 显示 Git 状态
  let html = '';

  // 当前分支
  html += `<div style="padding:8px 12px; font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
    <span style="color:var(--success);">●</span> ${gitCurrentBranch}
  </div>`;

  // 提交按钮
  html += `<div style="padding:8px 12px;">
    <input type="text" id="gitCommitMsg" placeholder="提交消息" style="width:100%; padding:6px 8px; border-radius:6px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-primary); font-size:12px; outline:none; margin-bottom:6px;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border-color)'">
    <button onclick="gitCommit()" style="width:100%; background:var(--accent); color:white; border:none; padding:6px; border-radius:6px; cursor:pointer; font-size:12px;">提交</button>
  </div>`;

  // 文件变更
  const staged = gitStagedFiles;
  const unstaged = gitUnstagedFiles;

  if (unstaged.length > 0) {
    html += `<div style="padding:4px 12px; font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">更改</div>`;
    unstaged.forEach(f => {
      html += `<div class="git-file-item" style="padding:3px 12px 3px 20px; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--text-secondary);" onmouseenter="this.style.background='var(--bg-hover)'" onmouseleave="this.style.background='none'" onclick="gitStageFile('${f.path.replace(/'/g, "\\'")}')">
        <span style="color:var(--warning); font-size:10px;">M</span>
        <span>${f.name}</span>
      </div>`;
    });
  }

  if (staged.length > 0) {
    html += `<div style="padding:4px 12px; font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-top:4px;">暂存</div>`;
    staged.forEach(f => {
      html += `<div class="git-file-item" style="padding:3px 12px 3px 20px; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--text-secondary);" onmouseenter="this.style.background='var(--bg-hover)'" onmouseleave="this.style.background='none'" onclick="gitUnstageFile('${f.path.replace(/'/g, "\\'")}')">
        <span style="color:var(--success); font-size:10px;">A</span>
        <span>${f.name}</span>
      </div>`;
    });
  }

  if (unstaged.length === 0 && staged.length === 0) {
    html += `<div style="padding:16px 12px; color:var(--text-muted); font-size:12px; text-align:center;">✓ 工作区干净</div>`;
  }

  // 提交历史
  html += `<div style="padding:8px 12px; font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-top:8px; border-top:1px solid var(--border-color); padding-top:8px;">最近提交</div>`;
  html += `<div id="gitLog" style="padding:0 12px 8px; font-size:11px; color:var(--text-muted);">点击"初始化"开始使用 Git</div>`;

  container.innerHTML = html;
}

// ── Git 操作（模拟）──────────────────────────────
function gitInit() {
  gitInitialized = true;
  gitCurrentBranch = 'main';
  gitStagedFiles = [];
  gitUnstagedFiles = gitScanWorkingTree();
  renderGitPanel();
  showToast('Git 仓库已初始化');
  document.getElementById('statusGit').innerHTML = '⌥ ' + gitCurrentBranch;
}

function gitStageFile(path) {
  const idx = gitUnstagedFiles.findIndex(f => f.path === path);
  if (idx >= 0) {
    gitStagedFiles.push(gitUnstagedFiles[idx]);
    gitUnstagedFiles.splice(idx, 1);
    renderGitPanel();
  }
}

function gitUnstageFile(path) {
  const idx = gitStagedFiles.findIndex(f => f.path === path);
  if (idx >= 0) {
    gitUnstagedFiles.push(gitStagedFiles[idx]);
    gitStagedFiles.splice(idx, 1);
    renderGitPanel();
  }
}

function gitCommit() {
  const msg = document.getElementById('gitCommitMsg')?.value?.trim();
  if (!msg) { showToast('请输入提交消息'); return; }
  if (gitStagedFiles.length === 0) { showToast('没有暂存的更改'); return; }

  // 模拟提交
  const commitId = Math.random().toString(36).substring(2, 10);
  gitStagedFiles = [];
  gitUnstagedFiles = gitScanWorkingTree();
  renderGitPanel();
  document.getElementById('gitCommitMsg').value = '';
  showToast(`已提交 ${commitId}: ${msg}`);
}

function gitScanWorkingTree() {
  // 扫描文件系统，模拟未跟踪/修改的文件
  const files = [];
  function walk(node, path) {
    if (node.type === 'file') {
      // 模拟：部分文件显示为已修改
      if (Math.random() > 0.5) {
        files.push({ name: node.name, path: path });
      }
    } else if (node.children) {
      for (const [k, v] of Object.entries(node.children)) {
        walk(v, path === '/' ? '/' + k : path + '/' + k);
      }
    }
  }
  if (fileSystem['/']) walk(fileSystem['/'], '/');
  return files;
}

// 真实实现：使用 isomorphic-git（需后端支持）
// 此处先做模拟版本，后续可接入真实 git 操作

// ── Git 面板显示/隐藏 ─────────────────────────────
function showGitPanel() {
  const sidebar = document.getElementById('sidebar');
  const header = sidebar?.querySelector('.sidebar-header span');
  const actionsDiv = document.getElementById('fileTreeActions');
  if (sidebar) {
    sidebar.classList.remove('collapsed');
    if (header) header.textContent = 'Git 版本控制';
    if (actionsDiv) actionsDiv.style.display = 'none';
    document.getElementById('fileTree').style.display = 'none';
    let gitPanel = document.getElementById('gitPanel');
    if (!gitPanel) {
      gitPanel = document.createElement('div');
      gitPanel.id = 'gitPanel';
      gitPanel.className = 'git-panel';
      document.getElementById('fileTree').parentNode.appendChild(gitPanel);
    }
    gitPanel.style.display = 'block';
    initGitPanel();
  }
  // 切换 activity bar 按钮状态
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  const gitBtn = document.getElementById('btnGit');
  if (gitBtn) gitBtn.classList.add('active');
}

function showFileTree() {
  const header = document.querySelector('.sidebar-header span');
  const actionsDiv = document.getElementById('fileTreeActions');
  if (header) header.textContent = '资源管理器';
  if (actionsDiv) actionsDiv.style.display = 'flex';
  const fileTree = document.getElementById('fileTree');
  if (fileTree) fileTree.style.display = 'block';
  const gitPanel = document.getElementById('gitPanel');
  if (gitPanel) gitPanel.style.display = 'none';
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  const explorerBtn = document.getElementById('btnExplorer');
  if (explorerBtn) explorerBtn.classList.add('active');
}

// 导出给全局使用
window.showGitPanel = showGitPanel;
window.showFileTree = showFileTree;
window.gitInit = gitInit;
window.gitCommit = gitCommit;
window.gitStageFile = gitStageFile;
window.gitUnstageFile = gitUnstageFile;
