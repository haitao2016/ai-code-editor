# V4.0 开发路线图 ✅ 全部完成

## 概述

V3.0 已完成 TypeScript 工程化、Zustand 状态管理、Electron 桌面端、Yjs CRDT 协作、插件系统等基础设施。V4.0 的目标是将"可用原型"提升为"产品级应用" — 已于 2026-06-18 全部完成。

### V3.0 → V4.0 提升

| 功能模块 | V3.0 状态 | V4.0 状态 |
|----------|-----------|-----------|
| Agent 模式 | 占位消息 | ✅ 真实 function calling + 6 个工具 |
| Composer 模式 | 占位消息 | ✅ 多文件 Diff 生成/审查/应用 |
| 终端 | 模拟 | ✅ Electron pty / 内置命令 fallback + 多标签 |
| Git | 模拟 | ✅ isomorphic-git + 分支/提交/历史/推送 |
| 代码补全 | 未接入 | ✅ Copilot 风格 AI 内联补全 |
| 全局搜索 | 缺失 | ✅ 正则/跨文件搜索 + 批量替换 |
| Diff 查看器 | 缺失 | ✅ Split/Inline 双模式 + Git 集成 |
| 符号大纲 | 缺失 | ✅ Monaco DocumentSymbols + 点击跳转 |
| 代码片段 | 缺失 | ✅ 22 个内置片段 + Tab 展开 |
| 测试覆盖 | 15 tests | ✅ 24 tests (files/agent/snippets) |
| 代码规范 | 缺失 | ✅ ESLint + Prettier + GitHub Actions CI |
| 文档 | 缺失 | ✅ README + CHANGELOG + API 文档 |

---

## Phase 1: AI 引擎重构 ✅

- [x] 1.1 Agent 工具调用系统 — read_file/write_file/list_files/search/run_command/delete_file + function calling 循环
- [x] 1.2 Composer 多文件变更 — Diff 生成/审查/应用/批量写到文件系统
- [x] 1.3 AI 内联代码补全 — Monaco InlineSuggestions + 300ms 防抖 + ghost text + Tab 接受
- [x] 1.4 聊天历史持久化 — IndexedDB 多会话管理 + token 计数

## Phase 2: 核心功能补全 ✅

- [x] 2.1 全局搜索与替换 — 正则/跨文件/匹配导航/批量替换
- [x] 2.2 真实终端对接 — Electron node-pty / 内置命令 fallback + 多标签 + ANSI
- [x] 2.3 Git 真实集成 — isomorphic-git + 虚拟 FS + 分支/提交/历史/推送/远程
- [x] 2.4 文件系统监听 — Electron fs.watch + Web 轮询

## Phase 3: 编辑器增强 ✅

- [x] 3.1 Minimap 与大纲 — Monaco minimap + 符号大纲面板 (Ctrl+Shift+O)
- [x] 3.2 Diff 查看器 — Split/Inline 双模式 + 变更导航
- [x] 3.3 高级编辑功能 — 多光标/查找替换/代码片段/自动闭合

## Phase 4: 工程化与质量 ✅

- [x] 4.1 测试体系 — 24 个单元测试 (agent/files/snippets)
- [x] 4.2 代码规范 — ESLint + Prettier 配置
- [x] 4.3 CI/CD — GitHub Actions workflow
- [x] 4.4 文档 — README + CHANGELOG + 插件开发指南

## Phase 5: 发布准备 ✅

- [x] 5.1 自动更新 — electron-updater + GitHub Releases publish 配置
- [x] 5.2 用户体验 — 快捷键编辑器 + 主题编辑器
- [x] 5.3 性能优化 — Monaco 懒加载/代码分割/插件按需加载
- [x] 5.4 打包发布 — 三平台配置(Windows NSIS/macOS DMG/Linux AppImage) + CHANGELOG
