// ============================================================
// 全局搜索与替换面板
// ============================================================
import { useFilesStore, useEditorStore } from '../core/stores';
import { openFileTab, getEditor } from '../core/editor';
import { getLanguageFromPath, saveFile, loadAllFiles } from '../core/files';

interface SearchMatch {
  file: string;
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  replaceText: string;
  includePattern: string;
  excludePattern: string;
}

let currentOptions: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
  replaceText: '',
  includePattern: '',
  excludePattern: '',
};

export function showSearchPanel(): void {
  const existing = document.getElementById('searchPanel');
  if (existing) {
    existing.classList.toggle('collapsed');
    if (!existing.classList.contains('collapsed')) {
      document.getElementById('searchInput')?.focus();
    }
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'searchPanel';
  panel.style.cssText = `
    position:fixed;top:60px;right:20px;width:500px;max-height:70vh;
    background:var(--bg-primary);border:1px solid var(--border-color);
    border-radius:8px;z-index:1000;display:flex;flex-direction:column;
    box-shadow:0 4px 20px rgba(0,0,0,0.3);overflow:hidden;
  `;

  panel.innerHTML = `
    <div style="padding:10px 14px;border-bottom:1px solid var(--border-color)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input id="searchInput" type="text" placeholder="搜索 (支持正则)" style="flex:1;background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);padding:6px 10px;border-radius:4px;font-size:13px;outline:none;">
        <button id="btnSearchPrev" title="上一个" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-primary);width:28px;height:28px;border-radius:4px;cursor:pointer;font-size:12px">▲</button>
        <button id="btnSearchNext" title="下一个" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-primary);width:28px;height:28px;border-radius:4px;cursor:pointer;font-size:12px">▼</button>
        <button id="btnSearchClose" title="关闭" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px">✕</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <input id="searchReplace" type="text" placeholder="替换为..." style="flex:1;min-width:100px;background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);padding:4px 8px;border-radius:4px;font-size:12px;outline:none;">
        <label style="font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;cursor:pointer">
          <input type="checkbox" id="searchCase">Aa
        </label>
        <label style="font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;cursor:pointer">
          <input type="checkbox" id="searchWord">全词
        </label>
        <label style="font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:3px;cursor:pointer">
          <input type="checkbox" id="searchRegex">.*
        </label>
        <button id="btnReplaceAll" style="background:var(--info);color:white;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px">全部替换</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 14px;font-size:11px;color:var(--text-secondary)">
      <span id="searchStats"></span>
      <input id="searchFilter" type="text" placeholder="文件过滤: *.ts, src/*" style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);padding:2px 6px;border-radius:3px;font-size:10px;width:120px;outline:none;">
    </div>
    <div id="searchResults" style="flex:1;overflow-y:auto;min-height:100px;max-height:50vh;padding:4px 0"></div>
  `;

  document.body.appendChild(panel);

  // Wire events
  const input = document.getElementById('searchInput') as HTMLInputElement;
  const replaceInput = document.getElementById('searchReplace') as HTMLInputElement;
  const resultsEl = document.getElementById('searchResults')!;
  const statsEl = document.getElementById('searchStats')!;
  const filterInput = document.getElementById('searchFilter') as HTMLInputElement;

  let debounceTimer: ReturnType<typeof setTimeout>;

  const performSearch = () => {
    currentOptions.caseSensitive = (document.getElementById('searchCase') as HTMLInputElement).checked;
    currentOptions.wholeWord = (document.getElementById('searchWord') as HTMLInputElement).checked;
    currentOptions.useRegex = (document.getElementById('searchRegex') as HTMLInputElement).checked;
    currentOptions.replaceText = replaceInput.value;
    currentOptions.includePattern = filterInput.value;

    const query = input.value;
    if (!query) {
      resultsEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px">输入搜索内容开始搜索</div>';
      statsEl.textContent = '';
      return;
    }

    const matches = performGlobalSearch(query, currentOptions);
    renderSearchResults(matches, resultsEl, statsEl);
  };

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 200);
  });

  replaceInput.addEventListener('input', () => {
    currentOptions.replaceText = replaceInput.value;
  });

  ['searchCase', 'searchWord', 'searchRegex'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (input.value) performSearch();
    });
  });

  filterInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 300);
  });

  document.getElementById('btnSearchPrev')?.addEventListener('click', () => navigateMatch(-1));
  document.getElementById('btnSearchNext')?.addEventListener('click', () => navigateMatch(1));
  document.getElementById('btnReplaceAll')?.addEventListener('click', () => replaceAllMatches());
  document.getElementById('btnSearchClose')?.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
  });

  // Escape to close
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      panel.classList.toggle('collapsed');
      document.removeEventListener('keydown', escHandler);
    }
  });

  input.focus();
}

// ─── Search logic ─────────────────────────────────────────
function performGlobalSearch(query: string, options: SearchOptions): SearchMatch[] {
  const files = useFilesStore.getState().files;
  const results: SearchMatch[] = [];

  let pattern: RegExp;
  try {
    let flags = 'g';
    if (!options.caseSensitive) flags += 'i';
    const escapedQuery = options.useRegex ? query : escapeRegex(query);
    const wordBoundary = options.wholeWord ? '\\b' : '';
    pattern = new RegExp(`${wordBoundary}${escapedQuery}${wordBoundary}`, flags);
  } catch {
    return [];
  }

  for (const [path, entry] of files.entries()) {
    // File pattern filter
    if (options.includePattern) {
      const patterns = options.includePattern.split(',').map((p) => p.trim());
      const matches = patterns.some((p) => {
        if (p.startsWith('!')) return false; // excluded in implementation if needed
        return matchGlob(path, p);
      });
      if (!matches && patterns.length > 0 && !patterns.some((p) => p === '*')) continue;
    }

    const lines = entry.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(lines[i])) !== null) {
        results.push({
          file: path,
          line: i + 1,
          content: lines[i].trim().substring(0, 150),
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
        });
        if (!options.useRegex && match.index === pattern.lastIndex) break; // prevent infinite loop
      }
    }
  }

  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchGlob(filePath: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  , 'i');
  return regex.test(filePath);
}

// ─── Render results ────────────────────────────────────────
function renderSearchResults(matches: SearchMatch[], container: HTMLElement, statsEl: HTMLElement): void {
  if (matches.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px">未找到结果</div>';
    statsEl.textContent = '0 个结果';
    return;
  }

  statsEl.textContent = `${matches.length} 个结果 (${new Set(matches.map((m) => m.file)).size} 个文件)`;

  // Group by file
  const grouped = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    if (!grouped.has(match.file)) grouped.set(match.file, []);
    grouped.get(match.file)!.push(match);
  }

  let html = '';
  for (const [file, fileMatches] of grouped.entries()) {
    html += `<div style="padding:6px 14px;background:var(--bg-secondary);font-size:12px;font-weight:500;color:var(--text-primary);cursor:pointer" onclick="window._openFile?.('${file}')">
      📄 ${file} <span style="color:var(--text-secondary);font-weight:400">(${fileMatches.length})</span>
    </div>`;
    for (const match of fileMatches) {
      const highlighted = highlightMatch(match.content, match.matchStart, match.matchEnd);
      html += `<div class="search-result-item" style="padding:2px 14px 2px 28px;font-size:11px;color:var(--text-secondary);cursor:pointer;font-family:monospace" 
        data-file="${match.file}" data-line="${match.line}">
        <span style="color:var(--text-muted);margin-right:8px">${match.line}</span>
        ${highlighted}
      </div>`;
    }
  }

  container.innerHTML = html;

  // Click handler: jump to file and line
  container.querySelectorAll('.search-result-item').forEach((item) => {
    item.addEventListener('click', () => {
      const file = (item as HTMLElement).dataset.file!;
      const line = parseInt((item as HTMLElement).dataset.line!);
      const entry = useFilesStore.getState().files.get(file);
      if (entry) {
        openFileTab(file, entry.content);
        // Jump to line
        setTimeout(() => {
          const editor = getEditor();
          if (editor) {
            editor.revealLineInCenter(line);
            editor.setPosition({ lineNumber: line, column: 1 });
          }
        }, 100);
      }
    });
  });
}

function highlightMatch(content: string, start: number, end: number): string {
  if (start >= content.length) return escapeHtml(content);
  const before = escapeHtml(content.substring(0, start));
  const match = escapeHtml(content.substring(start, Math.min(end, content.length)));
  const after = escapeHtml(content.substring(Math.min(end, content.length)));
  return `${before}<mark style="background:var(--info);color:white;padding:0 1px;border-radius:1px">${match}</mark>${after}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Match navigation ──────────────────────────────────────
let currentMatchIndex = -1;

function navigateMatch(direction: number): void {
  const items = document.querySelectorAll('.search-result-item');
  if (items.length === 0) return;

  currentMatchIndex += direction;
  if (currentMatchIndex < 0) currentMatchIndex = items.length - 1;
  if (currentMatchIndex >= items.length) currentMatchIndex = 0;

  items.forEach((item) => item.classList.remove('active'));
  items[currentMatchIndex].classList.add('active');
  (items[currentMatchIndex] as HTMLElement).click();
}

// ─── Replace all ───────────────────────────────────────────
async function replaceAllMatches(): Promise<void> {
  const query = (document.getElementById('searchInput') as HTMLInputElement).value;
  if (!query) return;

  currentOptions.caseSensitive = (document.getElementById('searchCase') as HTMLInputElement).checked;
  currentOptions.wholeWord = (document.getElementById('searchWord') as HTMLInputElement).checked;
  currentOptions.useRegex = (document.getElementById('searchRegex') as HTMLInputElement).checked;
  currentOptions.includePattern = (document.getElementById('searchFilter') as HTMLInputElement).value;

  const replaceText = currentOptions.replaceText;
  if (!replaceText) {
    alert('请输入替换文本');
    return;
  }

  const matches = performGlobalSearch(query, currentOptions);
  if (matches.length === 0) {
    alert('没有找到匹配项');
    return;
  }

  const confirmMsg = `确定要在 ${new Set(matches.map((m) => m.file)).size} 个文件中替换 ${matches.length} 个匹配项吗？`;
  if (!confirm(confirmMsg)) return;

  let pattern: RegExp;
  try {
    let flags = 'g';
    if (!currentOptions.caseSensitive) flags += 'i';
    const escapedQuery = currentOptions.useRegex ? query : escapeRegex(query);
    const wordBoundary = currentOptions.wholeWord ? '\\b' : '';
    pattern = new RegExp(`${wordBoundary}${escapedQuery}${wordBoundary}`, flags);
  } catch {
    alert('无效的正则表达式');
    return;
  }

  const files = useFilesStore.getState().files;
  const modifiedFiles = new Map<string, string>();
  let totalReplacements = 0;

  for (const [path, entry] of files.entries()) {
    const newContent = entry.content.replace(pattern, replaceText);
    if (newContent !== entry.content) {
      const count = (entry.content.match(pattern) || []).length;
      totalReplacements += count;
      modifiedFiles.set(path, newContent);
    }
  }

  // Apply changes
  for (const [path, newContent] of modifiedFiles.entries()) {
    const lang = getLanguageFromPath(path);
    useFilesStore.getState().setFile({
      path,
      content: newContent,
      language: lang,
      updatedAt: Date.now(),
    });
    await saveFile({ path, content: newContent, language: lang, updatedAt: Date.now() });
  }

  // Refresh UI
  import('../main').then((m) => m.showToast(`已替换 ${totalReplacements} 个匹配项 (${modifiedFiles.size} 个文件)`));
  loadAllFiles(useFilesStore.getState().files);

  // Refresh search results
  const input = document.getElementById('searchInput') as HTMLInputElement;
  if (input) input.dispatchEvent(new Event('input'));

  // If active file was modified, update editor
  const activeFile = useEditorStore.getState().activeFile;
  if (activeFile && modifiedFiles.has(activeFile)) {
    const editor = getEditor();
    if (editor) editor.setValue(modifiedFiles.get(activeFile)!);
  }
}
