// ============================================================
// Plugin Management Panel UI
// ============================================================
import { pluginManager } from '../core/plugin-manager';
import type { PluginInstance } from '../types/plugin';

export function showPluginPanel(): void {
  let panel = document.getElementById('pluginPanel');
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'pluginPanel';
  panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;max-height:80vh;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;z-index:10000;box-shadow:0 8px 32px rgba(0,0,0,0.3);display:flex;flex-direction:column;';

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border-color);">
      <h3 style="margin:0;font-size:15px;color:var(--text-primary);">🔌 插件管理</h3>
      <button id="btnClosePlugins" style="background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button>
    </div>
    <div id="pluginList" style="flex:1;overflow-y:auto;padding:12px 20px;"></div>
    <div style="padding:12px 20px;border-top:1px solid var(--border-color);display:flex;gap:8px;align-items:center;">
      <span style="font-size:12px;color:var(--text-muted);flex:1;">已安装 ${pluginManager.getPlugins().length} 个插件</span>
      <button id="btnImportPlugin" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-primary);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">导入插件</button>
    </div>
  `;

  document.body.appendChild(panel);

  const overlay = document.createElement('div');
  overlay.id = 'pluginOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:9999;';
  overlay.addEventListener('click', () => {
    panel?.remove();
    overlay.remove();
  });
  document.body.appendChild(overlay);

  document.getElementById('btnClosePlugins')?.addEventListener('click', () => {
    panel?.remove();
    overlay.remove();
  });

  document.getElementById('btnImportPlugin')?.addEventListener('click', () => {
    alert('插件导入功能：请将插件文件放入 plugins/ 目录后重启应用');
  });

  renderPluginList();

  // Subscribe to changes
  const unsub = pluginManager.subscribe(() => renderPluginList());
  const observer = new MutationObserver(() => {
    if (!document.getElementById('pluginPanel')) {
      unsub();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
}

function renderPluginList(): void {
  const list = document.getElementById('pluginList');
  if (!list) return;

  const plugins = pluginManager.getPlugins();

  list.innerHTML = plugins
    .map((p: PluginInstance) => {
      const isActive = p.status === 'active';
      const statusColor = p.status === 'active' ? 'var(--success)' : p.status === 'error' ? 'var(--error)' : 'var(--text-muted)';
      const themes = p.manifest.contributes.themes || [];
      const commands = p.manifest.contributes.commands || [];
      const sidebars = p.manifest.contributes.sidebars || [];

      return `
        <div style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:start;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="font-size:14px;font-weight:500;color:var(--text-primary);">${p.manifest.name}</span>
                <span style="font-size:11px;color:var(--text-muted);">v${p.manifest.version}</span>
                <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${statusColor}20;color:${statusColor};">${p.status}</span>
              </div>
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">${p.manifest.description}</div>
              <div style="font-size:11px;color:var(--text-muted);">
                作者: ${p.manifest.author}
                ${themes.length > 0 ? ` · 🎨 ${themes.length} 主题` : ''}
                ${commands.length > 0 ? ` · ⌘ ${commands.length} 命令` : ''}
                ${sidebars.length > 0 ? ` · 📊 ${sidebars.length} 面板` : ''}
              </div>
              ${themes.length > 0 ? `
                <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">
                  ${themes.map(t => `<button class="theme-btn" data-theme="${t.id}" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-primary);padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;">应用 ${t.name}</button>`).join('')}
                </div>
              ` : ''}
              ${p.error ? `<div style="margin-top:6px;font-size:11px;color:var(--error);">⚠ ${p.error}</div>` : ''}
            </div>
            <button class="toggle-btn" data-plugin="${p.manifest.name}" style="background:${isActive ? 'var(--error)' : 'var(--accent)'};border:none;color:white;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;">
              ${isActive ? '停用' : '启用'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  // Wire toggle buttons
  list.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.plugin!;
      const plugin = pluginManager.getPlugins().find((p) => p.manifest.name === name);
      if (plugin?.status === 'active') {
        pluginManager.deactivate(name);
      } else {
        pluginManager.activate(name);
      }
    });
  });

  // Wire theme buttons
  list.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const themeId = (btn as HTMLElement).dataset.theme!;
      if (pluginManager.applyTheme(themeId)) {
        const status = document.createElement('div');
        status.textContent = '✓ 主题已切换';
        status.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--success);color:white;padding:8px 16px;border-radius:6px;font-size:13px;z-index:10001;';
        document.body.appendChild(status);
        setTimeout(() => status.remove(), 2000);
      }
    });
  });
}
