// ============================================================
// 多文件上下文构建 — 依赖图分析 + 自动引用
// ============================================================
import { useFilesStore, useEditorStore } from './stores';
import { getEditorContent } from './editor';

// ─── Import parsing ────────────────────────────────────────
interface ParsedImport {
  /** Raw import path (e.g. './utils', 'react', '@/components/Button') */
  modulePath: string;
  /** Resolved file path if found in project */
  resolvedFile: string | null;
  /** Type: default, named, namespace, dynamic */
  type: 'default' | 'named' | 'namespace' | 'dynamic' | 'reexport';
}

/** Parse TypeScript/JavaScript imports from source code */
function parseTSJSImports(source: string): ParsedImport[] {
  const imports: ParsedImport[] = [];

  // Static imports: import { X } from './path'
  // import X from './path'
  // import * as X from './path'
  // import './path'
  const staticImportRe = /import\s+(?:(?:\{[^}]*\}|[\w$]+|\*\s+as\s+\w+)\s*,?\s*)*\s*(?:from\s*)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = staticImportRe.exec(source)) !== null) {
    const path = match[1];
    let type: ParsedImport['type'] = 'default';
    if (match[0].includes('{')) type = 'named';
    else if (match[0].includes('*')) type = 'namespace';
    imports.push({ modulePath: path, resolvedFile: null, type });
  }

  // Dynamic imports: import('./path')
  const dynamicImportRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRe.exec(source)) !== null) {
    imports.push({ modulePath: match[1], resolvedFile: null, type: 'dynamic' });
  }

  // Require: require('./path')
  const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRe.exec(source)) !== null) {
    imports.push({ modulePath: match[1], resolvedFile: null, type: 'default' });
  }

  // Re-exports: export { X } from './path'
  const reexportRe = /export\s+(?:\{[^}]*\}|[\w$]+|\*\s+from)\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = reexportRe.exec(source)) !== null) {
    imports.push({ modulePath: match[1], resolvedFile: null, type: 'reexport' });
  }

  return imports;
}

/** Parse Python imports from source code */
function parsePythonImports(source: string): ParsedImport[] {
  const imports: ParsedImport[] = [];

  // import module
  // import module as alias
  const importRe = /^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;
  let match;
  while ((match = importRe.exec(source)) !== null) {
    const modules = match[1].split(',').map((s) => s.trim());
    for (const mod of modules) {
      imports.push({ modulePath: mod, resolvedFile: null, type: 'default' });
    }
  }

  // from module import X
  const fromImportRe = /^from\s+([\w.]+)\s+import\s+/gm;
  while ((match = fromImportRe.exec(source)) !== null) {
    imports.push({ modulePath: match[1], resolvedFile: null, type: 'named' });
  }

  return imports;
}

// ─── File resolution ───────────────────────────────────────
/** Try to resolve an import path to a file in the project */
function resolveImportPath(
  importPath: string,
  fromFile: string,
  files: Map<string, any>,
): string | null {
  // Skip external/npm packages
  if (!importPath.startsWith('.') && !importPath.startsWith('/') && !importPath.startsWith('@')) {
    return null;
  }

  // Get directory of the importing file
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/') + 1);

  // Resolve the path
  let resolved = importPath;
  if (importPath.startsWith('.')) {
    resolved = normalizePath(fromDir + importPath);
  }

  // Try various extensions
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.py', '.json', '/index.ts', '/index.js', '/index.py'];
  for (const ext of extensions) {
    const path = (resolved + ext).replace(/\/+/g, '/');
    if (files.has(path)) return path;
  }

  return null;
}

/** Normalize a path resolving .. and . segments */
function normalizePath(path: string): string {
  const parts = path.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      result.pop();
    } else {
      result.push(part);
    }
  }
  return result.join('/');
}

// ─── Dependency graph ──────────────────────────────────────
interface DependencyNode {
  path: string;
  dependencies: string[];
  dependents: string[];
  content: string;
}

/** Get all files that the given file depends on (direct + transitive, up to depth 3) */
export function getDependencyFiles(
  filePath: string,
  maxDepth: number = 3,
): string[] {
  const files = useFilesStore.getState().files;
  const source = files.get(filePath)?.content || '';

  // Parse imports
  const lang = filePath.endsWith('.py') ? 'python' : 'typescript';
  const rawImports = lang === 'python' ? parsePythonImports(source) : parseTSJSImports(source);

  // Resolve to project files
  const resolvedImports = rawImports
    .map((imp) => ({
      ...imp,
      resolvedFile: resolveImportPath(imp.modulePath, filePath, files),
    }))
    .filter((imp) => imp.resolvedFile !== null);

  const visited = new Set<string>([filePath]);
  const result: string[] = [];
  let queue = resolvedImports.map((imp) => imp.resolvedFile!);

  for (let depth = 0; depth < maxDepth && queue.length > 0; depth++) {
    const nextQueue: string[] = [];
    for (const depPath of queue) {
      if (visited.has(depPath)) continue;
      visited.add(depPath);
      result.push(depPath);

      // Parse transitive dependencies
      const depSource = files.get(depPath)?.content || '';
      const depLang = depPath.endsWith('.py') ? 'python' : 'typescript';
      const depImports = depLang === 'python'
        ? parsePythonImports(depSource)
        : parseTSJSImports(depSource);

      for (const imp of depImports) {
        const resolved = resolveImportPath(imp.modulePath, depPath, files);
        if (resolved && !visited.has(resolved)) {
          nextQueue.push(resolved);
        }
      }
    }
    queue = nextQueue;
  }

  return result;
}

// ─── Multi-file context builder ─────────────────────────────
const MAX_CONTEXT_CHARS = 8000;

/** Build a multi-file context string for AI prompts */
export async function buildMultiFileContext(filePath?: string, userQuery?: string): Promise<string> {
  const editorStore = useEditorStore.getState();
  const files = useFilesStore.getState().files;
  const targetFile = filePath || editorStore.activeFile;

  if (!targetFile) return '';

  const parts: string[] = [];

  // 1. Current file (always included, truncated if large)
  const currentContent = getEditorContent() || files.get(targetFile)?.content || '';
  const currentTruncated = truncateContent(currentContent, MAX_CONTEXT_CHARS);
  parts.push(`### 📄 当前文件: ${targetFile}\n\`\`\`\n${currentTruncated}\n\`\`\``);

  // 2. Dependency files
  const deps = getDependencyFiles(targetFile, 2);
  if (deps.length > 0) {
    const remainingChars = MAX_CONTEXT_CHARS - currentTruncated.length;
    const charsPerDep = Math.floor(remainingChars / Math.max(deps.length, 1));

    parts.push('\n### 📎 相关依赖文件:');

    for (const depPath of deps.slice(0, 8)) { // max 8 dep files
      const depContent = files.get(depPath)?.content || '';
      const truncated = truncateContent(depContent, Math.max(charsPerDep, 200));
      parts.push(`\n**${depPath}**\n\`\`\`\n${truncated}\n\`\`\``);
    }
  }

  // 3. Project overview (file list)
  const allFiles = Array.from(files.keys()).sort();
  const fileList = allFiles.slice(0, 30).join('\n');
  parts.push(`\n### 📁 项目文件列表 (${allFiles.length} 个文件)\n${fileList}`);

  // 4. RAG semantic search (if query provided)
  if (userQuery && userQuery.length > 3) {
    try {
      const { searchRAGAsync, getRAGIndex } = await import('./rag');
      if (getRAGIndex().isBuilt) {
        const ragResults = await searchRAGAsync(userQuery, 4);
        if (ragResults) {
          parts.push(ragResults);
        }
      }
    } catch { /* RAG not available */ }
  }

  return parts.join('\n');
}

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const half = Math.floor(maxChars / 2);
  return content.substring(0, half) + '\n\n... (内容已截断) ...\n\n' + content.substring(content.length - half);
}

// ─── Gather project context with token awareness ────────────
import { estimateTokens } from './stores';

/**
 * Build a token-budget-aware context. Prioritizes current file, then dependencies,
 * then project overview. Truncates to fit within the budget.
 */
export async function buildSmartContext(maxTokens: number = 4000, userQuery?: string): Promise<string> {
  const multiFileCtx = await buildMultiFileContext(undefined, userQuery);
  const tokenCount = estimateTokens(multiFileCtx);

  if (tokenCount <= maxTokens) return multiFileCtx;

  // If over budget, fall back to just the current file
  const editorStore = useEditorStore.getState();
  const files = useFilesStore.getState().files;
  const targetFile = editorStore.activeFile;
  if (!targetFile) return '';

  const content = getEditorContent() || files.get(targetFile)?.content || '';
  let truncated = content;
  while (estimateTokens(truncated) > maxTokens - 100) {
    truncated = truncated.substring(0, Math.floor(truncated.length * 0.8));
  }
  return `当前文件: ${targetFile}\n\`\`\`\n${truncated}\n\`\`\``;
}
