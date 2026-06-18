// ============================================================
// 代码片段系统 — Snippet 模板注册与插入
// ============================================================
import { getEditor, getMonaco } from '../core/editor';

interface Snippet {
  name: string;
  label: string;
  description: string;
  language: string;
  insertText: string;
}

const SNIPPETS: Snippet[] = [
  // ─── JavaScript / TypeScript ─────────────────────────────
  {
    name: 'clg', label: 'clg', description: 'Console log',
    language: 'javascript',
    insertText: 'console.log(${1:value});$0',
  },
  {
    name: 'cer', label: 'cer', description: 'Console error',
    language: 'javascript',
    insertText: 'console.error(${1:error});$0',
  },
  {
    name: 'afn', label: 'afn', description: 'Arrow function',
    language: 'javascript',
    insertText: '(${1:params}) => {\n\t${2:// body}\n}$0',
  },
  {
    name: 'aaf', label: 'aaf', description: 'Async arrow function',
    language: 'javascript',
    insertText: 'async (${1:params}) => {\n\t${2:// body}\n}$0',
  },
  {
    name: 'imp', label: 'imp', description: 'Import module',
    language: 'javascript',
    insertText: "import ${2:module} from '${1:package}';$0",
  },
  {
    name: 'imd', label: 'imd', description: 'Import destructured',
    language: 'javascript',
    insertText: "import { ${2:items} } from '${1:package}';$0",
  },
  {
    name: 'exp', label: 'exp', description: 'Export default',
    language: 'javascript',
    insertText: 'export default ${1:name};$0',
  },
  {
    name: 'exf', label: 'exf', description: 'Export function',
    language: 'javascript',
    insertText: 'export function ${1:name}(${2:params}) {\n\t${3:// body}\n}$0',
  },
  {
    name: 'exa', label: 'exa', description: 'Export arrow',
    language: 'javascript',
    insertText: 'export const ${1:name} = (${2:params}) => {\n\t${3:// body}\n};$0',
  },
  {
    name: 'req', label: 'req', description: 'Require module',
    language: 'javascript',
    insertText: "const ${2:module} = require('${1:package}');$0",
  },

  // ─── React ──────────────────────────────────────────────
  {
    name: 'rfc', label: 'rfc', description: 'React Functional Component (TS)',
    language: 'typescript',
    insertText: 'import React from \'react\';\n\ninterface ${1:Props} {\n\t${2:// props}\n}\n\nconst ${3:ComponentName}: React.FC<${1:Props}> = (${4:props}) => {\n\treturn (\n\t\t<div>\n\t\t\t${5:content}\n\t\t</div>\n\t);\n};\n\nexport default ${3:ComponentName};$0',
  },
  {
    name: 'use', label: 'use', description: 'useState hook',
    language: 'typescript',
    insertText: 'const [${1:state}, set${1:State/(.*)/${1:/capitalize}/}] = useState<${2:string}>(${3:initialValue});$0',
  },
  {
    name: 'useE', label: 'useE', description: 'useEffect hook',
    language: 'typescript',
    insertText: 'useEffect(() => {\n\t${1:// effect}\n\n\treturn () => {\n\t\t${2:// cleanup}\n\t};\n}, [${3:deps}]);$0',
  },

  // ─── HTML ────────────────────────────────────────────────
  {
    name: 'html5', label: 'html5', description: 'HTML5 boilerplate',
    language: 'html',
    insertText: '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${1:Document}</title>\n</head>\n<body>\n\t${2:content}\n</body>\n</html>$0',
  },
  {
    name: 'dvl', label: 'dvl', description: 'Div element',
    language: 'html',
    insertText: '<div class="${1:className}">\n\t${2:content}\n</div>$0',
  },

  // ─── CSS ─────────────────────────────────────────────────
  {
    name: 'flex', label: 'flex', description: 'Flexbox center',
    language: 'css',
    insertText: 'display: flex;\njustify-content: center;\nalign-items: center;$0',
  },
  {
    name: 'grid', label: 'grid', description: 'CSS Grid',
    language: 'css',
    insertText: 'display: grid;\ngrid-template-columns: repeat(${1:auto-fit}, minmax(${2:200px}, 1fr));\ngap: ${3:1rem};$0',
  },

  // ─── Python ──────────────────────────────────────────────
  {
    name: 'def', label: 'def', description: 'Function definition',
    language: 'python',
    insertText: 'def ${1:name}(${2:params}):\n\t"""${3:docstring}"""\n\t${4:pass}$0',
  },
  {
    name: 'cla', label: 'cla', description: 'Class definition',
    language: 'python',
    insertText: 'class ${1:ClassName}(${2:object}):\n\t"""${3:docstring}"""\n\t\n\tdef __init__(self, ${4:params}):\n\t\t${5:pass}$0',
  },

  // ─── JSON ────────────────────────────────────────────────
  {
    name: 'pkg', label: 'pkg', description: 'package.json template',
    language: 'json',
    insertText: '{\n\t"name": "${1:my-project}",\n\t"version": "1.0.0",\n\t"description": "${2:description}",\n\t"main": "index.js",\n\t"scripts": {\n\t\t"test": "echo \\"Error: no test specified\\" && exit 1"\n\t},\n\t"keywords": [],\n\t"author": "",\n\t"license": "ISC"\n}$0',
  },

  // ─── General ─────────────────────────────────────────────
  {
    name: 'todo', label: 'todo', description: 'TODO comment',
    language: 'plaintext',
    insertText: '// TODO(${1:username}): ${2:description}$0',
  },
  {
    name: 'fixme', label: 'fixme', description: 'FIXME comment',
    language: 'plaintext',
    insertText: '// FIXME: ${1:description}$0',
  },
  {
    name: 'note', label: 'note', description: 'NOTE comment',
    language: 'plaintext',
    insertText: '// NOTE: ${1:description}$0',
  },
];

// ─── Register snippets as completion items ─────────────────
export function registerSnippets(): void {
  const monaco = getMonaco();
  if (!monaco) return;

  // Group snippets by language
  const byLanguage = new Map<string, Snippet[]>();
  for (const snippet of SNIPPETS) {
    if (!byLanguage.has(snippet.language)) {
      byLanguage.set(snippet.language, []);
    }
    byLanguage.get(snippet.language)!.push(snippet);
  }

  // Register for each language
  const languages = ['javascript', 'typescript', 'typescriptreact', 'html', 'css', 'scss', 'python', 'json', 'markdown'];
  for (const lang of languages) {
    // Get snippets for this language OR plaintext snippets
    const langSnippets = byLanguage.get(lang) || [];
    const generalSnippets = byLanguage.get('plaintext') || [];
    const allSnippets = [...langSnippets, ...generalSnippets];

    if (allSnippets.length === 0) continue;

    monaco.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const completions = allSnippets.map((s) => ({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: s.description,
          detail: `Snippet: ${s.name}`,
          range,
          sortText: '0' + s.name,
        }));

        return { suggestions: completions };
      },
    });
  }
}

// ─── Snippet Manager UI ────────────────────────────────────
export function showSnippetManager(): void {
  const existing = document.getElementById('snippetManager');
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'snippetManager';
  panel.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    width:600px;max-height:70vh;background:var(--bg-primary);
    border:1px solid var(--border-color);border-radius:8px;
    z-index:1002;display:flex;flex-direction:column;
    box-shadow:0 8px 30px rgba(0,0,0,0.5);
  `;

  const grouped = new Map<string, Snippet[]>();
  for (const s of SNIPPETS) {
    if (!grouped.has(s.language)) grouped.set(s.language, []);
    grouped.get(s.language)!.push(s);
  }

  panel.innerHTML = `
    <div style="padding:10px 14px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:14px;font-weight:600;color:var(--text-primary)">📦 代码片段 (${SNIPPETS.length})</span>
      <button id="btnCloseSnippets" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px;padding:0 4px">✕</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:8px 14px">
      ${Array.from(grouped.entries()).map(([lang, snippets]) => `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:var(--info);margin-bottom:4px;text-transform:uppercase">${lang}</div>
          ${snippets.map((s) => `
            <div style="padding:4px 8px;background:var(--bg-secondary);border-radius:4px;margin-bottom:3px;font-size:11px;display:flex;align-items:center;gap:8px">
              <code style="color:var(--warning);font-weight:600;min-width:40px">${s.name}</code>
              <span style="color:var(--text-primary)">${s.label}</span>
              <span style="color:var(--text-muted);margin-left:auto;font-size:10px">${s.description}</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
    <div style="padding:6px 14px;border-top:1px solid var(--border-color);font-size:10px;color:var(--text-muted)">
      在编辑器中输入代码片段名称，按 Tab 自动补全
    </div>
  `;

  document.body.appendChild(panel);

  document.getElementById('btnCloseSnippets')?.addEventListener('click', () => panel.remove());

  // Click outside to close
  setTimeout(() => {
    document.addEventListener('click', function closeSnippet(e) {
      if (!panel.contains(e.target as Node)) {
        panel.remove();
        document.removeEventListener('click', closeSnippet);
      }
    });
  }, 100);

  document.addEventListener('keydown', function escClose(e) {
    if (e.key === 'Escape') {
      panel.remove();
      document.removeEventListener('keydown', escClose);
    }
  });
}
