// ============================================================
// 设置面板 — TypeScript 版本
// ============================================================
import { useAISettingsStore, useEditorSettingsStore, useModelStore, useUIStore } from '../core/stores';
import { syncEditorSettings } from '../core/editor';
import { useQuotaStore, formatTokens, formatCost } from '../core/quota';
import type { ModelConfig } from '../types';
import { i18n, t } from '../core/i18n';
import {
  detectOllama,
  fetchOllamaModels,
  pullOllamaModel,
  deleteOllamaModel,
  RECOMMENDED_MODELS,
  type OllamaModelInfo,
} from '../core/local-models';
import { initCollab, getCollabManager } from '../core/collab';

export function showSettings(): void {
  const store = useUIStore.getState();
  store.toggleSettings();

  const overlay = document.getElementById('settingsModal');
  if (!overlay) return;

  if (!store.settingsVisible) {
    overlay.classList.remove('show');
    return;
  }

  const aiSettings = useAISettingsStore.getState() as any;
  const editorSettings = useEditorSettingsStore.getState();
  const modelStore = useModelStore.getState();

  // Populate fields
  const setVal = (id: string, val: string) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (el) el.value = val;
  };

  setVal('settingApiEndpoint', aiSettings.endpoint || '');
  setVal('settingApiKey', aiSettings.apiKey || '');
  setVal('settingModel', aiSettings.model || 'gpt-4o');
  setVal('settingFontSize', String(editorSettings.fontSize));
  setVal('settingTabSize', String(editorSettings.tabSize));
  setVal('settingInlineComplete', editorSettings.inlineComplete);

  // Update quota stats
  const quotaStats = useQuotaStore.getState().getStats();
  const setText = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('quotaToday', `${formatTokens(quotaStats.today.tokens)} tokens / ${formatCost(quotaStats.today.cost)} (${quotaStats.today.calls}次)`);
  setText('quotaWeek', `${formatTokens(quotaStats.week.tokens)} tokens / ${formatCost(quotaStats.week.cost)} (${quotaStats.week.calls}次)`);
  setText('quotaTotal', `${formatTokens(quotaStats.total.tokens)} tokens / ${formatCost(quotaStats.total.cost)} (${quotaStats.total.calls}次)`);

  useUIStore.setState({ settingsVisible: true });
  overlay.classList.add('show');

  // Auto-detect Ollama when settings opens
  setTimeout(() => detectAndLoadOllama(), 100);
}

export function hideSettings(): void {
  useUIStore.setState({ settingsVisible: false });
  const overlay = document.getElementById('settingsModal');
  if (overlay) overlay.classList.remove('show');
}

export function saveSettings(): void {
  const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';

  const aiStore = useAISettingsStore.getState() as any;
  aiStore.setEndpoint?.(getVal('settingApiEndpoint'));
  aiStore.setApiKey?.(getVal('settingApiKey'));
  aiStore.setModel?.(getVal('settingModel'));

  const editorStore = useEditorSettingsStore.getState();
  editorStore.setFontSize(Number(getVal('settingFontSize')) || 14);
  editorStore.setTabSize(Number(getVal('settingTabSize')) || 4);
  editorStore.setInlineComplete(getVal('settingInlineComplete') as any || 'enabled');

  syncEditorSettings();
  hideSettings();
}

export function resetSettings(): void {
  const defaults = { endpoint: '', apiKey: '', model: 'gpt-4o' };
  const aiStore = useAISettingsStore.getState() as any;
  aiStore.setEndpoint?.(defaults.endpoint);
  aiStore.setApiKey?.(defaults.apiKey);
  aiStore.setModel?.(defaults.model);

  useEditorSettingsStore.setState({
    theme: 'vs-dark',
    fontSize: 14,
    tabSize: 4,
    inlineComplete: 'enabled',
  });

  syncEditorSettings();
  hideSettings();
}

export function resetAllData(): void {
  indexedDB.deleteDatabase('ai-code-editor-v3');
  localStorage.clear();
  window.location.reload();
}

// ─── Ollama Local Models UI ───────────────────────

let _ollamaModels: OllamaModelInfo[] = [];
let _ollamaRunning = false;

function updateOllamaStatus(status: 'running' | 'stopped' | 'unknown'): void {
  const el = document.getElementById('ollamaStatus') as HTMLElement | null;
  if (!el) return;
  el.className = `ollama-status ${status}`;
  if (status === 'running') {
    el.textContent = i18n.t('app.运行中');
  } else if (status === 'stopped') {
    el.textContent = i18n.t('app.未运行');
  } else {
    el.textContent = i18n.t('app.检测中');
  }
}

async function detectAndLoadOllama(): Promise<void> {
  updateOllamaStatus('unknown');
  const btnRefresh = document.getElementById('btnRefreshOllamaModels') as HTMLButtonElement | null;
  if (btnRefresh) btnRefresh.disabled = true;

  const isRunning = await detectOllama();
  _ollamaRunning = isRunning;

  if (!isRunning) {
    updateOllamaStatus('stopped');
    const listEl = document.getElementById('ollamaModelsList') as HTMLElement | null;
    if (listEl) listEl.style.display = 'none';
    const pullEl = document.getElementById('ollamaPullSection') as HTMLElement | null;
    if (pullEl) pullEl.style.display = 'none';
    if (btnRefresh) btnRefresh.disabled = true;
    return;
  }

  updateOllamaStatus('running');
  if (btnRefresh) btnRefresh.disabled = false;

  // Show pull section
  const pullEl = document.getElementById('ollamaPullSection') as HTMLElement | null;
  if (pullEl) pullEl.style.display = '';

  // Load models
  try {
    _ollamaModels = await fetchOllamaModels();
    renderOllamaModels();
  } catch {
    _ollamaModels = [];
    renderOllamaModels();
  }

  // Render recommended
  renderRecommendedModels();
  detectAndShowGPUHint();
}

function renderOllamaModels(): void {
  const container = document.getElementById('ollamaModelsContainer') as HTMLElement | null;
  const listEl = document.getElementById('ollamaModelsList') as HTMLElement | null;
  if (!container || !listEl) return;

  if (_ollamaModels.length === 0) {
    listEl.style.display = 'none';
    return;
  }

  listEl.style.display = '';
  const activeModel = useModelStore.getState().models.find(
    (m: ModelConfig) => m.id === useModelStore.getState().activeModelId
  );
  const isOllamaActive = activeModel?.local === true;

  container.innerHTML = _ollamaModels.map((m) => {
    const isActive = isOllamaActive && activeModel?.model === m.name;
    const sizeMB = (m.size / 1024 / 1024).toFixed(1);
    return `
      <div class="ollama-model-item ${isActive ? 'active' : ''}" data-model="${m.name}">
        <span class="model-name">${m.name}</span>
        <span class="model-size">${sizeMB} MB</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.ollama-model-item').forEach((el) => {
    el.addEventListener('click', () => {
      const modelName = (el as HTMLElement).dataset.model;
      if (!modelName) return;
      selectOllamaModel(modelName);
    });
  });
}

function selectOllamaModel(modelName: string): void {
  const modelStore = useModelStore.getState();
  // Update the ollama-auto model's model field
  const ollamaModel = modelStore.models.find((m: ModelConfig) => m.id === 'ollama-auto');
  if (ollamaModel) {
    ollamaModel.model = modelName;
  }
  modelStore.setActiveModel('ollama-auto');

  // Re-render to update active state
  renderOllamaModels();

  // Show notification
  showOllamaNotification(i18n.t('ollama.switched', { name: modelName }));
}

function showOllamaNotification(msg: string): void {
  // Re-use existing notification system
  const existing = document.getElementById('ollamaNotification');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'ollamaNotification';
  el.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 9999;
    background: var(--bg-secondary, #181825); color: var(--text-primary, #cdd6f4);
    padding: 10px 16px; border-radius: 8px; border: 1px solid var(--accent, #6366f1);
    font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: fadeIn 0.2s ease;
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function renderRecommendedModels(): void {
  const container = document.getElementById('ollamaRecommended') as HTMLElement | null;
  if (!container) return;

  // 根据可用 RAM 推荐模型
  const ramGB = (navigator as any).deviceMemory || 8; // 默认 8GB
  const recommendedName = getRecommendedOllamaModel(ramGB);

  container.innerHTML = RECOMMENDED_MODELS.map((m) => {
    const isRecommended = m.name === recommendedName;
    return `
      <div class="ollama-recommended-item ${isRecommended ? 'recommended' : ''}">
        <div>
          <span class="name">${m.name}</span>
          ${isRecommended ? '<span class="recommended-badge">推荐</span>' : ''}
          <span class="desc">${m.description} · ${m.size}</span>
        </div>
        <button class="pull-btn" data-model="${m.name}">拉取</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.pull-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const modelName = (btn as HTMLElement).dataset.model;
      if (modelName) startPullModel(modelName);
    });
  });
}

// 根据可用 RAM 推荐 Ollama 模型
function getRecommendedOllamaModel(ramGB: number): string {
  if (ramGB >= 32) return 'llama3:70b';
  if (ramGB >= 16) return 'deepseek-r1:32b';
  if (ramGB >= 8) return 'qwen2.5-coder:7b';
  return 'qwen3:1.7b';
}

// 检测 GPU 并显示提示
function detectAndShowGPUHint(): void {
  const container = document.getElementById('ollamaSection') as HTMLElement | null;
  if (!container) return;

  const existing = document.getElementById('ollamaGPUHint');
  if (existing) existing.remove();

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  let gpuInfo = '';
  let hasGPU = false;

  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      gpuInfo = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
      hasGPU = true;
    }
  }

  const hint = document.createElement('div');
  hint.id = 'ollamaGPUHint';
  hint.style.cssText = 'margin-top:6px; font-size:11px; padding:4px 8px; border-radius:4px;';
  
  if (hasGPU) {
    hint.style.background = 'rgba(34,197,94,0.1)';
    hint.style.color = 'var(--success, #22c55e)';
    hint.textContent = `检测到 GPU: ${gpuInfo}。Ollama 将自动使用 GPU 加速。`;
  } else {
    hint.style.background = 'rgba(234,179,8,0.1)';
    hint.style.color = 'var(--warning, #eab308)';
    hint.textContent = '未检测到 GPU，模型将使用 CPU 运行（速度较慢）。';
  }

  const statusEl = document.getElementById('ollamaStatus') as HTMLElement | null;
  if (statusEl) {
    statusEl.insertAdjacentElement('afterend', hint);
  }
}

async function startPullModel(modelName: string): Promise<void> {
  const progressEl = document.getElementById('ollamaPullProgress') as HTMLElement | null;
  if (progressEl) {
    progressEl.style.display = '';
    progressEl.textContent = i18n.t('ollama.pulling', { name: modelName });
  }

  try {
    await pullOllamaModel(modelName, (progress) => {
      if (progressEl) {
        if (progress.total && progress.completed) {
          const pct = Math.round((progress.completed / progress.total) * 100);
          progressEl.textContent = i18n.t('ollama.pullProgress', {
            name: modelName,
            pct,
            completed: Math.round(progress.completed / 1024 / 1024),
            total: Math.round(progress.total / 1024 / 1024),
          });
        } else {
          progressEl.textContent = `${modelName}: ${progress.status}`;
        }
      }
    });
    if (progressEl) progressEl.textContent = i18n.t('ollama.pullComplete', { name: modelName });
    setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 3000);
    // Reload models
    await detectAndLoadOllama();
  } catch (err: any) {
    if (progressEl) progressEl.textContent = i18n.t('ollama.pullFailed', { error: err.message });
  }
}

// ─── Initialize Ollama Event Listeners ─────────────
export function initOllamaSettings(): void {
  const btnDetect = document.getElementById('btnDetectOllama') as HTMLButtonElement | null;
  const btnRefresh = document.getElementById('btnRefreshOllamaModels') as HTMLButtonElement | null;
  const btnPull = document.getElementById('btnPullOllamaModel') as HTMLButtonElement | null;
  const inputPull = document.getElementById('ollamaPullInput') as HTMLInputElement | null;

  btnDetect?.addEventListener('click', () => detectAndLoadOllama());
  btnRefresh?.addEventListener('click', () => detectAndLoadOllama());

  btnPull?.addEventListener('click', () => {
    const name = inputPull?.value?.trim();
    if (name) startPullModel(name);
  });

  // Auto-detect on settings open — patched into showSettings
}

// Patch showSettings to also detect Ollama
const _origShowSettings = showSettings;
export function showSettingsWithOllama(): void {
  _origShowSettings();
  // Defer to allow DOM to update
  setTimeout(() => detectAndLoadOllama(), 100);
}

// ─── RAG Settings ────────────────────────────────────────
export function initRAGSettings(): void {
  const btnBuild = document.getElementById('btnBuildRAG') as HTMLButtonElement | null;
  const btnEmbed = document.getElementById('btnBuildRAGEmbed') as HTMLButtonElement | null;
  const btnClear = document.getElementById('btnClearRAG') as HTMLButtonElement | null;
  const statusEl = document.getElementById('ragStatus') as HTMLElement | null;
  const progressEl = document.getElementById('ragProgress') as HTMLElement | null;
  const detailsEl = document.getElementById('ragDetails') as HTMLElement | null;
  const chunkCountEl = document.getElementById('ragChunkCount') as HTMLElement | null;
  const modeEl = document.getElementById('ragMode') as HTMLElement | null;

  function updateStatus(): void {
    import('../core/rag').then((m) => {
      const idx = m.getRAGIndex();
      if (!idx.isBuilt) {
        if (statusEl) { statusEl.textContent = '未索引'; statusEl.className = 'ollama-status unknown'; }
        if (detailsEl) detailsEl.style.display = 'none';
      } else {
        const mode = idx.embeddingMode ? 'Embedding' : 'TF-IDF';
        if (statusEl) { statusEl.textContent = `已索引 (${idx.size}块)`; statusEl.className = 'ollama-status running'; }
        if (detailsEl) detailsEl.style.display = '';
        if (chunkCountEl) chunkCountEl.textContent = String(idx.size);
        if (modeEl) modeEl.textContent = mode;
      }
    });
  }

  btnBuild?.addEventListener('click', async () => {
    if (progressEl) { progressEl.textContent = '建立索引中...'; progressEl.style.display = ''; }
    if (btnBuild) btnBuild.disabled = true;
    try {
      import('../core/rag').then((m) => {
        m.rebuildRAGIndex();
        updateStatus();
        if (progressEl) progressEl.textContent = '索引完成！';
      });
    } finally {
      if (btnBuild) btnBuild.disabled = false;
      setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 2000);
    }
  });

  btnEmbed?.addEventListener('click', async () => {
    if (progressEl) { progressEl.textContent = '建立 Embedding 索引中...'; progressEl.style.display = ''; }
    if (btnEmbed) btnEmbed.disabled = true;
    try {
      import('../core/rag').then(async (m) => {
        const result = await m.rebuildRAGIndexWithEmbeddings((cur, total) => {
          if (progressEl) progressEl.textContent = `Embedding: ${cur}/${total}`;
        });
        updateStatus();
        if (progressEl) progressEl.textContent = `完成 (${result.mode})！`;
      });
    } finally {
      if (btnEmbed) btnEmbed.disabled = false;
      setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 2000);
    }
  });

  btnClear?.addEventListener('click', async () => {
    import('../core/rag').then(async (m) => {
      await m.clearEmbeddingCache();
      updateStatus();
    });
  });

  // Initial status
  updateStatus();
}

// ─── Collab Settings ─────────────────────────────────────
export function initCollabSettings(): void {
  const checkbox = document.getElementById('settingCollabEnabled') as HTMLInputElement | null;
  const userInput = document.getElementById('settingCollabUser') as HTMLInputElement | null;
  const statusEl = document.getElementById('collabStatus') as HTMLElement | null;
  const statusText = document.getElementById('collabStatusText') as HTMLElement | null;

  // Load saved settings
  const savedEnabled = localStorage.getItem('collab-enabled') === 'true';
  const savedUser = localStorage.getItem('collab-user') || '';
  if (checkbox) checkbox.checked = savedEnabled;
  if (userInput) userInput.value = savedUser;

  checkbox?.addEventListener('change', () => {
    const enabled = checkbox.checked;
    localStorage.setItem('collab-enabled', String(enabled));
    if (statusEl) statusEl.style.display = enabled ? '' : 'none';

    if (enabled) {
      const userName = userInput?.value || 'Anonymous';
      initCollab(userName);
      if (statusText) statusText.textContent = '已启用（本地模式）';
    } else {
      getCollabManager().disable();
      if (statusText) statusText.textContent = '已禁用';
    }
  });

  userInput?.addEventListener('change', () => {
    const name = userInput.value.trim();
    localStorage.setItem('collab-user', name);
    if (checkbox?.checked) {
      initCollab(name || 'Anonymous');
    }
  });

  // Show status if enabled
  if (savedEnabled && statusEl) {
    statusEl.style.display = '';
    if (statusText) statusText.textContent = '已启用（本地模式）';
  }
}
