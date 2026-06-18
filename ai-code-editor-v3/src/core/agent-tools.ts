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
      description: 'Run a shell command (simulated terminal). Use for npm install, npm run, git, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
      execute: async (params) => {
        const cmd = params.command.trim();
        const files = useFilesStore.getState().files;

        // Simulate common commands
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
          return 'Simulated: npm install completed. Packages installed successfully.\nadded 42 packages in 2.3s';
        }
        if (cmd.startsWith('npm run')) {
          return 'Simulated: npm run completed. Build successful.\nCompiled successfully in 1.8s';
        }
        if (cmd.startsWith('echo ')) {
          return cmd.slice(5).trim();
        }
        if (cmd.startsWith('node ')) {
          return 'Simulated: node script executed successfully.';
        }
        return `Simulated output for: ${cmd}\nCommand executed successfully.`;
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

function buildToolsPrompt(tools: AgentTool[]): string {
  return `You have access to the following tools:\n\n${tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters.properties)}`
    )
    .join('\n')}\n\nTo use a tool, respond with a JSON block like:\n\`\`\`tool\n{"tool": "tool_name", "params": {...}}\n\`\`\``;
}

export async function runAgent(
  intent: string,
  onStep: (step: string) => void,
  onDone: (summary: string) => void
): Promise<void> {
  const tools = defineAgentTools();
  const { callAIStream } = await import('./ai');

  onStep('分析任务意图...');

  // Step 1: Plan
  const planMessages = [
    {
      role: 'system',
      content: `You are an AI coding agent. Plan how to accomplish the user's task using the available tools.\n\n${buildToolsPrompt(
        tools
      )}\n\nFirst, create a step-by-step plan. Then execute each step by calling tools. Be concise.`,
    },
    {
      role: 'user',
      content: `Task: ${intent}\n\nCreate a plan and start executing. You can use tools by outputting:\n\`\`\`tool\n{"tool": "tool_name", "params": {...}}\n\`\`\``,
    },
  ];

  let fullResponse = '';
  let stepCount = 0;
  const maxSteps = 10;
  let allSteps: string[] = [];

  try {
    while (stepCount < maxSteps) {
      stepCount++;
      fullResponse = '';

      await callAIStream(
        planMessages,
        (chunk) => {
          fullResponse += chunk;
        },
        { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }
      );

      // Check for tool calls in the response
      const toolBlockMatch = fullResponse.match(/```tool\s*\n([\s\S]*?)\n```/);
      if (toolBlockMatch) {
        try {
          const toolCall = JSON.parse(toolBlockMatch[1]);
          if (toolCall.tool && toolCall.params) {
            const tool = tools.find((t) => t.name === toolCall.tool);
            if (tool) {
              onStep(`🔧 ${toolCall.tool}: ${Object.values(toolCall.params).join(', ')}`);
              const result = await tool.execute(toolCall.params);
              onStep(`✅ 完成: ${result.substring(0, 80)}...`);

              // Add result to conversation and continue
              planMessages.push(
                { role: 'assistant', content: fullResponse },
                { role: 'user', content: `Tool result for ${toolCall.tool}:\n${result}\n\nContinue to the next step or provide the final summary.` }
              );
              continue;
            }
          }
        } catch {
          // Not a valid tool call, treat as final response
        }
      }

      // No tool call found or error parsing — treat as final response
      break;
    }
  } catch (err: any) {
    onDone(`Agent 执行出错: ${err.message}`);
    return;
  }

  if (stepCount >= maxSteps) {
    onDone('Agent 达到最大步骤数限制，已停止。');
    return;
  }

  onDone(fullResponse || '任务已完成。');
}
