// ============================================================
// Zen Mode — fullscreen distraction-free editing
// ============================================================

interface ZenModeState {
  active: boolean;
  savedPanelStates: {
    sidebarCollapsed: boolean;
    chatCollapsed: boolean;
    terminalCollapsed: boolean;
    statusBarVisible: boolean;
    titlebarVisible: boolean;
    activityBarVisible: boolean;
  };
}

const zenState: ZenModeState = {
  active: false,
  savedPanelStates: {
    sidebarCollapsed: false,
    chatCollapsed: false,
    terminalCollapsed: true,
    statusBarVisible: true,
    titlebarVisible: true,
    activityBarVisible: true,
  },
};

// ─── UI Selectors (mirror the app layout) ────────────────
const ZEN_ELEMENTS = {
  sidebar: '#sidebar',
  chatPanel: '#chatPanel',
  terminalPanel: '#terminalPanel',
  statusBar: '.statusbar',
  titlebar: '.titlebar',
  activityBar: '.activity-bar',
  tabs: '#tabsBar',
  editorContainer: '#editorContainer',
};

// ─── Enter Zen Mode ─────────────────────────────────────
export function enterZenMode(): void {
  if (zenState.active) return;

  // Save current states
  const sidebar = document.querySelector(ZEN_ELEMENTS.sidebar) as HTMLElement;
  const chatPanel = document.querySelector(ZEN_ELEMENTS.chatPanel) as HTMLElement;
  const terminalPanel = document.querySelector(ZEN_ELEMENTS.terminalPanel) as HTMLElement;
  const statusBar = document.querySelector(ZEN_ELEMENTS.statusBar) as HTMLElement;
  const titlebar = document.querySelector(ZEN_ELEMENTS.titlebar) as HTMLElement;
  const activityBar = document.querySelector(ZEN_ELEMENTS.activityBar) as HTMLElement;
  const editorContainer = document.querySelector(ZEN_ELEMENTS.editorContainer) as HTMLElement;

  zenState.savedPanelStates = {
    sidebarCollapsed: sidebar?.style.display === 'none',
    chatCollapsed: chatPanel?.style.display === 'none',
    terminalCollapsed: terminalPanel?.style.display === 'none',
    statusBarVisible: statusBar?.style.display !== 'none',
    titlebarVisible: titlebar?.style.display !== 'none',
    activityBarVisible: activityBar?.style.display !== 'none',
  };

  // Hide everything except editor
  const fadeElements = document.querySelectorAll(`
    ${ZEN_ELEMENTS.sidebar},
    ${ZEN_ELEMENTS.chatPanel},
    ${ZEN_ELEMENTS.terminalPanel},
    ${ZEN_ELEMENTS.statusBar},
    ${ZEN_ELEMENTS.titlebar},
    ${ZEN_ELEMENTS.activityBar},
    ${ZEN_ELEMENTS.tabs}
  `);

  for (const el of fadeElements) {
    (el as HTMLElement).style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    (el as HTMLElement).style.opacity = '0';
    (el as HTMLElement).style.pointerEvents = 'none';
    setTimeout(() => {
      (el as HTMLElement).style.display = 'none';
    }, 300);
  }

  // Center editor and add aesthetic spacing
  if (editorContainer) {
    editorContainer.style.transition = 'padding 0.5s ease, max-width 0.5s ease';
    editorContainer.style.maxWidth = '900px';
    editorContainer.style.margin = '0 auto';
    editorContainer.style.padding = '60px 40px';
  }

  // Add subtle background
  document.body.style.transition = 'background 0.5s ease';
  document.body.style.background = 'var(--bg-primary)';

  // Add zen mode overlay
  const overlay = document.createElement('div');
  overlay.id = 'zenOverlay';
  overlay.style.cssText = [
    'position: fixed',
    'top: 24px',
    'left: 50%',
    'transform: translateX(-50%)',
    'color: var(--text-muted)',
    'font-size: 12px',
    'opacity: 0',
    'transition: opacity 0.5s ease',
    'z-index: 10000',
    'pointer-events: none',
  ].join(';');
  overlay.textContent = i18n.t('app.专注模式按E');
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.style.opacity = '1';
    // Fade out after 2s
    setTimeout(() => { overlay.style.opacity = '0'; }, 2000);
  }, 500);

  // Blur other UI
  const allOtherUI = document.querySelectorAll('.titlebar, .statusbar, .activity-bar, #sidebar, #chatPanel, #terminalPanel, #tabsBar');
  for (const el of allOtherUI) {
    (el as HTMLElement).style.filter = 'blur(2px)';
  }

  zenState.active = true;

  // Listen for Esc
  document.addEventListener('keydown', zenEscHandler);

  // Show toast
  import('../core/event-bus').then(({ bus }) => {
    bus.emit('toast:show', { message: '🧘 专注模式 — 按 Esc 退出', type: 'info', duration: 2500 });
  });
}

// ─── Exit Zen Mode ──────────────────────────────────────
export function exitZenMode(): void {
  if (!zenState.active) return;

  // Restore UI elements
  const elements: [string, boolean][] = [
    [ZEN_ELEMENTS.sidebar, !zenState.savedPanelStates.sidebarCollapsed],
    [ZEN_ELEMENTS.chatPanel, !zenState.savedPanelStates.chatCollapsed],
    [ZEN_ELEMENTS.terminalPanel, !zenState.savedPanelStates.terminalCollapsed],
    [ZEN_ELEMENTS.statusBar, zenState.savedPanelStates.statusBarVisible],
    [ZEN_ELEMENTS.titlebar, zenState.savedPanelStates.titlebarVisible],
    [ZEN_ELEMENTS.activityBar, zenState.savedPanelStates.activityBarVisible],
  ];

  for (const [selector, visible] of elements) {
    const el = document.querySelector(selector) as HTMLElement;
    if (el) {
      el.style.transition = 'opacity 0.3s ease, filter 0.3s ease';
      el.style.display = visible ? '' : 'none';
      el.style.opacity = visible ? '1' : '0';
      el.style.pointerEvents = visible ? '' : 'none';
      el.style.filter = '';
    }
  }

  // Restore editor
  const editorContainer = document.querySelector(ZEN_ELEMENTS.editorContainer) as HTMLElement;
  if (editorContainer) {
    editorContainer.style.maxWidth = '';
    editorContainer.style.margin = '';
    editorContainer.style.padding = '';
  }

  document.body.style.background = '';

  // Remove overlay
  const overlay = document.getElementById('zenOverlay');
  if (overlay) overlay.remove();

  // Remove blur
  const allOtherUI = document.querySelectorAll('.titlebar, .statusbar, .activity-bar, #sidebar, #chatPanel, #terminalPanel, #tabsBar');
  for (const el of allOtherUI) {
    (el as HTMLElement).style.filter = '';
  }

  // Ensure tabs are visible
  const tabs = document.querySelector(ZEN_ELEMENTS.tabs) as HTMLElement;
  if (tabs) {
    tabs.style.display = '';
    tabs.style.opacity = '1';
    tabs.style.pointerEvents = '';
  }

  zenState.active = false;
  document.removeEventListener('keydown', zenEscHandler);

  import('../core/event-bus').then(({ bus }) => {
    bus.emit('toast:show', { message: '已退出专注模式', type: 'info', duration: 1500 });
  });
}

// ─── Toggle ──────────────────────────────────────────────
export function toggleZenMode(): void {
  if (zenState.active) {
    exitZenMode();
  } else {
    enterZenMode();
  }
}

// ─── Esc Handler ────────────────────────────────────────
function zenEscHandler(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    exitZenMode();
  }
}

// ─── Status ─────────────────────────────────────────────
export function isZenModeActive(): boolean {
  return zenState.active;
}

// ─── Keyboard shortcut registration ─────────────────────
export function registerZenModeShortcut(): void {
  document.addEventListener('keydown', (e) => {
    // Ctrl+K Z or F11 toggles zen mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      // Wait for second key
      const handler = (e2: KeyboardEvent) => {
        if (e2.key === 'z' || e2.key === 'Z') {
          e2.preventDefault();
          toggleZenMode();
        }
        document.removeEventListener('keydown', handler);
      };
      document.addEventListener('keydown', handler, { once: true });
      return;
    }

    if (e.key === 'F11') {
      e.preventDefault();
      toggleZenMode();
    }
  });
}
