// ============================================================
// AI 代码审查 — AI-driven code review with categorized findings
// ============================================================
import { callAI, createAISignal, abortActiveRequest } from '../core/ai';
import { useEditorStore } from '../core/stores';
import { getEditorContent } from '../core/editor';

// ─── Types ─────────────────────────────────────────────────
export interface AIReviewFinding {
  /** Unique id for this finding */
  id: string;
  /** Category of the finding */
  category: 'bug' | 'security' | 'performance' | 'style' | 'best-practice' | 'type-safety';
  /** Severity: error, warning, or info */
  severity: 'error' | 'warning' | 'info';
  /** 1-based line number where the issue is */
  line: number;
  /** End line (for multi-line issues), same as line if single-line */
  endLine: number;
  /** Short title describing the issue */
  title: string;
  /** Detailed explanation */
  description: string;
  /** Suggested fix code (optional) */
  suggestion?: string;
  /** The problematic code snippet */
  codeSnippet: string;
}

export interface AIReviewResult {
  /** File path being reviewed */
  filePath: string;
  /** Overall score: 0-100 */
  score: number;
  /** Short summary paragraph */
  summary: string;
  /** Categorized findings */
  findings: AIReviewFinding[];
  /** Timestamp */
  reviewedAt: number;
}

// ─── Review prompt template ────────────────────────────────
function buildReviewPrompt(code: string, language: string): string {
  return `You are a senior code reviewer. Review the following ${language} code for issues.
Analyze for: bugs, security vulnerabilities, performance problems, style violations, best-practice violations, and type-safety issues.

Respond with a JSON object in this exact format (no markdown, no other text):

{
  "score": <0-100>,
  "summary": "<one paragraph summary>",
  "findings": [
    {
      "category": "bug|security|performance|style|best-practice|type-safety",
      "severity": "error|warning|info",
      "line": <number>,
      "endLine": <number>,
      "title": "<short title>",
      "description": "<detailed explanation>",
      "suggestion": "<optional fix code or null>",
      "codeSnippet": "<the relevant code>"
    }
  ]
}

If no issues found, return empty findings array and score 100.

Code to review:
\`\`\`${language}
${code}
\`\`\``;
}

// ─── Parse AI response ─────────────────────────────────────
function parseReviewResponse(text: string, defaultScore: number): AIReviewResult | null {
  try {
    // Try direct JSON parse
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}') + 1;
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const json = JSON.parse(text.substring(jsonStart, jsonEnd));
      return {
        filePath: json.filePath || '',
        score: typeof json.score === 'number' ? Math.max(0, Math.min(100, json.score)) : defaultScore,
        summary: json.summary || '',
        findings: (json.findings || []).map((f: any, i: number) => ({
          id: `finding-${Date.now()}-${i}`,
          category: f.category || 'style',
          severity: f.severity || 'info',
          line: Math.max(1, Number(f.line) || 1),
          endLine: Math.max(Number(f.line) || 1, Number(f.endLine) || Number(f.line) || 1),
          title: f.title || 'Issue',
          description: f.description || '',
          suggestion: f.suggestion || undefined,
          codeSnippet: f.codeSnippet || '',
        })),
        reviewedAt: Date.now(),
      };
    }
  } catch {
    // If JSON parse fails, treat as text-only review
  }

  return {
    filePath: '',
    score: defaultScore,
    summary: text.substring(0, 300),
    findings: [],
    reviewedAt: Date.now(),
  };
}

// ─── Main review function ──────────────────────────────────
export async function runAIReview(
  filePath?: string,
  selectedCode?: string,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<AIReviewResult | null> {
  const editorStore = useEditorStore.getState();
  const targetFile = filePath || editorStore.activeFile;

  // Get code to review
  let code: string;
  let language = 'text';

  if (selectedCode) {
    code = selectedCode;
    language = 'text';
  } else if (targetFile) {
    code = getEditorContent();
    if (!code) {
      onProgress?.('无法获取文件内容');
      return null;
    }
    // Detect language from file extension
    if (targetFile.endsWith('.ts')) language = 'typescript';
    else if (targetFile.endsWith('.tsx')) language = 'tsx';
    else if (targetFile.endsWith('.js')) language = 'javascript';
    else if (targetFile.endsWith('.jsx')) language = 'jsx';
    else if (targetFile.endsWith('.py')) language = 'python';
    else if (targetFile.endsWith('.html')) language = 'html';
    else if (targetFile.endsWith('.css')) language = 'css';
    else if (targetFile.endsWith('.json')) language = 'json';
    else if (targetFile.endsWith('.md')) language = 'markdown';
  } else {
    onProgress?.('没有打开的文件');
    return null;
  }

  // Truncate very large files
  const MAX_CODE_LENGTH = 15000;
  if (code.length > MAX_CODE_LENGTH) {
    code = code.substring(0, MAX_CODE_LENGTH)
      + `\n\n// ... (truncated ${code.length - MAX_CODE_LENGTH} chars from ${targetFile})`;
  }

  onProgress?.('正在分析代码...');

  const messages = [
    { role: 'system' as const, content: 'You are an expert code reviewer. Always respond with valid JSON.' },
    { role: 'user' as const, content: buildReviewPrompt(code, language) },
  ];

  try {
    const response = await callAI(messages, {
      stream: false,
      temperature: 0.3,
      max_tokens: 4096,
      signal: signal || createAISignal(),
    });

    onProgress?.('正在处理审查结果...');

    const result = parseReviewResponse(response, 75);
    result.filePath = targetFile || '';

    // Sort findings: errors first, then warnings, then info
    result.findings.sort((a, b) => {
      const sevOrder = { error: 0, warning: 1, info: 2 };
      return (sevOrder[a.severity] - sevOrder[b.severity]) || a.line - b.line;
    });

    onProgress?.(`审查完成：${result.findings.length} 个问题，评分 ${result.score}/100`);
    return result;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      onProgress?.('审查已取消');
      return null;
    }
    onProgress?.(`审查失败: ${err.message}`);
    return null;
  }
}

// ─── UI: Review panel ──────────────────────────────────────
export function renderReviewPanel(result: AIReviewResult): string {
  const { score, summary, findings, filePath } = result;

  const scoreColor = score >= 80 ? '#4caf50' : score >= 60 ? '#ff9800' : '#f44336';
  const scoreLabel = score >= 90 ? '优秀' : score >= 80 ? '良好' : score >= 60 ? '一般' : '需改进';

  const categoryLabels: Record<string, string> = {
    'bug': '🐛 Bug',
    'security': '🔒 安全',
    'performance': '⚡ 性能',
    'style': '🎨 风格',
    'best-practice': '✅ 最佳实践',
    'type-safety': '🔷 类型',
  };

  const severityLabels: Record<string, string> = {
    'error': '🔴 错误',
    'warning': '🟡 警告',
    'info': '🔵 建议',
  };

  const findingsHtml = findings.length > 0
    ? findings.map((f) => `
      <div class="review-finding review-finding--${f.severity}" data-line="${f.line}">
        <div class="review-finding__header">
          <span class="review-finding__severity">${severityLabels[f.severity]}</span>
          <span class="review-finding__category">${categoryLabels[f.category] || f.category}</span>
          <span class="review-finding__line">行 ${f.line}${f.endLine > f.line ? `-${f.endLine}` : ''}</span>
        </div>
        <div class="review-finding__title">${escapeHtml(f.title)}</div>
        <div class="review-finding__desc">${escapeHtml(f.description)}</div>
        ${f.suggestion ? `<div class="review-finding__suggestion"><code>${escapeHtml(f.suggestion)}</code></div>` : ''}
        ${f.codeSnippet ? `<pre class="review-finding__code"><code>${escapeHtml(f.codeSnippet.substring(0, 200))}</code></pre>` : ''}
      </div>
    `).join('')
    : '<div class="review-empty">🎉 未发现代码问题！</div>';

  return `
    <div class="ai-review-panel">
      <div class="review-summary">
        <div class="review-score" style="color: ${scoreColor}">
          <span class="review-score__value">${score}</span>
          <span class="review-score__label">${scoreLabel}</span>
        </div>
        <div class="review-summary__text">${escapeHtml(summary)}</div>
      </div>
      <div class="review-actions">
        <button class="review-btn review-btn--apply-all" onclick="applyAllSuggestions()">🛠 全部修复</button>
        <button class="review-btn review-btn--copy" onclick="copyReviewResult()">📋 复制结果</button>
      </div>
      <div class="review-findings-list">
        ${findingsHtml}
      </div>
    </div>
  `;
}

// ─── Create review panel DOM ───────────────────────────────
export function createReviewPanel(result: AIReviewResult): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'ai-review-container';
  panel.innerHTML = renderReviewPanel(result);

  // Add click handlers for line navigation
  panel.querySelectorAll('.review-finding').forEach((el) => {
    el.addEventListener('click', () => {
      const line = parseInt((el as HTMLElement).dataset.line || '1', 10);
      const editorStore = useEditorStore.getState();
      if (editorStore.activeEditor) {
        editorStore.activeEditor.revealLineInCenter(line);
        editorStore.activeEditor.setPosition({ lineNumber: line, column: 1 });
        editorStore.activeEditor.focus();
      }
    });
  });

  return panel;
}

// ─── Apply single suggestion ──────────────────────────────
export function applySuggestion(finding: AIReviewFinding): void {
  if (!finding.suggestion) return;

  const editorStore = useEditorStore.getState();
  const editor = editorStore.activeEditor;
  if (!editor) return;

  const model = editor.getModel();
  if (!model) return;

  // Replace the lines with suggestion
  const range = {
    startLineNumber: finding.line,
    startColumn: 1,
    endLineNumber: finding.endLine,
    endColumn: model.getLineMaxColumn(finding.endLine),
  };

  editor.executeEdits('ai-review', [{
    range,
    text: finding.suggestion,
  }]);
}

// ─── Helpers ───────────────────────────────────────────────
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Review history ───────────────────────────────────────
const REVIEW_HISTORY_KEY = 'ai-review-history';
const MAX_HISTORY = 20;

export interface ReviewHistoryEntry {
  filePath: string;
  score: number;
  findingCount: number;
  reviewedAt: number;
}

export function saveReviewToHistory(result: AIReviewResult): void {
  try {
    const history: ReviewHistoryEntry[] = JSON.parse(
      localStorage.getItem(REVIEW_HISTORY_KEY) || '[]'
    );
    history.unshift({
      filePath: result.filePath,
      score: result.score,
      findingCount: result.findings.length,
      reviewedAt: result.reviewedAt,
    });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(history));
  } catch { /* ignore */ }
}

export function getReviewHistory(): ReviewHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

// ─── Quick review (background) ─────────────────────────────
let _reviewAbort: AbortController | null = null;

export async function quickReviewOnSave(filePath: string, content: string): Promise<void> {
  // Cancel previous quick review
  if (_reviewAbort) {
    _reviewAbort.abort();
  }
  _reviewAbort = new AbortController();

  // Only quick-review smaller files
  if (content.length > 8000) return;

  try {
    const language = filePath.endsWith('.ts') ? 'typescript'
      : filePath.endsWith('.py') ? 'python'
      : filePath.endsWith('.js') ? 'javascript'
      : 'text';

    const result = await runAIReview(filePath, content, undefined, _reviewAbort.signal);
    if (result && result.findings.filter((f) => f.severity === 'error').length > 0) {
      // Show notification for errors found
      const errCount = result.findings.filter((f) => f.severity === 'error').length;
      const eventBus = window.__eventBus;
      if (eventBus) {
        eventBus.emit('notification', {
          type: 'warning',
          message: `AI 审查: ${errCount} 个潜在错误在 ${pathBasename(filePath)}`,
          action: { label: '查看', handler: () => eventBus.emit('showReviewPanel', result) },
        });
      }
    }
  } catch { /* background failures are silent */ }
}

function pathBasename(p: string): string {
  return p.split('/').pop() || p.split('\\').pop() || p;
}
