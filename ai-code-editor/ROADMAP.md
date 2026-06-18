# AI Code Editor — 更新路线图

> 当前版本: **V3.0** | 最后更新: 2026-06-18

---

## ✅ V1.5 — 已完成（基础增强）

| # | 功能 | 状态 |
|---|------|------|
| 1 | 真实 AI API 接入 | ✅ OpenAI 兼容接口 |
| 2 | IndexedDB 文件持久化 | ✅ 刷新不丢失 |
| 3 | 设置持久化 | ✅ localStorage |
| 4 | Diff 对比 + 一键应用 | ✅ before/after 对比 |
| 5 | 内联代码补全（Ghost Text） | ✅ Tab 接受 |
| 6 | 面包屑导航 | ✅ 路径导航 |
| 7 | 文件模板 | ✅ 多语言模板 |

---

## ✅ V2.0 — 已完成（Cursor 对标）

| Phase | 功能 | 状态 |
|-------|------|------|
| Phase 1 | 终端面板 + Git 集成 | ✅ terminal.js / git.js |
| Phase 2 | Agent 模式 | ✅ agent.js |
| Phase 3 | Composer 多文件编辑 | ✅ composer.js |
| Phase 4 | @ 上下文引用 | ✅ context.js |
| Phase 5 | 实时预览 + Linter | ✅ preview.js |

---

## ✅ V3.0 — 已完成（平台化）

### 整体进度

```
✅ Phase 6:  工程化改造         ████████████████████ 100%
✅ Phase 7:  多模型 + 高级 AI   ████████████████████ 100%
✅ Phase 8:  Electron 桌面打包  ████████████████████ 100%
✅ Phase 9:  插件系统            ████████████████████ 100%
✅ Phase 10: 协作与同步          ████████████████████ 100%
```

---

### ✅ Phase 6: 工程化改造

| 任务 | 状态 |
|------|------|
| Vite + TypeScript 项目初始化 | ✅ |
| CSS 模块化拆分 | ✅ |
| Zustand 11 个 Store | ✅ |
| 核心模块 TS 迁移 | ✅ |
| 功能模块 TS 迁移 | ✅ |
| Vitest 15 个测试通过 | ✅ |

### ✅ Phase 7: 多模型 + 高级 AI

| 任务 | 状态 |
|------|------|
| 多模型注册表 + 下拉切换 | ✅ |
| 图片拖拽 + Vision API | ✅ |
| Web Speech API 语音输入 | ✅ |
| 模型用量统计 | ✅ |

### ✅ Phase 8: Electron 桌面打包

| 任务 | 状态 |
|------|------|
| Electron 主进程 (main.ts) | ✅ 窗口管理 + IPC |
| Preload 安全桥 (preload.ts) | ✅ contextBridge |
| vite-plugin-electron 集成 | ✅ 开发+生产模式 |
| 原生文件系统 (fs-handlers.ts) | ✅ Node.js fs |
| 原生终端 (terminal-handlers.ts) | ✅ node-pty + fallback |
| 系统菜单 (menu.ts) | ✅ File/Edit/View/Help |
| 文件对话框 | ✅ 打开文件夹/文件/保存 |
| electron-builder 打包配置 | ✅ Win/Mac/Linux |
| 渲染进程 Electron 集成 | ✅ 窗口控制 + 菜单事件 |

### ✅ Phase 9: 插件系统

| 任务 | 状态 |
|------|------|
| 插件清单规范 (plugin.ts) | ✅ name/version/api/contributes |
| PluginManager 核心 | ✅ 加载/卸载/激活/停用 |
| 扩展点 API | ✅ 主题/命令/侧栏/Agent |
| 插件管理面板 UI | ✅ 启用/禁用/主题切换 |
| 内置: Dracula 主题 | ✅ 15 个 CSS 变量 |
| 内置: Solarized Light 主题 | ✅ 亮色主题 |
| 内置: 代码统计工具 | ✅ 侧栏面板 + 命令 |
| 插件状态持久化 | ✅ localStorage |

### ✅ Phase 10: 协作与同步

| 任务 | 状态 |
|------|------|
| Yjs CRDT 文档同步 | ✅ yjs + y-monaco |
| WebSocket 信令服务器 | ✅ server/index.ts |
| 光标 + 用户名同步 | ✅ Awareness API |
| 协作 UI 面板 | ✅ 创建/加入房间 |
| 协作者列表 | ✅ 在线用户头像 |
| 房间链接分享 | ✅ URL 参数自动加入 |
| 断线重连 | ✅ y-websocket 内置 |

---

## 项目文件结构

```
ai-code-editor-v3/
├── package.json              ← Vite + TS + Zustand + Electron + Yjs
├── tsconfig.json
├── vite.config.ts            ← vite-plugin-electron 集成
├── index.html                ← 入口 HTML
├── server/
│   └── index.ts              ← WebSocket 协作信令服务器
├── electron/
│   ├── main.ts               ← Electron 主进程
│   ├── preload.ts            ← 安全桥接 (contextBridge)
│   ├── menu.ts               ← 系统菜单栏
│   ├── fs-handlers.ts        ← 原生文件系统 IPC
│   └── terminal-handlers.ts  ← node-pty 终端 IPC
├── src/
│   ├── main.ts               ← 主入口 + UI 逻辑
│   ├── types/
│   │   ├── index.ts          ← 核心类型定义
│   │   ├── electron.d.ts     ← Electron API 类型
│   │   └── plugin.ts         ← 插件类型定义
│   ├── styles/main.css       ← 完整样式
│   ├── core/
│   │   ├── stores.ts         ← Zustand Stores
│   │   ├── files.ts          ← IndexedDB 文件系统
│   │   ├── editor.ts         ← Monaco 编辑器封装
│   │   ├── ai.ts             ← AI API 流式客户端
│   │   ├── collab.ts         ← Yjs 协作引擎
│   │   └── plugin-manager.ts ← 插件管理器
│   ├── features/
│   │   ├── chat.ts           ← 聊天 + 多模态
│   │   ├── terminal.ts       ← 模拟终端
│   │   ├── git.ts            ← Git 面板
│   │   ├── settings.ts       ← 设置面板
│   │   ├── preview.ts        ← 实时预览 + Linter
│   │   ├── plugins.ts        ← 插件管理面板 UI
│   │   └── collab-ui.ts      ← 协作 UI 面板
│   └── plugins/
│       ├── index.ts          ← 插件加载器
│       ├── dracula.ts        ← Dracula 主题插件
│       ├── solarized.ts      ← Solarized 主题插件
│       └── code-stats.ts     ← 代码统计工具插件
├── tests/
│   └── files.test.ts         ← 15 个单元测试
└── dist/ / dist-electron/    ← 构建输出
```

---

## V3.0 技术栈

```
构建工具:    Vite 8.x + TypeScript 6.x
状态管理:    Zustand 5.x
编辑器:       Monaco Editor 0.55
测试:         Vitest 4.x (15/15 通过)
桌面:         Electron 42 + vite-plugin-electron
原生终端:    node-pty (可选) + fallback 模式
原生文件:    Node.js fs via IPC
插件:         自定义 Plugin API + 4 个扩展点
协作:         Yjs 13 + y-monaco + y-websocket
后端:         Node.js + ws (WebSocket 信令)
AI:           OpenAI 兼容 API (GPT-4o / Claude / DeepSeek)
```

---

## 构建产物

| 输出 | 大小 | gzip |
|------|------|------|
| index.html | 9.86 KB | 3.23 KB |
| main.css | 20.78 KB | 3.89 KB |
| index.js | 156.52 KB | 48.31 KB |
| monaco.js | 2,526 KB | 650 KB |
| main.js (Electron) | 7.42 KB | 2.77 KB |
| preload.js | 1.83 KB | 0.55 KB |

---

## 使用方式

```bash
# Web 开发模式
npm run dev

# Electron 开发模式
npm run dev:electron

# 协作服务器
npm run dev:server

# 生产构建
npm run build

# Electron 打包
npm run build:electron

# 运行测试
npm test
```
