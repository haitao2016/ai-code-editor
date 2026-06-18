# Changelog

## [4.0.1] - 2026-06-18

### Added — Phase 6: 体验打磨
- **欢迎页** — 新手引导 + 快速开始，项目模板（HTML/CSS/JS、TypeScript、React、Python），最近文件列表，快捷键参考，轮播提示
- **Split View 分屏编辑** — 左右/上下分屏，拖拽调整比例，独立编辑器实例，Ctrl+\ 切换
- **插件市场** — 搜索/分类浏览/一键安装卸载，12 个内置展示插件（主题/工具/AI/语言/界面）
- **撤销/重做可视化** — 编辑历史时间线面板，自动录制变更，点击跳转到任意历史状态
- **文件编码管理** — 13 种编码支持（UTF-8/GBK/Big5 等），编码检测/切换/转换，状态栏点击切换
- **大文件优化** — 500KB+ 自动关闭语法高亮/折叠/补全，2MB+ 分片加载，状态栏监控
- **启动性能优化** — 骨架屏加载动画，模块懒加载（critical/high/normal/low/idle 优先级），性能指标收集
- **自动更新** — electron-updater 集成，检查-下载-安装-重启流程，进度通知
- **Minimap 增强** — 搜索结果标记、Linter 错误标记、Git 变更标记在 minimap 上可视化

### Changed
- 版本号升级至 v4.0
- 命令面板新增 5 个命令（分屏编辑/插件市场/编辑历史/编码管理/检查更新）
- 快捷键新增 Ctrl+\ 分屏切换

## [4.0.0] - 2026-06-18

### Added
- **AI Agent 真实工具调用** — read_file / write_file / list_files / search / run_command / delete_file，支持 function calling 循环
- **Composer 多文件变更** — AI 生成批量编辑计划，Diff 视图逐文件展示，审查面板接受/拒绝
- **AI 内联代码补全 (Copilot 风格)** — 接入 Monaco InlineSuggestions API，300ms 防抖，ghost text + Tab 接受
- **聊天历史持久化** — IndexedDB 多会话管理（新建/切换/删除 + token 计数）
- **全局搜索与替换** — 正则/跨文件搜索，匹配导航，批量替换
- **真实终端** — Electron node-pty + Web 模拟终端，多标签切换，ANSI 颜色渲染
- **Git 集成** — isomorphic-git 分支/暂存/提交/历史/差异，real commit 操作
- **文件系统监听** — Electron fs.watch + Web 轮询，外部变更自动刷新
- **Diff 查看器** — Split/Inline 双模式，Git 集成
- **符号大纲** — Monaco getDocumentSymbols，点击跳转
- **代码片段系统** — 22 个内置片段，Tab 触发展开
- **主题编辑器** — 颜色选择器 + 实时预览 + 保存主题
- **快捷键编辑器** — 双击自定义，本地存储持久化
- **全面测试体系** — 24 个单元测试，覆盖 files / agent / snippets 模块
- **GitHub Actions CI/CD** — 自动构建、类型检查、测试
- **Electron 自动更新** — electron-updater + GitHub Releases
- **项目文档** — README (安装/配置/插件开发指南)

### Changed
- Agent 从模拟演示升级为真实 function calling 系统
- Composer 从模拟演示升级为真实 Diff 生成
- 终端从静态模拟升级为真实 PTY / 内置命令
- 内联补全从启发式规则升级为 AI 驱动

### Fixed
- Vite 构建配置 (external: isomorphic-git, node-pty)
- Electron preload 文件路径

## [3.0.0] - 2026-06-17

### Added
- TypeScript 工程化改造 (Vite + TS)
- Zustand 状态管理 (11 个 Store)
- IndexedDB 文件持久化
- Monaco Editor 封装
- Electron 桌面应用支持 (主进程/preload/IPC)
- node-pty 原生终端
- Yjs CRDT 实时协作
- 插件系统 (主题/命令/侧栏/AI 扩展点)
- 多模型架构 (GPT-4o/Claude/DeepSeek/通义千问)
- 图片分析 (Vision API) + 语音输入
- Vitest 单元测试

## [2.0.0] - 2026-06-16

### Added
- 多模型切换支持
- 主题选择器
- 设置面板
- 多标签编辑
- 命令面板 (Ctrl+P)

## [1.0.0] - 2026-06-15

### Added
- Monaco Editor 代码编辑器
- AI 对话面板 (流式响应)
- 模拟 Shell 终端
- Git 面板
- Agent 任务规划
- Composer 多文件编辑
- @ 上下文引用系统
- 实时预览 + Linter
