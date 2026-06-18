// ============================================================
// Collaboration UI — Invite, Join, Collaborator List
// ============================================================
import { collabManager } from '../core/collab';
import { showToast } from '../main';

export function showCollabPanel(): void {
  let panel = document.getElementById('collabPanel');
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'collabPanel';
  panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:480px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;z-index:10000;box-shadow:0 8px 32px rgba(0,0,0,0.3);';

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border-color);">
      <h3 style="margin:0;font-size:15px;color:var(--text-primary);">🌐 实时协作</h3>
      <button id="btnCloseCollab" style="background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button>
    </div>
    <div style="padding:20px;">
      <div id="collabContent"></div>
    </div>
  `;

  document.body.appendChild(panel);

  const overlay = document.createElement('div');
  overlay.id = 'collabOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:9999;';
  overlay.addEventListener('click', () => {
    panel?.remove();
    overlay.remove();
  });
  document.body.appendChild(overlay);

  document.getElementById('btnCloseCollab')?.addEventListener('click', () => {
    panel?.remove();
    overlay.remove();
  });

  renderCollabContent();

  const unsub = collabManager.subscribe(() => renderCollabContent());
  const observer = new MutationObserver(() => {
    if (!document.getElementById('collabPanel')) {
      unsub();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
}

function renderCollabContent(): void {
  const content = document.getElementById('collabContent');
  if (!content) return;

  const state = collabManager.getState();

  if (state.connected && state.roomId) {
    content.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">当前房间</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="background:var(--success);width:8px;height:8px;border-radius:50%;"></span>
          <code style="font-size:14px;color:var(--accent);font-family:monospace;">${state.roomId}</code>
          <button id="btnCopyRoom" style="margin-left:auto;background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-primary);padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;">复制链接</button>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">在线协作者 (${state.collaborators.length + 1})</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-primary);border-radius:6px;">
            <div style="width:24px;height:24px;border-radius:50%;background:${state.color};display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:500;">${state.username.charAt(0).toUpperCase()}</div>
            <span style="font-size:13px;color:var(--text-primary);">${state.username} (你)</span>
          </div>
          ${state.collaborators
            .map(
              (c) => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-primary);border-radius:6px;">
              <div style="width:24px;height:24px;border-radius:50%;background:${c.color};display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:500;">${c.name.charAt(0).toUpperCase()}</div>
              <span style="font-size:13px;color:var(--text-secondary);">${c.name}</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div style="display:flex;gap:8px;">
        <button id="btnLeaveRoom" style="flex:1;background:var(--error);border:none;color:white;padding:8px;border-radius:6px;font-size:13px;cursor:pointer;">离开房间</button>
      </div>
    `;

    document.getElementById('btnCopyRoom')?.addEventListener('click', () => {
      const link = `${window.location.origin}?room=${state.roomId}`;
      navigator.clipboard?.writeText(link);
      showToast('房间链接已复制');
    });

    document.getElementById('btnLeaveRoom')?.addEventListener('click', () => {
      collabManager.leaveRoom();
      showToast('已离开协作房间');
    });
  } else {
    content.innerHTML = `
      <div style="margin-bottom:20px;">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">你的名称</div>
        <input type="text" id="collabUsername" value="${state.username}" placeholder="输入你的名称"
          style="width:100%;background:var(--bg-primary);border:1px solid var(--border-color);color:var(--text-primary);padding:8px 12px;border-radius:6px;font-size:13px;box-sizing:border-box;">
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">创建新房间</div>
        <button id="btnCreateRoom" style="width:100%;background:var(--accent);border:none;color:white;padding:10px;border-radius:6px;font-size:13px;cursor:pointer;">创建协作房间</button>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">加入已有房间</div>
        <div style="display:flex;gap:8px;">
          <input type="text" id="collabRoomId" placeholder="输入房间 ID"
            style="flex:1;background:var(--bg-primary);border:1px solid var(--border-color);color:var(--text-primary);padding:8px 12px;border-radius:6px;font-size:13px;">
          <button id="btnJoinRoom" style="background:var(--bg-hover);border:1px solid var(--accent);color:var(--accent);padding:8px 16px;border-radius:6px;font-size:13px;cursor:pointer;">加入</button>
        </div>
      </div>

      <div style="padding:10px;background:var(--bg-primary);border-radius:6px;font-size:11px;color:var(--text-muted);">
        💡 协作功能使用 Yjs CRDT 算法，多用户同时编辑同一文件时无冲突。需要运行 WebSocket 信令服务器。
      </div>
    `;

    document.getElementById('collabUsername')?.addEventListener('change', (e) => {
      collabManager.setUsername((e.target as HTMLInputElement).value);
    });

    document.getElementById('btnCreateRoom')?.addEventListener('click', () => {
      const roomId = collabManager.generateRoomId();
      if (collabManager.joinRoom(roomId)) {
        showToast(`已创建房间: ${roomId}`);
      } else {
        showToast('创建房间失败，请检查服务器连接');
      }
    });

    document.getElementById('btnJoinRoom')?.addEventListener('click', () => {
      const input = document.getElementById('collabRoomId') as HTMLInputElement;
      const roomId = input.value.trim();
      if (!roomId) {
        showToast('请输入房间 ID');
        return;
      }
      if (collabManager.joinRoom(roomId)) {
        showToast(`正在加入房间: ${roomId}`);
      } else {
        showToast('加入房间失败');
      }
    });

    // Auto-join from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      input.value = roomParam;
      setTimeout(() => {
        if (collabManager.joinRoom(roomParam)) {
          showToast(`自动加入房间: ${roomParam}`);
        }
      }, 500);
    }
  }
}
