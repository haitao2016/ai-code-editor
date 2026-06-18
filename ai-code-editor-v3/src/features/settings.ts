// ============================================================
// 设置面板 — TypeScript 版本
// ============================================================
import { useAISettingsStore, useEditorSettingsStore, useModelStore, useUIStore } from '../core/stores';
import { syncEditorSettings } from '../core/editor';
import type { ModelConfig } from '../types';

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

  useUIStore.setState({ settingsVisible: true });
  overlay.classList.add('show');
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
