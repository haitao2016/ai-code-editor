// ============================================================
// Zustand Stores — 全局状态管理
// ============================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  FileEntry, AISettings, EditorSettings, ChatMessage,
  AgentPlan, ComposerPlan, GitStatus, LinterProblem, ModelConfig,
} from '../types';

// ─── Editor Store ─────────────────────────────────────────
interface EditorState {
  openTabs: string[];
  activeFile: string | null;
  dirtyFiles: Set<string>;
  openTab: (path: string) => void;
  closeTab: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  markDirty: (path: string) => void;
  markClean: (path: string) => void;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  openTabs: [],
  activeFile: null,
  dirtyFiles: new Set(),
  openTab: (path) => set((s) => {
    const tabs = s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path];
    return { openTabs: tabs, activeFile: path };
  }),
  closeTab: (path) => set((s) => {
    const idx = s.openTabs.indexOf(path);
    const tabs = s.openTabs.filter((t) => t !== path);
    let active = s.activeFile;
    if (active === path) {
      active = tabs[Math.min(idx, tabs.length - 1)] || null;
    }
    const dirty = new Set(s.dirtyFiles);
    dirty.delete(path);
    return { openTabs: tabs, activeFile: active, dirtyFiles: dirty };
  }),
  setActiveFile: (path) => set({ activeFile: path }),
  markDirty: (path) => set((s) => {
    const d = new Set(s.dirtyFiles);
    d.add(path);
    return { dirtyFiles: d };
  }),
  markClean: (path) => set((s) => {
    const d = new Set(s.dirtyFiles);
    d.delete(path);
    return { dirtyFiles: d };
  }),
}));

// ─── Files Store ───────────────────────────────────────────
interface FilesState {
  files: Map<string, FileEntry>;
  setFile: (entry: FileEntry) => void;
  deleteFile: (path: string) => void;
  loadFiles: (entries: FileEntry[]) => void;
  getFile: (path: string) => FileEntry | undefined;
}

export const useFilesStore = create<FilesState>()((set, get) => ({
  files: new Map(),
  setFile: (entry) => set((s) => {
    const m = new Map(s.files);
    m.set(entry.path, { ...entry, updatedAt: Date.now() });
    return { files: m };
  }),
  deleteFile: (path) => set((s) => {
    const m = new Map(s.files);
    m.delete(path);
    return { files: m };
  }),
  loadFiles: (entries) => set({ files: new Map(entries.map((e) => [e.path, e])) }),
  getFile: (path) => get().files.get(path),
}));

// ─── AI Settings Store ─────────────────────────────────────
export const useAISettingsStore = create<AISettings>()(
  persist(
    (set) => ({
      endpoint: '',
      apiKey: '',
      model: 'gpt-4o',
      customModel: '',
      setEndpoint: (endpoint: string) => set({ endpoint }),
      setApiKey: (apiKey: string) => set({ apiKey }),
      setModel: (model: string) => set({ model }),
      setCustomModel: (customModel: string) => set({ customModel }),
    }),
    { name: 'ai-code-editor-ai' }
  ) as any
);

// Extend the store with setters — workaround for persist + actions
const _aiSet = useAISettingsStore as any;
_aiSet.getState().setEndpoint = (v: string) => _aiSet.setState({ endpoint: v });
_aiSet.getState().setApiKey = (v: string) => _aiSet.setState({ apiKey: v });
_aiSet.getState().setModel = (v: string) => _aiSet.setState({ model: v });
_aiSet.getState().setCustomModel = (v: string) => _aiSet.setState({ customModel: v });

// ─── Editor Settings Store ─────────────────────────────────
interface EditorSettingsState extends EditorSettings {
  setTheme: (theme: EditorSettings['theme']) => void;
  setFontSize: (size: number) => void;
  setTabSize: (size: number) => void;
  setInlineComplete: (v: EditorSettings['inlineComplete']) => void;
}

export const useEditorSettingsStore = create<EditorSettingsState>()(
  persist(
    (set) => ({
      theme: 'vs-dark',
      fontSize: 14,
      tabSize: 4,
      inlineComplete: 'enabled',
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setTabSize: (tabSize) => set({ tabSize }),
      setInlineComplete: (inlineComplete) => set({ inlineComplete }),
    }),
    { name: 'ai-code-editor-settings' }
  )
);

// ─── Chat Store ────────────────────────────────────────────
interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  messages: ChatMessage[];
  sessions: ChatSession[];
  activeSessionId: string;
  isLoading: boolean;
  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  clearMessages: () => void;
  setLoading: (v: boolean) => void;
  // Session management
  createSession: (name?: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  loadSessions: (sessions: ChatSession[]) => void;
  saveCurrentSession: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [
    {
      id: 'welcome',
      role: 'ai',
      content: '你好！我是 AI Code Editor v3.0 编程助手。\n\n**新功能：**\n• 真实 Agent 工具调用\n• Composer 多文件变更计划\n• AI 内联代码补全\n• 多会话历史管理\n\n去 设置 配置 API Key 开始使用。',
      timestamp: Date.now(),
    },
  ],
  sessions: [],
  activeSessionId: 'default',
  isLoading: false,

  addMessage: (msg) => set((s) => {
    const msgs = [...s.messages, msg];
    // Auto-save to current session
    setTimeout(() => get().saveCurrentSession(), 100);
    return { messages: msgs };
  }),
  updateLastMessage: (content) => set((s) => {
    const msgs = [...s.messages];
    if (msgs.length > 0) {
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
    }
    return { messages: msgs };
  }),
  clearMessages: () => set({ messages: [] }),
  setLoading: (v) => set({ isLoading: v }),

  // Session management
  createSession: (name) => {
    const id = `session-${Date.now()}`;
    const session: ChatSession = {
      id,
      name: name || `会话 ${get().sessions.length + 1}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: id,
      messages: [],
    }));
    // Persist
    const allSessions = get().sessions;
    saveChatSessions(allSessions);
    return id;
  },
  switchSession: (id) => {
    const state = get();
    // Save current session first
    state.saveCurrentSession();

    const session = state.sessions.find((s) => s.id === id);
    if (session) {
      set({ activeSessionId: id, messages: session.messages });
    }
  },
  deleteSession: (id) => {
    set((s) => {
      const sessions = s.sessions.filter((ss) => ss.id !== id);
      let activeSessionId = s.activeSessionId;
      let messages = s.messages;

      if (id === s.activeSessionId) {
        const remaining = sessions.length > 0 ? sessions[0] : null;
        activeSessionId = remaining ? remaining.id : 'default';
        messages = remaining ? remaining.messages : [];
      }
      saveChatSessions(sessions);
      return { sessions, activeSessionId, messages };
    });
  },
  renameSession: (id, name) => set((s) => {
    const sessions = s.sessions.map((ss) => (ss.id === id ? { ...ss, name } : ss));
    saveChatSessions(sessions);
    return { sessions };
  }),
  loadSessions: (sessions) => set({ sessions }),
  saveCurrentSession: () => {
    const state = get();
    const sessions = state.sessions.map((s) => {
      if (s.id === state.activeSessionId) {
        return { ...s, messages: state.messages, updatedAt: Date.now() };
      }
      return s;
    });
    // If session doesn't exist yet, create it
    if (!sessions.find((s) => s.id === state.activeSessionId) && state.messages.length > 0) {
      sessions.push({
        id: state.activeSessionId,
        name: `会话 ${sessions.length + 1}`,
        messages: state.messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    // Don't persist default session with only welcome message
    if (state.activeSessionId === 'default' && state.messages.length <= 1) return;
    saveChatSessions(sessions);
  },
}));

// ─── Chat Sessions IndexedDB persistence ───────────────────
async function openChatDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ai-code-editor-chat', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveChatSessions(sessions: ChatSession[]): Promise<void> {
  try {
    const db = await openChatDB();
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    // Clear and re-save all sessions
    await new Promise<void>((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => reject(clearReq.error);
    });
    for (const session of sessions) {
      store.put(session);
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  } catch {
    // Silently fail — sessions are always in memory
  }
}

async function loadChatSessions(): Promise<ChatSession[]> {
  try {
    const db = await openChatDB();
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    const sessions: ChatSession[] = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return sessions;
  } catch {
    return [];
  }
}

// ─── Token counting utility ───────────────────────────────
export function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English, 1.5 for Chinese
  // Mix: ~3 chars per token
  return Math.ceil(text.length / 3);
}

export function trimContextWindow(messages: ChatMessage[], maxTokens: number = 8000): ChatMessage[] {
  let totalTokens = 0;
  const result: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(messages[i].content);
    if (totalTokens + tokens > maxTokens && result.length > 0) break;
    totalTokens += tokens;
    result.unshift(messages[i]);
  }
  return result;
}

// Export persistence functions for init
export { loadChatSessions };

// ─── Agent Store ───────────────────────────────────────────
interface AgentState {
  running: boolean;
  plan: AgentPlan | null;
  setPlan: (plan: AgentPlan) => void;
  updateStep: (stepId: string, update: Partial<import('../types').AgentStep>) => void;
  clear: () => void;
  setRunning: (v: boolean) => void;
}

export const useAgentStore = create<AgentState>()((set) => ({
  running: false,
  plan: null,
  setPlan: (plan) => set({ plan }),
  updateStep: (stepId, update) => set((s) => {
    if (!s.plan) return s;
    const steps = s.plan.steps.map((st) =>
      st.id === stepId ? { ...st, ...update } : st
    );
    return { plan: { ...s.plan, steps } };
  }),
  clear: () => set({ plan: null, running: false }),
  setRunning: (v) => set({ running: v }),
}));

// ─── Composer Store ────────────────────────────────────────
interface ComposerState {
  plan: ComposerPlan | null;
  setPlan: (plan: ComposerPlan) => void;
  updateChange: (filePath: string, status: ComposerPlan['changes'][0]['status']) => void;
  clear: () => void;
}

export const useComposerStore = create<ComposerState>()((set) => ({
  plan: null,
  setPlan: (plan) => set({ plan }),
  updateChange: (filePath, status) => set((s) => {
    if (!s.plan) return s;
    const changes = s.plan.changes.map((c) =>
      c.filePath === filePath ? { ...c, status } : c
    );
    return { plan: { ...s.plan, changes } };
  }),
  clear: () => set({ plan: null }),
}));

// ─── Git Store ─────────────────────────────────────────────
interface GitState {
  status: GitStatus | null;
  initialized: boolean;
  setStatus: (status: GitStatus) => void;
  setInitialized: (v: boolean) => void;
}

export const useGitStore = create<GitState>()((set) => ({
  status: null,
  initialized: false,
  setStatus: (status) => set({ status }),
  setInitialized: (v) => set({ initialized: v }),
}));

// ─── Linter Store ──────────────────────────────────────────
interface LinterState {
  problems: LinterProblem[];
  setProblems: (problems: LinterProblem[]) => void;
  clear: () => void;
}

export const useLinterStore = create<LinterState>()((set) => ({
  problems: [],
  setProblems: (problems) => set({ problems }),
  clear: () => set({ problems: [] }),
}));

// ─── Model Store ───────────────────────────────────────────
interface ModelState {
  models: ModelConfig[];
  activeModelId: string;
  setModels: (models: ModelConfig[]) => void;
  setActiveModel: (id: string) => void;
  addModel: (model: ModelConfig) => void;
  removeModel: (id: string) => void;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      models: [
        { id: 'gpt4o', name: 'GPT-4o', provider: 'openai', endpoint: '', model: 'gpt-4o', capabilities: [{ type: 'chat', enabled: true }, { type: 'vision', enabled: true }, { type: 'tool_calls', enabled: true }, { type: 'code', enabled: true }] },
        { id: 'gpt4omini', name: 'GPT-4o Mini', provider: 'openai', endpoint: '', model: 'gpt-4o-mini', capabilities: [{ type: 'chat', enabled: true }, { type: 'code', enabled: true }] },
        { id: 'claude', name: 'Claude 3.5 Sonnet', provider: 'anthropic', endpoint: '', model: 'claude-3-5-sonnet', capabilities: [{ type: 'chat', enabled: true }, { type: 'vision', enabled: true }, { type: 'tool_calls', enabled: true }, { type: 'code', enabled: true }] },
        { id: 'deepseek', name: 'DeepSeek Chat', provider: 'deepseek', endpoint: '', model: 'deepseek-chat', capabilities: [{ type: 'chat', enabled: true }, { type: 'code', enabled: true }] },
      ],
      activeModelId: 'gpt4o',
      setModels: (models) => set({ models }),
      setActiveModel: (id) => set({ activeModelId: id }),
      addModel: (model) => set((s) => ({ models: [...s.models, model] })),
      removeModel: (id) => set((s) => ({ models: s.models.filter((m) => m.id !== id) })),
    }),
    { name: 'ai-code-editor-models' }
  )
);

// ─── UI Store ──────────────────────────────────────────────
interface UIState {
  sidebarCollapsed: boolean;
  chatCollapsed: boolean;
  terminalCollapsed: boolean;
  previewVisible: boolean;
  settingsVisible: boolean;
  theme: 'dark' | 'light';
  toggleSidebar: () => void;
  toggleChat: () => void;
  toggleTerminal: () => void;
  togglePreview: () => void;
  toggleSettings: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  chatCollapsed: false,
  terminalCollapsed: true,
  previewVisible: false,
  settingsVisible: false,
  theme: 'dark',
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleChat: () => set((s) => ({ chatCollapsed: !s.chatCollapsed })),
  toggleTerminal: () => set((s) => ({ terminalCollapsed: !s.terminalCollapsed })),
  togglePreview: () => set((s) => ({ previewVisible: !s.previewVisible })),
  toggleSettings: () => set((s) => ({ settingsVisible: !s.settingsVisible })),
  setTheme: (theme) => set({ theme }),
}));
