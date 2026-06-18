// ============================================================
// Undo Timeline — 撤销/重做可视化编辑历史
// ============================================================
import { getEditor } from '../core/editor';
import { bus } from '../core/event-bus';

interface TimelineEntry {
  id: number;
  action: string;
  detail: string;
  timestamp: number;
  cursorLine: number;
  cursorColumn: number;
  isCurrent: boolean;
  isFuture: boolean;
}

let timelineEntries: TimelineEntry[] = [];
let nextId = 1;
let currentIndex = -1;
let isRecording = false;
let lastSnapshot = '';
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Recording ────────────────────────────────────────────
export function startTimelineRecording(): void {
  if (isRecording) return;
  isRecording = true;

  const editor = getEditor();
  if (!editor) return;

  lastSnapshot = editor.getValue();
  addTimelineEntry('初始状态', '编辑器就绪');

  // Listen for content changes
  editor.onDidChangeModelContent(() => {
    scheduleSnapshot();
  });

  // Listen for cursor changes
  editor.onDidChangeCursorPosition((e) => {
    // Track significant cursor movements
  });
}

export function stopTimelineRecording(): void {
  isRecording = false;
  if (snapshotTimer) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
}

function scheduleSnapshot(): void {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => {
    takeSnapshot();
  }, 500); // Debounce 500ms
}

function takeSnapshot(): void {
  const editor = getEditor();
  if (!editor) return;

  const currentContent = editor.getValue();
  if (currentContent === lastSnapshot) return;

  const position = editor.getPosition();
  const model = editor.getModel();
  const lineCount = model?.getLineCount() || 0;

  // Detect action type
  let action = '编辑';
  const diff = currentContent.length - lastSnapshot.length;

  if (diff > 20) action = '粘贴内容';
  else if (diff > 0) action = '输入文本';
  else if (diff < -20) action = '删除内容';
  else if (diff < 0) action = '删除文本';

  addTimelineEntry(action, `${lineCount} 行`, position?.lineNumber, position?.column);

  lastSnapshot = currentContent;

  // Cap timeline to prevent memory issues
  if (timelineEntries.length > 200) {
    timelineEntries = timelineEntries.slice(-150);
    // Re-index
    timelineEntries.forEach((e, i) => {
      e.id = nextId - timelineEntries.length + i;
    });
  }
}

function addTimelineEntry(
  action: string,
  detail: string,
  cursorLine?: number,
  cursorColumn?: number,
): void {
  // Remove future entries (if we were in an undone state)
  if (currentIndex < timelineEntries.length - 1) {
    timelineEntries = timelineEntries.slice(0, currentIndex + 1);
  }

  // Mark all previous as not current
  timelineEntries.forEach((e) => (e.isCurrent = false));

  const entry: TimelineEntry = {
    id: nextId++,
    action,
    detail,
    timestamp: Date.now(),
    cursorLine: cursorLine || 1,
    cursorColumn: cursorColumn || 1,
    isCurrent: true,
    isFuture: false,
  };

  timelineEntries.push(entry);
  currentIndex = timelineEntries.length - 1;

  // Update panel if visible
  if (document.getElementById('timelinePanel')?.classList.contains('show')) {
    renderTimeline();
  }
}

// ─── Show/Hide Timeline Panel ─────────────────────────────
export function showTimelinePanel(): void {
  const panel = document.getElementById('timelinePanel');
  if (!panel) return;

  panel.classList.add('show');
  renderTimeline();

  document.getElementById('btnCloseTimeline')?.addEventListener('click', hideTimelinePanel);
}

export function hideTimelinePanel(): void {
  const panel = document.getElementById('timelinePanel');
  if (panel) panel.classList.remove('show');
}

export function toggleTimelinePanel(): void {
  const panel = document.getElementById('timelinePanel');
  if (!panel) return;

  if (panel.classList.contains('show')) {
    hideTimelinePanel();
  } else {
    showTimelinePanel();
  }
}

// ─── Render Timeline ──────────────────────────────────────
function renderTimeline(): void {
  const body = document.getElementById('timelineBody');
  if (!body) return;

  if (timelineEntries.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;">
        <div style="font-size:32px;margin-bottom:8px;opacity:0.3;">⏱</div>
        <p>还没有编辑历史</p>
        <p style="font-size:11px;margin-top:4px;">开始编辑代码后，编辑历史会显示在这里</p>
      </div>
    `;
    return;
  }

  // Show entries in reverse (newest first)
  const entries = [...timelineEntries].reverse();

  body.innerHTML = entries
    .map((entry) => {
      const isCurrent = entry.id === timelineEntries[currentIndex]?.id;
      const isFuture = entry.id > (timelineEntries[currentIndex]?.id || 0);
      const time = formatTime(entry.timestamp);

      return `
      <div class="timeline-item${isCurrent ? ' current' : ''}${isFuture ? ' future' : ''}"
           data-timeline-id="${entry.id}">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-action">${entry.action}</div>
          <div class="timeline-detail">${escapeHtml(entry.detail)} · 行 ${entry.cursorLine}:${entry.cursorColumn}</div>
          <div class="timeline-time">${time}</div>
        </div>
      </div>`;
    })
    .join('');

  // Wire clicks to jump to entry
  body.querySelectorAll('.timeline-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = parseInt((item as HTMLElement).dataset.timelineId || '0');
      jumpToTimelineEntry(id);
    });
  });
}

// ─── Jump to timeline entry ───────────────────────────────
function jumpToTimelineEntry(id: number): void {
  const entry = timelineEntries.find((e) => e.id === id);
  if (!entry) return;

  const editor = getEditor();
  if (!editor) return;

  // Move cursor to the recorded position
  editor.setPosition({ lineNumber: entry.cursorLine, column: entry.cursorColumn });
  editor.revealLineInCenter(entry.cursorLine);
  editor.focus();

  // Update current state
  timelineEntries.forEach((e) => {
    e.isCurrent = e.id === id;
    e.isFuture = e.id > id;
  });
  currentIndex = timelineEntries.findIndex((e) => e.id === id);

  renderTimeline();
}

// ─── Clear timeline ───────────────────────────────────────
export function clearTimeline(): void {
  timelineEntries = [];
  nextId = 1;
  currentIndex = -1;
  renderTimeline();
}

// ─── Utility ──────────────────────────────────────────────
function formatTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Initialize ───────────────────────────────────────────
// Auto-start recording when module loaded
setTimeout(() => {
  const editor = getEditor();
  if (editor) {
    startTimelineRecording();
  }
}, 2000);
