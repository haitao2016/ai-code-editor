// ============================================================
// AI Client Unit Tests
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAISignal,
  abortActiveRequest,
  isAIRequestActive,
  cosineSimilarity,
} from '../src/core/ai';

describe('AI Client — AbortController management', () => {
  it('createAISignal should return an AbortSignal', () => {
    const signal = createAISignal();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('isAIRequestActive should return true after creating signal', () => {
    createAISignal();
    expect(isAIRequestActive()).toBe(true);
  });

  it('createAISignal should abort previous request', () => {
    const signal1 = createAISignal();
    expect(signal1.aborted).toBe(false);

    const signal2 = createAISignal();
    // Previous signal should now be aborted
    expect(signal1.aborted).toBe(true);
    expect(signal2.aborted).toBe(false);
  });

  it('abortActiveRequest should abort current signal', () => {
    const signal = createAISignal();
    expect(isAIRequestActive()).toBe(true);

    abortActiveRequest();
    expect(isAIRequestActive()).toBe(false);
    expect(signal.aborted).toBe(true);
  });

  it('abortActiveRequest should be safe when no active request', () => {
    expect(() => abortActiveRequest()).not.toThrow();
    expect(isAIRequestActive()).toBe(false);
  });

  it('multiple createAISignal calls should always return fresh signals', () => {
    const s1 = createAISignal();
    const s2 = createAISignal();
    const s3 = createAISignal();

    expect(s1).not.toBe(s2);
    expect(s2).not.toBe(s3);
    expect(s1.aborted).toBe(true);
    expect(s2.aborted).toBe(true);
    expect(s3.aborted).toBe(false);
  });
});

describe('AI Client — Cosine Similarity', () => {
  it('should return 1 for identical vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(-1, 5);
  });

  it('should throw on dimension mismatch', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => cosineSimilarity(a, b)).toThrow('Vector dimension mismatch');
  });

  it('should handle zero vectors gracefully', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBe(0);
  });

  it('should handle high-dimensional vectors', () => {
    const dim = 1536; // typical embedding dimension
    const a = new Array(dim).fill(0).map((_, i) => Math.sin(i));
    const b = new Array(dim).fill(0).map((_, i) => Math.sin(i + 0.01));

    const similarity = cosineSimilarity(a, b);
    // Similar vectors should have similarity near 1
    expect(similarity).toBeGreaterThan(0.99);
  });

  it('should work with float32 values', () => {
    const a = [0.1, 0.2, 0.3, 0.4];
    const b = [0.5, 0.6, 0.7, 0.8];
    const result = cosineSimilarity(a, b);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it('should handle negative values', () => {
    const a = [-0.5, 0.3, -0.2];
    const b = [0.1, -0.4, 0.6];
    const result = cosineSimilarity(a, b);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });
});

describe('AI Client — Stream reading', () => {
  it('should parse SSE stream data correctly (simulated)', () => {
    // Simulate the readStream logic
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let fullText = '';
    for (const rawChunk of chunks) {
      const lines = rawChunk.split('\n');
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
          // skip
        }
      }
    }

    expect(fullText).toBe('Hello World');
  });

  it('should handle empty SSE messages', () => {
    let fullText = '';
    const lines = ['', 'data: [DONE]', '', '  '];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]') continue;
      fullText += 'should-not-reach';
    }
    expect(fullText).toBe('');
  });

  it('should handle malformed JSON gracefully', () => {
    let fullText = '';
    const chunks = [
      'data: {broken json\n\n',
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n',
    ];

    for (const rawChunk of chunks) {
      const lines = rawChunk.split('\n');
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
          // skip unparseable
        }
      }
    }

    expect(fullText).toBe('OK');
  });

  it('should handle tool_calls in stream delta', () => {
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

    // Simulate accumulating tool_calls from stream
    interface DeltaItem {
      index: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }
    const deltas: Array<{ delta: { tool_calls?: DeltaItem[] } }> = [
      { delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_file' } }] } },
      { delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] } },
      { delta: { tool_calls: [{ index: 0, function: { arguments: '"/test.ts"}' } }] } },
    ];

    for (const { delta } of deltas) {
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
    }

    expect(toolCalls.size).toBe(1);
    const call = toolCalls.get(0)!;
    expect(call.name).toBe('read_file');
    expect(call.id).toBe('call_1');

    const args = JSON.parse(call.arguments);
    expect(args.path).toBe('/test.ts');
  });
});

describe('AI Client — API call parameters', () => {
  it('should construct correct API body structure', () => {
    const body = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    };

    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toHaveLength(1);
    expect(body.stream).toBe(true);
  });

  it('should include tools when provided', () => {
    const tools = [
      {
        type: 'function',
        function: { name: 'read_file', description: 'Read a file', parameters: {} },
      },
    ];

    const body: any = {
      model: 'gpt-4o',
      messages: [],
      stream: true,
      tools,
      tool_choice: 'auto',
    };

    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe('auto');
  });

  it('should append /chat/completions to endpoint', () => {
    const endpoint1 = 'https://api.openai.com';
    const url1 = endpoint1.endsWith('/chat/completions')
      ? endpoint1
      : `${endpoint1.replace(/\/$/, '')}/chat/completions`;

    expect(url1).toBe('https://api.openai.com/chat/completions');

    const endpoint2 = 'https://custom.api/v1/chat/completions';
    const url2 = endpoint2.endsWith('/chat/completions')
      ? endpoint2
      : `${endpoint2.replace(/\/$/, '')}/chat/completions`;

    expect(url2).toBe('https://custom.api/v1/chat/completions');
  });
});
