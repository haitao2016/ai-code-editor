# V5.0 开发路线图

## 概述

V4.0 已完成 TypeScript 工程化、Electron 桌面端、Agent 工具调用、插件系统等基础设施。
经过深度代码审查，V5.0 聚焦于将"可用原型"提升为"生产级 IDE"——填补 LSP/DAP 两大核心能力空白，消除安全漏洞，加固工程质量。

### V4.0 → V5.0 提升目标

| 功能模块 | V4.0 状态 | V5.0 目标 |
|----------|-----------|-----------|
| 诊断/Linter | 自制简易规则检查 | LSP 实时语义诊断 |
| 代码导航 | 无 | Go-to-Def / Find Refs / Rename |
| 代码补全 | AI 内联补全 | AI + LSP 双源补全 |
| 调试器 | 完全缺失 | DAP 断点/调用栈/变量 |
| 终端 | 模拟 | xterm.js + node-pty 真终端 |
| 工作区 | 扁平文件列表 | 文件夹树 + 项目配置 |
| AI 上下文 | 单文件 | RAG 多文件 + 项目级索引 |
| Git | 模拟 | isomorphic-git 真集成 |
| 安全 | 无防护 | XSS 修复 + Key 加密 + CSP |
| 测试 | 24 tests | 核心/Feature/Electron/E2E |

---

## Phase 1: LSP 语言服务器 — 语义级代码理解

将编辑器从"语法高亮文本编辑器"升级为"语义理解 IDE"。

- [x] 1.1 LSP 客户端基础设施 — lsp-client.ts JSON-RPC + 传输层 + 超时
- [x] 1.2 TypeScript Language Server 对接 — typescript-language-server --stdio
- [x] 1.3 Python Language Server (pylsp) 对接 + HTML/CSS/Go/Rust/Java 配置
- [x] 1.4 Monaco Diagnostics 实时波浪线渲染 — lsp-bridge.ts + lsp-fallback.ts
- [x] 1.5 Hover Provider — registerHoverProvider('*') 类型/文档浮窗
- [x] 1.6 Go-to-Definition — registerDefinitionProvider('*') Ctrl+Click
- [x] 1.7 Find All References — registerReferenceProvider('*') 引用列表
- [x] 1.8 Rename Symbol — registerRenameProvider('*') 项目级重命名
- [x] 1.9 Code Actions / Quick Fix — LSP CodeAction + WorkspaceEdit
- [x] 1.10 Signature Help — registerSignatureHelpProvider('*') 参数提示

## Phase 2: DAP 调试器 — 运行-暂停-检查

让编辑器拥有完整的调试能力。

- [x] 2.1 DAP 客户端基础设施 — dap-client.ts JSON-RPC + 传输层
- [x] 2.2 断点管理 — dap-session.ts 行断点/条件断点/日志点
- [x] 2.3 Debug 工具栏 — features/debug.ts Step/Continue/Restart/Stop
- [x] 2.4 Call Stack 面板 — dap-session.ts 调用栈 + 帧切换
- [x] 2.5 变量查看面板 — dap-session.ts 局部/全局/Scope 展开
- [x] 2.6 Watch 表达式 — features/debug.ts 添加/编辑/删除
- [x] 2.7 Debug Console — features/debug.ts REPL + 表达式求值
- [x] 2.8 launch.json 配置 — features/settings.ts Node/Python 预设
- [x] 2.9 Electron IPC 调试通道 — electron/dap-handlers.ts

## Phase 3: 工程基础 — 工作区 + 安全 + 真实工具

补齐工程化基础，消除安全隐患。

- [x] 3.1 文件夹树重构 — file-tree-virtual.ts + file-tree-opt.ts 虚拟化
- [x] 3.2 工作区配置 — features/settings.ts 完整配置面板
- [x] 3.3 xterm.js 终端集成 — features/terminal.ts + electron/terminal-handlers.ts
- [x] 3.4 isomorphic-git 真集成 — features/git.ts + 虚拟 FS 回退
- [x] 3.5 API Key 安全存储 — settings.ts Base64 编码存储
- [x] 3.6 XSS 防护 — escapeHtml 全局消毒 + DOM API
- [x] 3.7 CSP 策略配置 — Content Security Policy 头
- [x] 3.8 Preload 权限白名单 — sanitizePath 路径防穿越
- [x] 3.9 文件系统双向同步 — incremental-sync.ts 增量同步

## Phase 4: AI 增强 — 深度代码上下文 + 格式化

让 AI 真正理解整个项目，而不是只看当前文件。

- [x] 4.1 AbortController 请求取消 — ai.ts createAISignal/abortActiveRequest
- [x] 4.2 标准 OpenAI function calling — agent-tools.ts chat completions API
- [x] 4.3 项目级 RAG 上下文 — rag.ts + rag-worker.ts + rag-worker-manager.ts
- [x] 4.4 多文件上下文构建 — context.ts 依赖图分析 + 自动引用
- [x] 4.5 精确 Token 计算 — stores.ts estimateTokens/tiktoken 集成
- [x] 4.6 API 配额追踪 — quota.ts 用量统计 + 可视化面板
- [x] 4.7 Prettier 代码格式化 — features/format.ts 内置格式化
- [x] 4.8 AI 流式渲染优化 — features/chat.ts 增量 Markdown 解析

## Phase 5: 质量提升 — 测试 + 国际化 + UI 升级

让代码质量可度量、用户群体可扩展。

- [x] 5.1 核心模块单元测试 (190 tests) — stores / ai / editor / collab / plugin-manager
- [x] 5.2 Feature 模块单元测试 (157 tests) — terminal / git / chat / search / preview
- [x] 5.3 Electron IPC 集成测试 (80 tests) — menu/fs/terminal/lsp/dap/preload
- [x] 5.4 E2E 流程测试 (31 tests) — edit-save-terminal-AI/crud/git/chat/search/settings
- [x] 5.5 i18n 国际化框架 — 轻量级 i18n + 中英双语包(184 keys)
- [x] 5.6 UI 字符串提取 — 新增 590 locale keys，index.html 和 .ts 文件硬编码字符串已替换为 i18n.t()
- [x] 5.7 事件总线 — EventBus 框架已创建，所有 (window as any) 调用已移除，类型安全已通过 window.d.ts 实现
- [x] 5.8 通知系统增强 — 持久通知 + 进度条通知

## Phase 6: 体验打磨 — 扩展市场 + 多视图 + 性能

完善最终用户体验细节。

- [x] 6.1 扩展/插件市场 — 搜索/安装/管理面板
- [x] 6.2 多编辑器 Split View — 左右/上下分屏
- [x] 6.3 文件编码管理 — UTF-8/GBK 检测与转换
- [x] 6.4 撤销/重做可视化 — 时间线面板
- [x] 6.5 大文件优化 — 分片加载 + 语法关闭
- [x] 6.6 启动性能优化 — 懒加载 + 预构建 + 缓存
- [x] 6.7 自动更新实现 — electron-updater 检查-下载-安装
- [x] 6.8 Minimap 增强 — 搜索结果/错误/变更标记
- [x] 6.9 欢迎页 — 新手引导 + 快速开始

## V6.0: 本地模型 + 深度 AI 集成 — 规划中

> 开始日期: 2026-06-18
> 目标: 支持本地大模型（Ollama），脱离 API Key 依赖，真正实现本地 AI 编程助手

### Phase 6.1: 本地模型支持 (Ollama) ✅ 已部分完成

- [x] 6.1.1 ModelConfig 类型扩展 — 添加 `local` 和 `requireApiKey` 标志
- [x] 6.1.2 Ollama API 客户端 — `local-models.ts`：检测/列表/拉取/删除模型
- [x] 6.1.3 ai.ts 无 Key 调用 — 本地模型跳过 API Key 检查，不发送 Authorization header
- [x] 6.1.4 设置面板 UI — Ollama 状态指示、模型检测、拉取新模型
- [x] 6.1.5 i18n 集成 — 设置面板 Ollama 区域中文本替换为 i18n.t()
- [x] 6.1.6 模型自动选择 — 根据可用硬件（RAM）推荐模型
- [x] 6.1.7 GPU 加速提示 — 检测 GPU 并提示用户启用 CUDA/ROCm

### Phase 6.2: AI 上下文增强 — 规划中

- [~] 6.2.1 代码上下文智能选择 — 自动选择最相关的文件作为上下文 [基础版完成，UI 已添加]
- [x] 6.2.2 RAG 文档索引 — 对当前项目建立向量索引，支持语义搜索 [已集成到 AI Chat，设置面板已添加管理 UI]
- [x] 6.2.3 多文件编辑计划 — Composer 增强，支持跨文件复杂重构 [已添加全部接受/拒绝按钮]

### Phase 6.3: 协作与远程 — 规划中

- [x] 6.3.1 实时协作编辑 — CRDT 基础结构 [Yjs 集成，CollabManager API 已实现，测试通过]
- [ ] 6.3.2 SSH 远程开发 — 远程文件系统挂载
- [ ] 6.3.3 云端工作区 — WorkBuddy 深度集成
