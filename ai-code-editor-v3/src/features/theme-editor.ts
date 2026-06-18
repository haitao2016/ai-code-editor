// ============================================================
// 主题编辑器 — 颜色选择器 + 实时预览
// ============================================================
import { getEditor, getMonaco } from '../core/editor';

interface ThemeColors {
  background: string;
  foreground: string;
  lineHighlight: string;
  selection: string;
  cursor: string;
  lineNumber: string;
  lineNumberActive: string;
  comment: string;
  string: string;
  number: string;
  keyword: string;
  function: string;
  type: string;
  variable: string;
}

const defaultColors: ThemeColors = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  lineHighlight: '#31324430',
  selection: '#45475a60',
  cursor: '#6366f1',
  lineNumber: '#6c708660',
  lineNumberActive: '#a6adc8',
  comment: '#6c7086',
  string: '#a6e3a1',
  number: '#fab387',
  keyword: '#cba6f7',
  function: '#89b4fa',
  type: '#f9e2af',
  variable: '#cdd6f4',
};

let themeEditorPanel: HTMLDivElement | null = null;

export function showThemeEditor(): void {
  if (themeEditorPanel) {
    themeEditorPanel.classList.toggle('collapsed');
    return;
  }

  themeEditorPanel = document.createElement('div');
  themeEditorPanel.id = 'themeEditorPanel';
  themeEditorPanel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    width:700px;max-height:80vh;background:var(--bg-primary);
    border:1px solid var(--border-color);border-radius:8px;
    z-index:1002;display:flex;flex-direction:column;
    box-shadow:0 8px 30px rgba(0,0,0,0.5);
  `;

  const html = buildThemeEditorHTML();
  themeEditorPanel.innerHTML = html;
  document.body.appendChild(themeEditorPanel);

  // Wire color pickers
  wireColorPickers();

  // Apply button
  document.getElementById('btnApplyTheme')?.addEventListener('click', applyTheme);
  document.getElementById('btnResetTheme')?.addEventListener('click', resetTheme);
  document.getElementById('btnSaveTheme')?.addEventListener('click', saveTheme);
  document.getElementById('btnCloseThemeEditor')?.addEventListener('click', () => {
    themeEditorPanel?.remove();
    themeEditorPanel = null;
  });
}

function buildThemeEditorHTML(): string {
  const sections: { title: string; keys: (keyof ThemeColors)[] }[] = [
    { title: '编辑器', keys: ['background', 'foreground', 'lineHighlight', 'selection', 'cursor'] },
    { title: '行号', keys: ['lineNumber', 'lineNumberActive'] },
    { title: '语法高亮', keys: ['comment', 'string', 'number', 'keyword', 'function', 'type', 'variable'] },
  ];

  let html = `
    <div style="padding:10px 14px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:14px;font-weight:600;color:var(--text-primary)">🎨 主题编辑器</span>
      <div style="display:flex;gap:6px">
        <button id="btnResetTheme" style="background:var(--bg-hover);border:1px solid var(--border-color);color:var(--text-secondary);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px">重置</button>
        <button id="btnSaveTheme" style="background:var(--success);color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px">保存主题</button>
        <button id="btnCloseThemeEditor" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px;padding:0 4px">✕</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:10px 14px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <!-- Color pickers -->
      <div style="display:flex;flex-direction:column;gap:6px">
        ${sections.map((s) => `
          <div style="margin-bottom:4px">
            <div style="font-size:11px;font-weight:600;color:var(--info);margin-bottom:6px;text-transform:uppercase">${s.title}</div>
            ${s.keys.map((k) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:11px">
                <label style="color:var(--text-secondary);text-transform:capitalize">${k.replace(/([A-Z])/g, ' $1')}</label>
                <div style="display:flex;align-items:center;gap:6px">
                  <input type="color" id="theme-${k}" value="${defaultColors[k]}" style="width:28px;height:20px;border:1px solid var(--border-color);border-radius:3px;cursor:pointer;padding:0">
                  <input type="text" id="theme-${k}-hex" value="${defaultColors[k]}" style="width:70px;background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);padding:2px 4px;border-radius:3px;font-size:10px;font-family:monospace">
                </div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
      <!-- Preview -->
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--info);margin-bottom:6px;text-transform:uppercase">实时预览</div>
        <div id="themePreview" style="padding:12px;border-radius:6px;border:1px solid var(--border-color);min-height:300px;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6">
<pre style="margin:0"><span id="tp-comment">// Preview file.ts</span>
<span id="tp-keyword">import</span> { <span id="tp-type">Component</span> } <span id="tp-keyword">from</span> <span id="tp-string">'@angular/core'</span>;

<span id="tp-keyword">const</span> <span id="tp-variable">message</span>: <span id="tp-type">string</span> = <span id="tp-string">'Hello World'</span>;
<span id="tp-keyword">const</span> <span id="tp-variable">count</span>: <span id="tp-type">number</span> = <span id="tp-number">42</span>;

<span id="tp-keyword">function</span> <span id="tp-function">greet</span>(<span id="tp-variable">name</span>: <span id="tp-type">string</span>): <span id="tp-type">void</span> {
  <span id="tp-variable">console</span>.<span id="tp-function">log</span>(<span id="tp-string">\`Hello, \${name}!\`</span>);
}</pre>
        </div>
      </div>
    </div>
    <div style="padding:8px 14px;border-top:1px solid var(--border-color)">
      <button id="btnApplyTheme" style="background:var(--info);color:white;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:12px;width:100%">应用主题</button>
    </div>
  `;

  return html;
}

function wireColorPickers(): void {
  const colorKeys = Object.keys(defaultColors) as (keyof ThemeColors)[];

  for (const key of colorKeys) {
    const colorPicker = document.getElementById(`theme-${key}`) as HTMLInputElement;
    const hexInput = document.getElementById(`theme-${key}-hex`) as HTMLInputElement;

    if (!colorPicker || !hexInput) continue;

    colorPicker.addEventListener('input', () => {
      hexInput.value = colorPicker.value;
      updatePreviewColor(key, colorPicker.value);
    });

    hexInput.addEventListener('input', () => {
      const val = hexInput.value;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        colorPicker.value = val;
        updatePreviewColor(key, val);
      }
    });
  }
}

function updatePreviewColor(key: keyof ThemeColors, color: string): void {
  const mapping: Record<string, string> = {
    background: 'themePreview',
    foreground: 'themePreview',
    comment: 'tp-comment',
    string: 'tp-string',
    number: 'tp-number',
    keyword: 'tp-keyword',
    function: 'tp-function',
    type: 'tp-type',
    variable: 'tp-variable',
  };

  if (mapping[key] && key === 'background') {
    const preview = document.getElementById('themePreview');
    if (preview) preview.style.background = color;
  } else if (mapping[key]) {
    const el = document.getElementById(mapping[key]);
    if (el) el.style.color = color;
  }
}

function getCurrentThemeColors(): ThemeColors {
  const keys = Object.keys(defaultColors) as (keyof ThemeColors)[];
  const colors: Partial<ThemeColors> = {};

  for (const key of keys) {
    const input = document.getElementById(`theme-${key}`) as HTMLInputElement;
    if (input) colors[key] = input.value;
  }

  return colors as ThemeColors;
}

function applyTheme(): void {
  const monaco = getMonaco();
  const colors = getCurrentThemeColors();

  if (monaco) {
    monaco.editor.defineTheme('custom-theme', {
      base: 'vs-dark',
      inherit: false,
      rules: [
        { token: 'comment', foreground: colors.comment, fontStyle: 'italic' },
        { token: 'string', foreground: colors.string },
        { token: 'number', foreground: colors.number },
        { token: 'keyword', foreground: colors.keyword },
        { token: 'type', foreground: colors.type },
        { token: 'function', foreground: colors.function },
        { token: 'variable', foreground: colors.variable },
      ],
      colors: {
        'editor.background': colors.background,
        'editor.foreground': colors.foreground,
        'editor.lineHighlightBackground': colors.lineHighlight,
        'editor.selectionBackground': colors.selection,
        'editorCursor.foreground': colors.cursor,
        'editorLineNumber.foreground': colors.lineNumber,
        'editorLineNumber.activeForeground': colors.lineNumberActive,
      },
    });

    const editor = getEditor();
    if (editor) {
      monaco.editor.setTheme('custom-theme');
    }
  }

  // Save to localStorage
  // localStorage.setItem('custom-theme', JSON.stringify(colors));
}

function resetTheme(): void {
  const keys = Object.keys(defaultColors) as (keyof ThemeColors)[];
  for (const key of keys) {
    const colorPicker = document.getElementById(`theme-${key}`) as HTMLInputElement;
    const hexInput = document.getElementById(`theme-${key}-hex`) as HTMLInputElement;
    if (colorPicker) colorPicker.value = defaultColors[key];
    if (hexInput) hexInput.value = defaultColors[key];
    updatePreviewColor(key, defaultColors[key]);
  }
}

function saveTheme(): void {
  const colors = getCurrentThemeColors();
  const name = prompt('主题名称:', 'my-custom-theme');
  if (!name) return;

  localStorage.setItem(`theme-${name}`, JSON.stringify(colors));
  alert(`主题 "${name}" 已保存！`);
}

// ─── Keyboard Shortcut Editor ──────────────────────────────
export function showShortcutEditor(): void {
  const existing = document.getElementById('shortcutEditor');
  if (existing) {
    existing.remove();
    return;
  }

  const shortcuts: { key: string; name: string }[] = [
    { key: 'Ctrl+P', name: '命令面板' },
    { key: 'Ctrl+N', name: '新建文件' },
    { key: 'Ctrl+S', name: '保存文件' },
    { key: 'Ctrl+B', name: '切换侧栏' },
    { key: 'Ctrl+`', name: 'AI 助手' },
    { key: 'Ctrl+,', name: '设置' },
    { key: 'Ctrl+Shift+F', name: '全局搜索' },
    { key: 'Ctrl+Shift+O', name: '符号大纲' },
    { key: 'Ctrl+Shift+D', name: '差异对比' },
  ];

  const panel = document.createElement('div');
  panel.id = 'shortcutEditor';
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    width:500px;max-height:60vh;background:var(--bg-primary);
    border:1px solid var(--border-color);border-radius:8px;
    z-index:1003;display:flex;flex-direction:column;
    box-shadow:0 8px 30px rgba(0,0,0,0.5);
  `;

  panel.innerHTML = `
    <div style="padding:10px 14px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:14px;font-weight:600;color:var(--text-primary)">⌨ 快捷键</span>
      <button id="btnCloseShortcuts" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px;padding:0 4px">✕</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:8px 14px">
      ${shortcuts.map((s) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color)">
          <span style="font-size:12px;color:var(--text-primary)">${s.name}</span>
          <kbd style="background:var(--bg-secondary);border:1px solid var(--border-color);padding:2px 8px;border-radius:4px;font-size:11px;color:var(--info);font-family:monospace;cursor:pointer" 
            ondblclick="this.contentEditable='true';this.focus();this.style.background='var(--bg-primary)'" 
            onblur="this.contentEditable='false';this.style.background='var(--bg-secondary)'"
            onkeydown="if(event.key==='Enter'){this.blur();event.preventDefault()}">${s.key}</kbd>
        </div>
      `).join('')}
    </div>
    <div style="padding:8px 14px;border-top:1px solid var(--border-color);font-size:10px;color:var(--text-muted);text-align:center">
      双击快捷键可编辑 | 暂存于本地存储
    </div>
  `;

  document.body.appendChild(panel);

  document.getElementById('btnCloseShortcuts')?.addEventListener('click', () => panel.remove());

  // Escape to close
  document.addEventListener('keydown', function escClose(e) {
    if (e.key === 'Escape') {
      panel.remove();
      document.removeEventListener('keydown', escClose);
    }
  });
}
