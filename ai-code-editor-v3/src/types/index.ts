export interface FileEntry {
  path: string;
  content: string;
  language: string;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'error' | 'system';
  content: string;
  timestamp: number;
  codeBlocks?: CodeBlock[];
}

export interface CodeBlock {
  language: string;
  code: string;
  applied: boolean;
}

export interface AISettings {
  endpoint: string;
  apiKey: string;
  model: string;
  customModel: string;
}

export interface EditorSettings {
  theme: 'vs-dark' | 'vs' | 'hc-black';
  fontSize: number;
  tabSize: number;
  inlineComplete: 'enabled' | 'disabled';
}

export interface AgentStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  toolCall?: string;
  result?: string;
  snapshot?: Record<string, string>;
}

export interface AgentPlan {
  id: string;
  intent: string;
  steps: AgentStep[];
  status: 'planning' | 'executing' | 'done' | 'cancelled' | 'error';
  snapshots: Record<string, Record<string, string>>;
}

export interface ComposerChange {
  filePath: string;
  originalContent: string;
  newContent: string;
  status: 'pending' | 'accepted' | 'rejected';
  description: string;
}

export interface ComposerPlan {
  id: string;
  request: string;
  changes: ComposerChange[];
  status: 'pending' | 'reviewing' | 'applied' | 'cancelled';
}

export interface GitStatus {
  staged: string[];
  modified: string[];
  added: string[];
  deleted: string[];
  branch: string;
  commits: { hash: string; message: string; timestamp: number }[];
}

export interface LinterProblem {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  ruleId: string;
}

export interface ContextRef {
  type: 'file' | 'folder' | 'symbol' | 'terminal';
  value: string;
  label: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  model: string;
  apiKey?: string;
  capabilities: ModelCapability[];
}

export interface ModelCapability {
  type: 'chat' | 'vision' | 'tool_calls' | 'code';
  enabled: boolean;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  capabilities: string[];
  theme?: {
    colors: Record<string, string>;
  };
}
