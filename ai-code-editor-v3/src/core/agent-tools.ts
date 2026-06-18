// ============================================================
// Agent 工具调用系统 — 真实 AI function calling
// ============================================================
import { useFilesStore, useEditorStore } from './stores';
import { saveFile, loadAllFiles, getLanguageFromPath } from './files';
import { getEditorContent, openFileTab } from './editor';
import type { FileEntry } from '../types';

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  execute: (params: any) => Promise<string>;
}

export function defineAgentTools(): AgentTool[] {
  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file. Use this to understand existing code before making changes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to read' },
        },
        required: ['path'],
      },
      execute: async (params) => {
        const files = useFilesStore.getState().files;
        const entry = files.get(params.path);
        if (!entry) return `Error: File "${params.path}" not found.`;
        return `File: ${params.path}\nLanguage: ${entry.language}\nContent:\n\`\`\`\n${entry.content}\n\`\`\``;
      },
    },
    {
      name: 'write_file',
      description: 'Write or update the contents of a file. Creates the file if it does not exist.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to write' },
          content: { type: 'string', description: 'The full content of the file' },
        },
        required: ['path', 'content'],
      },
      execute: async (params) => {
        const store = useFilesStore.getState();
        const file: FileEntry = {
          path: params.path,
          content: params.content,
          language: getLanguageFromPath(params.path),
          updatedAt: Date.now(),
        };
        store.setFile(file);
        await saveFile(file);
        return `File "${params.path}" written successfully (${params.content.length} chars).`;
      },
    },
    {
      name: 'run_command',
      description: 'Run a shell command. Use for npm install, npm run, git, ls, cat, etc. Commands execute in the project workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
      execute: async (params) => {
        const cmd = params.command.trim();

        // Try real execution via Electron API
        const electronAPI = window.electronAPI;
        if (electronAPI?.exec?.command) {
          try {
            const result = await electronAPI.exec.command(cmd);
            const output = result.stdout || '';
            const errors = result.stderr || '';
            if (result.success) {
              return output + (errors ? `\n[stderr]\n${errors}` : '');
            } else {
              return `Command failed (exit code ${result.exitCode}):\n${errors || output}`;
            }
          } catch (err: any) {
            // Fall back to simulation if IPC fails
          }
        }

        // ─── Simulation fallback for web mode ────────────
        const files = useFilesStore.getState().files;

        if (cmd === 'ls' || cmd === 'dir') {
          const entries = Array.from(files.entries()).map(([path]) => path).sort();
          return entries.length > 0 ? entries.join('\n') : '(empty directory)';
        }
        if (cmd.startsWith('cat ')) {
          const target = cmd.slice(4).trim();
          const entry = files.get(target);
          if (!entry) return `cat: ${target}: No such file`;
          return entry.content;
        }
        if (cmd.startsWith('mkdir ')) {
          const dir = cmd.slice(6).trim();
          const file: FileEntry = {
            path: dir + '/',
            content: '',
            language: 'plaintext',
            updatedAt: Date.now(),
          };
          useFilesStore.getState().setFile(file);
          await saveFile(file);
          return `Created directory: ${dir}`;
        }
        if (cmd.startsWith('npm install')) {
          return 'Simulated: npm install completed.\nadded 42 packages in 2.3s\n[Note: Run in Electron for real npm execution]';
        }
        if (cmd.startsWith('npm run')) {
          return 'Simulated: npm run completed. Build successful.\n[Note: Run in Electron for real npm execution]';
        }
        if (cmd.startsWith('echo ')) {
          return cmd.slice(5).trim();
        }
        if (cmd.startsWith('node ')) {
          return 'Simulated: node script executed successfully.\n[Note: Run in Electron for real execution]';
        }
        return `Simulated output for: ${cmd}\n[Note: Running in web mode — commands are simulated. Use Electron for real execution.]`;
      },
    },
    {
      name: 'list_files',
      description: 'List all files in the project workspace.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Optional file pattern to filter (e.g., *.ts, src/*)' },
        },
        required: [],
      },
      execute: async (params) => {
        const files = useFilesStore.getState().files;
        const entries = Array.from(files.entries()).map(([path, entry]) => ({
          path,
          size: entry.content.length,
          updatedAt: new Date(entry.updatedAt).toISOString(),
        }));
        entries.sort((a, b) => a.path.localeCompare(b.path));
        const filtered = params.pattern
          ? entries.filter((e) => e.path.includes(params.pattern.replace(/\*/g, '')))
          : entries;
        if (filtered.length === 0) return 'No files found.';
        return filtered.map((e) => `${e.path} (${e.size} chars, ${e.updatedAt})`).join('\n');
      },
    },
    {
      name: 'search_content',
      description: 'Search for text content across all files in the project.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The text to search for' },
          filePattern: { type: 'string', description: 'Optional file pattern to limit search scope' },
        },
        required: ['query'],
      },
      execute: async (params) => {
        const files = useFilesStore.getState().files;
        const results: string[] = [];
        const query = params.query.toLowerCase();

        for (const [path, entry] of files.entries()) {
          if (params.filePattern && !path.includes(params.filePattern.replace(/\*/g, ''))) continue;
          const lines = entry.content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(query)) {
              results.push(`${path}:${i + 1}: ${lines[i].trim().substring(0, 120)}`);
            }
          }
        }

        if (results.length === 0) return `No matches found for "${params.query}".`;
        return results.slice(0, 30).join('\n') + (results.length > 30 ? `\n...and ${results.length - 30} more` : '');
      },
    },
  ];
}

export async function runAgent(
  intent: string,
  onStep: (step: string) => void,
  onDone: (summary: string) => void
): Promise<void> {
  const tools = defineAgentTools();
  const { callAIStream, createAISignal } = await import('./ai');

  onStep('分析任务意图...');

  const planMessages: { role: string; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string }[] = [
    {
      role: 'system',
      content: `You are an AI coding agent. Use the available tools to accomplish the user's task. Plan first, then execute step by step using function calls. Be concise and efficient.`,
    },
    {
      role: 'user',
      content: `Task: ${intent}`,
    },
  ];

  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  let fullText = '';
  let stepCount = 0;
  const maxSteps = 10;
  // Track pending tool calls for this iteration
  let pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];

  try {
    while (stepCount < maxSteps) {
      stepCount++;
      fullText = '';
      pendingToolCalls = [];

      await callAIStream(
        planMessages,
        (chunk) => {
          fullText += chunk;
        },
        {
          tools: openaiTools,
          signal: createAISignal(),
          onToolCalls: (calls) => {
            pendingToolCalls = calls;
          },
        }
      );

      // Execute tool calls using native OpenAI format
      if (pendingToolCalls.length > 0) {
        // Add assistant message with tool_calls
        planMessages.push({
          role: 'assistant',
          content: fullText || null as any,
          tool_calls: pendingToolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });

        // Execute each tool and add results
        for (const tc of pendingToolCalls) {
          const tool = tools.find((t) => t.name === tc.name);
          onStep(`🔧 ${tc.name}(${Object.values(tc.arguments).join(', ')})`);

          let result: string;
          if (tool) {
            result = await tool.execute(tc.arguments);
          } else {
            result = `Error: Unknown tool "${tc.name}"`;
          }

          onStep(`✅ ${result.substring(0, 80)}`);
          planMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content: result,
          });
        }
        continue; // Continue the loop for next AI step
      }

      // No tool calls — AI is done, text is the final response
      break;
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      onDone('Agent 已取消。');
      return;
    }
    onDone(`Agent 执行出错: ${err.message}`);
    return;
  }

  if (stepCount >= maxSteps) {
    onDone('Agent 达到最大步骤数限制，已停止。');
    return;
  }

  onDone(fullText || '任务已完成。');
}
