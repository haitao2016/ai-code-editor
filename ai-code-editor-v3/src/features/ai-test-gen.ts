// ============================================================
// AI 测试生成 — 自动生成单元测试用例
// ============================================================
import { callAI, createAISignal } from '../core/ai';
import { useEditorStore, useFilesStore } from '../core/stores';
import { getEditorContent, openFileTab } from '../core/editor';
import { saveFile } from '../core/files';
import type { FileEntry } from '../types';

// ─── Types ─────────────────────────────────────────────────
export interface TestGenerationOptions {
  /** Test framework: 'vitest' (TS/JS) or 'pytest' (Python) */
  framework: 'vitest' | 'pytest' | 'auto';
  /** Generate tests for: current file, selected code, or specific function */
  scope: 'file' | 'selection' | 'function';
  /** Function name (when scope is 'function') */
  functionName?: string;
  /** Whether to include edge case tests */
  includeEdgeCases?: boolean;
  /** Whether to include mock/stub examples */
  includeMocks?: boolean;
  /** Custom extra instructions for the AI */
  extraInstructions?: string;
}

export interface GeneratedTest {
  /** The generated test code */
  code: string;
  /** Framework used */
  framework: string;
  /** Target file the tests are for */
  targetFile: string;
  /** Brief description of what's tested */
  description: string;
  /** Coverage summary: number of test cases generated */
  testCaseCount: number;
}

// ─── Prompt builder ────────────────────────────────────────
function buildTestPrompt(
  sourceCode: string,
  sourceFilePath: string,
  language: string,
  options: TestGenerationOptions,
): string {
  const framework = options.framework === 'auto'
    ? (language === 'python' ? 'pytest' : 'vitest')
    : options.framework;

  const scopeDesc = options.scope === 'selection'
    ? 'the following code snippet'
    : options.scope === 'function' && options.functionName
    ? `the function \`${options.functionName}\` in this file`
    : 'all functions and classes in this file';

  const edgeCases = options.includeEdgeCases !== false
    ? '\n- Edge cases: null/undefined, empty inputs, boundary values, invalid types'
    : '';

  const mocks = options.includeMocks !== false
    ? '\n- Include mock/stub examples where appropriate (e.g., API calls, file I/O)'
    : '';

  const frameworkGuides: Record<string, string> = {
    vitest: `Use Vitest with the following structure:
- \`import { describe, it, expect, vi, beforeEach } from 'vitest'\`
- Use \`describe\` blocks for logical grouping
- Use \`it\` for individual test cases
- Use \`expect\` for assertions (toBe, toEqual, toThrow, etc.)
- Use \`vi.fn()\` / \`vi.mock()\` for mocks
- Export the test as default or use explicit imports`,
    pytest: `Use pytest with the following structure:
- Import pytest and the target module
- Use \`def test_*\` naming convention
- Use \`assert\` for assertions
- Use fixtures where helpful
- Use \`pytest.raises\` for exception testing
- Use \`@pytest.mark.parametrize\` for table-driven tests`,
  };

  return `You are an expert test engineer. Generate comprehensive unit tests for ${scopeDesc}.

Source file: ${sourceFilePath}
Language: ${language}
Test framework: ${framework}

${frameworkGuides[framework] || frameworkGuides.vitest}

Requirements:
- Write complete, runnable test code
- Cover happy path, error handling, and edge cases${edgeCases}${mocks}
- Add helpful comments explaining test intent
- Use descriptive test names
- Return ONLY the test code, no markdown fences, no explanation

Code to test:
\`\`\`${language}
${sourceCode}
\`\`\`

Generate ${framework} tests:`;
}

// ─── Resolve test file path ────────────────────────────────
function getTestFilePath(sourcePath: string, framework: string): string {
  const dir = sourcePath.substring(0, sourcePath.lastIndexOf('/') + 1);
  const baseName = sourcePath.substring(dir.length).replace(/\.[^.]+$/, '');

  if (framework === 'vitest') {
    // Convention: src/core/foo.ts → src/core/foo.test.ts
    return `${dir}${baseName}.test.ts`;
  } else if (framework === 'pytest') {
    // Convention: app/models.py → tests/test_models.py
    // If source is in tests/, keep there; otherwise put in tests/
    if (dir.includes('/tests/') || dir.startsWith('tests/')) {
      return `${dir}test_${baseName}.py`;
    }
    return `tests/test_${baseName}.py`;
  }

  return `${dir}${baseName}.test.ts`;
}

// ─── Main generation function ──────────────────────────────
export async function generateTests(
  options: TestGenerationOptions = { framework: 'auto', scope: 'file' },
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<GeneratedTest | null> {
  const editorStore = useEditorStore.getState();
  const targetFile = editorStore.activeFile;

  if (!targetFile) {
    onProgress?.('没有打开的文件');
    return null;
  }

  // Get source code
  let sourceCode: string;
  if (options.scope === 'selection') {
    sourceCode = editorStore.activeEditor?.getModel()?.getValueInRange(
      editorStore.activeEditor.getSelection()!
    ) || '';
    if (!sourceCode) {
      onProgress?.('请先选中要生成测试的代码');
      return null;
    }
  } else {
    sourceCode = getEditorContent();
    if (!sourceCode) {
      onProgress?.('无法获取文件内容');
      return null;
    }
  }

  // Detect language
  const language = detectLanguage(targetFile);
  const framework = options.framework === 'auto'
    ? (language === 'python' ? 'pytest' : 'vitest')
    : options.framework;

  // Truncate large files
  const MAX_CHARS = 12000;
  if (sourceCode.length > MAX_CHARS) {
    // Keep the beginning and end, summarize middle
    const half = Math.floor(MAX_CHARS / 2);
    sourceCode = sourceCode.substring(0, half - 100)
      + `\n// ... ${sourceCode.length - MAX_CHARS + 200} chars omitted ...\n`
      + sourceCode.substring(sourceCode.length - half + 100);
  }

  onProgress?.('正在分析代码结构...');

  const messages = [
    {
      role: 'system' as const,
      content: `You are an expert test engineer specializing in ${framework}. Write clean, comprehensive unit tests.`,
    },
    {
      role: 'user' as const,
      content: buildTestPrompt(sourceCode, targetFile, language, options),
    },
  ];

  try {
    onProgress?.('正在生成测试用例...');

    const testCode = await callAI(messages, {
      stream: false,
      temperature: 0.3,
      max_tokens: 4096,
      signal: signal || createAISignal(),
    });

    // Clean up the response (strip markdown fences if present)
    let cleanCode = testCode;
    const fenceMatch = cleanCode.match(/```[\w]*\n([\s\S]*?)```/);
    if (fenceMatch) {
      cleanCode = fenceMatch[1];
    } else {
      // Try to strip any leading/trailing markdown
      cleanCode = cleanCode.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    }

    // Count test cases
    const testCount = countTestCases(cleanCode, framework);

    onProgress?.(`已生成 ${testCount} 个测试用例`);

    return {
      code: cleanCode.trim(),
      framework,
      targetFile,
      description: `Tests for ${targetFile} (${framework}, ${testCount} cases)`,
      testCaseCount: testCount,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      onProgress?.('测试生成已取消');
      return null;
    }
    onProgress?.(`生成失败: ${err.message}`);
    return null;
  }
}

// ─── Apply generated tests ─────────────────────────────────
export async function applyGeneratedTests(
  generatedTest: GeneratedTest,
  createNewFile?: boolean,
): Promise<void> {
  const testFilePath = getTestFilePath(generatedTest.targetFile, generatedTest.framework);
  const files = useFilesStore.getState().files;

  if (createNewFile || !files.has(testFilePath)) {
    // Create new test file
    const file: FileEntry = {
      path: testFilePath,
      content: generatedTest.code,
      language: generatedTest.framework === 'pytest' ? 'python' : 'typescript',
      updatedAt: Date.now(),
    };
    useFilesStore.getState().setFile(file);
    await saveFile(file);
    openFileTab(testFilePath);
  } else {
    // Append to existing test file
    const existing = files.get(testFilePath)!;
    const separator = '\n\n// ─── Generated tests ───────────────────────────────────────\n\n';
    const updated = existing.content + separator + generatedTest.code;
    const file: FileEntry = {
      ...existing,
      content: updated,
      updatedAt: Date.now(),
    };
    useFilesStore.getState().setFile(file);
    await saveFile(file);
    openFileTab(testFilePath);
  }
}

// ─── Batch generate tests for multiple files ───────────────
export async function batchGenerateTests(
  filePaths: string[],
  onProgress?: (file: string, message: string) => void,
): Promise<{ generated: number; skipped: number; errors: string[] }> {
  let generated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const filePath of filePaths) {
    const editorStore = useEditorStore.getState();
    const files = useFilesStore.getState().files;
    const entry = files.get(filePath);
    if (!entry) {
      skipped++;
      continue;
    }

    // Skip non-code files
    const language = detectLanguage(filePath);
    if (language === 'text' || language === 'json' || language === 'markdown') {
      skipped++;
      continue;
    }

    // Skip files already larger than threshold
    if (entry.content.length > 15000) {
      skipped++;
      onProgress?.(filePath, '文件过大，跳过');
      continue;
    }

    try {
      onProgress?.(filePath, '生成中...');

      // Open file to set as active
      openFileTab(filePath);
      await new Promise((r) => setTimeout(r, 100)); // Let editor load

      const result = await generateTests({
        framework: 'auto',
        scope: 'file',
        includeEdgeCases: true,
      });

      if (result && result.code.length > 50) {
        await applyGeneratedTests(result, true);
        generated++;
        onProgress?.(filePath, `已生成 ${result.testCaseCount} 个测试`);
      } else {
        skipped++;
        onProgress?.(filePath, '未能生成有效测试');
      }
    } catch (err: any) {
      errors.push(`${filePath}: ${err.message}`);
      skipped++;
    }
  }

  return { generated, skipped, errors };
}

// ─── Test generation UI ───────────────────────────────────
export function renderTestGenUI(): string {
  return `
    <div class="ai-testgen-panel">
      <div class="testgen-header">
        <h3>🧪 AI 测试生成</h3>
        <p>为当前文件自动生成单元测试</p>
      </div>

      <div class="testgen-config">
        <div class="testgen-field">
          <label>测试框架</label>
          <select id="testgen-framework">
            <option value="auto">自动检测</option>
            <option value="vitest">Vitest (TypeScript/JavaScript)</option>
            <option value="pytest">Pytest (Python)</option>
          </select>
        </div>

        <div class="testgen-field">
          <label>生成范围</label>
          <select id="testgen-scope">
            <option value="file">整个文件</option>
            <option value="selection">选中代码</option>
            <option value="function">指定函数</option>
          </select>
        </div>

        <div class="testgen-field testgen-field--func" style="display:none">
          <label>函数名</label>
          <input type="text" id="testgen-function" placeholder="输入函数名...">
        </div>

        <div class="testgen-checks">
          <label><input type="checkbox" id="testgen-edge" checked> 包含边界测试</label>
          <label><input type="checkbox" id="testgen-mocks" checked> 包含 Mock 示例</label>
        </div>

        <div class="testgen-field">
          <label>额外指令（可选）</label>
          <textarea id="testgen-instructions" rows="2" placeholder="例如：关注异步错误处理..."></textarea>
        </div>
      </div>

      <div class="testgen-actions">
        <button class="testgen-btn testgen-btn--generate" onclick="runTestGeneration()">
          ⚡ 生成测试
        </button>
        <button class="testgen-btn testgen-btn--batch" onclick="batchTestGeneration()">
          📦 批量生成
        </button>
      </div>

      <div id="testgen-output" class="testgen-output" style="display:none"></div>
    </div>
  `;
}

// ─── Helpers ───────────────────────────────────────────────
function detectLanguage(filePath: string): string {
  if (filePath.endsWith('.ts')) return 'typescript';
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.js')) return 'javascript';
  if (filePath.endsWith('.jsx')) return 'jsx';
  if (filePath.endsWith('.py')) return 'python';
  if (filePath.endsWith('.html')) return 'html';
  if (filePath.endsWith('.css')) return 'css';
  if (filePath.endsWith('.json')) return 'json';
  if (filePath.endsWith('.md')) return 'markdown';
  return 'text';
}

function countTestCases(code: string, framework: string): number {
  if (framework === 'pytest') {
    // Count def test_ patterns
    const matches = code.match(/^def\s+test_\w+/gm);
    return matches ? matches.length : 0;
  } else {
    // Count it( patterns (including vitest)
    const itMatches = code.match(/\bit\s*\(/g);
    const testMatches = code.match(/\btest\s*\(/g);
    return (itMatches?.length || 0) + (testMatches?.length || 0);
  }
}
