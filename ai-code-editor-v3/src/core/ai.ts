// ============================================================
// AI API 客户端 — 支持 OpenAI 兼容接口 + 多模型
// ============================================================
import { useAISettingsStore, useModelStore } from '../core/stores';
import type { ChatMessage, ModelConfig } from '../types';

export interface AIRequestOptions {
  model?: string;
  endpoint?: string;
  stream?: boolean;
  images?: string[];
  tools?: any[];
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

  if (!endpoint) {
    return '请在设置中配置 API 端点。支持 OpenAI 兼容接口（如 OpenAI、DeepSeek、通义千问等）。';
  }
  if (!apiKey) {
    return '请在设置中配置 API Key。密钥仅存储在本地浏览器中。';
  }

  const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const body: any = {
    model,
    messages,
    stream: options.stream ?? true,
    temperature: 0.7,
    max_tokens: 4096,
  };

  if (options.tools) {
    body.tools = options.tools;
    body.tool_choice = 'auto';
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API 错误 (${res.status}): ${err}`);
    }

    if (options.stream) {
      return readStream(res);
    } else {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
  } catch (err: any) {
    throw new Error(`请求失败: ${err.message}`);
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

  if (!endpoint || !apiKey) {
    const msg = !endpoint ? '请配置 API 端点' : '请配置 API Key';
    onChunk(msg);
    return msg;
  }

  const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const body: any = {
    model,
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (options.tools) { body.tools = options.tools; body.tool_choice = 'auto'; }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
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

    // Append tool calls to response as code blocks for parsing
    if (toolCalls.size > 0) {
      const toolBlock = Array.from(toolCalls.values())
        .map((tc) => `\`\`\`tool\n{"tool": "${tc.name}", "params": ${tc.arguments}}\n\`\`\``)
        .join('\n');
      fullText += '\n' + toolBlock;
      onChunk('\n' + toolBlock);
    }

    return fullText;
  } catch (err: any) {
    const msg = `请求失败: ${err.message}`;
    onChunk(msg);
    return msg;
  }
}

// ─── Code completion (inline) ──────────────────────────────
export async function getInlineCompletion(
  prefix: string,
  suffix: string,
  language: string
): Promise<string> {
  const aiSettings = useAISettingsStore.getState() as any;
  if (!aiSettings.endpoint || !aiSettings.apiKey) return '';

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
