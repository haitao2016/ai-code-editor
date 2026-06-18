// ============================================================
// Window Global Properties — TypeScript 类型声明
// 替代所有 (window as any) 转换，提供类型安全
// ============================================================

declare global {
  interface Window {
    // ─── Monaco ──────────────────────────────────────
    monaco?: any;
    __monacoEditor?: any;

    // ─── Editor ─────────────────────────────────────
    __pendingContent?: { content: string; language?: string };

    // ─── Preview ───────────────────────────────────
    _refreshPreview?: () => void;
    _closePreview?: () => void;
    _gotoProblem?: (line: number, column: number) => void;

    // ─── Debug ──────────────────────────────────────
    _debugContinue?: () => void;
    _debugStepOver?: () => void;
    _debugStepInto?: () => void;
    _debugStepOut?: () => void;
    _debugRestart?: () => void;
    _debugStop?: () => void;
    _switchDebugTab?: (tab: string) => void;
    _selectStackFrame?: (frameId: number) => void;
    _expandVar?: (ref: number, name: string) => Promise<void>;
    _addWatch?: () => void;
    _removeWatch?: (i: number) => void;

    // ─── Git ───────────────────────────────────────
    _gitStage?: (path: string) => void;
    _gitUnstage?: (path: string) => void;
    _gitStageAll?: () => void;
    _gitUnstageAll?: () => void;
    _gitCommit?: () => void;
    _gitRefresh?: () => void;
    _gitCreateBranch?: () => void;
    _gitAddRemote?: () => void;
    _gitRemoveRemote?: (name: string) => void;
    _gitPush?: () => void;

    // ─── Chat ──────────────────────────────────────
    _applyCode?: (code: string, language: string, path?: string) => void;
    __pendingImages?: string[];
    __clearImages?: () => void;

    // ─── File Tree ────────────────────────────────
    __refreshFileTree?: () => void;
    __expandFolder?: (folder: HTMLElement) => void;
    __closedFolders?: Set<string>;

    // ─── Terminal ──────────────────────────────────
    _switchTermTab?: (tabId: string) => void;
    _closeTermTab?: (tabId: string) => void;
    _newTermTab?: () => void;
    __terminalAPI?: any;

    // ─── Diff ──────────────────────────────────────
    _navigateDiff?: (direction: 'next' | 'prev') => void;
    _diffEditor?: any;

    // ─── Split View ───────────────────────────────
    __splitMonacoEditor?: any;

    // ─── Auto-update ─────────────────────────────
    __showNotification?: (opts: { message: string; type?: string; persistent?: boolean }) => void;

    // ─── Main ─────────────────────────────────────
    __workspaceRoot?: string;
    __lspManager?: any;
    __pluginManager?: any;
    __showSSHPanel?: () => void;
    __removeImage?: (i: number) => void;

    // ─── Speech ────────────────────────────────────
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

export {};
