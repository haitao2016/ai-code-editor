// ============================================================
// 本地模型管理 — Ollama 支持
// ============================================================
// Ollama 提供两个 API：
//   1. Native API:  http://localhost:11434/api/*
//   2. OpenAI 兼容: http://localhost:11434/v1/chat/completions
//
// 本模块封装 Native API（模型管理），聊天仍走 ai.ts（OpenAI 兼容路径）。

const OLLAMA_HOST = 'http://localhost:11434';

// ─── 类型 ────────────────────────────────────────────────

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  modified_at: string;
  details: OllamaModel['details'];
}

// ─── 检测 Ollama 是否运行 ────────────────────────────────

export async function detectOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000), // 3秒超时
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── 获取本地已拉取的模型列表 ────────────────────────────

export async function fetchOllamaModels(): Promise<OllamaModelInfo[]> {
  const res = await fetch(`${OLLAMA_HOST}/api/tags`);
  if (!res.ok) throw new Error(`获取模型列表失败 (${res.status})`);
  const data = await res.json();
  return (data.models || []) as OllamaModelInfo[];
}

// ─── 拉取（下载）新模型 ─────────────────────────────────
// Ollama 拉取是长轮询，返回 NDJSON 流。
// 每个 JSON 对象代表一个进度事件。

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export async function pullOllamaModel(
  name: string,
  onProgress?: (progress: PullProgress) => void,
): Promise<void> {
  const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`拉取失败 (${res.status}): ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('响应体不可读');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留最后一个不完整的行

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        onProgress?.(obj);
      } catch {
        // 忽略无法解析的行
      }
    }
  }
}

// ─── 删除本地模型 ────────────────────────────────────────

export async function deleteOllamaModel(name: string): Promise<void> {
  const res = await fetch(`${OLLAMA_HOST}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`删除失败 (${res.status}): ${err}`);
  }
}

// ─── 验证模型是否支持聊天 ────────────────────────────────
// 通过向 /v1/chat/completions 发送一个极小请求来验证

export async function testOllamaChat(modelName: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 10,
        stream: false,
      }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── 推荐模型列表（供 UI 展示）─────────────────────────

export interface RecommendedModel {
  name: string;
  description: string;
  size: string;
 适合: string[];
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  { name: 'qwen3:1.7b',      description: '通义千问3 1.7B - 轻量快速', size: '1.1GB', 适合: ['代码补全', '快速聊天'] },
  { name: 'qwen3:4b',        description: '通义千问3 4B - 平衡',     size: '2.6GB', 适合: ['代码生成', '聊天'] },
  { name: 'qwen3:8b',        description: '通义千问3 8B - 高质量',   size: '5.2GB', 适合: ['复杂推理', '代码审查'] },
  { name: 'qwen2.5-coder:3.5b', description: '千问代码专用 3.5B',  size: '2.3GB', 适合: ['代码补全', '代码生成'] },
  { name: 'qwen2.5-coder:7b',  description: '千问代码专用 7B',    size: '4.5GB', 适合: ['代码审查', '重构'] },
  { name: 'deepseek-r1:7b',    description: 'DeepSeek R1 7B - 推理',  size: '4.8GB', 适合: ['数学推理', '代码推理'] },
  { name: 'llama3.2:3b',      description: 'Llama 3.2 3B - 轻量',   size: '2.0GB', 适合: ['快速聊天', '简单代码'] },
  { name: 'llama3.1:8b',      description: 'Llama 3.1 8B - 通用',   size: '4.9GB', 适合: ['通用聊天', '代码生成'] },
  { name: 'codellama:7b',      description: 'Code Llama 7B - 代码',   size: '3.8GB', 适合: ['代码生成', '代码补全'] },
  { name: 'phi3:mini',         description: 'Phi-3 Mini - 极轻量',    size: '1.6GB', 适合: ['边缘设备', '快速补全'] },
];
