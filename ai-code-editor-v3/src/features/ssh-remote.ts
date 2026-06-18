// ============================================================
// SSH Remote Manager — remote connection lifecycle + file browse
// ============================================================

export interface SSHConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  password?: string;
  keyPath?: string;
}

export interface SSHConnectionState {
  connection: SSHConnection;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  connectedAt?: number;
}

export interface RemoteFile {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  modified: number;
  permissions: string;
}

class SSHRemoteManager {
  private connections = new Map<string, SSHConnectionState>();
  private activeConnectionId: string | null = null;
  private listeners: (() => void)[] = [];

  // ─── Configuration Persistence ─────────────────────────
  loadConnections(): SSHConnection[] {
    try {
      const raw = localStorage.getItem('aice:ssh-connections');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveConnections(connections: SSHConnection[]): void {
    // Don't save passwords in plaintext
    const sanitized = connections.map((c) => ({
      ...c,
      password: undefined, // passwords should be stored in OS keychain
    }));
    localStorage.setItem('aice:ssh-connections', JSON.stringify(sanitized));
  }

  // ─── Connection Management ─────────────────────────────
  addConnection(conn: Omit<SSHConnection, 'id'>): SSHConnection {
    const connection: SSHConnection = {
      ...conn,
      id: `ssh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };

    this.connections.set(connection.id, {
      connection,
      status: 'disconnected',
    });

    const allConns = this.loadConnections();
    allConns.push(connection);
    this.saveConnections(allConns);
    this.notify();

    return connection;
  }

  removeConnection(id: string): void {
    this.disconnect(id);
    this.connections.delete(id);

    const allConns = this.loadConnections().filter((c) => c.id !== id);
    this.saveConnections(allConns);
    this.notify();
  }

  // ─── Connect / Disconnect ─────────────────────────────
  async connect(id: string): Promise<boolean> {
    const state = this.connections.get(id);
    if (!state) return false;

    state.status = 'connecting';
    state.error = undefined;
    this.notify();

    try {
      const electron = window.electronAPI;
      if (!electron?.ssh) {
        throw new Error('SSH requires Electron desktop app');
      }

      const result = await electron.ssh.connect(state.connection);
      if (result.success) {
        state.status = 'connected';
        state.connectedAt = Date.now();
        this.activeConnectionId = id;
        this.notify();
        return true;
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (err: any) {
      state.status = 'error';
      state.error = err.message;
      this.notify();
      return false;
    }
  }

  disconnect(id: string): void {
    const state = this.connections.get(id);
    if (!state) return;

    const electron = window.electronAPI;
    if (electron?.ssh) {
      electron.ssh.disconnect(id).catch(() => {});
    }

    state.status = 'disconnected';
    if (this.activeConnectionId === id) {
      this.activeConnectionId = null;
    }
    this.notify();
  }

  // ─── Remote File Operations ────────────────────────────
  async listRemoteFiles(connectionId: string, remotePath: string = '/'): Promise<RemoteFile[]> {
    const state = this.connections.get(connectionId);
    if (!state || state.status !== 'connected') return [];

    try {
      const electron = window.electronAPI;
      if (!electron?.ssh) return [];

      const result = await electron.ssh.listFiles(connectionId, remotePath);
      if (result.success && result.files) {
        return result.files.map((f: any) => ({
          path: f.path,
          name: f.name || f.path.split('/').pop() || f.path,
          isDir: f.isDir || f.type === 'd',
          size: f.size || 0,
          modified: f.modified || 0,
          permissions: f.permissions || '---------',
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async readRemoteFile(connectionId: string, remotePath: string): Promise<string | null> {
    const state = this.connections.get(connectionId);
    if (!state || state.status !== 'connected') return null;

    try {
      const electron = window.electronAPI;
      if (!electron?.ssh) return null;

      const result = await electron.ssh.readFile(connectionId, remotePath);
      return result.success ? result.content : null;
    } catch {
      return null;
    }
  }

  async writeRemoteFile(connectionId: string, remotePath: string, content: string): Promise<boolean> {
    const state = this.connections.get(connectionId);
    if (!state || state.status !== 'connected') return false;

    try {
      const electron = window.electronAPI;
      if (!electron?.ssh) return false;

      const result = await electron.ssh.writeFile(connectionId, remotePath, content);
      return result.success;
    } catch {
      return false;
    }
  }

  async execRemoteCommand(connectionId: string, command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const state = this.connections.get(connectionId);
    if (!state || state.status !== 'connected') {
      return { stdout: '', stderr: 'Not connected', exitCode: -1 };
    }

    try {
      const electron = window.electronAPI;
      if (!electron?.ssh) {
        return { stdout: '', stderr: 'SSH not available', exitCode: -1 };
      }

      const result = await electron.ssh.exec(connectionId, command, cwd);
      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode ?? 0,
      };
    } catch (err: any) {
      return { stdout: '', stderr: err.message, exitCode: -1 };
    }
  }

  // ─── State ─────────────────────────────────────────────
  getConnections(): SSHConnectionState[] {
    return [...this.connections.values()];
  }

  getActiveConnection(): SSHConnectionState | null {
    if (!this.activeConnectionId) return null;
    return this.connections.get(this.activeConnectionId) || null;
  }

  isConnected(id: string): boolean {
    return this.connections.get(id)?.status === 'connected';
  }

  // ─── Subscription ──────────────────────────────────────
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const sshRemote = new SSHRemoteManager();

// ─── UI Panel ────────────────────────────────────────────
export function showSSHPanel(): void {
  let panel = document.getElementById('sshPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'sshPanel';
    panel.className = 'ssh-panel';
    panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;max-height:80vh;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:9000;display:flex;flex-direction:column;overflow:hidden;';
    document.body.appendChild(panel);
  }

  const connections = sshRemote.getConnections();

  panel.innerHTML = `
    <div style="padding:16px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;">
      <h3 style="margin:0;font-size:16px;">🔗 SSH 远程开发</h3>
      <button id="sshCloseBtn" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div style="padding:16px;overflow-y:auto;flex:1;">
      <div style="margin-bottom:12px;">
        <button id="sshAddBtn" style="background:var(--info);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">+ 添加连接</button>
      </div>
      <div id="sshConnList">
        ${connections.length === 0 ? '<div style="color:var(--text-muted);text-align:center;padding:24px;">暂无 SSH 连接配置</div>' : ''}
        ${connections.map((s) => {
          const statusColors: Record<string, string> = {
            disconnected: 'var(--text-muted)',
            connecting: 'var(--warning)',
            connected: 'var(--success)',
            error: 'var(--error)',
          };
          const statusIcons: Record<string, string> = {
            disconnected: '⚪',
            connecting: '🔄',
            connected: '🟢',
            error: '🔴',
          };
          const conn = s.connection;
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;margin-bottom:8px;background:var(--bg-hover);">
            <div style="flex:1;">
              <div style="font-weight:600;font-size:13px;">${conn.name}</div>
              <div style="font-size:11px;color:var(--text-muted);">${conn.username}@${conn.host}:${conn.port}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:${statusColors[s.status]};font-size:11px;">${statusIcons[s.status]} ${s.status}</span>
              ${s.status === 'disconnected'
                ? `<button class="ssh-connect" data-id="${conn.id}" style="background:var(--success);color:white;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;">连接</button>`
                : s.status === 'connected'
                  ? `<button class="ssh-browse" data-id="${conn.id}" style="background:var(--info);color:white;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;">浏览</button>
                     <button class="ssh-disconnect" data-id="${conn.id}" style="background:var(--bg-hover);color:var(--text-primary);border:1px solid var(--border-color);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;">断开</button>`
                  : ''}
              <button class="ssh-delete" data-id="${conn.id}" style="background:transparent;border:none;color:var(--error);cursor:pointer;font-size:14px;">🗑</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      ${s.error ? `<div style="margin-top:8px;color:var(--error);font-size:12px;">❌ ${s.error}</div>` : ''}
    </div>
  `;

  // Wire events
  document.getElementById('sshCloseBtn')?.addEventListener('click', () => panel?.remove());
  document.getElementById('sshAddBtn')?.addEventListener('click', () => showSSHAddForm(panel!));

  panel.querySelectorAll('.ssh-connect').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      sshRemote.connect(id).then(() => showSSHPanel());
    });
  });

  panel.querySelectorAll('.ssh-disconnect').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      sshRemote.disconnect(id);
      showSSHPanel();
    });
  });

  panel.querySelectorAll('.ssh-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      if (confirm('确定删除此连接？')) {
        sshRemote.removeConnection(id);
        showSSHPanel();
      }
    });
  });

  panel.querySelectorAll('.ssh-browse').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!;
      const files = await sshRemote.listRemoteFiles(id, '/home');
      // Simple file list display
      const content = files.map((f) =>
        `${f.isDir ? '📁' : '📄'} ${f.name.padEnd(30)} ${f.size > 0 ? (f.size / 1024).toFixed(1) + 'K' : ''}`
      ).join('\n');
      alert(`远程文件:\n${content || '(空目录)'}`);
    });
  });

  panel.classList.add('show');
}

function showSSHAddForm(panel: HTMLElement): void {
  const form = document.createElement('div');
  form.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:400px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:12px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:9100;';

  form.innerHTML = `
    <h3 style="margin:0 0 16px;">添加 SSH 连接</h3>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <input id="sshName" placeholder=i18n.t('common.连接名称') style="padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-hover);color:var(--text-primary);">
      <input id="sshHost" placeholder="主机地址 (IP 或域名)" style="padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-hover);color:var(--text-primary);">
      <input id="sshPort" placeholder=i18n.t('common.端口') value="22" type="number" style="padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-hover);color:var(--text-primary);">
      <input id="sshUser" placeholder=i18n.t('common.用户名') style="padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-hover);color:var(--text-primary);">
      <select id="sshAuth" style="padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-hover);color:var(--text-primary);">
        <option value="password">密码</option>
        <option value="key">密钥文件</option>
      </select>
      <input id="sshPassword" type="password" placeholder="密码 (不保存)" style="padding:8px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-hover);color:var(--text-primary);">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
        <button id="sshCancelBtn" style="padding:8px 16px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:var(--text-primary);cursor:pointer;">取消</button>
        <button id="sshSaveBtn" style="padding:8px 16px;border:none;border-radius:6px;background:var(--info);color:white;cursor:pointer;">保存</button>
      </div>
    </div>
  `;

  document.body.appendChild(form);

  document.getElementById('sshCancelBtn')?.addEventListener('click', () => form.remove());
  document.getElementById('sshSaveBtn')?.addEventListener('click', () => {
    const name = (document.getElementById('sshName') as HTMLInputElement).value;
    const host = (document.getElementById('sshHost') as HTMLInputElement).value;
    const port = parseInt((document.getElementById('sshPort') as HTMLInputElement).value) || 22;
    const username = (document.getElementById('sshUser') as HTMLInputElement).value;
    const authType = (document.getElementById('sshAuth') as HTMLSelectElement).value as 'password' | 'key';
    const password = (document.getElementById('sshPassword') as HTMLInputElement).value;

    if (!name || !host || !username) {
      alert('请填写连接名称、主机地址和用户名');
      return;
    }

    sshRemote.addConnection({ name, host, port, username, authType, password: authType === 'password' ? password : undefined });
    form.remove();
    showSSHPanel();
  });

  // Toggle password/key field
  document.getElementById('sshAuth')?.addEventListener('change', (e) => {
    const authType = (e.target as HTMLSelectElement).value;
    const pwdInput = document.getElementById('sshPassword') as HTMLInputElement;
    if (pwdInput) {
      pwdInput.placeholder = authType === 'password' ? '密码 (不保存)' : '密钥文件路径';
    }
  });
}
