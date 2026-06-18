// ============================================================
// 符号大纲面板 — getDocumentSymbols + 点击跳转
// ============================================================
import { getEditor, getMonaco } from '../core/editor';
import { useEditorStore } from '../core/stores';

interface SymbolEntry {
  name: string;
  kind: string;
  icon: string;
  line: number;
  children: SymbolEntry[];
  containerName?: string;
}

const SYMBOL_KINDS: Record<string, string> = {
  'Function': 'ƒ',
  'Method': 'ƒ',
  'Class': 'C',
  'Interface': 'I',
  'Enum': 'E',
  'Variable': 'V',
  'Constant': 'C',
  'Property': 'P',
  'Field': 'F',
  'Constructor': 'c',
  'Module': 'M',
  'Namespace': 'N',
  'Struct': 'S',
  'TypeParameter': 'T',
  'FunctionDefinition': 'fn',
  'ClassDefinition': 'cls',
  'Export': '⇧',
  'Default': '★',
};

function getSymbolIcon(kind: string): string {
  return SYMBOL_KINDS[kind] || '•';
}

let outlinePanel: HTMLDivElement | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function showOutlinePanel(): void {
  if (outlinePanel) {
    outlinePanel.classList.toggle('collapsed');
    if (!outlinePanel.classList.contains('collapsed')) {
      refreshOutline();
    }
    return;
  }

  outlinePanel = document.createElement('div');
  outlinePanel.id = 'outlinePanel';
  outlinePanel.style.cssText = `
    position:fixed;top:60px;right:20px;width:280px;max-height:70vh;
    background:var(--bg-primary);border:1px solid var(--border-color);
    border-radius:8px;z-index:1000;display:flex;flex-direction:column;
    box-shadow:0 4px 20px rgba(0,0,0,0.3);overflow:hidden;
  `;

  outlinePanel.innerHTML = `
    <div style="padding:8px 12px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;font-weight:600;color:var(--text-primary)">📋 大纲</span>
      <button id="btnOutlineClose" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;padding:0 4px">✕</button>
    </div>
    <div id="outlineTree" style="flex:1;overflow-y:auto;max-height:60vh;padding:4px 0;font-family:monospace"></div>
    <div style="padding:4px 12px;font-size:10px;color:var(--text-muted);border-top:1px solid var(--border-color)">
      点击跳转 | 显示当前文件符号结构
    </div>
  `;

  document.body.appendChild(outlinePanel);

  document.getElementById('btnOutlineClose')?.addEventListener('click', () => {
    outlinePanel?.classList.toggle('collapsed');
  });

  // Auto-refresh on editor changes
  const editor = getEditor();
  if (editor) {
    editor.onDidChangeModelContent(() => {
      clearTimeout(refreshTimer!);
      refreshTimer = setTimeout(refreshOutline, 500);
    });
  }

  // Escape to close
  document.addEventListener('keydown', function outlineEsc(e) {
    if (e.key === 'Escape') {
      outlinePanel?.classList.toggle('collapsed');
      document.removeEventListener('keydown', outlineEsc);
    }
  });

  refreshOutline();
}

function refreshOutline(): void {
  const editor = getEditor();
  const monaco = getMonaco();
  if (!editor || !monaco) return;

  const model = editor.getModel();
  if (!model) return;

  try {
    const symbols = monaco.languages.getDocumentSymbols
      ? monaco.languages.getDocumentSymbols(model)
      : [];

    const entries = convertSymbols(symbols || [], model);
    renderOutlineTree(entries);
  } catch {
    renderOutlineTree([]);
  }
}

function convertSymbols(symbols: any[], model: any): SymbolEntry[] {
  const entries: SymbolEntry[] = [];

  for (const sym of symbols) {
    const kind = typeof sym.kind === 'number' 
      ? getSymbolKindName(sym.kind) 
      : 'Variable';
    
    let line = 1;
    if (sym.range) {
      line = sym.range.startLineNumber;
    } else if (sym.location?.range) {
      line = sym.location.range.startLineNumber;
    }

    const entry: SymbolEntry = {
      name: sym.name,
      kind,
      icon: getSymbolIcon(kind),
      line,
      children: sym.children 
        ? convertSymbols(sym.children, model) 
        : [],
    };

    if (sym.containerName) {
      entry.containerName = sym.containerName;
    }

    entries.push(entry);
  }

  return entries;
}

function getSymbolKindName(kind: number): string {
  const names: Record<number, string> = {
    0: 'File',
    1: 'Module',
    2: 'Namespace',
    3: 'Package',
    4: 'Class',
    5: 'Method',
    6: 'Property',
    7: 'Field',
    8: 'Constructor',
    9: 'Enum',
    10: 'Interface',
    11: 'Function',
    12: 'Variable',
    13: 'Constant',
    14: 'String',
    15: 'Number',
    16: 'Boolean',
    17: 'Array',
    18: 'Object',
    19: 'Key',
    20: 'Null',
    21: 'EnumMember',
    22: 'Struct',
    23: 'Event',
    24: 'Operator',
    25: 'TypeParameter',
  };
  return names[kind] || 'Variable';
}

function renderOutlineTree(entries: SymbolEntry[]): void {
  const container = document.getElementById('outlineTree');
  if (!container) return;

  if (entries.length === 0) {
    container.innerHTML = `
      <div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px">
        当前文件无符号信息
      </div>`;
    return;
  }

  container.innerHTML = '';

  const renderSymbols = (symbols: SymbolEntry[], depth: number, parentEl: HTMLElement): void => {
    for (const sym of symbols) {
      const item = document.createElement('div');
      item.style.cssText = `
        display:flex;align-items:center;gap:4px;
        padding:2px 8px 2px ${8 + depth * 16}px;
        font-size:11px;color:var(--text-secondary);cursor:pointer;
        border-radius:3px;margin:0 2px;
      `;
      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--bg-hover)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', () => {
        const editor = getEditor();
        if (editor && sym.line > 0) {
          editor.revealLineInCenter(sym.line);
          editor.setPosition({ lineNumber: sym.line, column: 1 });
          editor.focus();
        }
      });

      const iconSpan = document.createElement('span');
      iconSpan.textContent = sym.icon;
      iconSpan.style.cssText = 'width:16px;text-align:center;color:var(--info);font-size:10px;';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = sym.name;
      nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

      const kindSpan = document.createElement('span');
      kindSpan.textContent = sym.kind;
      kindSpan.style.cssText = 'font-size:9px;color:var(--text-muted);opacity:0.6;flex-shrink:0;';

      const lineSpan = document.createElement('span');
      lineSpan.textContent = `L${sym.line}`;
      lineSpan.style.cssText = 'font-size:9px;color:var(--text-muted);opacity:0.4;margin-left:auto;flex-shrink:0;';

      item.appendChild(iconSpan);
      item.appendChild(nameSpan);
      item.appendChild(kindSpan);
      item.appendChild(lineSpan);

      parentEl.appendChild(item);

      // Render children
      if (sym.children.length > 0) {
        renderSymbols(sym.children, depth + 1, parentEl);
      }
    }
  };

  renderSymbols(entries, 0, container);
}

// ─── Toggle from command palette ───────────────────────────
export function toggleOutlinePanel(): void {
  const existing = document.getElementById('outlinePanel');
  if (existing) {
    existing.classList.toggle('collapsed');
  } else {
    showOutlinePanel();
  }
}
