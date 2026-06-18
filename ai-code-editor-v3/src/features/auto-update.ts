// ============================================================
// Auto Update UI — 更新检查/下载/安装
// ============================================================
import { bus } from '../core/event-bus';

interface UpdateState {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  version: string | null;
  releaseNotes: string | null;
  progress: number;
  error: string | null;
}

const updateState: UpdateState = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  version: null,
  releaseNotes: null,
  progress: 0,
  error: null,
};

// ─── Initialize update listeners ───────────────────────────
export function initAutoUpdate(): void {
  const electron = window.electronAPI;
  if (!electron || !electron.on) return;

  electron.on('update:checking', () => {
    updateState.checking = true;
    updateState.error = null;
    bus.emit('toast:show', { message: '🔍 正在检查更新...', type: 'info', duration: 3000 });
  });

  electron.on('update:available', (data: any) => {
    updateState.checking = false;
    updateState.available = true;
    updateState.version = data.version;
    updateState.releaseNotes = data.releaseNotes;
    showUpdateNotification(data);
  });

  electron.on('update:not-available', () => {
    updateState.checking = false;
    bus.emit('toast:show', { message: '✅ 已是最新版本', type: 'success', duration: 3000 });
  });

  electron.on('update:download-progress', (data: any) => {
    updateState.downloading = true;
    updateState.progress = data.percent;
    updateUpdateProgress(data.percent);
  });

  electron.on('update:downloaded', (data: any) => {
    updateState.downloading = false;
    updateState.downloaded = true;
    updateState.version = data.version;
    showInstallPrompt(data);
  });

  electron.on('update:error', (data: any) => {
    updateState.checking = false;
    updateState.downloading = false;
    updateState.error = data.message;
    bus.emit('toast:show', {
      message: `❌ 更新失败: ${data.message}`,
      type: 'error',
      persistent: true,
    });
  });
}

// ─── Check for updates ─────────────────────────────────────
export async function checkForUpdates(): Promise<void> {
  const electron = window.electronAPI;
  if (!electron) {
    bus.emit('toast:show', {
      message: '⚠️ 自动更新仅在 Electron 桌面版中可用',
      type: 'warning',
      duration: 3000,
    });
    return;
  }

  if (updateState.checking || updateState.downloading) return;

  try {
    await electron.invoke('update:check');
  } catch (e: any) {
    bus.emit('toast:show', {
      message: `❌ 检查更新失败: ${e.message}`,
      type: 'error',
      duration: 3000,
    });
  }
}

// ─── Download update ───────────────────────────────────────
export async function downloadUpdate(): Promise<void> {
  const electron = window.electronAPI;
  if (!electron) return;

  try {
    updateState.downloading = true;
    await electron.invoke('update:download');
  } catch (e: any) {
    updateState.downloading = false;
    bus.emit('toast:show', {
      message: `❌ 下载失败: ${e.message}`,
      type: 'error',
      duration: 3000,
    });
  }
}

// ─── Install update ────────────────────────────────────────
export async function installUpdate(): Promise<void> {
  const electron = window.electronAPI;
  if (!electron) return;

  await electron.invoke('update:install');
}

// ─── UI helpers ────────────────────────────────────────────
let updateProgressId: string | null = null;

function updateUpdateProgress(percent: number): void {
  if (!updateProgressId) {
    const notifModule = window.__showNotification;
    if (notifModule) {
      updateProgressId = notifModule('正在下载更新...', 'info', {
        persistent: true,
        progress: percent,
      });
    }
  } else {
    const { updateNotificationProgress } = require('../main');
    updateNotificationProgress(updateProgressId, percent);
  }

  // Also update status bar
  const statusBar = document.querySelector('.statusbar .left');
  if (statusBar) {
    let el = document.getElementById('updateStatus');
    if (!el) {
      el = document.createElement('span');
      el.id = 'updateStatus';
      el.className = 'item';
      el.style.color = 'var(--accent)';
      statusBar.appendChild(el);
    }
    el.textContent = `⬇ 下载中 ${percent}%`;
  }
}

function showUpdateNotification(data: any): void {
  const notifId = `update-${Date.now()}`;

  // Create a custom notification with actions
  const container = document.getElementById('notificationContainer') || document.body;
  const el = document.createElement('div');
  el.className = 'notification-item';
  el.style.cssText = `
    pointer-events:auto;display:flex;flex-direction:column;gap:8px;
    padding:12px 16px;background:var(--bg-primary);border:1px solid var(--accent);
    border-left:3px solid var(--accent);border-radius:8px;
    box-shadow:0 4px 16px rgba(0,0,0,0.3);animation:slideInRight 0.25s ease-out;
    font-size:13px;z-index:10001;min-width:300px;
  `;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:18px;">🆕</span>
      <span style="font-weight:600;">新版本 v${data.version}</span>
    </div>
    ${data.releaseNotes ? `<div style="font-size:11px;color:var(--text-muted);max-height:60px;overflow-y:auto;">${escapeHtml(String(data.releaseNotes).slice(0, 200))}</div>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="update-dismiss" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-muted);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px;">稍后</button>
      <button class="update-download" style="background:var(--accent);border:none;color:white;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px;">立即更新</button>
    </div>
  `;

  el.querySelector('.update-dismiss')?.addEventListener('click', () => {
    el.style.animation = 'slideOutRight 0.2s ease-in forwards';
    setTimeout(() => el.remove(), 200);
  });

  el.querySelector('.update-download')?.addEventListener('click', () => {
    el.remove();
    downloadUpdate();
  });

  container.appendChild(el);

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (el.parentNode) {
      el.style.animation = 'slideOutRight 0.2s ease-in forwards';
      setTimeout(() => el.remove(), 200);
    }
  }, 30000);
}

function showInstallPrompt(data: any): void {
  // Clean up progress
  updateProgressId = null;
  const statusEl = document.getElementById('updateStatus');
  if (statusEl) {
    statusEl.textContent = '⬇ 更新就绪';
    statusEl.style.color = 'var(--success)';
  }

  // Show install prompt
  const container = document.getElementById('notificationContainer') || document.body;
  const el = document.createElement('div');
  el.className = 'notification-item';
  el.style.cssText = `
    pointer-events:auto;display:flex;flex-direction:column;gap:8px;
    padding:12px 16px;background:var(--bg-primary);border:1px solid var(--success);
    border-left:3px solid var(--success);border-radius:8px;
    box-shadow:0 4px 16px rgba(0,0,0,0.3);animation:slideInRight 0.25s ease-out;
    font-size:13px;z-index:10001;min-width:300px;
  `;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:18px;">✅</span>
      <span style="font-weight:600;">v${data.version} 下载完成</span>
    </div>
    <p style="font-size:11px;color:var(--text-muted);">重启应用以完成更新安装</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="update-later" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-muted);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px;">稍后重启</button>
      <button class="update-restart" style="background:var(--success);border:none;color:#1a1a2e;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">立即重启</button>
    </div>
  `;

  el.querySelector('.update-later')?.addEventListener('click', () => el.remove());
  el.querySelector('.update-restart')?.addEventListener('click', () => installUpdate());
  container.appendChild(el);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Get update state ──────────────────────────────────────
export function getUpdateState(): UpdateState {
  return { ...updateState };
}
