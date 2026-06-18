// ============================================================
// Git 面板 — TypeScript 版本
// ============================================================
import { useGitStore, useFilesStore } from '../core/stores';
import type { GitStatus } from '../types';

// ─── Git State ─────────────────────────────────────────────
let gitStagedFiles: string[] = [];
let gitModifiedFiles: string[] = [];
let gitAddedFiles: string[] = [];
let gitBranch = 'main';
let gitCommits: { hash: string; message: string; timestamp: number }[] = [
  { hash: 'abc1234', message: 'Initial commit', timestamp: Date.now() - 86400000 },
];

export function initGitPanel(): void {
  const panel = document.getElementById('gitPanel');
  if (!panel) return;
  updateGitStatus();
  renderGitPanel();
}

function updateGitStatus(): void {
  const files = useFilesStore.getState().files;
  const filePaths = Array.from(files.keys());

  gitModifiedFiles = filePaths.filter((p) => !gitStagedFiles.includes(p));
  gitAddedFiles = filePaths.filter((p) => !gitModifiedFiles.includes(p) && !gitStagedFiles.includes(p));

  const store = useGitStore.getState();
  store.setStatus({
    staged: gitStagedFiles,
    modified: gitModifiedFiles,
    added: gitAddedFiles,
    deleted: [],
    branch: gitBranch,
    commits: gitCommits,
  });

  // Update status bar
  const statusEl = document.getElementById('statusGit');
  if (statusEl) statusEl.textContent = `⎇ ${gitBranch}`;
}

function renderGitPanel(): void {
  const panel = document.getElementById('gitPanel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="git-status-bar">
      <span class="branch">⎇ ${gitBranch}</span>
      <button onclick="window._gitOpenSettings?.()">⚙ 设置</button>
    </div>
    <div class="git-section-title">暂存的更改 (${gitStagedFiles.length})</div>
    ${gitStagedFiles.map((f) => `<div class="git-file-item"><span class="git-status-icon modified">M</span>${f}</div>`).join('')}
    <div class="git-section-title">更改 (${gitModifiedFiles.length})</div>
    ${gitModifiedFiles.map((f) => `<div class="git-file-item"><span class="git-status-icon modified">M</span>${f}</div>`).join('')}
    <div class="git-section-title">未跟踪的文件 (${gitAddedFiles.length})</div>
    ${gitAddedFiles.map((f) => `<div class="git-file-item"><span class="git-status-icon added">U</span>${f}</div>`).join('')}
    <div class="git-commit-section">
      <textarea placeholder="提交信息 (Commit message)"></textarea>
      <button class="commit-btn" onclick="window._gitCommit?.()">✓ 提交 (Commit)</button>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;text-align:center;">模拟 Git — 存储于 IndexedDB</div>
    </div>
    <div class="git-section-title">提交历史</div>
    ${gitCommits.map((c) => `
      <div class="git-log-item">
        <div class="git-hash">${c.hash}</div>
        <div class="git-msg">${c.message}</div>
        <div class="git-meta"><span>${new Date(c.timestamp).toLocaleDateString()}</span><span>HEAD</span></div>
      </div>
    `).join('')}
  `;
}

export function showGitPanel(): void {
  const sidebar = document.getElementById('sidebar');
  const header = sidebar?.querySelector('.sidebar-header span');
  if (sidebar) {
    sidebar.classList.remove('collapsed');
    if (header) header.textContent = 'Git';
    const fileTree = document.getElementById('fileTree');
    if (fileTree) fileTree.style.display = 'none';
    const gitPanel = document.getElementById('gitPanel');
    if (gitPanel) gitPanel.style.display = 'block';
    initGitPanel();
  }

  // Toggle activity buttons
  document.querySelectorAll('.activity-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btnGit');
  if (btn) btn.classList.add('active');
}

export function showFileTree(): void {
  const header = document.querySelector('.sidebar-header span');
  if (header) header.textContent = '资源管理器';
  const fileTree = document.getElementById('fileTree');
  if (fileTree) fileTree.style.display = 'block';
  const gitPanel = document.getElementById('gitPanel');
  if (gitPanel) gitPanel.style.display = 'none';

  document.querySelectorAll('.activity-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btnExplorer');
  if (btn) btn.classList.add('active');
}

// ─── Git Commit ────────────────────────────────────────────
export function gitCommit(): void {
  const panel = document.getElementById('gitPanel');
  const textarea = panel?.querySelector('textarea') as HTMLTextAreaElement;
  const msg = textarea?.value.trim();
  if (!msg) return;

  const hash = Math.random().toString(16).substring(2, 9);
  gitCommits.unshift({ hash, message: msg, timestamp: Date.now() });
  gitStagedFiles = [];
  textarea.value = '';
  updateGitStatus();
  renderGitPanel();
}

// ─── Export global handles ─────────────────────────────────
(window as any)._gitCommit = gitCommit;
(window as any)._gitOpenSettings = () => {
  const btn = document.getElementById('btnSettings');
  if (btn) btn.click();
};
