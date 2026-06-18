// ============================================================
// 聊天面板 UI — 整合 AI、Agent、Composer、上下文引用
// ============================================================
import { useChatStore, useUIStore, useEditorStore, useAISettingsStore, useFilesStore, useModelStore, useAgentStore, useComposerStore } from '../core/stores';
import { callAIStream, createAISignal, abortActiveRequest } from '../core/ai';
import { runAgent } from '../core/agent-tools';
import { getEditor, openFileTab, setEditorContent } from '../core/editor';
import { getLanguageFromPath, saveFile, loadAllFiles } from '../core/files';
import { buildSmartContext } from '../core/context';
import { getDependencyFiles } from '../core/context';
import { searchRAGAsync, getRAGIndex, rebuildRAGIndex, rebuildRAGIndexWithEmbeddings } from '../core/rag';
import { bus } from '../core/event-bus';
import type { ChatMessage, CodeBlock, ModelConfig, ComposerChange, FileEntry } from '../types';

// ─── EventBus: apply code from AI ──────────────────────
bus.on('chat:apply-code', (data: { code: string }) => {
  applyCodeToEditor(data.code);
});

let pendingImages: string[] = [];

// ─── Parse code blocks from markdown ───────────────────────
function parseCodeBlocks(text: string): { html: string; blocks: CodeBlock[] } {
  const blocks: CodeBlock[] = [];
  let html = text;
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    const lang = match[1] || 'plaintext';
    const code = match[2];
    blocks.push({ language: lang, code, applied: false });
    const blockHtml = `<pre><span class="lang-tag">${lang}</span><button class="copy-btn" data-idx="${idx}">复制</button><code>${escapeHtml(code)}</code></pre>`;
    html = html.replace(match[0], blockHtml);
    idx++;
  }

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  return { html, blocks };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Render message ────────────────────────────────────────
export function renderChatMessages(): void {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const messages = useChatStore.getState().messages;
  let html = '';

  for (const msg of messages) {
    const avatarMap: Record<string, string> = { user: '👤', ai: '🤖', error: '⚠️', system: '📢' };
    const avatar = avatarMap[msg.role] || '💬';
    const { html: contentHtml, blocks } = parseCodeBlocks(msg.content);

    html += `<div class="chat-message ${msg.role}">
      <div class="avatar">${avatar}</div>
      <div class="content">${contentHtml}</div>
    </div>`;

    // Add apply buttons for code blocks
    if (msg.role === 'ai' && blocks.length > 0) {
      html += `<div class="chat-message ai">
        <div class="avatar"></div>
        <div class="content">
          <div class="actions-row">
            ${blocks.map((b, i) =>
              `<button class="apply" onclick="window._applyCode?.(${i}, \`${b.code.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">应用代码块 ${i + 1}</button>`
            ).join('')}
          </div>
        </div>
      </div>`;
    }
  }

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// ─── Streaming-optimized incremental render ─────────────────
// Instead of rebuilding all HTML on every token, only update the last message's content div.
// Throttled to ~50ms to avoid jank during fast streaming.

let _streamRenderTimer: ReturnType<typeof setTimeout> | null = null;
let _streamPendingContent: string | null = null;
const STREAM_THROTTLE_MS = 50;

/** Call from streaming onChunk for incremental DOM updates */
export function renderChatMessagesStream(content: string): void {
  _streamPendingContent = content;

  if (_streamRenderTimer) return; // already scheduled
  _streamRenderTimer = setTimeout(() => {
    _streamRenderTimer = null;
    const text = _streamPendingContent;
    _streamPendingContent = null;
    if (text === null) return;

    const container = document.getElementById('chatMessages');
    if (!container) return;

    // Try incremental: find the last AI message and update its content div
    const messages = container.querySelectorAll('.chat-message.ai');
    const lastMsg = messages[messages.length - 1];
    if (lastMsg) {
      const contentDiv = lastMsg.querySelector('.content');
      if (contentDiv) {
        const { html: contentHtml } = parseCodeBlocks(text);
        contentDiv.innerHTML = contentHtml;
        container.scrollTop = container.scrollHeight;
        return;
      }
    }

    // Fallback: full render
    renderChatMessages();
  }, STREAM_THROTTLE_MS);
}

/** Force-flush any pending stream render and do a final full render */
export function renderChatMessagesFinal(): void {
  if (_streamRenderTimer) {
    clearTimeout(_streamRenderTimer);
    _streamRenderTimer = null;
    _streamPendingContent = null;
  }
  renderChatMessages();
}

// ─── Send message ──────────────────────────────────────────
/** Update the "Context" UI showing recommended files for the current file */
export function updateChatContext(): void {
  const contextDiv = document.getElementById('chatContext') as HTMLElement | null;
  const filesDiv = document.getElementById('contextFiles') as HTMLElement | null;
  if (!contextDiv || !filesDiv) return;

  const editorStore = useEditorStore.getState();
  const activePath = editorStore.activeFilePath;
  if (!activePath) {
    contextDiv.style.display = 'none';
    return;
  }

  // Get dependency files
  const deps = getDependencyFiles(activePath, 2);
  if (deps.length === 0) {
    contextDiv.style.display = 'none';
    return;
  }

  // Render context files
  contextDiv.style.display = '';
  filesDiv.innerHTML = deps.slice(0, 5).map((f) => {
    const name = f.split('/').pop() || f;
    return `<span class="context-file" data-path="${f}" title="${f}">${name}</span>`;
  }).join('');

  // Add click handlers
  filesDiv.querySelectorAll('.context-file').forEach((el) => {
    el.addEventListener('click', () => {
      const path = (el as HTMLElement).dataset.path;
      if (path) openFileTab(path);
    });
  });
}

export async function sendChatMessage(): Promise<void> {
  const input = document.getElementById('chatInput') as HTMLTextAreaElement;
  if (!input) return;

  const text = input.value.trim();
  const store = useChatStore.getState();
  if (!text || store.isLoading) return;

  input.value = '';
  input.style.height = 'auto';

  // Check for Agent/Composer mode
  if (text.startsWith('/agent ')) {
    const intent = text.replace('/agent ', '').trim();
    addUserMessage(text);
    await startAgentFromChat(intent);
    return;
  }
  if (text.startsWith('/composer ')) {
    const request = text.replace('/composer ', '').trim();
    addUserMessage(text);
    await startComposerFromChat(request);
    return;
  }

  addUserMessage(text);
  store.setLoading(true);
  toggleSendStopButton(true);

  // Create abort signal for this request
  const signal = createAISignal();

  // Get pending images from global state
  pendingImages = window.__pendingImages || [];
  window.__pendingImages = [];
  window._clearImages?.();

  // Build context with model
  const modelStore = useModelStore.getState();
  const context = await getChatContext(text);

  // RAG: semantic search for relevant code snippets
  let ragContext = '';
  try {
    ragContext = await searchRAGAsync(text, 3);
  } catch {
    // RAG index not built yet, skip
  }

  // Build messages with image support
  const userContent: any[] = [{ type: 'text', text: text }];
  if (pendingImages.length > 0) {
    pendingImages.forEach((img) => userContent.push({ type: 'image_url', image_url: { url: img } }));
  }

  const systemContent = `You are an AI programming assistant in AI Code Editor v3.0. Be helpful, concise. ${context ? 'Context:\\n' + context : ''}${ragContext}`;
  const messages = [
    { role: 'system', content: systemContent },
    ...useChatStore.getState().messages
      .filter((m) => m.role === 'user' || m.role === 'ai')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: pendingImages.length > 0 ? userContent : text },
  ];

  // Add loading placeholder
  store.addMessage({
    id: Date.now().toString(),
    role: 'ai',
    content: '',
    timestamp: Date.now(),
  });
  renderChatMessages();

  // Stream response
  await callAIStream(
    messages,
    (chunk) => {
      const msgs = useChatStore.getState().messages;
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'ai') {
        msgs[msgs.length - 1].content += chunk;
        // Incremental render: only update the last message content
        renderChatMessagesStream(msgs[msgs.length - 1].content);
      }
    },
    { signal }
  );

  // Final full render to process code blocks and action buttons
  renderChatMessagesFinal();
  store.setLoading(false);
  toggleSendStopButton(false);
}

function addUserMessage(text: string): void {
  useChatStore.getState().addMessage({
    id: Date.now().toString(),
    role: 'user',
    content: text,
    timestamp: Date.now(),
  });
}

async function getChatContext(userQuery?: string): Promise<string> {
  // Use smart multi-file context with token budget + RAG
  return buildSmartContext(4000, userQuery);
}

// ─── Quick hints ───────────────────────────────────────────
export function sendHint(hint: string): void {
  const input = document.getElementById('chatInput') as HTMLTextAreaElement;
  if (!input) return;
  input.value = hint;
  sendChatMessage();
}

// ─── Code apply ────────────────────────────────────────────
export function applyCodeToEditor(code: string): void {
  const editor = getEditor();
  if (!editor) return;
  editor.setValue(code);
  // Mark dirty
  const active = useEditorStore.getState().activeFile;
  if (active) useEditorStore.getState().markDirty(active);
}

// ─── Agent from chat (REAL implementation) ────────────────
async function startAgentFromChat(intent: string): Promise<void> {
  const store = useChatStore.getState();
  const agentStore = useAgentStore.getState();
  store.setLoading(true);
  agentStore.setRunning(true);
  toggleSendStopButton(true);

  // Create AI message placeholder
  const aiMsgId = Date.now().toString();
  store.addMessage({
    id: aiMsgId,
    role: 'ai',
    content: `**🤖 Agent 模式启动**\n\n🎯 任务: ${intent}\n\n⏳ 正在分析...`,
    timestamp: Date.now(),
  });
  renderChatMessages();

  await runAgent(
    intent,
    (step) => {
      const msgs = useChatStore.getState().messages;
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'ai') {
        last.content += '\n' + step;
        renderChatMessages();
      }
    },
    (summary) => {
      const msgs = useChatStore.getState().messages;
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'ai') {
        last.content += '\n\n---\n\n📊 **执行总结**\n\n' + summary;
        renderChatMessages();
      }
      store.setLoading(false);
      agentStore.setRunning(false);
      toggleSendStopButton(false);

      // Refresh file tree if files were created
      import('../main').then((m) => {
        loadAllFiles(useFilesStore.getState().files).then(() => {
          // Trigger file tree refresh
          const tree = document.getElementById('fileTree');
          if (tree) {
            const files = useFilesStore.getState().files;
            const entries = Array.from(files.entries()).map(([path, entry]) => ({ path, ...entry }));
            entries.sort((a, b) => a.path.localeCompare(b.path));
            window.__refreshFileTree?.();
          }
        });
      });
    }
  );
}

// ─── Composer from chat (REAL implementation) ─────────────
async function startComposerFromChat(request: string): Promise<void> {
  const store = useChatStore.getState();
  const composerStore = useComposerStore.getState();
  const aiSettings = useAISettingsStore.getState() as any;
  store.setLoading(true);
  toggleSendStopButton(true);

  if (!aiSettings.endpoint || !aiSettings.apiKey) {
    store.addMessage({
      id: Date.now().toString(),
      role: 'ai',
      content: '⚠ **Composer 模式需要配置 AI API**\n\n请在设置中配置 API 端点和 Key，然后重试。',
      timestamp: Date.now(),
    });
    store.setLoading(false);
    toggleSendStopButton(false);
    renderChatMessages();
    return;
  }

  // Collect all file contents
  const files = useFilesStore.getState().files;
  const fileList = Array.from(files.entries())
    .map(([path, entry]) => `### ${path}\n\`\`\`\n${entry.content}\n\`\`\``)
    .join('\n\n');

  const aiMsgId = Date.now().toString();
  store.addMessage({
    id: aiMsgId,
    role: 'ai',
    content: `**📝 Composer 模式启动**\n\n需求: ${request}\n\n⏳ 正在分析项目文件并生成变更计划...`,
    timestamp: Date.now(),
  });
  renderChatMessages();

  const messages = [
    {
      role: 'system',
      content: `You are a multi-file code editing assistant. Given the user's request and the current state of all project files, generate a plan for changes across multiple files.

Respond in this EXACT format:
\`\`\`plan
{
  "summary": "Brief summary of what will be changed",
  "changes": [
    {
      "filePath": "path/to/file",
      "description": "What changed and why",
      "newContent": "The complete new content of the file"
    }
  ]
}
\`\`\`

IMPORTANT: 
- Include THE COMPLETE file content in newContent, not just diffs
- Only include files that need to be changed
- Be thorough but practical
- Make sure the changes are consistent across files`,
    },
    {
      role: 'user',
      content: `Project files:\n\n${fileList}\n\nUser request: ${request}\n\nGenerate a multi-file change plan.`,
    },
  ];

  let fullResponse = '';

  try {
    await callAIStream(
      messages,
      (chunk) => {
        fullResponse += chunk;
        const msgs = useChatStore.getState().messages;
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'ai') {
          // Don't show raw streaming for composer - just update at the end
        }
      }
    );

    // Parse the plan JSON
    const planMatch = fullResponse.match(/```plan\s*\n([\s\S]*?)\n```/);
    if (planMatch) {
      try {
        const plan = JSON.parse(planMatch[1]);
        const changes: ComposerChange[] = (plan.changes || []).map((c: any) => ({
          filePath: c.filePath,
          originalContent: useFilesStore.getState().files.get(c.filePath)?.content || '',
          newContent: c.newContent || '',
          status: 'pending' as const,
          description: c.description || '',
        }));

        composerStore.setPlan({
          id: Date.now().toString(),
          request,
          changes,
          status: 'reviewing',
        });

        // Render the plan as a rich message
        const planHtml = buildComposerPlanHtml(changes);
        const msgs = useChatStore.getState().messages;
        if (msgs.length > 0 && msgs[msgs.length - 1].role === 'ai') {
          msgs[msgs.length - 1].content =
            `**📝 Composer 变更计划**\n\n${plan.summary || '以下是建议的文件变更：'}\n\n` + planHtml;
          renderChatMessages();
        }

        // Attach click handlers for accept/reject
        setTimeout(() => {
          changes.forEach((change, i) => {
            const acceptBtn = document.getElementById(`composer-accept-${i}`);
            const rejectBtn = document.getElementById(`composer-reject-${i}`);
            acceptBtn?.addEventListener('click', () => applyComposerChange(i));
            rejectBtn?.addEventListener('click', () => rejectComposerChange(i));
          });
          const applyAllBtn = document.getElementById('composer-apply-all');
          applyAllBtn?.addEventListener('click', applyAllComposerChanges);
          const rejectAllBtn = document.getElementById('composer-reject-all');
          rejectAllBtn?.addEventListener('click', rejectAllComposerChanges);
        }, 50);

      } catch (e) {
        throw new Error('Failed to parse AI response plan');
      }
    } else {
      // Show raw response as fallback
      const msgs = useChatStore.getState().messages;
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'ai') {
        msgs[msgs.length - 1].content = `**📝 Composer 结果**\n\n${fullResponse}`;
        renderChatMessages();
      }
    }
  } catch (err: any) {
    const msgs = useChatStore.getState().messages;
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'ai') {
      msgs[msgs.length - 1].content = `❌ **Composer 执行失败**: ${err.message}`;
      renderChatMessages();
    }
  }

  store.setLoading(false);
  toggleSendStopButton(false);
}

function buildComposerPlanHtml(changes: ComposerChange[]): string {
  const totalFiles = changes.length;
  const additions = changes.reduce((sum, c) => sum + (c.newContent.length - c.originalContent.length), 0);
  const changeItems = changes
    .map(
      (c, i) =>
        `<div class="composer-change-item" id="composer-item-${i}" style="margin:8px 0;padding:10px;border:0.5px solid var(--border-color);border-radius:8px;background:var(--bg-secondary)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-weight:500;font-family:monospace;font-size:12px">📄 ${escapeHtml(c.filePath)}</span>
        <div>
          <button id="composer-accept-${i}" style="background:var(--success);color:white;border:none;padding:2px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">✓ 接受</button>
          <button id="composer-reject-${i}" style="background:var(--error);color:white;border:none;padding:2px 10px;border-radius:4px;cursor:pointer;font-size:11px">✕ 拒绝</button>
        </div>
      </div>
      <p style="margin:0;font-size:11px;color:var(--text-secondary)">${escapeHtml(c.description || '修改此文件')}</p>
      <div style="margin-top:6px;font-size:11px;color:var(--text-secondary)">
        ${c.originalContent.length} → ${c.newContent.length} 字符
        (${additions > 0 ? '+' : ''}${c.newContent.length - c.originalContent.length})
      </div>
    </div>`
    )
    .join('');

  return `<div class="composer-plan" style="margin:8px 0">
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">
      ${totalFiles} 个文件变更
    </div>
    ${changeItems}
    <div style="display:flex;gap:6px;margin-top:8px">
      <button id="composer-apply-all" style="flex:1;background:var(--success);color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px">
        🚀 全部应用 (${totalFiles} 个文件)
      </button>
      <button id="composer-reject-all" style="flex:1;background:var(--error);color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px">
        ✕ 全部拒绝
      </button>
    </div>
  </div>`;
}

async function applyComposerChange(index: number): Promise<void> {
  const plan = useComposerStore.getState().plan;
  if (!plan) return;

  const change = plan.changes[index];
  if (!change) return;

  // Apply the change
  const file: FileEntry = {
    path: change.filePath,
    content: change.newContent,
    language: getLanguageFromPath(change.filePath),
    updatedAt: Date.now(),
  };
  useFilesStore.getState().setFile(file);
  await saveFile(file);

  // Update status
  useComposerStore.getState().updateChange(change.filePath, 'accepted');

  // Update UI
  const item = document.getElementById(`composer-item-${index}`);
  if (item) {
    item.style.borderLeft = '3px solid var(--success)';
    const btns = item.querySelectorAll('button');
    btns.forEach((b) => (b as HTMLButtonElement).disabled = true);
  }

  // Open the file in editor
  if (useEditorStore.getState().activeFile === change.filePath) {
    const editor = getEditor();
    if (editor) editor.setValue(change.newContent);
  }

  import('../main').then((m) => m.showToast(`已应用: ${change.filePath}`));
}

function rejectComposerChange(index: number): void {
  const plan = useComposerStore.getState().plan;
  if (!plan) return;

  const change = plan.changes[index];
  if (!change) return;

  useComposerStore.getState().updateChange(change.filePath, 'rejected');

  const item = document.getElementById(`composer-item-${index}`);
  if (item) {
    item.style.borderLeft = '3px solid var(--error)';
    item.style.opacity = '0.6';
    const btns = item.querySelectorAll('button');
    btns.forEach((b) => (b as HTMLButtonElement).disabled = true);
  }
}

async function applyAllComposerChanges(): Promise<void> {
  const plan = useComposerStore.getState().plan;
  if (!plan) return;

  for (let i = 0; i < plan.changes.length; i++) {
    if (plan.changes[i].status === 'pending') {
      await applyComposerChange(i);
    }
  }

  import('../main').then((m) =>
    m.showToast(`已应用 ${plan.changes.filter((c) => c.status !== 'rejected').length} 个文件变更`)
  );

  // Refresh file tree
  import('../core/files').then(({ loadAllFiles }) => {
    loadAllFiles(useFilesStore.getState().files);
  });
}

async function rejectAllComposerChanges(): Promise<void> {
  const plan = useComposerStore.getState().plan;
  if (!plan) return;

  for (let i = 0; i < plan.changes.length; i++) {
    if (plan.changes[i].status === 'pending') {
      rejectComposerChange(i);
    }
  }

  import('../main').then((m) =>
    m.showToast(`已拒绝 ${plan.changes.length} 个文件变更`)
  );
}

// ─── Toggle panel ──────────────────────────────────────────
function toggleSendStopButton(isLoading: boolean): void {
  const btnSend = document.getElementById('btnSend');
  const btnStop = document.getElementById('btnStop');
  if (btnSend) btnSend.style.display = isLoading ? 'none' : '';
  if (btnStop) btnStop.style.display = isLoading ? '' : 'none';
}

export function cancelChatRequest(): void {
  abortActiveRequest();
  useChatStore.getState().setLoading(false);
  toggleSendStopButton(false);
  import('../main').then((m) => m.showToast('已停止生成'));
}
export function toggleChat(): void {
  const store = useUIStore.getState();
  store.toggleChat();
  const panel = document.getElementById('chatPanel');
  if (panel) panel.classList.toggle('collapsed', store.chatCollapsed);
  if (!store.chatCollapsed) {
    setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
    updateChatContext();
  }
}

export function clearChat(): void {
  useChatStore.getState().clearMessages();
  renderChatMessages();
}

// ─── Export global handles ─────────────────────────────────
// Delegate to EventBus for decoupling (HTML onclick compatibility)
window._applyCode = (code: string) => bus.emit('chat:apply-code', { code });
