// ============================================================
// Built-in Plugin: Code Statistics
// ============================================================
import type { PluginManifest, PluginModule } from '../types/plugin';
import { useFilesStore } from '../core/stores';

export const manifest: PluginManifest = {
  name: 'code-stats',
  version: '1.0.0',
  description: 'Show code statistics in a sidebar panel',
  author: 'AI Code Editor',
  entry: 'index.js',
  api: 1,
  contributes: {
    sidebars: [
      {
        id: 'code-stats',
        title: '代码统计',
        icon: '📊',
      },
    ],
    commands: [
      {
        id: 'code-stats:show',
        title: '显示代码统计',
      },
    ],
  },
  permissions: ['filesystem'],
};

export const module: PluginModule = {
  activate(api) {
    manifest.contributes.sidebars?.forEach((panel) => {
      api.registerSidebar(panel, (container: HTMLElement) => {
        renderStats(container);
      });
    });

    manifest.contributes.commands?.forEach((cmd) => {
      api.registerCommand(cmd, () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
          const existing = document.getElementById('codeStatsPanel');
          if (existing) {
            existing.remove();
            return;
          }
          const panel = document.createElement('div');
          panel.id = 'codeStatsPanel';
          panel.style.cssText = 'flex:1;overflow-y:auto;padding:8px;';
          sidebar.appendChild(panel);
          renderStats(panel);
        }
      });
    });

    api.log('Code Stats plugin activated');
  },
  deactivate() {
    const panel = document.getElementById('codeStatsPanel');
    if (panel) panel.remove();
  },
};

function renderStats(container: HTMLElement): void {
  const files = useFilesStore.getState().files;
  let totalLines = 0;
  let totalChars = 0;
  const byLang: Record<string, { files: number; lines: number }> = {};

  files.forEach((file: any) => {
    const lines = file.content.split('\n').length;
    totalLines += lines;
    totalChars += file.content.length;
    const lang = file.language || 'plaintext';
    if (!byLang[lang]) byLang[lang] = { files: 0, lines: 0 };
    byLang[lang].files++;
    byLang[lang].lines += lines;
  });

  const sortedLangs = Object.entries(byLang).sort((a, b) => b[1].lines - a[1].lines);

  container.innerHTML = `
    <div style="padding:12px;font-size:13px;color:var(--text-primary);">
      <div style="font-weight:500;margin-bottom:12px;">📊 代码统计</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
        <div style="background:var(--bg-secondary);padding:10px;border-radius:8px;">
          <div style="font-size:20px;font-weight:500;color:var(--accent);">${files.size}</div>
          <div style="font-size:11px;color:var(--text-muted);">文件总数</div>
        </div>
        <div style="background:var(--bg-secondary);padding:10px;border-radius:8px;">
          <div style="font-size:20px;font-weight:500;color:var(--success);">${totalLines.toLocaleString()}</div>
          <div style="font-size:11px;color:var(--text-muted);">代码行数</div>
        </div>
      </div>
      <div style="font-size:12px;font-weight:500;margin-bottom:8px;">按语言分布</div>
      ${sortedLangs
        .map(
          ([lang, stats]) => `
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;">
          <span style="color:var(--text-secondary);">${lang}</span>
          <span style="color:var(--text-muted);">${stats.files} 文件 · ${stats.lines} 行</span>
        </div>
      `
        )
        .join('')}
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-color);font-size:11px;color:var(--text-muted);">
        总字符数: ${totalChars.toLocaleString()}
      </div>
    </div>
  `;
}
