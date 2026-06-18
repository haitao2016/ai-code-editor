<!-- omit in toc -->
# AI Code Editor

> Cursor 风格的 AI 编程助手 — 基于 Monaco Editor + TypeScript + Zustand + Electron

[![CI](https://github.com/haitao2016/ai-code-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/haitao2016/ai-code-editor/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![Vite](https://img.shields.io/badge/Vite-8.0-purple)
![Electron](https://img.shields.io/badge/Electron-39-9cf)
![License](https://img.shields.io/badge/license-MIT-green)

## 功能特性

### 核心编辑器
-   **Monaco Editor** — VS Code 同款编辑器引擎，语法高亮、自动补全、多光标编辑
-   **文件系统** — 基于 IndexedDB 的虚拟文件系统，Electron 下支持原生文件访问
-   **多标签编辑** — 打开多个文件，支持拖拽排序、关闭、脏文件标记
-   **命令面板** — `Ctrl+P` 快速执行所有命令
-   **符号大纲** — `Ctrl+Shift+O` 查看代码结构，点击跳转
-   **全球搜索** — `Ctrl+Shift+F` 正则/跨文件搜索与批量替换

### AI 智能
-   **AI 对话** — 多轮对话、上下文引用、流式响应
-   **Agent 模式** — `/agent` 启动自主任务执行 (readFile/writeFile/search/runCommand)
-   **Composer** — `/composer` AI 批量编辑多文件，生成 Diff 对比
-   **内联补全** — Copilot 风格代码补全 (Tab 接受, 防抖 300ms)
-   **多模型** — 支持 GPT-4o / Claude / DeepSeek / 通义千问
-   **多模态** — 图片拖拽分析 (Vision API)、语音输入

### 平台
-   **Web 版** — 浏览器运行，无需安装
-   **桌面版** — Electron 封装，原生终端、文件系统访问、系统菜单

### 扩展
-   **插件系统** — 主题/命令/侧栏/AI 四类扩展点
-   **代码片段** — 内置常用代码片段，Tab 触发展开
-   **Diff 查看器** — Split/Inline 双模式，Git 集成
-   **实时协作** — Yjs CRDT，多用户同时编辑

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/haitao2016/ai-code-editor.git
cd ai-code-editor/ai-code-editor-v3

# 安装依赖
npm install

# 开发模式（浏览器）
npm run dev

# 构建
npm run build

# 运行测试
npm run test

# Electron 桌面模式
npm run electron:dev
```

## 项目结构

```
ai-code-editor-v3/
├── src/
│   ├── core/                 # 核心模块
│   │   ├── ai.ts             # AI API 客户端（流式/同步/内联补全）
│   │   ├── agent-tools.ts    # Agent 工具系统（5 个工具）
│   │   ├── editor.ts         # Monaco 编辑器封装
│   │   ├── files.ts          # IndexedDB 文件持久化
│   │   ├── stores.ts         # Zustand 状态管理（11 个 Store）
│   │   └── plugin-manager.ts # 插件管理器
│   ├── features/             # 功能模块
│   │   ├── chat.ts           # AI 聊天面板
│   │   ├── terminal.ts       # 终端（多标签 + ANSI）
│   │   ├── git.ts            # Git 面板（isomorphic-git）
│   │   ├── search.ts         # 全局搜索与替换
│   │   ├── outline.ts        # 符号大纲面板
│   │   ├── diff-viewer.ts    # Diff 对比查看器
│   │   ├── snippets.ts       # 代码片段系统
│   │   ├── settings.ts       # 设置面板
│   │   ├── preview.ts        # 实时预览 + Linter
│   │   ├── plugins.ts        # 插件管理面板
│   │   └── collab-ui.ts      # 协作面板
│   ├── plugins/              # 内置插件
│   │   ├── index.ts          # 插件注册入口
│   │   ├── dracula.ts        # Dracula 主题
│   │   ├── solarized.ts      # Solarized 主题
│   │   └── code-stats.ts     # 代码统计插件
│   ├── types/                # TypeScript 类型定义
│   ├── styles/               # CSS 样式
│   └── main.ts               # 应用入口
├── electron/                 # Electron 层
│   ├── main.ts               # 主进程
│   ├── preload.ts            # contextBridge
│   ├── menu.ts               # 系统菜单
│   ├── fs-handlers.ts        # 原生文件系统 IPC
│   └── terminal-handlers.ts  # node-pty IPC
├── tests/                    # 单元测试
├── server/                   # WebSocket 信令服务器
├── vite.config.ts            # Vite + Electron 构建
├── tsconfig.json             # TypeScript 配置
└── package.json
```

## AI API 配置

支持标准的 OpenAI 兼容 API：

```json
{
  "endpoint": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "model": "gpt-4o"
}
```

在设置面板中配置即可。兼容的服务商：

| 服务商 | 端点示例 |
|--------|---------|
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 本地模型 | `http://localhost:11434/v1` (Ollama) |

## 插件开发

### 创建插件

```typescript
import type { Plugin } from '../core/plugin-manager';

const myPlugin: Plugin = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: '我的第一个插件',

  activate(context) {
    // 注册主题
    context.themes.register({
      id: 'my-theme',
      label: 'My Theme',
      themeData: { base: 'vs-dark', colors: {}, rules: [] },
    });

    // 注册命令
    context.commands.register('myPlugin.hello', () => {
      context.subscriptions.push(context.showMessage('Hello!'));
    });

    // 注册侧栏视图
    context.sidebar.register({
      id: 'my-plugin-view',
      title: 'My Plugin',
      render(container) {
        container.innerHTML = '<div>Hello from plugin!</div>';
      },
    });
  },

  deactivate() {
    // 清理资源
  },
};

export default myPlugin;
```

### 扩展点

| 扩展点 | 说明 |
|--------|------|
| `context.themes` | 注册编辑器主题 |
| `context.commands` | 注册命令（显示在命令面板） |
| `context.sidebar` | 注册侧栏视图 |
| `context.ai` | 注册 AI 能力扩展 |

## 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript | 类型安全开发 |
| Vite | 构建工具 (8.0) |
| Monaco Editor | 代码编辑器 |
| Zustand | 状态管理 |
| IndexedDB | 数据持久化 |
| Electron | 桌面打包 |
| Vitest | 单元测试 |
| Yjs | CRDT 协作 |
| isomorphic-git | Git 操作 |

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+P` | 命令面板 |
| `Ctrl+N` | 新建文件 |
| `Ctrl+S` | 保存文件 |
| `Ctrl+B` | 切换侧栏 |
| `Ctrl+`` | AI 助手 |
| `Ctrl+,` | 设置 |
| `Ctrl+Shift+F` | 全局搜索 |
| `Ctrl+Shift+O` | 符号大纲 |
| `Ctrl+Shift+D` | 差异对比 |

## 版本历史

| 版本 | 变更 |
|------|------|
| v1.0 | 基础编辑器 + AI 对话 |
| v2.0 | 多模型、Agent、Composer、预览 |
| v3.0 | TypeScript 工程化、Electron、插件系统、协作 |
| v4.0 | AI 引擎重构、全局搜索、真实终端/Git、Diff 查看器、代码片段 |

## License

MIT
