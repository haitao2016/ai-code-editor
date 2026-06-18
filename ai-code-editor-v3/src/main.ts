// ============================================================
// AI Code Editor v3.0 — Main Entry
// TypeScript + Vite + Zustand + Modular Architecture
// ============================================================
import './styles/main.css';
import { useEditorStore, useFilesStore, useChatStore, useUIStore, useEditorSettingsStore, useAISettingsStore, useLinterStore, useModelStore, loadChatSessions, estimateTokens, trimContextWindow } from './core/stores';
import { initMonaco, syncEditorSettings, openFileTab, saveCurrentFile, getEditorContent, getEditor } from './core/editor';
import { initDefaultFiles, loadAllFiles, saveFile, deleteFile, clearAllFiles, getLanguageFromPath, getFileIcon } from './core/files';
import { initTerminal, toggleTerminal, runActiveFileInTerminal } from './features/terminal';
import { showGitPanel, showFileTree, gitCommit } from './features/git';
import { sendChatMessage, toggleChat, clearChat, renderChatMessages, sendHint, applyCodeToEditor } from './features/chat';
import { callAIStream } from './core/ai';
import { showSettings, hideSettings, saveSettings, resetSettings, resetAllData } from './features/settings';
import { togglePreviewPanel, refreshPreview, runLinter, toggleProblemPanel } from './features/preview';
import { showPluginPanel } from './features/plugins';
import { showCollabPanel } from './features/collab-ui';
import { showSearchPanel } from './features/search';
import { initPlugins, pluginManager } from './plugins';
import type { FileEntry } from './types';
import type { ElectronAPI } from './types/electron';

function getElectronAPI(): ElectronAPI | undefined {
  return (window as any).electronAPI;
}

// ─── Initialize ────────────────────────────────────────────
async function init(): Promise<void> {
  // Load files from IndexedDB
  const fileEntries = await initDefaultFiles();
  useFilesStore.getState().loadFiles(fileEntries);

  // Init Monaco
  const container = document.getElementById('editorContainer');
  if (container) {
    await initMonaco(container);
    (window as any).__monacoEditor = getEditor();
  }

  // Init Terminal
  initTerminal();

  // Render file tree
  renderFileTree();

  // Render chat
  renderChatMessages();

  // Wire event listeners
  wireEvents();

  // Update AI status
  updateAIStatus();

  // Run linter
  runLinter();

  // Init plugins
  initPlugins();

  // Load chat sessions
  loadChatSessions().then((sessions) => {
    if (sessions.length > 0) {
      useChatStore.getState().loadSessions(sessions);
      setupSessionSelector();
    }
  });

  // Global handles
  (window as any)._toggleTerminal = toggleTerminal;
  (window as any)._runFile = runActiveFileInTerminal;
  (window as any)._termNew = () => initTerminal();
  (window as any).__refreshFileTree = renderFileTree;

  // Electron integration
  if (getElectronAPI()) {
    setupElectronIntegration();
  }
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
  document.getElementById('btnAI')?.addEventListener('click', toggleChat);
  document.getElementById('btnTerminal')?.addEventListener('click', toggleTerminal);
  document.getElementById('btnPreview')?.addEventListener('click', togglePreviewPanel);
  document.getElementById('btnPlugins')?.addEventListener('click', showPluginPanel);
  document.getElementById('btnCollab')?.addEventListener('click', showCollabPanel);
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
        case '`': e.preventDefault(); toggleChat(); break;
        case ',': e.preventDefault(); showSettings(); break;
        case 'f': 
          if (e.shiftKey) { e.preventDefault(); showSearchPanel(); }
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

// ─── File Tree Rendering ───────────────────────────────────
function renderFileTree(): void {
  const tree = document.getElementById('fileTree');
  if (!tree) return;

  const files = useFilesStore.getState().files;
  const entries = Array.from(files.entries()).map(([path, entry]) => ({ path, ...entry }));
  entries.sort((a, b) => a.path.localeCompare(b.path));

  tree.innerHTML = entries
    .map((entry) => {
      const icon = getFileIcon(entry.path, false);
      const active = useEditorStore.getState().activeFile === entry.path ? ' active' : '';
      return `<div class="tree-item${active}" data-path="${entry.path}" onclick="window._openFile?.('${entry.path}')">
        <span class="icon">${icon}</span><span class="name">${entry.path}</span>
      </div>`;
    })
    .join('');

  // Context menu on file tree
  tree.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });

  (window as any)._openFile = (path: string) => {
    const entry = useFilesStore.getState().files.get(path);
    if (entry) {
      openFileTab(path, entry.content);
      renderTabs();
      renderFileTree();
    }
  };
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
      return `<div class="tab${isActive ? ' active' : ''}${isDirty ? ' dirty' : ''}" onclick="window._openFile?.('${path}')">
        <span class="tab-icon">${icon}</span>
        <span class="tab-name">${path}</span>
        <span class="tab-close" onclick="event.stopPropagation(); window._closeTab?.('${path}')">✕</span>
      </div>`;
    })
    .join('');

  if (tabs.length > 0) {
    const empty = document.getElementById('emptyState');
    if (empty) empty.style.display = 'none';
  }

  (window as any)._closeTab = (path: string) => {
    useEditorStore.getState().closeTab(path);
    renderTabs();
    renderFileTree();
    if (!useEditorStore.getState().activeFile) {
      const empty = document.getElementById('emptyState');
      if (empty) empty.style.display = 'flex';
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
    { icon: '⚙', name: '打开设置', shortcut: 'Ctrl+,', action: showSettings },
    { icon: '❓', name: '关于 AI Code Editor v3.0', shortcut: '', action: () => alert('AI Code Editor v3.0\nTypeScript + Vite + Zustand') },
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
              (window as any).__pendingImages = (window as any).__pendingImages || [];
              (window as any).__pendingImages.push(reader.result as string);
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
          (window as any).__pendingImages = (window as any).__pendingImages || [];
          (window as any).__pendingImages.push(reader.result as string);
          renderImagePreviews();
        };
        reader.readAsDataURL(file);
      });
    }
  });

  (window as any)._clearImages = () => {
    (window as any).__pendingImages = [];
    renderImagePreviews();
  };
}

function renderImagePreviews(): void {
  const container = document.getElementById('imagePreview');
  if (!container) return;
  const images = (window as any).__pendingImages || [];
  container.innerHTML = images
    .map((img: string, i: number) => `
      <div style="position:relative;width:48px;height:48px;border-radius:4px;overflow:hidden;border:1px solid var(--border-color);">
        <img src="${img}" style="width:100%;height:100%;object-fit:cover;">
        <button onclick="(window as any).__removeImage?.(${i})" style="position:absolute;top:0;right:0;background:rgba(0,0,0,0.6);border:none;color:white;font-size:10px;width:14px;height:14px;line-height:14px;cursor:pointer;padding:0;">✕</button>
      </div>
    `)
    .join('');
  (window as any).__removeImage = (i: number) => {
    (window as any).__pendingImages = ((window as any).__pendingImages || []).filter((_: string, idx: number) => idx !== i);
    renderImagePreviews();
  };
}

// ─── Phase 7: Voice Input ──────────────────────────────────
function setupVoiceInput(): void {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;

  const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
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

// ─── Toast ─────────────────────────────────────────────────
export function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

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

// ─── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
