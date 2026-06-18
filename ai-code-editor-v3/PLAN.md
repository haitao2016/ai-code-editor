# AI Code Editor V6.0 开发计划

> 制定日期：2026-06-18
> 当前版本：V5.0（53/53 项完成）
> 测试状态：471 tests passed, 1349 modules built

---

## 当前状态总结

| 模块 | 状态 | 完成度 |
|------|------|--------|
| Phase 1-4 (LSP/DAP/工程/AI) | ✅ 完成 | 36/36 |
| Phase 5 (质量提升) | 🔶 进行中 | 6/8（5.6、5.7 未完成） |
| Phase 6 (体验打磨) | ✅ 完成 | 9/9 |
| V6.0 Phase 6.1 (本地模型) | 🔶 进行中 | 4/7 |
| V6.0 Phase 6.2 (AI 增强) | ⬜ 规划中 | 0/3 |
| V6.0 Phase 6.3 (协作远程) | ⬜ 规划中 | 0/3 |

---

## 阶段一：Phase 5 收尾（本周）

### 5.6 i18n 硬编码字符串替换

**目标**：将用户可见的 UI 字符串替换为 `i18n.t()` 调用

**范围**（按优先级）：
1. **设置面板** (`features/settings.ts`, `index.html`) — 最高优先级，用户最频繁接触
2. **调试面板** (`features/debug.ts`) — 断点/变量/ Watch 等标签
3. **Git 面板** (`features/git.ts`) — 分支/提交/推送等按钮和状态
4. **AI Chat** (`features/chat.ts`) — 消息、按钮、状态提示
5. **主菜单/工具栏** (`main.ts`) — 文件/编辑/视图菜单项

**工作量**：~200 处字符串替换
**验证**：替换后运行 `npm run build` 和 `npm test` 确保无回归

### 5.7 EventBus 迁移收尾

**目标**：移除剩余的 47 处 `(window as any)` 全局函数调用

**剩余文件**：
- `core/editor.ts` — `__pendingContent`
- `core/a11y.ts` — `__expandFolder`
- `core/large-file.ts` — `monaco` 全局访问
- `core/lsp-fallback.ts` — `__monacoEditor`
- `core/minimap-enhancer.ts` — `monaco`, `__minimapSearchDecoration`
- `core/plugin-api-ext.ts` — `__pluginManager`, `__workspaceRoot`, `__showToast`, `__terminalAPI`
- `features/debug.ts` — `_switchDebugTab`, `_selectStackFrame`, `_expandVar`, `_addWatch`, `_removeWatch`
- `features/diff-viewer.ts` — `_navigateDiff`, `_diffEditor`
- `features/preview.ts` — `_refreshPreview`, `_closePreview`, `_gotoProblem`, `__monacoEditor`

**策略**：
1. 对于 Monaco 实例访问（`__monacoEditor`, `monaco`）→ 通过 `getEditor()` / `getMonaco()` 获取
2. 对于插件 API 调用 → 通过 EventBus 或 `bus.emit()` 解耦
3. 对于 UI 操作（`_refreshPreview`, `_navigateDiff`）→ 直接调用函数或 EventBus

**工作量**：47 处替换
**验证**：替换后构建通过，Electron 环境下功能无回归

---

## 阶段二：V6.0 Phase 6.1 收尾（本周）

### 6.1.5 i18n 集成（设置面板 Ollama 区域）

**目标**：将 `settings.ts` 中 Ollama 区域的硬编码字符串替换为 `i18n.t()`

**涉及字符串**：
- `"检测 Ollama"`
- `"Ollama 未运行"`
- `"Ollama 状态未知"`
- `"已安装模型"`
- `"拉取新模型..."`
- `"推荐模型"` + 模型描述

**工作量**：~20 处
**依赖**：5.6 完成

### 6.1.6 模型自动选择

**目标**：根据可用硬件（RAM）推荐模型

**实现**：
1. 使用 `window.performance.memory` 或 Electron `systemPreferences` 获取可用内存
2. 根据内存大小推荐模型：
   - < 8GB RAM：`qwen3:1.7b`, `phi3:mini`
   - 8-16GB RAM：`qwen2.5-coder:7b`, `deepseek-r1:7b`
   - > 16GB RAM：`llama3:70b`, `deepseek-r1:32b`
3. 在推荐模型列表中标注 "推荐" 标签

**工作量**：~100 行新代码
**验证**：在不同 RAM 环境下测试推荐逻辑

### 6.1.7 GPU 加速提示

**目标**：检测 GPU 并提示用户启用 CUDA/ROCm（Ollama 自动使用 GPU）

**实现**：
1. 使用 WebGL 或 Electron `gpuFeatureStatus` 检测 GPU
2. 如果 GPU 可用但 Ollama 未使用 GPU，显示提示："检测到 GPU，Ollama 将自动使用 GPU 加速"
3. 如果 GPU 不可用，显示提示："未检测到 GPU，模型将使用 CPU 运行（速度较慢）"

**工作量**：~80 行新代码
**验证**：在有/无 GPU 环境下测试

---

## 阶段三：V6.0 Phase 6.2 AI 上下文增强（下周）

### 6.2.1 代码上下文智能选择

**目标**：自动选择最相关的文件作为 AI 上下文

**实现**：
1. 分析当前文件的 `import` / `require` 语句
2. 使用 LSP `textDocument/references` 查找引用当前文件的其他文件
3. 使用静态分析查找频繁一同编辑的文件对（基于 Git 历史）
4. 在 AI Chat 侧边栏显示"推荐上下文"列表，用户可勾选/取消

**工作量**：~300 行新代码 + 1 个新文件 `context-selector.ts`
**验证**：在不同项目中测试上下文选择准确性

### 6.2.2 RAG 文档索引

**目标**：对当前项目建立向量索引，支持语义搜索

**实现**：
1. 使用 `i18n.t()` 获取项目所有文件内容（或只索引 `.md` / `.txt` / 注释）
2. 使用 `getEmbeddings()` 生成向量（支持 OpenAI / 本地 Ollama embeddings）
3. 存储向量到 IndexedDB（`rag-db`）
4. 在 AI Chat 中，使用语义搜索获取相关文档片段作为上下文

**依赖**：6.1.3（Ollama embeddings 支持）
**工作量**：~400 行新代码 + 1 个新文件 `rag-indexer.ts`
**验证**：在大型项目中测试索引速度和搜索准确性

### 6.2.3 多文件编辑计划（Composer 增强）

**目标**：支持跨文件复杂重构（Composer 模式增强）

**实现**：
1. 在 Composer 面板中，允许用户输入"编辑计划"（如"重命名所有 `foo` 为 `bar`"）
2. AI 分析计划，生成跨文件编辑操作列表（预览）
3. 用户确认后，批量应用编辑（使用 `monaco.editor.applyEdits()`）
4. 支持撤销（使用 `UndoRedoService`）

**工作量**：~500 行新代码 + Composer 面板 UI 更新
**验证**：测试跨 5+ 文件的重构操作

---

## 阶段四：V6.0 Phase 6.3 协作与远程（下下周）

### 6.3.1 实时协作编辑

**目标**：基于 CRDT 的实时协作编辑

**实现**：
1. 集成 `yjs` 或 `automerge` CRDT 库
2. 使用 WebSocket 或 WebRTC 同步编辑操作
3. 在编辑器中标示协作者光标/选择（不同颜色）
4. 显示协作者在线状态

**工作量**：~800 行新代码 + 1 个新文件 `collab-crdt.ts`
**验证**：在多用户环境下测试冲突解决和延迟

### 6.3.2 SSH 远程开发

**目标**：通过 SSH 连接到远程文件系统

**实现**：
1. 创建 `ssh-client.ts` — 使用 `ssh2` 库建立 SSH 连接
2. 在文件树中挂载远程目录（虚拟 FS）
3. 在远程服务器上运行终端命令（xterm.js + SSH shell）
4. 支持 SSH 密钥管理和连接保存

**工作量**：~600 行新代码 + 1 个新文件 `ssh-client.ts`
**验证**：连接到真实远程服务器测试文件操作和终端

### 6.3.3 云端工作区（WorkBuddy 深度集成）

**目标**：将编辑器工作区保存到云端，支持多设备同步

**实现**：
1. 集成 WorkBuddy Cloud API（如果可用）
2. 将项目文件、设置、打开的文件标签同步到云端
3. 支持"继续上次编辑"（跨设备）
4. 冲突解决（使用 CRDT 或最后写入获胜）

**工作量**：~500 行新代码 + WorkBuddy API 集成
**验证**：在多设备上测试同步和冲突解决

---

## 风险和依赖

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Ollama 本地模型性能取决于硬件 | 用户体验 | 6.1.6 模型自动选择，推荐合适大小的模型 |
| i18n 替换可能导致 UI 字符串丢失 | 用户可见错误 | 逐步替换 + 完整测试 |
| EventBus 迁移可能引入 bug | 功能回归 | 每迁移一个文件就构建+测试 |
| CRDT 协作编辑实现复杂 | 延迟发布 | 可先发布"只读协作"（查看他人编辑但不实时同步） |
| SSH 远程开发需要后端支持 | 功能不完整 | 可先发布"本地 SSH 客户端"（不依赖后端） |

---

## 时间线（粗略估计）

| 周次 | 目标 |
|-------|------|
| 本周 | 完成 Phase 5 收尾（5.6 + 5.7） |
| 本周 | 完成 Phase 6.1 收尾（6.1.5-6.1.7） |
| 下周 | 完成 Phase 6.2（6.2.1-6.2.3） |
| 下下周 | 完成 Phase 6.3（6.3.1-6.3.3） |
| 第 4 周 | 测试、优化、准备 V6.0 发布 |

---

## 立即开始？

如果你想立即开始，我可以：

1. **先完成 Phase 5.7**（EventBus 迁移）— 更明确，47 处替换
2. **先完成 Phase 5.6**（i18n 替换）— 更用户可见，但工作量更大
3. **先完成 Phase 6.1.5-6.1.7**（Ollama 收尾）— 新功能，更有趣
4. **先创建测试覆盖报告** — 确保当前 471 测试覆盖关键路径

**你希望我按什么顺序执行？** 或者有其他优先级？
