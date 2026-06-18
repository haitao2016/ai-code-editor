// ============================================================
// AI API 客户端 — 支持 OpenAI 兼容接口 + 多模型
// ============================================================
import { useAISettingsStore, useModelStore } from '../core/stores';
import type { ChatMessage, ModelConfig } from '../types';

// ─── Global AbortController management ─────────────────────
let _activeAbortController: AbortController | null = null;

/** Create a new AbortController and abort any existing one. Returns signal. */
export function createAISignal(): AbortSignal {
  abortActiveRequest();
  _activeAbortController = new AbortController();
  return _activeAbortController.signal;
}

/** Abort the current AI request if any is active. */
export function abortActiveRequest(): void {
  if (_activeAbortController) {
    _activeAbortController.abort();
    _activeAbortController = null;
  }
}

/** Check if there's an active request. */
export function isAIRequestActive(): boolean {
  return _activeAbortController !== null;
}

export interface AIRequestOptions {
  model?: string;
  endpoint?: string;
  stream?: boolean;
  images?: string[];
  tools?: any[];
  signal?: AbortSignal;
  temperature?: number;
  max_tokens?: number;
  /** Called when native OpenAI tool_calls are received (for function calling) */
  onToolCalls?: (toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }>) => void;
}

export async function callAI(
  messages: { role: string; content: string | any[] }[],
  options: AIRequestOptions = {}
): Promise<string> {
  const aiSettings = useAISettingsStore.getState() as any;
  const modelStore = useModelStore.getState();

  const activeModel = modelStore.models.find((m: ModelConfig) => m.id === modelStore.activeModelId);
  const endpoint = options.endpoint || aiSettings.endpoint || activeModel?.endpoint || '';
  const model = options.model || aiSettings.model || activeModel?.model || 'gpt-4o';
  const apiKey = aiSettings.apiKey || '';
  const isLocal = activeModel?.local === true || activeModel?.requireApiKey === false;

  if (!endpoint) {
    return '请在设置中配置 API 端点。支持 OpenAI 兼容接口（如 OpenAI、DeepSeek、通义千问等）。';
  }
  if (!isLocal && !apiKey) {
    return '请在设置中配置 API Key。密钥仅存储在本地浏览器中。';
  }

  const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const body: any = {
    model,
    messages,
    stream: options.stream ?? true,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4096,
  };

  if (options.tools) {
    body.tools = options.tools;
    body.tool_choice = 'auto';
  }

  // Build headers — local models don't need Authorization
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isLocal && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API 错误 (${res.status}): ${err}`);
    }

    if (options.stream) {
      const result = await readStream(res);
      // Track quota
      import('./quota').then((m) => {
        const promptText = messages.map((msg) => typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)).join('');
        m.trackAICall(model, endpoint, promptText, result);
      });
      return result;
    } else {
      const data = await res.json();
      const result = data.choices?.[0]?.message?.content || '';
      // Track quota
      import('./quota').then((m) => {
        const promptText = messages.map((msg) => typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)).join('');
        m.trackAICall(model, endpoint, promptText, result);
      });
      return result;
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return '[已取消]';
    }
    throw new Error(`请求失败: ${err.message}`);
  } finally {
    _activeAbortController = null;
  }
}

async function readStream(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('流式响应不可用');

  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]') continue;

      try {
        const data = JSON.parse(jsonStr);
        const content = data.choices?.[0]?.delta?.content;
        if (content) fullText += content;
      } catch {
        // skip unparseable lines
      }
    }
  }

  return fullText;
}

// ─── Streaming with callback ───────────────────────────────
export async function callAIStream(
  messages: { role: string; content: string | any[] }[],
  onChunk: (text: string) => void,
  options: AIRequestOptions = {}
): Promise<string> {
  const aiSettings = useAISettingsStore.getState() as any;
  const modelStore = useModelStore.getState();

  const activeModel = modelStore.models.find((m: ModelConfig) => m.id === modelStore.activeModelId);
  const endpoint = options.endpoint || aiSettings.endpoint || activeModel?.endpoint || '';
  const model = options.model || aiSettings.model || activeModel?.model || 'gpt-4o';
  const apiKey = aiSettings.apiKey || '';
  const isLocal = activeModel?.local === true || activeModel?.requireApiKey === false;

  if (!endpoint || (!isLocal && !apiKey)) {
    const msg = !endpoint ? '请配置 API 端点' : '请配置 API Key';
    onChunk(msg);
    return msg;
  }

  const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const body: any = {
    model,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4096,
  };
  if (options.tools) { body.tools = options.tools; body.tool_choice = 'auto'; }

  // Build headers — local models don't need Authorization
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isLocal && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      const msg = `API 错误 (${res.status}): ${err}`;
      onChunk(msg);
      return msg;
    }

    const reader = res.body?.getReader();
    if (!reader) { onChunk('流式响应不可用'); return ''; }

    const decoder = new TextDecoder();
    let fullText = '';
    let toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') continue;
        try {
          const data = JSON.parse(jsonStr);
          const delta = data.choices?.[0]?.delta;

          if (delta?.content) {
            fullText += delta.content;
            onChunk(delta.content);
          }

          // Handle native tool_calls in stream
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls.has(idx)) {
                toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
              }
              const existing = toolCalls.get(idx)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            }
          }
        } catch {}
      }
    }

    // Handle native tool_calls via callback
    if (toolCalls.size > 0 && options.onToolCalls) {
      const calls = Array.from(toolCalls.values()).map((tc) => {
        let args: Record<string, any> = {};
        try { args = JSON.parse(tc.arguments); } catch {}
        return { id: tc.id, name: tc.name, arguments: args };
      });
      options.onToolCalls(calls);
      fullText += '\n[🔧 正在调用工具...]';
    } else if (toolCalls.size > 0) {
      // Legacy: convert to text blocks when no callback provided
      const toolBlock = Array.from(toolCalls.values())
        .map((tc) => `\`\`\`tool\n{"tool": "${tc.name}", "params": ${tc.arguments}}\n\`\`\``)
        .join('\n');
      fullText += '\n' + toolBlock;
      onChunk('\n' + toolBlock);
    }

    // Track quota
    import('./quota').then((m) => {
      const promptText = messages.map((msg) => typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)).join('');
      m.trackAICall(model, endpoint, promptText, fullText);
    });

    return fullText;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return fullText || '[已取消]';
    }
    const msg = `请求失败: ${err.message}`;
    onChunk(msg);
    return msg;
  } finally {
    _activeAbortController = null;
  }
}

// ─── Code completion (inline) ──────────────────────────────
export async function getInlineCompletion(
  prefix: string,
  suffix: string,
  language: string
): Promise<string> {
  const aiSettings = useAISettingsStore.getState() as any;
  const modelStore = useModelStore.getState();
  const activeModel = modelStore.models.find((m: ModelConfig) => m.id === modelStore.activeModelId);
  const isLocal = activeModel?.local === true || activeModel?.requireApiKey === false;
  if (!aiSettings.endpoint || (!isLocal && !aiSettings.apiKey)) return '';

  const messages = [
    {
      role: 'system',
      content: `You are a code completion engine. Complete the code based on context.
Respond ONLY with the completion code, no explanation, no markdown.
Language: ${language}`,
    },
    {
      role: 'user',
      content: `Complete the following code:\n\n\`\`\`${language}\n${prefix}█${suffix}\n\`\`\``,
    },
  ];

  try {
    const result = await callAI(messages, { stream: false, temperature: 0.3, max_tokens: 200 } as any);
    return result.replace(/```[\s\S]*?```/g, '').trim();
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════════════
// Embedding API — for semantic search / RAG
// ═══════════════════════════════════════════════════════════

/** Batch-embed multiple texts into vectors using the AI API */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const aiSettings = useAISettingsStore.getState() as any;
  const modelStore = useModelStore.getState();
  const activeModel = modelStore.models.find((m: ModelConfig) => m.id === modelStore.activeModelId);
  const isLocal = activeModel?.local === true || activeModel?.requireApiKey === false;

  if (!aiSettings.endpoint || (!isLocal && !aiSettings.apiKey)) {
    throw new Error('请先配置 API 端点和 Key');
  }

  const base = aiSettings.endpoint.replace(/\/$/, '').replace(/\/chat\/completions$/, '');
  const url = `${base}/embeddings`;

  const model = aiSettings.embeddingModel || 'text-embedding-3-small';

  try {
    // Build headers — local models don't need Authorization
    const embedHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!isLocal && aiSettings.apiKey) {
      embedHeaders['Authorization'] = `Bearer ${aiSettings.apiKey}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: embedHeaders,
      body: JSON.stringify({
        model,
        input: texts,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Embedding API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const vectors: number[][] = data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);

    return vectors;
  } catch (err: any) {
    throw new Error(`Embedding request failed: ${err.message}`);
  }
}

/** Single text embedding convenience */
export async function getEmbedding(text: string): Promise<number[]> {
  const vectors = await getEmbeddings([text]);
  if (vectors.length === 0) throw new Error('Empty embedding response');
  return vectors[0];
}

/** Check if the configured API supports embeddings */
export async function supportsEmbeddings(): Promise<boolean> {
  const aiSettings = useAISettingsStore.getState() as any;
  if (!aiSettings.endpoint || !aiSettings.apiKey) return false;

  try {
    await getEmbeddings(['test']);
    return true;
  } catch {
    return false;
  }
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vector dimension mismatch');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
