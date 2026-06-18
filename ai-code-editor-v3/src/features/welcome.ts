// ============================================================
// Welcome Page — 新手引导 + 快速开始
// ============================================================
import { useEditorStore, useFilesStore } from '../core/stores';
import { openFileTab } from '../core/editor';
import { getLanguageFromPath, saveFile } from '../core/files';

// ─── Template definitions ──────────────────────────────────
interface WelcomeTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  files: { path: string; content: string }[];
}

const TEMPLATES: WelcomeTemplate[] = [
  {
    id: 'html-css-js',
    name: 'HTML/CSS/JS',
    icon: '🌐',
    description: '经典前端三件套项目',
    files: [
      { path: 'index.html', content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的项目</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Hello World!</h1>
  <script src="script.js"></script>
</body>
</html>` },
      { path: 'style.css', content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #1a1a2e;
  color: #e0e0e0;
}

h1 {
  font-size: 2.5rem;
  background: linear-gradient(135deg, #6366f1, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}` },
      { path: 'script.js', content: `console.log('Hello from AI Code Editor!');

// 你的 JavaScript 代码从这里开始
document.querySelector('h1').addEventListener('click', () => {
  alert('欢迎使用 AI Code Editor!');
});` },
    ],
  },
  {
    id: 'typescript-lib',
    name: 'TypeScript 库',
    icon: '📦',
    description: '创建一个 TypeScript 库项目',
    files: [
      { path: 'src/index.ts', content: `/**
 * 我的 TypeScript 库
 */

export function greet(name: string): string {
  return \`Hello, \${name}! Welcome to AI Code Editor.\`;
}

export function add(a: number, b: number): number {
  return a + b;
}

// 使用示例
const message = greet('开发者');
console.log(message);
console.log('1 + 2 =', add(1, 2));` },
      { path: 'tsconfig.json', content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src"]
}` },
      { path: 'README.md', content: `# 我的 TypeScript 库

一个用于演示的 TypeScript 库项目。

## 使用

\`\`\`typescript
import { greet } from 'my-lib';
console.log(greet('World'));
\`\`\`
` },
    ],
  },
  {
    id: 'react-app',
    name: 'React 应用',
    icon: '⚛️',
    description: 'React 组件开发模板',
    files: [
      { path: 'App.tsx', content: `import React, { useState } from 'react';

interface AppProps {
  title?: string;
}

const App: React.FC<AppProps> = ({ title = 'AI Code Editor' }) => {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: 2 + 'rem', textAlign: 'center' }}>
      <h1>{title}</h1>
      <p>React + TypeScript 项目模板</p>
      <button
        onClick={() => setCount(c => c + 1)}
        style={{
          padding: '0.5rem 1.5rem',
          fontSize: '1rem',
          background: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
      >
        点击计数: {count}
      </button>
    </div>
  );
};

export default App;` },
      { path: 'index.tsx', content: `import React from 'react';
import App from './App';

// React 入口
export default function Main() {
  return <App title="React + TypeScript" />;
}` },
    ],
  },
  {
    id: 'python-script',
    name: 'Python 脚本',
    icon: '🐍',
    description: 'Python 实用脚本模板',
    files: [
      { path: 'main.py', content: `#!/usr/bin/env python3
"""Python 项目模板 — AI Code Editor"""

import json
import sys
from pathlib import Path
from typing import Any


def read_json(filepath: str) -> dict[str, Any]:
    """读取 JSON 文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_json(filepath: str, data: dict[str, Any]) -> None:
    """写入 JSON 文件"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def main() -> None:
    ""i18n.t('welcome.主函数')""
    print("🐍 Hello from Python — AI Code Editor")
    print(f"Python {sys.version}")

    # 示例数据
    sample = {"name": "AI Code Editor", "version": "4.0", "language": "Python"}
    print(f"\\n示例数据: {json.dumps(sample, indent=2)}")


if __name__ == "__main__":
    main()` },
    ],
  },
];

// ─── Recent files tracking ────────────────────────────────
const RECENT_FILES_KEY = 'ai-code-editor-recent-files';
const MAX_RECENT = 10;

export function addRecentFile(path: string): void {
  const stored = localStorage.getItem(RECENT_FILES_KEY);
  const recent: string[] = stored ? JSON.parse(stored) : [];
  const filtered = recent.filter((f) => f !== path);
  filtered.unshift(path);
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
}

export function getRecentFiles(): string[] {
  const stored = localStorage.getItem(RECENT_FILES_KEY);
  return stored ? JSON.parse(stored) : [];
}

// ─── Welcome page rendering ───────────────────────────────
export function renderWelcomePage(): void {
  const container = document.getElementById('editorContainer');
  if (!container) return;

  const existing = document.getElementById('welcomePage');
  if (existing) existing.remove();

  // Hide empty state
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.style.display = 'none';

  const welcomeEl = document.createElement('div');
  welcomeEl.id = 'welcomePage';
  welcomeEl.className = 'welcome-page';

  const recentFiles = getRecentFiles();
  const filesStore = useFilesStore.getState();
  const availableRecent = recentFiles.filter((f) => filesStore.files.has(f));

  welcomeEl.innerHTML = `
    <div class="welcome-container">
      <!-- Hero Section -->
      <div class="welcome-hero">
        <div class="welcome-logo">
          <svg viewBox="0 0 80 80" fill="none">
            <rect width="80" height="80" rx="18" fill="#6366f1" opacity="0.8"/>
            <text x="40" y="55" text-anchor="middle" fill="white" font-size="40" font-family="monospace" font-weight="bold">&lt;/&gt;</text>
          </svg>
        </div>
        <h1>AI Code Editor v4.0</h1>
        <p class="welcome-subtitle">智能编程助手 — 让开发更高效</p>
        <div class="welcome-actions">
          <button class="welcome-btn primary" id="welcomeNewFile">📄 新建文件</button>
          <button class="welcome-btn secondary" id="welcomeOpenFolder">📁 打开文件夹</button>
          <button class="welcome-btn secondary" id="welcomeQuickStart">🚀 快速开始</button>
        </div>
      </div>

      <!-- Getting Started -->
      <div class="welcome-section" id="welcomeGettingStarted" style="display:none;">
        <h3>🚀 快速开始指南</h3>
        <div class="getting-started-steps">
          <div class="gs-step">
            <div class="gs-step-num">1</div>
            <div class="gs-step-content">
              <strong>配置 AI 模型</strong>
              <p>点击左下角 ⚙ 设置，填入 API 端点和 API Key，支持 OpenAI 兼容接口</p>
            </div>
          </div>
          <div class="gs-step">
            <div class="gs-step-num">2</div>
            <div class="gs-step-content">
              <strong>创建/打开文件</strong>
              <p>使用 <kbd>Ctrl+N</kbd> 新建文件，或点击左侧资源管理器浏览项目文件</p>
            </div>
          </div>
          <div class="gs-step">
            <div class="gs-step-num">3</div>
            <div class="gs-step-content">
              <strong>使用 AI 助手</strong>
              <p>按 <kbd>Ctrl+\`</kbd> 打开 AI 面板，选中代码后提问，AI 帮你分析/重构/生成代码</p>
            </div>
          </div>
          <div class="gs-step">
            <div class="gs-step-num">4</div>
            <div class="gs-step-content">
              <strong>试试 Agent 模式</strong>
              <p>输入 <code>/agent 帮我完成...</code> 启动 Agent，AI 可以读写文件、执行搜索</p>
            </div>
          </div>
        </div>
        <button class="welcome-back-btn" id="welcomeBackFromGS">← 返回</button>
      </div>

      <!-- Main Content Grid -->
      <div class="welcome-grid">
        <!-- Start Section -->
        <div class="welcome-card">
          <h3>🎯 快速开始</h3>
          <div class="start-options">
            <div class="start-option" data-action="new-file">
              <span class="start-icon">📄</span>
              <div>
                <strong>新建文件</strong>
                <p>Ctrl+N 创建新代码文件</p>
              </div>
            </div>
            <div class="start-option" data-action="command-palette">
              <span class="start-icon">⌨</span>
              <div>
                <strong>命令面板</strong>
                <p>Ctrl+P 搜索所有命令</p>
              </div>
            </div>
            <div class="start-option" data-action="ai-chat">
              <span class="start-icon">🤖</span>
              <div>
                <strong>AI 对话</strong>
                <p>Ctrl+\` 启动 AI 助手</p>
              </div>
            </div>
            <div class="start-option" data-action="settings">
              <span class="start-icon">⚙</span>
              <div>
                <strong>配置 AI</strong>
                <p>Ctrl+, 打开设置面板</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Templates Section -->
        <div class="welcome-card">
          <h3>📋 项目模板</h3>
          <div class="template-list">
            ${TEMPLATES.map(
              (t) => `
              <div class="template-item" data-template="${t.id}">
                <span class="template-icon">${t.icon}</span>
                <div class="template-info">
                  <strong>${t.name}</strong>
                  <p>${t.description}</p>
                </div>
                <span class="template-arrow">→</span>
              </div>`
            ).join('')}
          </div>
        </div>

        <!-- Recent Files -->
        <div class="welcome-card">
          <h3>🕐 最近文件</h3>
          ${availableRecent.length > 0 ? `
            <div class="recent-list">
              ${availableRecent.slice(0, 5).map(
                (f) => `
                <div class="recent-item" data-path="${escapeHtml(f)}">
                  <span class="recent-icon">📄</span>
                  <span class="recent-name">${escapeHtml(f)}</span>
                </div>`
              ).join('')}
            </div>
          ` : `
            <div class="welcome-empty">
              <p>还没有打开过文件</p>
              <p style="font-size:12px;color:var(--text-muted)">创建新文件或打开项目开始</p>
            </div>
          `}
        </div>

        <!-- Keyboard Shortcuts -->
        <div class="welcome-card">
          <h3>⌨ 常用快捷键</h3>
          <div class="shortcut-list">
            <div class="shortcut-row"><kbd>Ctrl+N</kbd><span>新建文件</span></div>
            <div class="shortcut-row"><kbd>Ctrl+S</kbd><span>保存</span></div>
            <div class="shortcut-row"><kbd>Ctrl+P</kbd><span>命令面板</span></div>
            <div class="shortcut-row"><kbd>Ctrl+B</kbd><span>切换侧栏</span></div>
            <div class="shortcut-row"><kbd>Ctrl+\`</kbd><span>AI 助手</span></div>
            <div class="shortcut-row"><kbd>Ctrl+Shift+F</kbd><span>全局搜索</span></div>
            <div class="shortcut-row"><kbd>Shift+Alt+F</kbd><span>格式化代码</span></div>
            <div class="shortcut-row"><kbd>F5</kbd><span>启动调试</span></div>
          </div>
        </div>
      </div>

      <!-- Tips Footer -->
      <div class="welcome-tips">
        <span class="welcome-tip active">💡 提示：选中代码后提问，AI 可以针对选中的代码进行分析</span>
        <span class="welcome-tip">💡 提示：使用 /agent 模式让 AI 帮你读写文件和执行命令</span>
        <span class="welcome-tip">💡 提示：拖拽图片到聊天框，AI 可以分析图片内容</span>
        <span class="welcome-tip">💡 提示：按 Ctrl+P 打开命令面板，搜索所有可用命令</span>
      </div>
    </div>
  `;

  container.appendChild(welcomeEl);

  // ─── Wire events ──────────────────────────────────────
  wireWelcomeEvents(welcomeEl);
}

function wireWelcomeEvents(el: HTMLElement): void {
  // New file button
  el.querySelector('#welcomeNewFile')?.addEventListener('click', () => {
    promptNewFile();
  });

  // Quick start toggle
  el.querySelector('#welcomeQuickStart')?.addEventListener('click', () => {
    const gs = el.querySelector('#welcomeGettingStarted') as HTMLElement;
    const grid = el.querySelector('.welcome-grid') as HTMLElement;
    const tips = el.querySelector('.welcome-tips') as HTMLElement;
    if (gs) gs.style.display = 'block';
    if (grid) grid.style.display = 'none';
    if (tips) tips.style.display = 'none';
  });

  // Back from getting started
  el.querySelector('#welcomeBackFromGS')?.addEventListener('click', () => {
    const gs = el.querySelector('#welcomeGettingStarted') as HTMLElement;
    const grid = el.querySelector('.welcome-grid') as HTMLElement;
    const tips = el.querySelector('.welcome-tips') as HTMLElement;
    if (gs) gs.style.display = 'none';
    if (grid) grid.style.display = 'grid';
    if (tips) tips.style.display = 'flex';
  });

  // Open folder button
  el.querySelector('#welcomeOpenFolder')?.addEventListener('click', () => {
    // Try Electron API first
    const electron = window.electronAPI;
    if (electron?.openFolder) {
      electron.openFolder();
    } else {
      // Fallback: open command palette
      document.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'p' }));
    }
  });

  // Start options
  el.querySelectorAll('.start-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const action = (opt as HTMLElement).dataset.action;
      switch (action) {
        case 'new-file':
          promptNewFile();
          break;
        case 'command-palette':
          document.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'p' }));
          break;
        case 'ai-chat':
          document.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '`' }));
          break;
        case 'settings':
          document.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: ',' }));
          break;
      }
    });
  });

  // Templates
  el.querySelectorAll('.template-item').forEach((item) => {
    item.addEventListener('click', () => {
      const templateId = (item as HTMLElement).dataset.template;
      const template = TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;

      // Ask confirmation before creating many files
      const count = template.files.length;
      if (count > 1 && !confirm(`将创建 ${count} 个文件，是否继续？`)) return;

      createTemplateFiles(template);
    });
  });

  // Recent files
  el.querySelectorAll('.recent-item').forEach((item) => {
    item.addEventListener('click', () => {
      const path = (item as HTMLElement).dataset.path;
      if (!path) return;
      const entry = useFilesStore.getState().files.get(path);
      if (entry) {
        openFileTab(path, entry.content);
        hideWelcomePage();
      }
    });
  });

  // Rotating tips
  let tipIndex = 0;
  const tips = el.querySelectorAll('.welcome-tip');
  if (tips.length > 1) {
    setInterval(() => {
      tips[tipIndex].classList.remove('active');
      tipIndex = (tipIndex + 1) % tips.length;
      tips[tipIndex].classList.add('active');
    }, 4000);
  }
}

// ─── Local new file prompt ──────────────────────────────
function promptNewFile(): void {
  const name = prompt('输入文件名 (如 my-component.tsx):');
  if (!name) return;

  const fileEntry = {
    path: name,
    content: '',
    language: getLanguageFromPath(name),
    updatedAt: Date.now(),
  };

  useFilesStore.getState().setFile(fileEntry);
  saveFile(fileEntry).then(() => {
    if (window.__refreshFileTree) window.__refreshFileTree();
    openFileTab(name, '');
    hideWelcomePage();
  });
}

// ─── Create template files ───────────────────────────────
async function createTemplateFiles(template: WelcomeTemplate): Promise<void> {
  const store = useFilesStore.getState();

  for (const file of template.files) {
    const entry = {
      path: file.path,
      content: file.content,
      language: getLanguageFromPath(file.path),
      updatedAt: Date.now(),
    };
    store.setFile(entry);
    await saveFile(entry);
  }

  // Open first file
  const firstFile = template.files[0];
  openFileTab(firstFile.path, firstFile.content);

  // Refresh tree
  if (window.__refreshFileTree) {
    window.__refreshFileTree();
  }

  // Show notification via event bus
  const { bus } = await import('../core/event-bus');
  bus.emit('toast:show', {
    message: `模板 "${template.name}" 创建成功，共 ${template.files.length} 个文件`,
    type: 'success',
    duration: 3000,
  });

  hideWelcomePage();
}

// ─── Show/hide helpers ───────────────────────────────────
export function showWelcomePage(): void {
  renderWelcomePage();
}

export function hideWelcomePage(): void {
  const welcome = document.getElementById('welcomePage');
  if (welcome) welcome.remove();

  const emptyState = document.getElementById('emptyState');
  if (emptyState) {
    const tabs = useEditorStore.getState().openTabs;
    emptyState.style.display = tabs.length === 0 ? 'flex' : 'none';
  }
}

// ─── Check if welcome should be shown ────────────────────
export function shouldShowWelcome(): boolean {
  const store = useEditorStore.getState();
  return store.openTabs.length === 0;
}

// ─── Utility ─────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
