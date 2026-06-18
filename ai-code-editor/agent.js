// ============================================================
// agent.js — Agent 模式：任务规划 + 自主执行 + 回滚
// Phase 2: Agent Mode
// ============================================================

// ─── Agent 状态 ──────────────────────────────────────
let agentActive = false;
let agentPlan = null; // { intent, steps: [{id, description, status, code?, result?}] }
let agentCurrentStep = -1;
let agentSnapshots = {}; // 变更前代码快照，用于回滚
let agentContainer = null;
let agentAborted = false;

// ─── 初始化 Agent 面板 ───────────────────────────────
function initAgentUI() {
  if (agentContainer) return;
  
  // 在 chat-messages 区域插入 agent 面板
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  agentContainer = document.createElement('div');
  agentContainer.id = 'agentPanel';
  agentContainer.className = 'agent-panel';
  agentContainer.style.display = 'none';
  agentContainer.innerHTML = `
    <div class="agent-header">
      <span class="agent-title">🤖 Agent 模式</span>
      <div class="agent-actions">
        <button class="agent-btn-agent" onclick="abortAgent()" title="停止">⏹ 停止</button>
      </div>
    </div>
    <div class="agent-plan" id="agentPlan"></div>
    <div class="agent-progress" id="agentProgress" style="display:none;">
      <div class="agent-progress-bar"><div class="agent-progress-fill" id="agentProgressFill"></div></div>
      <span class="agent-progress-text" id="agentProgressText">规划中...</span>
    </div>
    <div class="agent-output" id="agentOutput"></div>
  `;
  chatMessages.appendChild(agentContainer);

  // CSS
  if (!document.getElementById('agent-styles')) {
    const style = document.createElement('style');
    style.id = 'agent-styles';
    style.textContent = `
      .agent-panel {
        background: var(--bg-tertiary);
        border: 1px solid var(--accent);
        border-radius: 10px;
        overflow: hidden;
        margin: 8px 0;
        animation: agentSlideIn 0.3s ease;
      }
      @keyframes agentSlideIn {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .agent-header {
        background: var(--accent);
        color: white;
        padding: 8px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 13px;
        font-weight: 600;
      }
      .agent-title {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .agent-actions {
        display: flex;
        gap: 4px;
      }
      .agent-actions button {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 3px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.15s;
      }
      .agent-actions button:hover {
        background: rgba(255,255,255,0.3);
      }
      .agent-plan {
        padding: 12px 14px;
        max-height: 300px;
        overflow-y: auto;
      }
      .agent-plan .plan-intent {
        font-size: 13px;
        color: var(--text-primary);
        margin-bottom: 10px;
        padding: 6px 10px;
        background: var(--accent-light);
        border-radius: 6px;
        border-left: 3px solid var(--accent);
      }
      .agent-plan .plan-steps {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .agent-plan .plan-step {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        border: 1px solid var(--border-color);
        transition: all 0.2s;
        cursor: default;
      }
      .agent-plan .plan-step .step-indicator {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        flex-shrink: 0;
        border: 2px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-muted);
      }
      .agent-plan .plan-step.pending .step-indicator { border-color: var(--border-color); }
      .agent-plan .plan-step.running {
        border-color: var(--accent);
        background: var(--accent-light);
      }
      .agent-plan .plan-step.running .step-indicator {
        border-color: var(--accent);
        color: var(--accent);
        animation: agentPulse 1s infinite;
      }
      @keyframes agentPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
        50% { box-shadow: 0 0 0 6px rgba(99,102,241,0); }
      }
      .agent-plan .plan-step.done {
        border-color: var(--success);
      }
      .agent-plan .plan-step.done .step-indicator {
        border-color: var(--success);
        background: var(--success);
        color: var(--bg-primary);
      }
      .agent-plan .plan-step.error {
        border-color: var(--error);
      }
      .agent-plan .plan-step.error .step-indicator {
        border-color: var(--error);
        background: var(--error);
        color: white;
      }
      .agent-plan .plan-step .step-desc {
        flex: 1;
        color: var(--text-secondary);
        min-width: 0;
      }
      .agent-plan .plan-step .step-action {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }
      .agent-plan .plan-step .step-action button {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 3px;
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-muted);
        cursor: pointer;
        transition: all 0.15s;
      }
      .agent-plan .plan-step .step-action button:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .agent-plan .plan-step .step-action button.approve {
        border-color: var(--success);
        color: var(--success);
      }
      .agent-plan .plan-step .step-action button.approve:hover {
        background: rgba(166,227,161,0.1);
      }
      .agent-plan .plan-step .step-action button.reject {
        border-color: var(--error);
        color: var(--error);
      }
      .agent-plan .plan-step .step-action button.reject:hover {
        background: rgba(243,139,168,0.1);
      }
      .agent-progress {
        padding: 0 14px 8px;
      }
      .agent-progress-bar {
        height: 4px;
        background: var(--bg-primary);
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 4px;
      }
      .agent-progress-fill {
        height: 100%;
        background: var(--accent);
        border-radius: 2px;
        transition: width 0.3s ease;
        width: 0%;
      }
      .agent-progress-text {
        font-size: 11px;
        color: var(--text-muted);
      }
      .agent-output {
        padding: 8px 14px 12px;
        font-size: 12px;
        color: var(--text-secondary);
        border-top: 1px solid var(--border-color);
        max-height: 200px;
        overflow-y: auto;
        display: none;
      }
      .agent-output .output-line {
        padding: 2px 0;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
      }
      .agent-output .output-line.success { color: var(--success); }
      .agent-output .output-line.error { color: var(--error); }
      .agent-output .output-line.info { color: var(--info); }
      .agent-summary {
        padding: 10px 14px;
        border-top: 1px solid var(--border-color);
        display: none;
      }
      .agent-summary .summary-title {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 6px;
        color: var(--text-primary);
      }
      .agent-summary .summary-detail {
        font-size: 11px;
        color: var(--text-muted);
        margin-bottom: 8px;
      }
      .agent-summary .summary-actions {
        display: flex;
        gap: 6px;
      }
      .agent-summary .summary-actions button {
        font-size: 11px;
        padding: 5px 12px;
        border-radius: 6px;
        border: 1px solid var(--border-color);
        background: var(--bg-primary);
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.15s;
      }
      .agent-summary .summary-actions button:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .agent-summary .summary-actions button.accept {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
      }
      .agent-summary .summary-actions button.accept:hover {
        background: var(--accent-hover);
      }
      .agent-summary .summary-actions button.rollback {
        border-color: var(--error);
        color: var(--error);
      }
      .agent-summary .summary-actions button.rollback:hover {
        background: rgba(243,139,168,0.1);
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Agent 入口：解析用户意图，生成计划 ──────────────
async function startAgent(intent) {
  initAgentUI();

  // 重置状态
  agentActive = true;
  agentAborted = false;
  agentPlan = null;
  agentCurrentStep = -1;
  agentSnapshots = {};

  // 显示 Agent 面板
  const panel = document.getElementById('agentPanel');
  const planDiv = document.getElementById('agentPlan');
  const outputDiv = document.getElementById('agentOutput');
  const summaryDiv = panel?.querySelector('.agent-summary');
  const progressDiv = document.getElementById('agentProgress');

  panel.style.display = 'block';
  outputDiv.style.display = 'none';
  if (summaryDiv) summaryDiv.style.display = 'none';
  if (progressDiv) progressDiv.style.display = 'none';

  // 显示"规划中"状态
  planDiv.innerHTML = `
    <div class="plan-intent">🎯 分析需求: "${intent}"</div>
    <div class="plan-steps">
      <div class="plan-step running">
        <div class="step-indicator">◌</div>
        <div class="step-desc">AI 正在分析并规划任务...</div>
      </div>
    </div>
  `;

  // 调用 AI 生成计划
  try {
    const plan = await generatePlan(intent);
    if (agentAborted) {
      finishAgent('aborted', '任务已被用户中止');
      return;
    }
    agentPlan = plan;
    renderPlan();
    // 自动开始执行
    await executeAgentPlan();
  } catch (e) {
    planDiv.innerHTML = `
      <div class="plan-intent">🎯 分析需求: "${intent}"</div>
      <div class="plan-steps">
        <div class="plan-step error">
          <div class="step-indicator">✕</div>
          <div class="step-desc">计划生成失败: ${e.message}</div>
        </div>
      </div>
    `;
    agentActive = false;
  }

  // 滚动到 agent 面板
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── 使用 AI 生成执行计划 ────────────────────────────
async function generatePlan(intent) {
  const prompt = `你是一个代码 Agent 规划器。分析以下需求，生成一个结构化的执行计划。

需求: ${intent}

当前打开的文件: ${activeFile || '无'}

请以 JSON 格式返回计划，格式如下:
{
  "intent": "一句话描述目标",
  "steps": [
    { "id": "step_1", "description": "步骤描述", "action": "create_file|edit_file|run_command|search", "target": "目标文件或命令", "detail": "详细操作说明" }
  ]
}

注意:
- 每个 step 必须具体可执行
- action 为 create_file/edit_file/run_command/search 之一
- 最多 8 个步骤
- 每个步骤应该是原子的单一操作

只返回 JSON，不要其他内容。`;

  const resp = await callAI([{ role: 'user', content: prompt }], { temperature: 0.2, maxTokens: 2048 });

  // 解析 JSON（处理可能的 markdown 包装）
  let jsonStr = resp.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\w*\n/, '').replace(/\n```$/, '');
  }
  
  try {
    const plan = JSON.parse(jsonStr);
    if (!plan.steps || !Array.isArray(plan.steps)) {
      throw new Error('计划缺少 steps 数组');
    }
    plan.steps.forEach((s, i) => {
      s.id = s.id || `step_${i + 1}`;
      s.status = 'pending';
    });
    return plan;
  } catch (e) {
    // 回退：生成一个简单计划
    return {
      intent: intent,
      steps: [
        { id: 'step_1', description: '分析当前代码', action: 'search', target: activeFile || 'project', detail: '理解现有代码结构', status: 'pending' },
        { id: 'step_2', description: '实现主要变更', action: 'edit_file', target: activeFile || 'main', detail: intent, status: 'pending' },
        { id: 'step_3', description: '验证变更', action: 'run_command', target: 'check', detail: '确认修改正确', status: 'pending' },
      ]
    };
  }
}

// ─── 渲染计划视图 ────────────────────────────────────
function renderPlan() {
  if (!agentPlan) return;
  const planDiv = document.getElementById('agentPlan');

  const stepsHtml = agentPlan.steps.map(s => {
    const statusClass = s.status || 'pending';
    const icon = { pending: '○', running: '◌', done: '✓', error: '✕', skipped: '−' }[statusClass] || '○';
    let actionsHtml = '';
    if (statusClass === 'pending' && agentPlan.steps.indexOf(s) === agentCurrentStep + 1) {
      actionsHtml = `
        <div class="step-action">
          <button class="approve" onclick="approveStep('${s.id}')" title="执行此步骤">▶ 执行</button>
          <button class="reject" onclick="skipStep('${s.id}')" title="跳过此步骤">跳过</button>
        </div>`;
    }
    return `
      <div class="plan-step ${statusClass}" id="plan-step-${s.id}">
        <div class="step-indicator">${icon}</div>
        <div class="step-desc">${escapeHtml(s.description)}</div>
        ${actionsHtml}
      </div>`;
  }).join('');

  planDiv.innerHTML = `
    <div class="plan-intent">🎯 ${escapeHtml(agentPlan.intent)}</div>
    <div class="plan-steps">${stepsHtml}</div>
  `;

  // 显示进度条
  const progressDiv = document.getElementById('agentProgress');
  if (progressDiv && agentPlan.steps.length > 0) {
    progressDiv.style.display = 'block';
    updateAgentProgress();
  }
}

// ─── 执行计划 ────────────────────────────────────────
async function executeAgentPlan() {
  if (!agentPlan || !agentPlan.steps || agentPlan.steps.length === 0) {
    finishAgent('done', '计划为空');
    return;
  }

  for (let i = 0; i < agentPlan.steps.length; i++) {
    if (agentAborted) {
      finishAgent('aborted', '任务已被用户中止');
      return;
    }

    agentCurrentStep = i;
    const step = agentPlan.steps[i];

    // 更新 UI：当前步骤 running
    step.status = 'running';
    renderPlan();
    updateAgentProgress();

    // 显示输出区域
    const outputDiv = document.getElementById('agentOutput');
    outputDiv.style.display = 'block';

    try {
      // 快照（如果是编辑操作）
      if (['edit_file', 'create_file'].includes(step.action)) {
        takeSnapshot(step.target || activeFile);
      }

      // 执行步骤
      const result = await executeStep(step);

      // 显示执行结果
      appendOutput(result.output || `✓ ${step.description} 完成`, 'success');

      step.status = 'done';
      step.result = result;
    } catch (e) {
      appendOutput(`✕ ${e.message}`, 'error');
      step.status = 'error';
      step.result = { error: e.message };

      // 询问是否继续
      renderPlan();
      const shouldContinue = await confirmStep(`步骤 "${step.description}" 执行失败: ${e.message}\n是否继续执行后续步骤？`);
      if (!shouldContinue) {
        finishAgent('error', '执行中止（用户选择停止）');
        return;
      }
    }

    // 步骤间短暂延迟（让用户看到进度）
    if (i < agentPlan.steps.length - 1) {
      await sleep(600);
    }
  }

  // 全部完成
  finishAgent('done', '所有步骤执行完成');
}

// ─── 执行单个步骤 ────────────────────────────────────
async function executeStep(step) {
  const action = step.action;
  const target = step.target || '';
  const detail = step.detail || '';

  switch (action) {
    case 'edit_file': {
      // 让 AI 生成代码修改
      const currentCode = getFileContent(target);
      const prompt = `你是代码编辑器。当前文件: ${target}\n\n当前内容:\n\`\`\`\n${currentCode}\n\`\`\`\n\n任务: ${detail}\n\n请返回修改后的完整文件内容。只返回代码，不要解释。`;
      const newCode = await callAI([{ role: 'user', content: prompt }], { temperature: 0.1, maxTokens: 4096 });
      
      const cleanCode = newCode.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
      
      if (target && findNode(target)) {
        // 文件存在，应用 diff
        showAgentDiffView(target, currentCode, cleanCode, step);
      } else {
        // 文件不存在，直接创建
        applyCodeChange(target, cleanCode);
      }
      
      return { output: `已修改 ${target}`, code: cleanCode };
    }

    case 'create_file': {
      const prompt = `你是代码生成器。创建文件: ${target}\n\n需求: ${detail}\n\n请生成完整的文件内容。只返回代码，不要解释。`;
      const code = await callAI([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 4096 });
      const cleanCode = code.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
      
      createFileFromAgent(target, cleanCode);
      return { output: `已创建 ${target}`, code: cleanCode };
    }

    case 'search': {
      const found = searchInProject(detail);
      const output = found.length > 0
        ? `搜索到 ${found.length} 个相关结果: ${found.join(', ')}`
        : '未找到相关结果';
      return { output, found };
    }

    case 'run_command': {
      // 模拟命令执行
      return { output: `[模拟] 执行: ${detail}\n命令执行完成（浏览器环境模拟）` };
    }

    default:
      return { output: `跳过未知操作: ${action}` };
  }
}

// ─── Agent Diff 视图 ─────────────────────────────────
function showAgentDiffView(filePath, oldCode, newCode, step) {
  // 使用现有的 diff 面板
  pendingDiff = { path: filePath, oldContent: oldCode, newContent: newCode };
  
  const diffOverlay = document.getElementById('diffOverlay');
  const diffContainer = document.getElementById('diffContainer');
  const btnAccept = document.getElementById('btnDiffAccept');
  const btnReject = document.getElementById('btnDiffReject');

  diffContainer.innerHTML = '';
  
  // 创建简单差异视图
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);

  let diffHtml = '<div style="font-family:monospace;font-size:12px;overflow:auto;height:100%;">';
  for (let i = 0; i < maxLen; i++) {
    const oldL = oldLines[i] || '';
    const newL = newLines[i] || '';
    if (oldL === newL) {
      diffHtml += `<div style="padding:1px 8px;color:var(--text-secondary);">  ${escapeHtml(oldL)}</div>`;
    } else {
      if (oldL !== undefined && oldL !== '') {
        diffHtml += `<div style="padding:1px 8px;background:rgba(243,139,168,0.1);color:var(--error);">- ${escapeHtml(oldL)}</div>`;
      }
      if (newL !== undefined && newL !== '') {
        diffHtml += `<div style="padding:1px 8px;background:rgba(166,227,161,0.1);color:var(--success);">+ ${escapeHtml(newL)}</div>`;
      }
    }
  }
  diffHtml += '</div>';

  diffContainer.innerHTML = diffHtml;
  diffOverlay.classList.add('show');

  // 覆盖按钮行为（Agent 模式下）
  return new Promise((resolve) => {
    btnAccept.onclick = () => {
      diffOverlay.classList.remove('show');
      applyCodeChange(filePath, newCode);
      resolve(true);
    };
    btnReject.onclick = () => {
      diffOverlay.classList.remove('show');
      resolve(false);
    };
  });
}

// ─── 快照（用于回滚）─────────────────────────────────
function takeSnapshot(filePath) {
  if (!filePath) return;
  const node = findNode(filePath);
  if (node && node.type === 'file') {
    if (!agentSnapshots[filePath]) {
      agentSnapshots[filePath] = [];
    }
    agentSnapshots[filePath].push(node.content || '');
  }
}

function rollbackAgent() {
  let rolledBack = 0;
  for (const [path, snapshots] of Object.entries(agentSnapshots)) {
    if (snapshots.length > 0) {
      const originalContent = snapshots[0]; // 回到最初版本
      const node = findNode(path);
      if (node && node.type === 'file') {
        node.content = originalContent;
        rolledBack++;
        // 如果文件当前打开，更新编辑器
        if (openFiles.has(path)) {
          const model = editor.getModel();
          if (model) model.setValue(originalContent);
        }
      }
    }
  }
  persistFileSystem();
  renderFileTree();
  if (rolledBack > 0) {
    showToast(`已回滚 ${rolledBack} 个文件`);
  }
  agentSnapshots = {};
}

// ─── 辅助函数 ────────────────────────────────────────
function applyCodeChange(filePath, content) {
  const node = findNode(filePath);
  if (node && node.type === 'file') {
    node.content = content;
    // 更新编辑器
    if (openFiles.has(filePath)) {
      const model = editor.getModel();
      if (model) model.setValue(content);
      openFiles.get(filePath).dirty = false;
      renderTabs();
    }
    persistFileSystem();
    renderFileTree();
  }
}

function createFileFromAgent(filePath, content) {
  const parts = filePath.split('/');
  const fileName = parts.pop();
  const dirPath = parts.join('/') || '/';
  
  const dir = findNode(dirPath);
  if (!dir || dir.type !== 'folder') {
    throw new Error(`目录不存在: ${dirPath}`);
  }
  if (!dir.children) dir.children = {};
  
  const ext = fileName.split('.').pop();
  const langMap = { js: 'javascript', jsx: 'javascriptreact', ts: 'typescript', tsx: 'typescriptreact', py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown', svg: 'svg' };
  
  dir.children[fileName] = {
    name: fileName,
    type: 'file',
    content: content,
    language: langMap[ext] || 'plaintext'
  };
  
  pickFile(filePath);
  renderFileTree();
  persistFileSystem();
}

function getFileContent(filePath) {
  if (!filePath) return '';
  const node = findNode(filePath);
  return node?.content || '';
}

function searchInProject(query) {
  const results = [];
  function walk(node, path) {
    if (node.type === 'file' && node.content && node.content.toLowerCase().includes(query.toLowerCase())) {
      results.push(path);
    }
    if (node.children) {
      for (const [k, v] of Object.entries(node.children)) {
        walk(v, path === '/' ? '/' + k : path + '/' + k);
      }
    }
  }
  if (fileSystem && fileSystem['/']) {
    walk(fileSystem['/'], '/');
  }
  return results;
}

function appendOutput(text, type) {
  const outputDiv = document.getElementById('agentOutput');
  if (!outputDiv) return;
  outputDiv.style.display = 'block';
  const line = document.createElement('div');
  line.className = `output-line ${type || ''}`;
  line.textContent = text;
  outputDiv.appendChild(line);
  outputDiv.scrollTop = outputDiv.scrollHeight;
}

function updateAgentProgress() {
  if (!agentPlan) return;
  const total = agentPlan.steps.length;
  const done = agentPlan.steps.filter(s => s.status === 'done' || s.status === 'skipped').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const fill = document.getElementById('agentProgressFill');
  const text = document.getElementById('agentProgressText');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `进度: ${done}/${total} (${pct}%)`;
}

function finishAgent(status, message) {
  agentActive = false;
  const panel = document.getElementById('agentPanel');
  const summaryDiv = panel?.querySelector('.agent-summary');
  const progressDiv = document.getElementById('agentProgress');
  
  // 更新所有待处理步骤
  if (agentPlan) {
    agentPlan.steps.forEach(s => {
      if (s.status === 'pending') s.status = 'skipped';
    });
  }
  renderPlan();
  if (progressDiv) progressDiv.style.display = 'none';
  
  if (summaryDiv) {
    summaryDiv.style.display = 'block';
    const doneCount = agentPlan?.steps.filter(s => s.status === 'done').length || 0;
    const totalCount = agentPlan?.steps.length || 0;
    const errorCount = agentPlan?.steps.filter(s => s.status === 'error').length || 0;
    
    const statusEmoji = status === 'done' ? '✅' : status === 'aborted' ? '⏹' : '⚠️';
    summaryDiv.innerHTML = `
      <div class="summary-title">${statusEmoji} ${message}</div>
      <div class="summary-detail">完成 ${doneCount}/${totalCount} 步骤${errorCount > 0 ? `，${errorCount} 个错误` : ''}</div>
      <div class="summary-actions">
        <button class="accept" onclick="closeAgent()">关闭</button>
        ${Object.keys(agentSnapshots).length > 0 ? '<button class="rollback" onclick="rollbackAgent(); closeAgent();">↩ 回滚所有变更</button>' : ''}
        <button onclick="retryAgent()">🔄 重试失败步骤</button>
      </div>
    `;
  }
}

function closeAgent() {
  const panel = document.getElementById('agentPanel');
  if (panel) panel.style.display = 'none';
  agentActive = false;
}

function retryAgent() {
  if (!agentPlan) return;
  // 重置失败步骤
  agentPlan.steps.forEach(s => {
    if (s.status === 'error') s.status = 'pending';
  });
  closeAgent();
  startAgentExecution();
}

function startAgentExecution() {
  if (!agentPlan) return;
  const panel = document.getElementById('agentPanel');
  if (panel) panel.style.display = 'block';
  agentActive = true;
  agentAborted = false;
  executeAgentPlan();
}

function abortAgent() {
  agentAborted = true;
  agentActive = false;
  if (agentPlan) {
    agentPlan.steps.forEach(s => {
      if (s.status === 'running') s.status = 'error';
      if (s.status === 'pending') s.status = 'skipped';
    });
  }
  finishAgent('aborted', '任务已被用户中止');
}

function approveStep(stepId) {
  // 跳过手动审批，直接执行
  executeAgentPlan();
}

function skipStep(stepId) {
  if (!agentPlan) return;
  agentPlan.steps.forEach(s => {
    if (s.id === stepId) s.status = 'skipped';
  });
  renderPlan();
  // 继续执行下一步
  executeAgentPlan();
}

async function confirmStep(message) {
  return new Promise((resolve) => {
    appendOutput(`⚠️ ${message}`, 'info');
    // 自动继续，不阻塞
    resolve(true);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Chat 集成：识别 /agent 命令 ─────────────────────
function startAgentFromChat(intent) {
  if (!intent || intent.length < 5) {
    showToast('请提供更详细的任务描述');
    return;
  }
  if (!settings.apiEndpoint || !settings.apiKey) {
    showToast('请先在设置中配置 AI API');
    return;
  }
  startAgent(intent);
}

// 导出给全局使用
window.startAgent = startAgent;
window.startAgentFromChat = startAgentFromChat;
window.abortAgent = abortAgent;
window.approveStep = approveStep;
window.skipStep = skipStep;
window.rollbackAgent = rollbackAgent;
window.closeAgent = closeAgent;
window.retryAgent = retryAgent;
window.initAgentUI = initAgentUI;
