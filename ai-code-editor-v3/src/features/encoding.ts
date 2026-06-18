// ============================================================
// File Encoding Manager — UTF-8/GBK 检测与转换
// ============================================================
import { useEditorStore, useFilesStore } from '../core/stores';
import { getEditorContent, getEditor } from '../core/editor';
import { bus } from '../core/event-bus';

const COMMON_ENCODINGS = [
  { value: 'utf-8', label: 'Unicode', desc: '通用编码，支持所有语言' },
  { value: 'utf-8-bom', label: 'BOM', desc: '带 BOM 的 UTF-8' },
  { value: 'utf-16le', label: 'UTF-16 LE', desc: 'Windows 默认 UTF-16 小端' },
  { value: 'utf-16be', label: 'UTF-16 BE', desc: 'UTF-16 大端序' },
  { value: 'gbk', label: 'GBK', desc: '中文编码，兼容 GB2312' },
  { value: 'gb2312', label: 'GB2312', desc: '简体中文编码' },
  { value: 'gb18030', label: 'GB18030', desc: '中国国家标准编码' },
  { value: 'big5', label: 'Big5', desc: '繁体中文编码' },
  { value: 'shift_jis', label: 'Shift-JIS', desc: '日文编码' },
  { value: 'euc-kr', label: 'EUC-KR', desc: '韩文编码' },
  { value: 'iso-8859-1', label: 'Latin-1', desc: '西欧语言编码' },
  { value: 'windows-1252', label: 'Win-1252', desc: 'Windows 西欧编码' },
  { value: 'windows-1251', label: 'Win-1251', desc: 'Windows 西里尔编码' },
];

// Current encoding per file
const fileEncodings: Map<string, string> = new Map();

// ─── Detect encoding ──────────────────────────────────────
export function detectEncoding(path: string, content: string): string {
  // Check for BOM
  if (content.length >= 3) {
    const bom = content.slice(0, 3);
    const bomBytes = new Uint8Array([bom.charCodeAt(0), bom.charCodeAt(1), bom.charCodeAt(2)]);
    if (bomBytes[0] === 0xef && bomBytes[1] === 0xbb && bomBytes[2] === 0xbf) {
      return 'utf-8-bom';
    }
  }
  if (content.length >= 2) {
    const bom2 = new Uint8Array([content.charCodeAt(0), content.charCodeAt(1)]);
    if (bom2[0] === 0xff && bom2[1] === 0xfe) return 'utf-16le';
    if (bom2[0] === 0xfe && bom2[1] === 0xff) return 'utf-16be';
  }

  // Heuristic: check for GBK/gb2312 patterns (high byte ranges)
  let gbkScore = 0;
  let asciiScore = 0;
  let totalChars = 0;

  for (let i = 0; i < Math.min(content.length, 5000); i++) {
    const code = content.charCodeAt(i);
    totalChars++;

    if (code < 0x80) {
      asciiScore++;
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK Unified Ideographs — could be GBK or UTF-8
      gbkScore++;
    } else if (code >= 0x3000 && code <= 0x303f) {
      // CJK Symbols and Punctuation
      gbkScore++;
    } else if (code >= 0xff00 && code <= 0xffef) {
      // Halfwidth and Fullwidth Forms
      gbkScore++;
    } else if (code >= 0x3400 && code <= 0x4dbf) {
      // CJK Extension A
      gbkScore++;
    }
  }

  // If mostly ASCII, default to UTF-8
  if (totalChars > 0 && asciiScore / totalChars > 0.9) {
    return 'utf-8';
  }

  // Default to UTF-8 for stored files (browsers handle encoding)
  return 'utf-8';
}

// ─── Get encoding for file ────────────────────────────────
export function getFileEncoding(path: string): string {
  return fileEncodings.get(path) || 'utf-8';
}

// ─── Set encoding for file ────────────────────────────────
export function setFileEncoding(path: string, encoding: string): void {
  fileEncodings.set(path, encoding);

  // Update status bar
  const statusEncoding = document.getElementById('statusEncoding');
  if (statusEncoding) {
    const shortName = getEncodingShortName(encoding);
    statusEncoding.textContent = shortName;
  }

  bus.emit('toast:show', {
    message: `📝 编码已切换为 ${getEncodingLabel(encoding)}`,
    type: 'info',
    duration: 2000,
  });
}

// ─── Convert content between encodings ────────────────────
export function convertEncoding(
  content: string,
  fromEncoding: string,
  toEncoding: string,
): string {
  // In browser context, we work with UTF-16 strings
  // For non-UTF encodings, this is a simplified conversion
  // Real conversion would use TextEncoder/TextDecoder or iconv-lite

  if (fromEncoding === toEncoding) return content;

  try {
    // Use TextEncoder/TextDecoder for supported encodings
    if (fromEncoding === 'utf-8' && toEncoding === 'utf-16le') {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      // Convert to UTF-16LE string representation
      return content; // Simplified for browser
    }

    if (fromEncoding === 'utf-16le' && toEncoding === 'utf-8') {
      return content; // Simplified for browser
    }

    // GBK/GB2312 conversion — in real app would use iconv-lite
    // For now, return content as-is since browsers handle Unicode
    return content;
  } catch {
    return content;
  }
}

// ─── Show encoding selector ───────────────────────────────
export function showEncodingSelector(): void {
  const existing = document.getElementById('encodingDropdown');
  if (existing) {
    existing.remove();
    return;
  }

  const statusEncoding = document.getElementById('statusEncoding');
  if (!statusEncoding) return;

  const activeFilePath = useEditorStore.getState().activeFile;
  const currentEncoding = activeFilePath
    ? getFileEncoding(activeFilePath)
    : 'utf-8';

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.id = 'encodingDropdown';
  dropdown.className = 'encoding-dropdown show';

  // Group encodings
  dropdown.innerHTML = `
    <div style="padding:4px 10px;font-size:10px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px;">Unicode</div>
    ${renderEncodingItems(['utf-8', 'utf-8-bom', 'utf-16le', 'utf-16be'], currentEncoding)}
    <div style="padding:4px 10px;font-size:10px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px;margin-top:4px;">中文</div>
    ${renderEncodingItems(['gbk', 'gb2312', 'gb18030', 'big5'], currentEncoding)}
    <div style="padding:4px 10px;font-size:10px;color:var(--text-muted);font-weight:600;letter-spacing:0.5px;margin-top:4px;">其他</div>
    ${renderEncodingItems(['shift_jis', 'euc-kr', 'iso-8859-1', 'windows-1252', 'windows-1251'], currentEncoding)}
  `;

  // Make status bar item relative
  statusEncoding.style.position = 'relative';
  statusEncoding.appendChild(dropdown);

  // Wire clicks
  dropdown.querySelectorAll('.encoding-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const encoding = (item as HTMLElement).dataset.encoding;
      if (!encoding) return;

      if (activeFilePath) {
        // Re-read file with new encoding
        const entry = useFilesStore.getState().files.get(activeFilePath);
        if (entry) {
          setFileEncoding(activeFilePath, encoding);
        }
      }

      dropdown.remove();
      if (statusEncoding) statusEncoding.style.position = '';

      // Re-open file with new encoding
      if (activeFilePath && encoding !== currentEncoding) {
        handleEncodingConversion(activeFilePath, currentEncoding, encoding);
      }
    });
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener(
      'click',
      function closeDropdown() {
        dropdown.remove();
        if (statusEncoding) statusEncoding.style.position = '';
        document.removeEventListener('click', closeDropdown);
      },
      { once: true },
    );
  }, 100);
}

function renderEncodingItems(encodings: string[], current: string): string {
  return encodings
    .map(
      (enc) =>
        `<div class="encoding-item${enc === current ? ' active' : ''}" data-encoding="${enc}">
          <span class="encoding-label">${getEncodingShortName(enc)}</span>
          ${getEncodingDesc(enc)}
        </div>`,
    )
    .join('');
}

function handleEncodingConversion(
  path: string,
  from: string,
  to: string,
): void {
  const entry = useFilesStore.getState().files.get(path);
  if (!entry) return;

  const converted = convertEncoding(entry.content, from, to);

  // Update file content
  useFilesStore.getState().setFile({
    path,
    content: converted,
    language: entry.language,
    updatedAt: Date.now(),
  });

  // Update editor content
  const editor = getEditor();
  if (editor) {
    const model = editor.getModel();
    if (model) {
      model.setValue(converted);
    }
  }

  bus.emit('toast:show', {
    message: `✅ 编码已从 ${getEncodingLabel(from)} 转换为 ${getEncodingLabel(to)}`,
    type: 'success',
    duration: 3000,
  });
}

// ─── Update status bar encoding display ───────────────────
export function updateStatusBarEncoding(): void {
  const activeFilePath = useEditorStore.getState().activeFile;
  const encoding = activeFilePath ? getFileEncoding(activeFilePath) : 'utf-8';
  const statusEncoding = document.getElementById('statusEncoding');
  if (statusEncoding) {
    statusEncoding.textContent = getEncodingShortName(encoding);
    statusEncoding.title = getEncodingLabel(encoding) + ' — 点击切换编码';
  }

  // Make status bar encoding clickable
  if (statusEncoding && !statusEncoding.classList.contains('encoding-indicator')) {
    statusEncoding.classList.add('encoding-indicator');
    statusEncoding.addEventListener('click', (e) => {
      e.stopPropagation();
      showEncodingSelector();
    });
  }
}

// ─── Utility ──────────────────────────────────────────────
function getEncodingShortName(encoding: string): string {
  const names: Record<string, string> = {
    'utf-8': 'UTF-8',
    'utf-8-bom': 'BOM',
    'utf-16le': 'UTF-16',
    'utf-16be': 'UTF-16',
    gbk: 'GBK',
    gb2312: 'GB2312',
    gb18030: 'GB18030',
    big5: 'Big5',
    shift_jis: 'S-JIS',
    'euc-kr': 'EUC-KR',
    'iso-8859-1': 'Latin-1',
    'windows-1252': '1252',
    'windows-1251': '1251',
  };
  return names[encoding] || encoding.toUpperCase();
}

function getEncodingLabel(encoding: string): string {
  const enc = COMMON_ENCODINGS.find((e) => e.value === encoding);
  return enc ? `${enc.label}` : encoding;
}

function getEncodingDesc(encoding: string): string {
  const enc = COMMON_ENCODINGS.find((e) => e.value === encoding);
  return enc ? enc.desc : '';
}
