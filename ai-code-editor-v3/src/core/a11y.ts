// ============================================================
// Accessibility (a11y) — ARIA labels, focus management, keyboard nav
// ============================================================

import { i18n, t } from './i18n';

// ─── Skip Links ──────────────────────────────────────────
export function injectSkipLinks(): void {
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Skip links');
  nav.style.cssText = 'position:absolute;top:0;left:0;z-index:99999;';

  const links = [
    { target: '#editorContainer', key: 'a11y.skipToEditor' },
    { target: '#chatPanel', key: 'a11y.skipToChat' },
    { target: '#terminalPanel', key: 'a11y.skipToTerminal' },
    { target: '#fileTree', key: 'a11y.skipToFileTree' },
  ];

  for (const link of links) {
    const a = document.createElement('a');
    a.href = link.target;
    a.textContent = i18n.t(link.key);
    a.style.cssText = [
      'position:absolute;',
      'left:-9999px;',
      'top:auto;',
      'width:1px;',
      'height:1px;',
      'overflow:hidden;',
    ].join('');
    a.addEventListener('focus', () => {
      a.style.cssText = [
        'position:fixed;',
        'top:8px;',
        'left:50%;',
        'transform:translateX(-50%);',
        'padding:8px 16px;',
        'background:var(--bg-primary);',
        'border:2px solid var(--info);',
        'border-radius:6px;',
        'color:var(--text-primary);',
        'z-index:100000;',
        'font-size:14px;',
        'text-decoration:none;',
      ].join('');
    });
    a.addEventListener('blur', () => {
      a.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
    });
    nav.appendChild(a);
  }

  document.body.insertBefore(nav, document.body.firstChild);
}

// ─── ARIA Label Injection ───────────────────────────────
const ARIA_MAP: Record<string, { role?: string; label?: string; description?: string; expanded?: string }> = {
  '#sidebar': { role: 'navigation', label: '文件资源管理器' },
  '#fileTree': { role: 'tree', label: '文件列表' },
  '#editorContainer': { role: 'region', label: '代码编辑器' },
  '#chatPanel': { role: 'complementary', label: 'AI 助手面板' },
  '#terminalPanel': { role: 'region', label: '终端面板' },
  '#tabsBar': { role: 'tablist', label: '打开的标签页' },
  '#btnSend': { role: 'button', label: '发送消息' },
  '#btnStop': { role: 'button', label: '停止生成' },
  '#btnClearChat': { role: 'button', label: '清空对话' },
  '#btnExplorer': { role: 'button', label: '资源管理器' },
  '#btnGit': { role: 'button', label: '源代码管理' },
  '#btnSearch': { role: 'button', label: '搜索' },
  '#btnAI': { role: 'button', label: 'AI 助手' },
  '#btnTerminal': { role: 'button', label: '终端' },
  '#btnPreview': { role: 'button', label: '预览' },
  '#btnPlugins': { role: 'button', label: '插件管理' },
  '#btnCollab': { role: 'button', label: '实时协作' },
  '#btnSettings': { role: 'button', label: '设置' },
  '#btnNewFile': { role: 'button', label: '新建文件' },
  '#btnNewFolder': { role: 'button', label: '新建文件夹' },
  '#btnRefresh': { role: 'button', label: '刷新文件列表' },
  '#statusErrors': { role: 'button', label: '问题和错误' },
  '#statusGit': { role: 'button', label: 'Git 状态' },
  '.activity-bar': { role: 'toolbar', label: '活动栏' },
  '.statusbar': { role: 'status', label: '状态栏' },
  '.titlebar': { role: 'banner', label: '标题栏' },
};

export function injectARIALabels(): void {
  for (const [selector, attrs] of Object.entries(ARIA_MAP)) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (attrs.role) el.setAttribute('role', attrs.role);
      if (attrs.label) el.setAttribute('aria-label', attrs.label);
      if (attrs.description) el.setAttribute('aria-description', attrs.description);
      if (attrs.expanded) el.setAttribute('aria-expanded', attrs.expanded);
    }
  }

  // Mark tab elements
  document.querySelectorAll('.tab').forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
    tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
    tab.setAttribute('aria-posinset', String(index + 1));
  });

  // Mark file tree items
  document.querySelectorAll('.tree-item').forEach((item) => {
    item.setAttribute('role', 'treeitem');
    item.setAttribute('tabindex', '-1');
  });

  // Mark chat messages
  document.querySelectorAll('.chat-message').forEach((msg, index) => {
    const role = msg.classList.contains('user') ? 'user' : 'assistant';
    msg.setAttribute('role', 'article');
    msg.setAttribute('aria-label', `${role === 'user' ? '用户' : 'AI'} 消息 ${index + 1}`);
  });
}

// ─── Focus Trap ──────────────────────────────────────────
export function createFocusTrap(container: HTMLElement): { activate: () => void; deactivate: () => void } {
  const focusableSelector = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  let previousFocused: HTMLElement | null = null;

  function getFocusableElements(): HTMLElement[] {
    return [...container.querySelectorAll(focusableSelector)] as HTMLElement[];
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return {
    activate(): void {
      previousFocused = document.activeElement as HTMLElement;
      container.addEventListener('keydown', handleKeyDown);
      const first = getFocusableElements()[0];
      first?.focus();
    },
    deactivate(): void {
      container.removeEventListener('keydown', handleKeyDown);
      previousFocused?.focus();
      previousFocused = null;
    },
  };
}

// ─── Live Region Announcements ──────────────────────────
let liveRegion: HTMLElement | null = null;

export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.style.cssText = [
      'position: absolute',
      'width: 1px',
      'height: 1px',
      'overflow: hidden',
      'clip: rect(0,0,0,0)',
      'white-space: nowrap',
    ].join(';');
    document.body.appendChild(liveRegion);
  }

  liveRegion.setAttribute('aria-live', priority);
  // Clear and set to trigger announcement
  liveRegion.textContent = '';
  setTimeout(() => {
    if (liveRegion) liveRegion.textContent = message;
  }, 50);
}

// ─── Keyboard Navigation Enhancement ────────────────────
export function enhanceKeyboardNavigation(): void {
  // Arrow key navigation in file tree
  document.addEventListener('keydown', (e) => {
    // Only handle when focus is in file tree
    const activeEl = document.activeElement;
    if (!activeEl?.closest('#fileTree')) return;
    if (!(activeEl instanceof HTMLElement)) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = activeEl.nextElementSibling as HTMLElement;
        if (next) {
          next.focus();
          next.scrollIntoView({ block: 'nearest' });
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = activeEl.previousElementSibling as HTMLElement;
        if (prev) {
          prev.focus();
          prev.scrollIntoView({ block: 'nearest' });
        }
        break;
      }
        case 'ArrowRight': {
        e.preventDefault();
        const folder = activeEl.closest('[data-type="folder"]');
        if (folder) {
          folder.setAttribute('aria-expanded', 'true');
          // Expand folder — toggle visibility of children
          const path = folder.getAttribute('data-path');
          if (path) {
            bus.emit('file-tree:expand', { path });
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const folder = activeEl.closest('[data-type="folder"]');
        if (folder) {
          folder.setAttribute('aria-expanded', 'false');
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        activeEl.click();
        break;
      }
    }
  });

  // Tab navigation in tabs bar
  const tabsBar = document.querySelector('#tabsBar');
  if (tabsBar) {
    tabsBar.addEventListener('keydown', (e) => {
      if (!(e.target instanceof HTMLElement)) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const tabs = [...tabsBar.querySelectorAll('.tab')] as HTMLElement[];
        const currentIdx = tabs.indexOf(e.target);
        const nextIdx = e.key === 'ArrowRight'
          ? Math.min(currentIdx + 1, tabs.length - 1)
          : Math.max(currentIdx - 1, 0);

        tabs[nextIdx]?.focus();
      }
    });
  }
}

// ─── High Contrast Support ──────────────────────────────
export function detectHighContrast(): boolean {
  return window.matchMedia('(forced-colors: active)').matches;
}

export function enableHighContrastMode(): void {
  document.documentElement.classList.add('high-contrast');
}

export function disableHighContrastMode(): void {
  document.documentElement.classList.remove('high-contrast');
}

// ─── Reduced Motion ─────────────────────────────────────
export function detectReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function applyReducedMotion(): void {
  if (detectReducedMotion()) {
    const style = document.createElement('style');
    style.id = 'reduced-motion-styles';
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Init All ───────────────────────────────────────────
export function initAccessibility(): void {
  injectSkipLinks();
  injectARIALabels();
  enhanceKeyboardNavigation();
  applyReducedMotion();

  // Re-inject ARIA labels when UI changes
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      injectARIALabels();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // Listen for high contrast changes
  window.matchMedia('(forced-colors: active)').addEventListener('change', (e) => {
    if (e.matches) {
      enableHighContrastMode();
    } else {
      disableHighContrastMode();
    }
  });

  // Initial high contrast check
  if (detectHighContrast()) {
    enableHighContrastMode();
  }
}

// ─── Focus ring manager ─────────────────────────────────
export function setupFocusStyles(): void {
  const style = document.createElement('style');
  style.id = 'a11y-focus-styles';
  style.textContent = `
    :focus-visible {
      outline: 2px solid var(--info) !important;
      outline-offset: 2px !important;
    }

    :focus:not(:focus-visible) {
      outline: none !important;
    }

    .high-contrast :focus {
      outline: 3px solid Highlight !important;
      outline-offset: 2px !important;
    }

    @media (forced-colors: active) {
      .high-contrast * {
        border-color: ButtonText !important;
      }
    }
  `;
  document.head.appendChild(style);
}
