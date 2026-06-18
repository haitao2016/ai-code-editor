// ============================================================
// AI Code Editor v4.0 — Main Entry
// TypeScript + Vite + Zustand + Modular Architecture
// ============================================================
import './styles/main.css';
import { useEditorStore, useFilesStore, useChatStore, useUIStore, useEditorSettingsStore, useAISettingsStore, useLinterStore, useModelStore, loadChatSessions, estimateTokens, trimContextWindow } from './core/stores';
import { initMonaco, syncEditorSettings, openFileTab, saveCurrentFile, getEditorContent, getEditor } from './core/editor';
import { initDefaultFiles, loadAllFiles, saveFile, deleteFile, clearAllFiles, getLanguageFromPath, getFileIcon } from './core/files';
import { initTerminal, toggleTerminal, runActiveFileInTerminal, injectTermStyles } from './features/terminal';
import { showGitPanel, showFileTree, gitCommit } from './features/git';
import { sendChatMessage, toggleChat, clearChat, renderChatMessages, sendHint, applyCodeToEditor } from './features/chat';
import { bus } from './core/event-bus';
import { showSettings, hideSettings, saveSettings, resetSettings, resetAllData, initOllamaSettings, initRAGSettings, initCollabSettings } from './features/settings';
import { togglePreviewPanel, refreshPreview, runLinter, toggleProblemPanel } from './features/preview';
import { showPluginPanel } from './features/plugins';
import { showCollabPanel } from './features/collab-ui';
import { showSearchPanel } from './features/search';
import { showOutlinePanel, toggleOutlinePanel } from './features/outline';
import { showDiffViewer, toggleDiffViewer } from './features/diff-viewer';
import { registerSnippets, showSnippetManager } from './features/snippets';
import { showThemeEditor, showShortcutEditor } from './features/theme-editor';
import { initPlugins, pluginManager } from './plugins';
import { LSPManager } from './core/lsp-manager';
import { setLSPManager, startLSPForFile, notifyLSPChange, notifyLSPClose } from './core/lsp-bridge';
import { quickDebug, toggleBreakpointAtCursor, stopDebugSession } from './features/debug';
import { initI18n, createLanguageSwitcher } from './core/i18n';
import { initAccessibility, setupFocusStyles } from './core/a11y';
import { registerZenModeShortcut } from './features/zen-mode';
import type { FileEntry } from './types';
import type { ElectronAPI } from './types/electron';

function getElectronAPI(): ElectronAPI | undefined {
  return window.electronAPI;
}

// ─── HTML Escape (XSS prevention) ──────────────────────────
function h(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── CSP Meta Tag ──────────────────────────────────────────
function injectCSP(): void {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://esm.sh",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https://*",
    "connect-src 'self' ws: wss: https://* http://localhost:*",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
  ].join('; ');
  document.head.appendChild(meta);
}

// ─── API Key Encryption (PBKDF2-derived, no raw key in localStorage) ──
const ENC_ALGO = { name: 'AES-GCM', length: 256 };
const ENC_SALT_KEY = 'ai-code-editor-salt';
const PBKDF2_ITER = 200000;

// Build a stable device fingerprint for key derivation
function getDeviceFingerprint(): string {
  const parts = [
    navigator.hardwareConcurrency || 4,
    navigator.language,
    navigator.platform,
    screen.colorDepth,
    screen.width,
    screen.height,
    navigator.maxTouchPoints || 0,
  ];
  return parts.join('|');
}

async function deriveEncKey(): Promise<CryptoKey> {
  let saltHex = localStorage.getItem(ENC_SALT_KEY);
  let salt: Uint8Array;

  if (saltHex) {
    salt = Uint8Array.from(atob(saltHex), (c) => c.charCodeAt(0));
  } else {
    salt = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(ENC_SALT_KEY, btoa(String.fromCharCode(...salt)));
  }

  const fingerprint = new TextEncoder().encode(getDeviceFingerprint());
  const baseKey = await crypto.subtle.importKey('raw', fingerprint, 'PBKDF2', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    baseKey,
    ENC_ALGO,
    false, // non-exportable: derived key lives only in memory
    ['encrypt', 'decrypt'],
  );
}

export async function encryptAPIKey(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  try {
    const key = await deriveEncKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch { return ''; }
}

export async function decryptAPIKey(ciphertext: string): Promise<string> {
  if (!ciphertext) return '';
  try {
    const key = await deriveEncKey();
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch { return ''; }
}

// ─── Initialize ────────────────────────────────────────────
async function init(): Promise<void> {
  injectCSP();

  // Startup performance: show skeleton screen
  const { showSkeletonScreen, hideSkeletonScreen, startPerfMeasure, endPerfMeasure, logPerfMetrics } = await import('./core/startup-perf');
  showSkeletonScreen();
  startPerfMeasure('total-init');

  // Load files from IndexedDB
  startPerfMeasure('file-load');
  const fileEntries = await initDefaultFiles();
  useFilesStore.getState().loadFiles(fileEntries);
  endPerfMeasure('file-load');

  // Init Monaco
  startPerfMeasure('monaco-init');
  const container = document.getElementById('editorContainer');
  if (container) {
    await initMonaco(container);
    window.__monacoEditor = getEditor();
  }
  endPerfMeasure('monaco-init');

  // Init LSP Manager
  const rootPath = window.__workspaceRoot || '/workspace';
  const isElectron = !!getElectronAPI();
  const lspMgr = new LSPManager(rootPath, isElectron, getElectronAPI());
  setLSPManager(lspMgr);
  window.__lspManager = lspMgr;

  // Auto-start LSP for default file
  const defaultPath = 'src/index.ts';
  const defaultContent = useFilesStore.getState().files.get(defaultPath)?.content || '';
  startLSPForFile('typescript', defaultPath, defaultContent).catch(() => {});

  // Init LSP fallback (Monaco built-in TS/JS/CSS/HTML services + diagnostics sync)
  import('./core/lsp-fallback').then((m) => {
    m.initLSPFallback();
  });

  // Init RAG index (background, non-blocking)
  import('./core/rag').then((m) => {
    setTimeout(() => m.rebuildRAGIndex(), 1000); // delay to let files settle
  });

  // Init Terminal
  initTerminal();

  // Render file tree
  renderFileTree();

  // Show welcome page if no tabs open
  import('./features/welcome').then((m) => {
    if (m.shouldShowWelcome()) {
      m.showWelcomePage();
    }
  });

  // Render chat
  renderChatMessages();

  // Wire event listeners
  wireEvents();

  // Update AI status
  updateAIStatus();

  // Set up encoding status bar
  import('./features/encoding').then((m) => m.updateStatusBarEncoding());

  // Run linter
  runLinter();

  // Init plugins
  initPlugins();

  // Init Ollama settings UI
  initOllamaSettings();

  // Init RAG index (build TF-IDF immediately, try embedding later)
  import('./core/rag').then((m) => {
    m.rebuildRAGIndex();
    const idx = m.getRAGIndex();
    console.log(`[RAG] Index built: ${idx.size} chunks (TF-IDF mode)`);
  });

  // Init RAG settings UI
  initRAGSettings();

  // Init Collab settings UI
  initCollabSettings();

  // Register code snippets
  registerSnippets();

  // Inject terminal styles
  injectTermStyles();

  // Load chat sessions
  loadChatSessions().then((sessions) => {
    if (sessions.length > 0) {
      useChatStore.getState().loadSessions(sessions);
      setupSessionSelector();
    }
  });

  // Load quota records
  import('./core/quota').then((m) => {
    m.loadQuotaRecords().then((records) => {
      m.useQuotaStore.getState().loadRecords(records);
    });
  });

  // Global handles
  window._toggleTerminal = toggleTerminal;
  window._runFile = runActiveFileInTerminal;
  window._termNew = () => initTerminal();
  window.__refreshFileTree = renderFileTree;

  // Electron integration
  if (getElectronAPI()) {
    setupElectronIntegration();
  }

  // Start file system watching
  initFilesystemWatch();

  // Init auto update
  import('./features/auto-update').then((m) => m.initAutoUpdate());

  // Init i18n
  initI18n().then(() => {
    // Add language switcher to status bar when i18n is ready
    const statusRight = document.querySelector('.statusbar .right');
    if (statusRight) {
      statusRight.appendChild(createLanguageSwitcher());
    }
  });

  // Init a11y
  initAccessibility();
  setupFocusStyles();

  // Register Zen Mode shortcut
  registerZenModeShortcut();

  // Register SSH panel in command palette
  window.__showSSHPanel = () => import('./features/ssh-remote').then((m) => m.showSSHPanel());

  // End perf measurement and hide skeleton
  endPerfMeasure('total-init');
  setTimeout(() => {
    hideSkeletonScreen();
    if (import.meta.env.DEV) logPerfMetrics();
  }, 300);
}

// ─── Event Wiring ──────────────────────────────────────────
function wireEvents(): void {
  // Chat input
  const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });
  }

  // Send button
  document.getElementById('btnSend')?.addEventListener('click', sendChatMessage);

  // Stop button
  document.getElementById('btnStop')?.addEventListener('click', () => {
    import('./features/chat').then((m) => m.cancelChatRequest());
  });

  // Hint buttons
  document.querySelectorAll('.chat-hint button[data-hint]').forEach((btn) => {
    btn.addEventListener('click', () => sendHint((btn as HTMLElement).dataset.hint || ''));
  });

  // Agent / Composer buttons
  document.querySelector('.chat-hint .agent-btn')?.addEventListener('click', () => {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    if (input) { input.value = '/agent 帮我完成以下任务：'; input.focus(); }
  });
  document.querySelector('.chat-hint .composer-btn')?.addEventListener('click', () => {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    if (input) { input.value = '/composer 帮我实现以下需求：'; input.focus(); }
  });

  // Chat panel controls
  document.getElementById('btnClearChat')?.addEventListener('click', clearChat);
  document.getElementById('btnCloseChat')?.addEventListener('click', toggleChat);

  // Activity bar
  document.getElementById('btnExplorer')?.addEventListener('click', showFileTree);
  document.getElementById('btnGit')?.addEventListener('click', showGitPanel);
  document.getElementById('btnSearch')?.addEventListener('click', showSearchPanel);
  document.getElementById('btnAI')?.addEventListener('click', toggleChat);
  document.getElementById('btnTerminal')?.addEventListener('click', toggleTerminal);
  document.getElementById('btnPreview')?.addEventListener('click', togglePreviewPanel);
  document.getElementById('btnPlugins')?.addEventListener('click', showPluginPanel);
  document.getElementById('btnCollab')?.addEventListener('click', showCollabPanel);
  document.getElementById('btnOutline')?.addEventListener('click', showOutlinePanel);
  document.getElementById('btnDiff')?.addEventListener('click', toggleDiffViewer);
  document.getElementById('btnSettings')?.addEventListener('click', showSettings);

  // File tree buttons
  document.getElementById('btnNewFile')?.addEventListener('click', promptNewFile);
  document.getElementById('btnNewFolder')?.addEventListener('click', promptNewFolder);
  document.getElementById('btnRefresh')?.addEventListener('click', renderFileTree);

  // Settings modal
  document.getElementById('btnSaveSettings')?.addEventListener('click', saveSettings);
  document.getElementById('btnCancelSettings')?.addEventListener('click', hideSettings);
  document.getElementById('btnCloseSettings')?.addEventListener('click', hideSettings);
  document.getElementById('btnResetSettings')?.addEventListener('click', resetSettings);
  document.getElementById('btnResetData')?.addEventListener('click', () => {
    if (confirm('确定要清除所有数据？此操作不可撤销！')) resetAllData();
  });

  // Settings modal overlay click to close
  document.getElementById('settingsModal')?.addEventListener('click', function(this: HTMLElement, e: MouseEvent) {
    if (e.target === this) hideSettings();
  });

  // Theme selector
  document.getElementById('settingTheme')?.addEventListener('change', (e) => {
    useEditorSettingsStore.getState().setTheme((e.target as HTMLSelectElement).value as any);
  });

  // Font size
  document.getElementById('settingFontSize')?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    const label = document.getElementById('fontSizeLabel');
    if (label) label.textContent = val + 'px';
    useEditorSettingsStore.getState().setFontSize(Number(val));
  });

  // Status bar clicks
  document.getElementById('statusErrors')?.addEventListener('click', toggleProblemPanel);
  document.getElementById('statusGit')?.addEventListener('click', showGitPanel);

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 's': e.preventDefault(); saveCurrentFile(); break;
        case 'p': e.preventDefault(); showCommandPalette(); break;
        case 'n': e.preventDefault(); promptNewFile(); break;
        case 'b': e.preventDefault(); useUIStore.getState().toggleSidebar(); break;
        case '\\': e.preventDefault();
          import('./features/split-view').then((m) => m.toggleSplitView('horizontal'));
          break;
        case '`': e.preventDefault(); toggleChat(); break;
        case ',': e.preventDefault(); showSettings(); break;
        case 'f':
          if (e.shiftKey) { e.preventDefault(); showSearchPanel(); }
          break;
        case 'o': e.preventDefault(); showOutlinePanel(); break;
        case 'd':
          if (e.shiftKey) { e.preventDefault(); toggleDiffViewer(); }
          break;
      }
    }

    // Debug shortcuts (no Ctrl)
    if (!e.ctrlKey && !e.metaKey) {
      switch (e.key) {
        case 'F5':
          e.preventDefault();
          if (e.shiftKey) {
            stopDebugSession();
          } else {
            quickDebug();
          }
          break;
        case 'F9':
          e.preventDefault();
          toggleBreakpointAtCursor();
          break;
        case 'F':
          if (e.altKey && e.shiftKey) {
            e.preventDefault();
            import('./features/format').then((m) => m.formatDocument());
          }
          break;
      }
    }
  });

  // Sidebar resize
  setupResize('sidebarResize', 'sidebar', 'width', 160, 500);
  setupResize('chatResize', 'chatPanel', 'width', 200, 600, true);

  // Window controls
  document.getElementById('btnFullscreen')?.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  });

  // ─── Phase 7: Model selector in chat header ──────────────
  setupModelSelector();
  setupImageUpload();
  setupVoiceInput();
}

// ─── File Tree Rendering (optimized: RAF-batched + cache) ──
let _treeRAF: ReturnType<typeof requestAnimationFrame> | null = null;
let _lastTreeHTML: string = '';

function renderFileTree(): void {
  if (_treeRAF !== null) return; // Already scheduled
  _treeRAF = requestAnimationFrame(() => {
    _treeRAF = null;
    _renderFileTreeNow();
  });
}

function _renderFileTreeNow(): void {
  const tree = document.getElementById('fileTree');
  if (!tree) return;

  const files = useFilesStore.getState().files;
  const entries = Array.from(files.entries()).map(([path, entry]) => ({ path, ...entry }));
  entries.sort((a, b) => a.path.localeCompare(b.path));

  // Build folder tree structure
  const root: Record<string, any> = { __children: [] };

  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        current.__children.push({ type: 'file', name: part, path: entry.path, icon: getFileIcon(entry.path, false) });
      } else {
        if (!current[part]) {
          current[part] = { __children: [], __open: true };
        }
        current = current[part];
      }
    }
  }

  function renderNode(node: any, depth: number): string {
    let html = '';

    // Render subdirectories
    const dirNames = Object.keys(node).filter((k) => k !== '__children' && k !== '__open');
    for (const dirName of dirNames) {
      const dir = node[dirName];
      const indent = depth * 16;
      const open = dir.__open !== false;
      html += `<div class="tree-item folder" style="padding-left:${indent}px" data-folder="${dirName}" data-depth="${depth}">
        <span class="icon">${open ? '📂' : '📁'}</span><span class="name">${h(dirName)}</span>
      </div>`;
      if (open) {
        html += renderNode(dir, depth + 1);
      }
    }

    // Render files
    for (const file of node.__children) {
      const indent = depth * 16;
      const active = useEditorStore.getState().activeFile === file.path ? ' active' : '';
      html += `<div class="tree-item file${active}" style="padding-left:${indent}px" data-path="${h(file.path)}" data-type="file">
        <span class="icon">${file.icon}</span><span class="name">${h(file.name)}</span>
      </div>`;
    }

    return html;
  }

  const newHTML = renderNode(root, 0);
  if (newHTML !== _lastTreeHTML) {
    _lastTreeHTML = newHTML;
    tree.innerHTML = newHTML;
  }

  // Delegate clicks — avoids XSS via inline onclick
  tree.onclick = (e) => {
    const target = (e.target as HTMLElement).closest('[data-path]') as HTMLElement;
    if (!target) {
      // Check folder toggle
      const folder = (e.target as HTMLElement).closest('[data-folder]') as HTMLElement;
      if (folder) {
        const dirName = folder.dataset.folder || '';
        const depth = parseInt(folder.dataset.depth || '0');
        // Toggle open state by rerendering
        toggleFolder(dirName, depth);
        return;
      }
      return;
    }
    const path = target.dataset.path || '';
    const entry = useFilesStore.getState().files.get(path);
    if (entry) {
      openFileTab(path, entry.content);
      import('./features/welcome').then((m) => m.addRecentFile(path));
      renderTabs();
      renderFileTree();
    }
  };

  // Context menu
  tree.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });
}

function toggleFolder(dirName: string, depth: number): void {
  // Simple toggle — just re-render the whole tree with the folder toggled state
  // For now, use a Set to track closed folders
  if (!window.__closedFolders) {
    window.__closedFolders = new Set<string>();
  }
  const closed: Set<string> = window.__closedFolders;
  const key = `${String(depth)}:${dirName}`;
  if (closed.has(key)) {
    closed.delete(key);
  } else {
    closed.add(key);
  }
  renderFileTreeWithState(closed);
}

function renderFileTreeWithState(closed: Set<string>): void {
  const tree = document.getElementById('fileTree');
  if (!tree) return;

  const files = useFilesStore.getState().files;
  const entries = Array.from(files.entries()).map(([path, entry]) => ({ path, ...entry }));
  entries.sort((a, b) => a.path.localeCompare(b.path));

  const root: Record<string, any> = { __children: [] };
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        current.__children.push({ type: 'file', name: part, path: entry.path, icon: getFileIcon(entry.path, false) });
      } else {
        if (!current[part]) {
          const key = `${String(i + 1)}:${part}`;
          current[part] = { __children: [], __open: !closed.has(key) };
        }
        current = current[part];
      }
    }
  }

  function renderNode(node: any, depth: number): string {
    let html = '';
    const dirNames = Object.keys(node).filter((k) => k !== '__children' && k !== '__open');
    for (const dirName of dirNames) {
      const dir = node[dirName];
      const indent = depth * 16;
      const open = dir.__open !== false;
      html += `<div class="tree-item folder" style="padding-left:${indent}px" data-folder="${h(dirName)}" data-depth="${depth}">
        <span class="icon">${open ? '📂' : '📁'}</span><span class="name">${h(dirName)}</span>
      </div>`;
      if (open) html += renderNode(dir, depth + 1);
    }
    for (const file of node.__children) {
      const indent = depth * 16;
      const active = useEditorStore.getState().activeFile === file.path ? ' active' : '';
      html += `<div class="tree-item file${active}" style="padding-left:${indent}px" data-path="${h(file.path)}" data-type="file">
        <span class="icon">${file.icon}</span><span class="name">${h(file.name)}</span>
      </div>`;
    }
    return html;
  }

  const newHTML = renderNode(root, 0);
  if (newHTML !== _lastTreeHTML) {
    _lastTreeHTML = newHTML;
    tree.innerHTML = newHTML;
  }
  tree.onclick = (e) => {
    const target = (e.target as HTMLElement).closest('[data-path]') as HTMLElement;
    if (!target) {
      const folder = (e.target as HTMLElement).closest('[data-folder]') as HTMLElement;
      if (folder) {
        const dirName = folder.dataset.folder || '';
        const depth = parseInt(folder.dataset.depth || '0');
        toggleFolder(dirName, depth);
        return;
      }
      return;
    }
    const path = target.dataset.path || '';
    const entry = useFilesStore.getState().files.get(path);
    if (entry) {
      openFileTab(path, entry.content);
      import('./features/welcome').then((m) => m.addRecentFile(path));
      renderTabs();
      renderFileTree();
    }
  };
  tree.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });
}

function renderTabs(): void {
  const bar = document.getElementById('tabsBar');
  if (!bar) return;

  const store = useEditorStore.getState();
  const tabs = store.openTabs;
  const active = store.activeFile;
  const dirty = store.dirtyFiles;

  bar.innerHTML = tabs
    .map((path) => {
      const isActive = path === active;
      const isDirty = dirty.has(path);
      const icon = getFileIcon(path, false);
      const name = path.split('/').pop() || path;
      return `<div class="tab${isActive ? ' active' : ''}${isDirty ? ' dirty' : ''}" data-tab="${h(path)}">
        <span class="tab-icon">${icon}</span>
        <span class="tab-label">${h(name)}</span>
        <span class="tab-close" data-close="${h(path)}">×</span>
      </div>`;
    })
    .join('');

  if (tabs.length > 0) {
    const empty = document.getElementById('emptyState');
    if (empty) empty.style.display = 'none';
  }

  // Delegate tab clicks
  bar.onclick = (e) => {
    const closeBtn = (e.target as HTMLElement).closest('[data-close]') as HTMLElement;
    if (closeBtn) {
      e.stopPropagation();
      const closePath = closeBtn.dataset.close || '';
      useEditorStore.getState().closeTab(closePath);
      renderTabs();
      renderFileTree();
      if (!useEditorStore.getState().activeFile) {
        const empty = document.getElementById('emptyState');
        if (empty) empty.style.display = 'flex';
      }
      return;
    }
    const tab = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement;
    if (tab) {
      const tabPath = tab.dataset.tab || '';
      const entry = useFilesStore.getState().files.get(tabPath);
      if (entry) {
        openFileTab(tabPath, entry.content);
        import('./features/welcome').then((m) => m.addRecentFile(tabPath));
        renderTabs();
        renderFileTree();
      }
    }
  };
}

// ─── New File ──────────────────────────────────────────────
function promptNewFile(): void {
  const name = prompt('输入文件名 (如 my-component.tsx):');
  if (!name) return;

  const file: FileEntry = {
    path: name,
    content: '',
    language: getLanguageFromPath(name),
    updatedAt: Date.now(),
  };

  useFilesStore.getState().setFile(file);
  saveFile(file).then(() => {
    renderFileTree();
    openFileTab(name, '');
    renderTabs();
  });
}

function promptNewFolder(): void {
  const name = prompt('输入文件夹名:');
  if (!name) return;

  const file: FileEntry = {
    path: name + '/',
    content: '',
    language: 'plaintext',
    updatedAt: Date.now(),
  };

  useFilesStore.getState().setFile(file);
  saveFile(file).then(() => renderFileTree());
}

// ─── Context Menu ──────────────────────────────────────────
function showContextMenu(x: number, y: number): void {
  const menu = document.getElementById('contextMenu');
  if (!menu) return;

  menu.innerHTML = `
    <div class="menu-item" onclick="document.getElementById('btnNewFile')?.click();hideMenu()">📄 新建文件</div>
    <div class="menu-item" onclick="document.getElementById('btnNewFolder')?.click();hideMenu()">📁 新建文件夹</div>
    <div class="menu-separator"></div>
    <div class="menu-item" onclick="document.getElementById('btnRefresh')?.click();hideMenu()">↻ 刷新</div>
  `;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('show');

  const hideMenu = () => menu.classList.remove('show');
  document.addEventListener('click', hideMenu, { once: true });
}

// ─── Resize Handle ─────────────────────────────────────────
function setupResize(handleId: string, targetId: string, property: string, min: number, max: number, reverse: boolean = false): void {
  const handle = document.getElementById(handleId);
  const target = document.getElementById(targetId);
  if (!handle || !target) return;

  let startPos = 0;
  let startSize = 0;

  handle.addEventListener('mousedown', (e) => {
    startPos = property === 'width' ? e.clientX : e.clientY;
    startSize = parseInt(getComputedStyle(target)[property as any]);
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const delta = property === 'width' ? ev.clientX - startPos : ev.clientY - startPos;
      const newSize = reverse ? startSize - delta : startSize + delta;
      target.style[property as any] = Math.max(min, Math.min(max, newSize)) + 'px';
    };

    const onUp = () => {
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ─── Command Palette ───────────────────────────────────────
function showCommandPalette(): void {
  const cmds = [
    { icon: '🔍', name: '全局搜索', shortcut: 'Ctrl+Shift+F', action: showSearchPanel },
    { icon: '📄', name: '新建文件', shortcut: 'Ctrl+N', action: promptNewFile },
    { icon: '💾', name: '保存文件', shortcut: 'Ctrl+S', action: saveCurrentFile },
    { icon: '🔍', name: '切换侧栏', shortcut: 'Ctrl+B', action: () => useUIStore.getState().toggleSidebar() },
    { icon: '🤖', name: 'AI 助手', shortcut: 'Ctrl+`', action: toggleChat },
    { icon: '>_', name: '终端', shortcut: '', action: toggleTerminal },
    { icon: '▶', name: '实时预览', shortcut: '', action: togglePreviewPanel },
    { icon: '⎇', name: 'Git: 打开面板', shortcut: '', action: showGitPanel },
    { icon: '🔌', name: '插件管理', shortcut: '', action: showPluginPanel },
    { icon: '🌐', name: '实时协作', shortcut: '', action: showCollabPanel },
    { icon: '📋', name: '符号大纲', shortcut: '', action: showOutlinePanel },
    { icon: '📊', name: '差异对比', shortcut: '', action: toggleDiffViewer },
    { icon: '📦', name: '代码片段管理', shortcut: '', action: showSnippetManager },
    { icon: '🎨', name: '主题编辑器', shortcut: '', action: showThemeEditor },
    { icon: '⌨', name: '快捷键设置', shortcut: '', action: showShortcutEditor },
    { icon: '🐛', name: '启动调试', shortcut: 'F5', action: quickDebug },
    { icon: '■', name: '停止调试', shortcut: 'Shift+F5', action: stopDebugSession },
    { icon: '🔴', name: '切换断点', shortcut: 'F9', action: toggleBreakpointAtCursor },
    { icon: '✨', name: '格式化代码', shortcut: 'Shift+Alt+F', action: () => import('./features/format').then((m) => m.formatDocument()) },
    { icon: '⬌', name: '分屏编辑 (水平)', shortcut: 'Ctrl+\\', action: () => import('./features/split-view').then((m) => m.toggleSplitView('horizontal')) },
    { icon: '⬍', name: '关闭分屏', shortcut: '', action: () => import('./features/split-view').then((m) => m.closeSplitView()) },
    { icon: '🛒', name: '插件市场', shortcut: '', action: () => import('./features/marketplace').then((m) => m.showMarketplace()) },
    { icon: '⏱', name: '编辑历史时间线', shortcut: '', action: showTimelinePanel },
    { icon: '🔤', name: '文件编码管理', shortcut: '', action: () => import('./features/encoding').then((m) => m.showEncodingSelector()) },
    { icon: '🔄', name: '检查更新', shortcut: '', action: () => import('./features/auto-update').then((m) => m.checkForUpdates()) },
    { icon: '⚙', name: '打开设置', shortcut: 'Ctrl+,', action: showSettings },
    { icon: '❓', name: '关于 AI Code Editor v4.0', shortcut: '', action: () => alert('AI Code Editor v4.0\nTypeScript + Vite + Zustand\nSplit View · Marketplace · Timeline') },
    { icon: '🧘', name: '专注模式 (Zen Mode)', shortcut: 'F11', action: () => import('./features/zen-mode').then((m) => m.toggleZenMode()) },
    { icon: '🔗', name: 'SSH 远程连接', shortcut: '', action: () => import('./features/ssh-remote').then((m) => m.showSSHPanel()) },
    { icon: '🌐', name: '切换语言 (Language)', shortcut: '', action: () => import('./core/i18n').then(({ i18n }) => {
      i18n.setLocale(i18n.getLocale() === 'zh-CN' ? 'en' : 'zh-CN');
    })},
  ];

  let palette = document.getElementById('commandPalette');
  if (!palette) {
    palette = document.createElement('div');
    palette.id = 'commandPalette';
    palette.className = 'command-palette';
    palette.innerHTML = '<input type="text" id="cmdInput" placeholder="输入命令..."><div class="results" id="cmdResults"></div>';
    document.body.appendChild(palette);
  }

  palette.classList.add('show');

  const input = palette.querySelector('input') as HTMLInputElement;
  input.value = '';
  input.focus();

  const render = (filter: string = '') => {
    const results = document.getElementById('cmdResults');
    if (!results) return;
    const filtered = cmds.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));
    results.innerHTML = filtered
      .map((c) => `<div class="result-item" data-action="${c.name}">
        <span class="cmd-icon">${c.icon}</span><span class="cmd-name">${c.name}</span>
        <span class="cmd-shortcut">${c.shortcut}</span>
      </div>`)
      .join('');

    results.querySelectorAll('.result-item').forEach((item) => {
      item.addEventListener('click', () => {
        const action = (item as HTMLElement).dataset.action;
        const cmd = cmds.find((c) => c.name === action);
        cmd?.action();
        palette?.classList.remove('show');
      });
    });
  };

  input.addEventListener('input', () => render(input.value));
  render();

  const close = () => {
    palette?.classList.remove('show');
    document.removeEventListener('click', close);
    document.removeEventListener('keydown', closeKey);
  };
  const closeKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  setTimeout(() => {
    document.addEventListener('click', close);
    document.addEventListener('keydown', closeKey);
  }, 100);
}

// ─── Phase 7: Model Selector ────────────────────────────────
function setupModelSelector(): void {
  const chatHeader = document.querySelector('.chat-header .title');
  if (!chatHeader) return;

  const selector = document.createElement('select');
  selector.id = 'chatModelSelector';
  selector.style.cssText = 'margin-left:8px;background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-primary);font-size:11px;padding:1px 4px;border-radius:4px;max-width:120px;';

  const modelStore = useModelStore.getState();
  modelStore.models.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    opt.selected = m.id === modelStore.activeModelId;
    selector.appendChild(opt);
  });

  selector.addEventListener('change', () => {
    useModelStore.setState({ activeModelId: selector.value });
  });

  chatHeader.appendChild(selector);
}

// ─── Phase 7: Image Upload ─────────────────────────────────
function setupImageUpload(): void {
  const chatPanel = document.getElementById('chatPanel');
  if (!chatPanel) return;

  // Add image preview area above input
  const previewDiv = document.createElement('div');
  previewDiv.id = 'imagePreview';
  previewDiv.style.cssText = 'padding:4px 14px 0;display:flex;gap:6px;flex-wrap:wrap;';
  const inputArea = document.querySelector('.chat-input-area');
  if (inputArea) inputArea.insertBefore(previewDiv, inputArea.firstChild);

  // Add upload button
  const wrapper = document.querySelector('.chat-input-wrapper');
  if (wrapper) {
    const uploadBtn = document.createElement('button');
    uploadBtn.title = '上传图片';
    uploadBtn.style.cssText = 'background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-muted);width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:14px;flex-shrink:0;align-self:flex-end;';
    uploadBtn.textContent = '🖼';
    uploadBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.multiple = true;
      fileInput.addEventListener('change', () => {
        if (fileInput.files) {
          Array.from(fileInput.files).forEach((file) => {
            const reader = new FileReader();
            reader.onload = () => {
              window.__pendingImages = window.__pendingImages || [];
              window.__pendingImages.push(reader.result as string);
              renderImagePreviews();
            };
            reader.readAsDataURL(file);
          });
        }
      });
      fileInput.click();
    });
    wrapper.appendChild(uploadBtn);
  }

  // Drag and drop on chat panel
  chatPanel.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  chatPanel.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer?.files) {
      Array.from(e.dataTransfer.files).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
          window.__pendingImages = window.__pendingImages || [];
          window.__pendingImages.push(reader.result as string);
          renderImagePreviews();
        };
        reader.readAsDataURL(file);
      });
    }
  });

  window._clearImages = () => {
    window.__pendingImages = [];
    renderImagePreviews();
  };
}

function renderImagePreviews(): void {
  const container = document.getElementById('imagePreview');
  if (!container) return;
  const images = window.__pendingImages || [];
  container.innerHTML = images
    .map((img: string, i: number) => `
      <div style="position:relative;width:48px;height:48px;border-radius:4px;overflow:hidden;border:1px solid var(--border-color);">
        <img src="${img}" style="width:100%;height:100%;object-fit:cover;">
        <button onclick="window.__removeImage?.(${i})" style="position:absolute;top:0;right:0;background:rgba(0,0,0,0.6);border:none;color:white;font-size:10px;width:14px;height:14px;line-height:14px;cursor:pointer;padding:0;">✕</button>
      </div>
    `)
    .join('');
  window.__removeImage = (i: number) => {
    window.__pendingImages = (window.__pendingImages || []).filter((_: string, idx: number) => idx !== i);
    renderImagePreviews();
  };
}

// ─── Phase 7: Voice Input ──────────────────────────────────
function setupVoiceInput(): void {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;

  const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = true;

  const wrapper = document.querySelector('.chat-input-wrapper');
  if (!wrapper) return;

  const voiceBtn = document.createElement('button');
  voiceBtn.title = '语音输入';
  voiceBtn.style.cssText = 'background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-muted);width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:14px;flex-shrink:0;align-self:flex-end;';
  voiceBtn.textContent = '🎤';
  let isListening = false;

  voiceBtn.addEventListener('click', () => {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    if (!input) return;

    if (isListening) {
      recognition.stop();
      return;
    }

    isListening = true;
    voiceBtn.textContent = '🔴';
    voiceBtn.style.color = 'var(--error)';
    recognition.start();
  });

  recognition.onresult = (event: any) => {
    const input = document.getElementById('chatInput') as HTMLTextAreaElement;
    if (!input) return;
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    input.value = transcript;
  };

  recognition.onend = () => {
    isListening = false;
    voiceBtn.textContent = '🎤';
    voiceBtn.style.color = 'var(--text-muted)';
  };

  recognition.onerror = () => {
    isListening = false;
    voiceBtn.textContent = '🎤';
    voiceBtn.style.color = 'var(--text-muted)';
  };

  wrapper.appendChild(voiceBtn);
}

// ─── AI Status ─────────────────────────────────────────────
function updateAIStatus(): void {
  const aiSettings = useAISettingsStore.getState() as any;
  const dot = document.getElementById('aiStatusDot');
  const label = document.getElementById('aiStatusLabel');
  if (aiSettings.endpoint && aiSettings.apiKey) {
    if (dot) dot.style.background = 'var(--success)';
    if (label) { label.textContent = '已连接'; label.className = 'status ok'; }
  } else {
    if (dot) dot.style.background = 'var(--warning)';
    if (label) { label.textContent = '未配置'; label.className = 'status warn'; }
  }
}

// ─── Enhanced Notification System ─────────────────────────
interface ActiveNotification {
  id: string;
  el: HTMLElement;
  type: 'toast' | 'persistent' | 'progress';
  timer?: ReturnType<typeof setTimeout>;
}

const activeNotifications: ActiveNotification[] = [];
const MAX_VISIBLE = 5;

let notificationContainer: HTMLElement | null = null;

function getNotificationContainer(): HTMLElement {
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notificationContainer';
    notificationContainer.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:10000;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;';
    document.body.appendChild(notificationContainer);
  }
  return notificationContainer;
}

function createNotificationEl(
  message: string,
  type: 'info' | 'success' | 'error' | 'warning',
  persistent: boolean,
  progress?: number,
): HTMLElement {
  const colors: Record<string, string> = {
    info: 'var(--info)',
    success: 'var(--success)',
    error: 'var(--error)',
    warning: 'var(--warning)',
  };
  const icons: Record<string, string> = {
    info: 'ℹ',
    success: '✓',
    error: '✕',
    warning: '⚠',
  };

  const el = document.createElement('div');
  el.className = 'notification-item';
  el.style.cssText = `pointer-events:auto;display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-primary);border:1px solid var(--border-color);border-left:3px solid ${colors[type]};border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);min-width:280px;max-width:420px;animation:slideInRight 0.25s ease-out;font-size:13px;`;

  if (progress !== undefined) {
    el.innerHTML = `
      <span style="color:${colors[type]};font-size:16px;flex-shrink:0;">${icons[type]}</span>
      <div style="flex:1;min-width:0;">
        <div style="margin-bottom:6px;">${message}</div>
        <div style="background:var(--bg-hover);border-radius:4px;height:4px;overflow:hidden;">
          <div style="background:${colors[type]};height:100%;width:${Math.min(100, progress)}%;transition:width 0.3s ease;"></div>
        </div>
      </div>
      ${persistent ? '<button class="notif-close" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;flex-shrink:0;padding:0 2px;">✕</button>' : ''}
    `;
  } else {
    el.innerHTML = `
      <span style="color:${colors[type]};font-size:16px;flex-shrink:0;">${icons[type]}</span>
      <span style="flex:1;min-width:0;word-break:break-word;">${message}</span>
      ${persistent ? '<button class="notif-close" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;flex-shrink:0;padding:0 2px;">✕</button>' : ''}
    `;
  }

  // Close button handler
  const closeBtn = el.querySelector('.notif-close') as HTMLElement;
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dismissNotification(idFromEl(el)));
  }

  return el;
}

function idFromEl(el: HTMLElement): string {
  const notif = activeNotifications.find((n) => n.el === el);
  return notif?.id || '';
}

function dismissNotification(id: string): void {
  const idx = activeNotifications.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const notif = activeNotifications[idx];
  if (notif.timer) clearTimeout(notif.timer);
  notif.el.style.animation = 'slideOutRight 0.2s ease-in forwards';
  setTimeout(() => {
    notif.el.remove();
    activeNotifications.splice(
      activeNotifications.findIndex((n) => n.id === id),
      1,
    );
  }, 200);
}

// Legacy: keep backward compatibility
export function showToast(message: string): void {
  bus.emit('toast:show', { message, type: 'info', duration: 3000 });
}

// Modern: typed notification API
export function showNotification(
  message: string,
  type: 'info' | 'success' | 'error' | 'warning' = 'info',
  options: { persistent?: boolean; duration?: number; progress?: number } = {},
): string {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const container = getNotificationContainer();

  // Clean up expired toasts
  while (activeNotifications.length >= MAX_VISIBLE) {
    const oldest = activeNotifications.shift();
    if (oldest) {
      if (oldest.timer) clearTimeout(oldest.timer);
      oldest.el.remove();
    }
  }

  const el = createNotificationEl(message, type, options.persistent || false, options.progress);
  container.appendChild(el);

  const notif: ActiveNotification = { id, el, type: options.progress !== undefined ? 'progress' : options.persistent ? 'persistent' : 'toast' };

  if (!options.persistent && options.duration !== 0) {
    notif.timer = setTimeout(() => dismissNotification(id), options.duration || 3500);
  }

  activeNotifications.push(notif);
  return id;
}

export function updateNotificationProgress(id: string, progress: number, message?: string): void {
  const notif = activeNotifications.find((n) => n.id === id);
  if (!notif) return;
  const progressBar = notif.el.querySelector('div > div > div') as HTMLElement;
  if (progressBar) {
    progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  }
  if (progress >= 100) {
    setTimeout(() => dismissNotification(id), 1500);
  }
}

// ─── Set up event bus listeners for notifications ─────────
bus.on('toast:show', ({ message, type = 'info', duration = 3000 }) => {
  showNotification(message, type, { duration });
});

// ─── Electron Integration ─────────────────────────────────
function setupElectronIntegration(): void {
  const electron = getElectronAPI();
  if (!electron) return;

  // Window controls
  const titlebar = document.querySelector('.titlebar');
  if (titlebar) {
    const actions = titlebar.querySelector('.actions');
    if (actions) {
      actions.innerHTML = '';
      const btnMin = document.createElement('button');
      btnMin.title = '最小化';
      btnMin.textContent = '─';
      btnMin.addEventListener('click', () => electron.minimize());

      const btnMax = document.createElement('button');
      btnMax.title = '最大化';
      btnMax.textContent = '□';
      btnMax.addEventListener('click', () => {
        electron.maximize();
        btnMax.textContent = electron.isMaximized() ? '❐' : '□';
      });

      const btnClose = document.createElement('button');
      btnClose.title = '关闭';
      btnClose.className = 'close';
      btnClose.textContent = '✕';
      btnClose.addEventListener('click', () => electron.close());

      actions.appendChild(btnMin);
      actions.appendChild(btnMax);
      actions.appendChild(btnClose);
    }
  }

  // System menu events
  electron.fs.readDir; // just type-check access
  // Menu: open folder
  const onMenuOpenFolder = async () => {
    const folderPath = await electron.openFolder();
    if (folderPath) {
      showToast(`打开文件夹: ${folderPath}`);
      const result = await electron.fs.readDir(folderPath);
      if (result.success && result.items) {
        const filesStore = useFilesStore.getState();
        for (const item of result.items) {
          if (!item.isDir && item.size < 1024 * 1024) {
            const fileResult = await electron.fs.readFile(item.path);
            if (fileResult.success && fileResult.content !== undefined) {
              filesStore.setFile({
                path: item.path,
                content: fileResult.content,
                language: getLanguageFromPath(item.path),
                updatedAt: item.modified,
              });
              await saveFile({
                path: item.path,
                content: fileResult.content,
                language: getLanguageFromPath(item.path),
                updatedAt: item.modified,
              });
            }
          }
        }
        loadAllFiles(filesStore.files);
        renderFileTree();
      }
    }
  };

  // Listen for menu events from main process
  electron.on('menu:openFolder', onMenuOpenFolder);
  electron.on('menu:save', saveCurrentFile);
  electron.on('menu:toggleSidebar', () => useUIStore.getState().toggleSidebar());
  electron.on('menu:toggleAI', toggleChat);
  electron.on('menu:toggleTerminal', toggleTerminal);
  electron.on('menu:commandPalette', showCommandPalette);

  // Status bar update
  electron.getAppInfo().then((info) => {
    const statusBarRight = document.querySelector('.statusbar .right');
    if (statusBarRight) {
      const el = document.createElement('span');
      el.className = 'item';
      el.textContent = `⚡ Electron v${info.version}`;
      el.style.opacity = '0.6';
      statusBarRight.appendChild(el);
    }
  });
}

// ─── Session Selector ──────────────────────────────────────
function setupSessionSelector(): void {
  const chatHeader = document.querySelector('.chat-header .title');
  if (!chatHeader) return;

  // Add "New Session" button
  const newBtn = document.createElement('button');
  newBtn.id = 'btnNewSession';
  newBtn.title = '新建会话';
  newBtn.textContent = '+';
  newBtn.style.cssText =
    'background:var(--info);color:white;border:none;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:14px;line-height:1;margin-right:4px;flex-shrink:0;';
  newBtn.addEventListener('click', () => {
    const store = useChatStore.getState();
    const newId = store.createSession();
    renderChatMessages();
    setupSessionSelector();
    showToast('新会话已创建');
  });

  // Add session selector dropdown
  const selector = document.createElement('select');
  selector.id = 'sessionSelector';
  selector.style.cssText =
    'margin-left:4px;background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-primary);font-size:11px;padding:1px 3px;border-radius:4px;max-width:100px;flex-shrink:1;';

  const store = useChatStore.getState();
  // Add current session if not in list
  if (store.activeSessionId && !store.sessions.find((s) => s.id === store.activeSessionId)) {
    // Default session
    const opt = document.createElement('option');
    opt.value = 'default';
    opt.textContent = '当前会话';
    opt.selected = true;
    selector.appendChild(opt);
  }

  store.sessions.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name.substring(0, 12);
    opt.selected = s.id === store.activeSessionId;
    selector.appendChild(opt);
  });

  selector.addEventListener('change', () => {
    store.switchSession(selector.value);
    renderChatMessages();
  });

  // Add delete session button
  const delBtn = document.createElement('button');
  delBtn.id = 'btnDeleteSession';
  delBtn.title = '删除当前会话';
  delBtn.textContent = '🗑';
  delBtn.style.cssText =
    'background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;margin-left:2px;padding:0 2px;opacity:0.6;flex-shrink:0;';
  delBtn.addEventListener('click', () => {
    if (store.sessions.length <= 0) {
      showToast('没有可删除的会话');
      return;
    }
    if (confirm('确定删除当前会话？此操作不可撤销！')) {
      store.deleteSession(store.activeSessionId);
      renderChatMessages();
      setupSessionSelector();
      showToast('会话已删除');
    }
  });

  // Wrap title with session controls
  const existingSelector = document.getElementById('sessionSelector');
  if (existingSelector) existingSelector.remove();
  const existingNewBtn = document.getElementById('btnNewSession');
  if (existingNewBtn) existingNewBtn.remove();
  const existingDelBtn = document.getElementById('btnDeleteSession');
  if (existingDelBtn) existingDelBtn.remove();

  // Insert before any existing selector/model selector
  const modelSelector = document.getElementById('chatModelSelector');
  if (modelSelector) {
    chatHeader.insertBefore(newBtn, modelSelector);
    chatHeader.insertBefore(selector, modelSelector);
    chatHeader.insertBefore(delBtn, modelSelector);
  } else {
    chatHeader.appendChild(newBtn);
    chatHeader.appendChild(selector);
    chatHeader.appendChild(delBtn);
  }
}

// ─── File System Watch ─────────────────────────────────────
let fsWatchInterval: ReturnType<typeof setInterval> | null = null;

function initFilesystemWatch(): void {
  // Electron: use native fs.watch via IPC
  const electron = getElectronAPI();
  if (electron?.fs?.watch) {
    electron.fs.watch({ recursive: true }).then(() => {
      // Watch started successfully
    }).catch(() => {
      // Fallback to polling
      startWatchPolling();
    });

    // Listen for file change events
    if (electron.on) {
      electron.on('fs:fileChanged', (data: { path: string; event: string }) => {
        handleFileChange(data.path, data.event);
      });
    }
  } else {
    // Web: use polling
    startWatchPolling();
  }
}

function startWatchPolling(): void {
  if (fsWatchInterval) return;

  // Check every 3 seconds
  fsWatchInterval = setInterval(() => {
    const files = useFilesStore.getState().files;
    let hasChanges = false;

    for (const [path, entry] of files.entries()) {
      // Check if file was modified externally
      const storedAt = entry.updatedAt;
      const now = Date.now();
      // In a real polling scenario, we'd compare with server/file system timestamps
      // For now, this serves as a framework for the polling mechanism
    }

    if (hasChanges) {
      renderFileTree();
    }
  }, 3000);
}

function handleFileChange(path: string, event: string): void {
  const electron = getElectronAPI();
  if (!electron) return;

  if (event === 'rename' || event === 'change') {
    // Reload file content
    electron.fs.readFile(path).then((result: any) => {
      if (result.success && result.content !== undefined) {
        const currentEntry = useFilesStore.getState().files.get(path);
        if (currentEntry && currentEntry.content !== result.content) {
          showToast(`📄 ${path} 已在外部修改`);
        }
        useFilesStore.getState().setFile({
          path,
          content: result.content,
          language: getLanguageFromPath(path),
          updatedAt: Date.now(),
        });
        saveFile({
          path,
          content: result.content,
          language: getLanguageFromPath(path),
          updatedAt: Date.now(),
        }).then(() => {
          loadAllFiles(useFilesStore.getState().files);
          renderFileTree();
        });
      }
    }).catch(() => {});
  } else if (event === 'rename-delete') {
    useFilesStore.getState().deleteFile(path);
    renderFileTree();
    showToast(`🗑 ${path} 已被删除`);
  }
}

function stopFilesystemWatch(): void {
  if (fsWatchInterval) {
    clearInterval(fsWatchInterval);
    fsWatchInterval = null;
  }
}

// ─── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

// ─── Timeline Panel ────────────────────────────────────────
function showTimelinePanel(): void {
  import('./features/timeline').then((m) => m.toggleTimelinePanel());
}
