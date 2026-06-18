# V4.0 开发路线图

## 概述

V3.0 已完成 TypeScript 工程化、Zustand 状态管理、Electron 桌面端、Yjs CRDT 协作、插件系统等基础设施。V4.0 的目标是将"可用原型"提升为"产品级应用"。

### V3.0 现状分析

| 功能模块 | 状态 | 问题 |
|----------|------|------|
| Agent 模式 | 占位 | 仅返回固定格式消息，无真实工具调用 |
| Composer 模式 | 占位 | 无多文件变更计划生成/审查/应用 |
| 终端 | 模拟 | 基于 IndexedDB 的命令解析，非真实 Shell |
| Git | 模拟 | 随机 hash，内存存储，非真实 Git |
| 代码补全 | 未接入 | `getInlineCompletion` 函数已写但未调用 |
| 全局搜索 | 缺失 | UI 按钮存在，无功能实现 |
| 测试覆盖 | 极低 | 仅 15 个工具函数测试 |
| 代码规范 | 缺失 | 无 ESLint/Prettier |
| 文档 | 缺失 | 无 README |

---

## Phase 1: AI 引擎重构

**目标**: 让 Agent 和 Composer 真正工作，接入 AI 代码补全

### 1.1 Agent 工具调用系统
- [ ] 定义工具接口：`readFile`, `writeFile`, `runCommand`, `search`, `listFiles`
- [ ] 实现 AI function calling 循环（plan → execute → observe → next）
- [ ] 任务步骤可视化（进度条、当前步骤高亮）
- [ ] 错误处理与重试机制
- [ ] 步骤回滚能力

### 1.2 Composer 多文件变更
- [ ] 生成多文件编辑计划（基于 AI 分析用户意图）
- [ ] Diff 视图：逐文件展示变更（新增/修改/删除）
- [ ] 审查面板：接受/拒绝/修改单个变更
- [ ] 批量应用变更到 IndexedDB / 原生文件系统

### 1.3 AI 内联代码补全
- [ ] 接入 `getInlineCompletion` 到 Monaco InlineSuggestions API
- [ ] 防抖触发（停止输入 300ms 后请求）
- [ ] Ghost text 展示，Tab 接受
- [ ] 多行补全支持

### 1.4 聊天历史持久化
- [ ] 聊天会话存储到 IndexedDB
- [ ] 多会话管理（新建/切换/删除）
- [ ] 上下文窗口管理（token 计数，超出截断）

---

## Phase 2: 核心功能补全

**目标**: 补全编辑器缺失的基础功能

### 2.1 全局搜索与替换
- [ ] 跨文件搜索面板（支持正则、全词匹配、大小写）
- [ ] 搜索结果列表（文件分组，点击跳转）
- [ ] 批量替换（预览变更后确认）
- [ ] 搜索范围过滤（文件类型/排除目录）

### 2.2 真实终端对接
- [ ] 前端连接 Electron `terminalAPI`（spawn pty）
- [ ] 多标签终端（创建/切换/关闭）
- [ ] 终端输出主题适配（ANSI 颜色）
- [ ] 浏览器环境保留模拟终端 fallback

### 2.3 Git 真实集成
- [ ] 使用 `isomorphic-git` 或 `child_process` 调用系统 git
- [ ] 真实状态检测（modified/staged/untracked）
- [ ] 分支管理（创建/切换/合并）
- [ ] 提交历史 + Diff 查看
- [ ] 暂存/取消暂存单个文件

### 2.4 文件系统监听
- [ ] Electron 环境下监听外部文件变更
- [ ] 自动刷新文件树
- [ ] 未保存文件冲突提示

---

## Phase 3: 编辑器增强

**目标**: 补齐 VS Code 级别的编辑体验

### 3.1 Minimap 与大纲
- [ ] Monaco minimap 开启与配置
- [ ] 符号大纲面板（基于 Monaco `getDocumentSymbols`）
- [ ] 点击大纲跳转到对应位置

### 3.2 Diff 查看器
- [ ] Split diff 视图（左右对比）
- [ ] Inline diff 视图（行内高亮）
- [ ] Git 变更 diff 集成

### 3.3 高级编辑功能
- [ ] 多光标编辑（Ctrl+D 选中相同，Alt+Click 添加光标）
- [ ] 文件内查找替换（Ctrl+F / Ctrl+H）
- [ ] 代码片段系统（Snippets）
- [ ] 自动闭合括号/标签

---

## Phase 4: 工程化与质量

**目标**: 建立可持续的工程质量保障体系

### 4.1 测试体系
- [ ] AI 客户端单元测试（mock API 响应）
- [ ] Stores 单元测试（状态变更、持久化）
- [ ] Plugin Manager 单元测试
- [ ] Files 模块集成测试（CRUD 全流程）
- [ ] 编辑器交互 E2E 测试

### 4.2 代码规范
- [ ] ESLint 配置（TypeScript rules）
- [ ] Prettier 格式化配置
- [ ] pre-commit hook（husky + lint-staged）
- [ ] 编辑器集成（EditorConfig）

### 4.3 CI/CD
- [ ] GitHub Actions workflow（lint → test → build）
- [ ] PR 自动检查
- [ ] 构建产物上传

### 4.4 文档
- [ ] README.md（项目介绍/快速开始/功能列表）
- [ ] API 文档（核心模块接口说明）
- [ ] 插件开发指南
- [ ] .gitignore + git 初始化

---

## Phase 5: 发布准备

**目标**: 完成桌面应用打包与发布

### 5.1 自动更新
- [ ] electron-updater 集成
- [ ] 更新检查与下载
- [ ] 增量更新支持

### 5.2 用户体验
- [ ] 快捷键自定义系统
- [ ] 主题编辑器（自定义颜色方案）
- [ ] 首次启动引导

### 5.3 性能优化
- [ ] Monaco 编辑器懒加载
- [ ] 插件按需加载
- [ ] 文件树虚拟滚动
- [ ] AI 响应流式渲染优化

### 5.4 打包发布
- [ ] Windows NSIS 安装包
- [ ] macOS DMG 安装包
- [ ] Linux AppImage
- [ ] 应用图标与品牌设计
- [ ] 发布说明 (CHANGELOG)
