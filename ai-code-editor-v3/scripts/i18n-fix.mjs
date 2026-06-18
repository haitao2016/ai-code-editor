/**
 * i18n 替换脚本 - 处理 .ts 文件中遗漏的硬编码中文字符串
 * 用法: node scripts/i18n-fix.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ZH_PATH = path.join(ROOT, 'src', 'i18n', 'zh-CN.json');
const EN_PATH = path.join(ROOT, 'src', 'i18n', 'en.json');

// 加载翻译
const zhCN = JSON.parse(fs.readFileSync(ZH_PATH, 'utf8'));
const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
const zhToKey = {};
for (const [k, v] of Object.entries(zhCN)) zhToKey[v] = k;

function getKey(text) {
  text = text.trim();
  if (!text) return null;
  if (zhToKey[text]) return zhToKey[text];
  // 生成 key
  const clean = text.replace(/[^\w\u4e00-\u9fa5]/g, '').slice(0, 6);
  let key = `app.${clean || 'text'}`;
  let n = 1;
  while (zhCN[key]) key = `app.${clean || 'text'}${n}`;
  zhCN[key] = text;
  en[key] = text; // TODO: 英文翻译
  zhToKey[text] = key;
  return key;
}

// 需要处理的文件列表（从 grep 结果中得到）
const TARGETS = [
  'core/a11y.ts',
  'core/editor.ts',
  'core/large-file.ts',
  'features/preview.ts',
  'features/search.ts',
  'features/settings.ts',
  'features/zen-mode.ts',
];

const changes = [];

for (const rel of TARGETS) {
  const fp = path.join(SRC, rel);
  if (!fs.existsSync(fp)) { console.log(`Skip missing: ${rel}`); continue; }
  let content = fs.readFileSync(fp, 'utf8');
  let modified = false;

  // 模式1: textContent = '中文'
  content = content.replace(
    /(\w+)\.textContent\s*=\s*['"]([^'"]*[\u4e00-\u9fa5][^'"]*)['"]/g,
    (match, el, text) => {
      const key = getKey(text);
      changes.push(`${rel}: textContent '${text}' -> i18n.t('${key}')`);
      modified = true;
      return `${el}.textContent = i18n.t('${key}')`;
    }
  );

  // 模式2: title = '中文'
  content = content.replace(
    /(\w+)\.title\s*=\s*['"]([^'"]*[\u4e00-\u9fa5][^'"]*)['"]/g,
    (match, el, text) => {
      const key = getKey(text);
      changes.push(`${rel}: title '${text}' -> i18n.t('${key}')`);
      modified = true;
      return `${el}.title = i18n.t('${key}')`;
    }
  );

  // 模式3: placeholder = '中文' （在 HTML 字符串中）
  // 跳过，因为 HTML 中的 placeholder 已经在 index.html 中处理

  if (modified) {
    // 确保文件顶部有 import { i18n } from './i18n' 或类似
    if (!content.includes("from '../core/i18n'") && !content.includes("from './i18n'")) {
      // 在第一个 import 后添加
      const importLine = "import { i18n, t } from '../core/i18n';";
      // 检查是否已有 i18n import
      if (!content.includes('from ') || content.includes("from '../core/i18n'")) {
        // 已经有或不需要
      } else {
        // 在文件顶部添加 import
        const lines = content.split('\n');
        let insertAt = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('import ')) {
            insertAt = i + 1;
          } else if (lines[i].trim() && !lines[i].startsWith('//') && !lines[i].startsWith('/*')) {
            break;
          }
        }
        lines.splice(insertAt, 0, importLine);
        content = lines.join('\n');
      }
    }
    fs.writeFileSync(fp, content, 'utf8');
  }
}

// 保存翻译
fs.writeFileSync(ZH_PATH, JSON.stringify(zhCN, null, 2), 'utf8');
fs.writeFileSync(EN_PATH, JSON.stringify(en, null, 2), 'utf8');

console.log(`Done! ${changes.length} changes:`);
for (const c of changes) console.log(`  ${c}`);
