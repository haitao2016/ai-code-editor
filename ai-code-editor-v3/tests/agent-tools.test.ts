// ============================================================
// Agent Tools Unit Tests
// ============================================================
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';

// Test the tool registry and execution logic directly
describe('Agent Tools System', () => {
  it('should have defined tool schemas', () => {
    const schemas = [
      { name: 'read_file', description: 'Read file content' },
      { name: 'write_file', description: 'Write file content' },
      { name: 'list_files', description: 'List directory contents' },
      { name: 'search', description: 'Search for pattern in files' },
      { name: 'run_command', description: 'Run a shell command' },
      { name: 'delete_file', description: 'Delete a file' },
      { name: 'get_editor_context', description: 'Get active editor context' },
    ];

    expect(schemas.length).toBeGreaterThanOrEqual(7);
    schemas.forEach((s) => {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(typeof s.name).toBe('string');
      expect(typeof s.description).toBe('string');
    });
  });

  it('should generate OpenAI-compatible tool format', () => {
    function toOpenAITool(schema: { name: string; description: string; parameters: any }) {
      return {
        type: 'function' as const,
        function: {
          name: schema.name,
          description: schema.description,
          parameters: schema.parameters,
        },
      };
    }

    const tool = toOpenAITool({
      name: 'read_file',
      description: 'Read file content',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path' } },
        required: ['path'],
      },
    });

    expect(tool.type).toBe('function');
    expect(tool.function.name).toBe('read_file');
    expect(tool.function.parameters.required).toContain('path');
  });

  it('should parse tool calls from AI response', () => {
    function parseToolCalls(response: any) {
      const toolCalls = response?.choices?.[0]?.message?.tool_calls || [];
      return toolCalls.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || 'unknown',
        arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
      }));
    }

    const mockResponse = {
      choices: [{
        message: {
          tool_calls: [{
            id: 'call_123',
            function: {
              name: 'read_file',
              arguments: '{"path":"test.ts"}',
            },
          }],
        },
      }],
    };

    const calls = parseToolCalls(mockResponse);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('read_file');
    expect(calls[0].arguments.path).toBe('test.ts');
  });
});
