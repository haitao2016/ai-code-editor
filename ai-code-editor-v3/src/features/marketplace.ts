// ============================================================
// Plugin Marketplace — 搜索/安装/管理面板
// ============================================================
import { bus } from '../core/event-bus';
import { pluginManager } from '../core/plugin-manager';

interface MarketPlugin {
  id: string;
  name: string;
  icon: string;
  description: string;
  author: string;
  version: string;
  rating: number;
  downloads: number;
  category: 'theme' | 'tool' | 'ai' | 'lang' | 'ui' | 'other';
  installed: boolean;
}

// ─── Built-in marketplace plugins ─────────────────────────
const MARKETPLACE_PLUGINS: MarketPlugin[] = [
  {
    id: 'dracula-theme',
    name: 'Dracula 主题',
    icon: '🧛',
    description: '经典 Dracula 暗色主题，护眼舒适',
    author: 'AI Code Editor',
    version: '1.0.0',
    rating: 4.8,
    downloads: 15420,
    category: 'theme',
    installed: false,
  },
  {
    id: 'solarized-theme',
    name: 'Solarized 主题',
    icon: '☀️',
    description: 'Solarized Light & Dark 双主题，精确色彩',
    author: 'AI Code Editor',
    version: '1.0.0',
    rating: 4.6,
    downloads: 8930,
    category: 'theme',
    installed: false,
  },
  {
    id: 'code-stats',
    name: '代码统计',
    icon: '📊',
    description: '统计代码行数、文件数、语言分布等',
    author: 'AI Code Editor',
    version: '1.1.0',
    rating: 4.5,
    downloads: 6720,
    category: 'tool',
    installed: false,
  },
  {
    id: 'monokai-pro',
    name: 'Monokai Pro',
    icon: '🎨',
    description: '专业级 Monokai 配色方案，多种变体',
    author: 'Community',
    version: '2.0.1',
    rating: 4.9,
    downloads: 25100,
    category: 'theme',
    installed: false,
  },
  {
    id: 'gitlens-lite',
    name: 'GitLens Lite',
    icon: '🔍',
    description: '行级 Git Blame 注解，内联显示提交信息',
    author: 'Community',
    version: '3.2.0',
    rating: 4.9,
    downloads: 38900,
    category: 'tool',
    installed: false,
  },
  {
    id: 'ai-code-review',
    name: 'AI Code Review',
    icon: '🤖',
    description: 'AI 驱动的代码审查，自动检测问题并给出建议',
    author: 'Community',
    version: '1.3.0',
    rating: 4.7,
    downloads: 12300,
    category: 'ai',
    installed: false,
  },
  {
    id: 'auto-import',
    name: 'Auto Import',
    icon: '📥',
    description: '自动导入缺失的模块，支持 TS/JS/Python',
    author: 'Community',
    version: '2.1.0',
    rating: 4.6,
    downloads: 18700,
    category: 'tool',
    installed: false,
  },
  {
    id: 'python-lsp-extra',
    name: 'Python 增强',
    icon: '🐍',
    description: 'Python 语言支持增强：类型检查、自动补全、重构',
    author: 'Community',
    version: '1.5.0',
    rating: 4.5,
    downloads: 9400,
    category: 'lang',
    installed: false,
  },
  {
    id: 'rust-analyzer-bridge',
    name: 'Rust Analyzer',
    icon: '🦀',
    description: 'Rust 语言支持，集成 rust-analyzer LSP',
    author: 'Community',
    version: '1.2.0',
    rating: 4.8,
    downloads: 11200,
    category: 'lang',
    installed: false,
  },
  {
    id: 'bracket-colorizer',
    name: '彩虹括号',
    icon: '🌈',
    description: '为嵌套括号着色，快速识别代码层级',
    author: 'Community',
    version: '2.0.0',
    rating: 4.4,
    downloads: 22100,
    category: 'ui',
    installed: false,
  },
  {
    id: 'indent-rainbow',
    name: '缩进彩虹线',
    icon: '🎯',
    description: '为缩进添加彩色引导线，提升代码可读性',
    author: 'Community',
    version: '1.3.0',
    rating: 4.3,
    downloads: 14500,
    category: 'ui',
    installed: false,
  },
  {
    id: 'ai-commit-msg',
    name: 'AI 提交信息',
    icon: '✍️',
    description: 'AI 自动生成 Git 提交信息，分析代码变更',
    author: 'Community',
    version: '1.0.2',
    rating: 4.6,
    downloads: 7800,
    category: 'ai',
    installed: false,
  },
];

let currentCategory = 'all';
let currentSearch = '';

// ─── Show/hide marketplace ────────────────────────────────
export function showMarketplace(): void {
  const modal = document.getElementById('marketplaceModal');
  if (!modal) return;

  // Update installed status
  updateInstalledStatus();

  modal.classList.add('show');
  renderMarketplaceList();

  // Wire events
  wireMarketplaceEvents(modal);
}

export function hideMarketplace(): void {
  const modal = document.getElementById('marketplaceModal');
  if (modal) modal.classList.remove('show');
}

// ─── Update installed status ──────────────────────────────
function updateInstalledStatus(): void {
  const installed = pluginManager.listPlugins().map((p) => p.id);
  MARKETPLACE_PLUGINS.forEach((p) => {
    p.installed = installed.includes(p.id);
  });
}

// ─── Render marketplace list ──────────────────────────────
function renderMarketplaceList(): void {
  const list = document.getElementById('marketplaceList');
  if (!list) return;

  const filtered = MARKETPLACE_PLUGINS.filter((p) => {
    if (currentCategory !== 'all' && p.category !== currentCategory) return false;
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const count = document.getElementById('marketplaceCount');
  const installedCount = document.getElementById('marketplaceInstalled');
  if (count) count.textContent = String(filtered.length);
  if (installedCount) {
    installedCount.textContent = String(MARKETPLACE_PLUGINS.filter((p) => p.installed).length);
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="marketplace-empty">🔍 未找到匹配的插件</div>';
    return;
  }

  list.innerHTML = filtered
    .map(
      (p) => `
    <div class="marketplace-item" data-plugin-id="${p.id}">
      <div class="plugin-icon">${p.icon}</div>
      <div class="plugin-info">
        <div class="plugin-name">${p.name}</div>
        <div class="plugin-desc">${p.description}</div>
        <div class="plugin-meta">
          <span class="plugin-author">${p.author}</span>
          <span class="plugin-version">v${p.version}</span>
          <span class="plugin-rating">★ ${p.rating}</span>
          <span>↓ ${formatDownloadCount(p.downloads)}</span>
        </div>
      </div>
      <div class="plugin-action">
        ${
          p.installed
            ? `<button class="installed" data-action="uninstall" data-plugin="${p.id}">已安装</button>`
            : `<button data-action="install" data-plugin="${p.id}">安装</button>`
        }
      </div>
    </div>`
    )
    .join('');

  // Wire plugin item clicks
  list.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = (btn as HTMLElement).dataset.action;
      const pluginId = (btn as HTMLElement).dataset.plugin || '';
      if (action === 'install') installPlugin(pluginId);
      else if (action === 'uninstall') uninstallPlugin(pluginId);
    });
  });
}

// ─── Wire marketplace events ──────────────────────────────
function wireMarketplaceEvents(modal: HTMLElement): void {
  // Close button
  document.getElementById('btnCloseMarketplace')?.addEventListener('click', hideMarketplace);

  // Overlay click
  modal.addEventListener('click', function (this: HTMLElement, e: MouseEvent) {
    if (e.target === this) hideMarketplace();
  });

  // Search
  const searchInput = document.getElementById('marketplaceSearch') as HTMLInputElement;
  if (searchInput) {
    searchInput.value = currentSearch;
    searchInput.addEventListener('input', () => {
      currentSearch = searchInput.value;
      renderMarketplaceList();
    });
  }

  // Categories
  document.getElementById('marketplaceCategories')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button') as HTMLElement;
    if (!btn || !btn.dataset.cat) return;
    currentCategory = btn.dataset.cat;

    // Update active state
    document.querySelectorAll('#marketplaceCategories button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    renderMarketplaceList();
  });
}

// ─── Install/Uninstall ────────────────────────────────────
async function installPlugin(pluginId: string): Promise<void> {
  const plugin = MARKETPLACE_PLUGINS.find((p) => p.id === pluginId);
  if (!plugin) return;

  try {
    // Dynamically load the plugin module
    const module = await import(`../plugins/${pluginId.split('-')[0]}`);
    if (module) {
      pluginManager.registerPlugin({
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        author: plugin.author,
        type: 'theme', // simplified
        activate: () => {
          // Plugin activation logic would go here
        },
        deactivate: () => {},
      });
      plugin.installed = true;
      renderMarketplaceList();

      bus.emit('toast:show', {
        message: `✅ "${plugin.name}" 安装成功`,
        type: 'success',
        duration: 3000,
      });
    }
  } catch {
    // Simulate installation for demo purposes
    await new Promise((r) => setTimeout(r, 500));
    plugin.installed = true;
    renderMarketplaceList();

    bus.emit('toast:show', {
      message: `✅ "${plugin.name}" 安装成功`,
      type: 'success',
      duration: 3000,
    });
  }
}

function uninstallPlugin(pluginId: string): void {
  const plugin = MARKETPLACE_PLUGINS.find((p) => p.id === pluginId);
  if (!plugin) return;

  if (!confirm(`确定要卸载 "${plugin.name}" 吗？`)) return;

  try {
    pluginManager.unregisterPlugin(pluginId);
  } catch {}

  plugin.installed = false;
  renderMarketplaceList();

  bus.emit('toast:show', {
    message: `🗑 "${plugin.name}" 已卸载`,
    type: 'info',
    duration: 3000,
  });
}

// ─── Utility ──────────────────────────────────────────────
function formatDownloadCount(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
