// add-i18n-html.mjs — 给 index.html 添加 data-i18n 属性
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..', 'src');

const HTML_FILE = join(__dirname, '..', 'index.html');
const ZH_CN = join(__dirname, 'i18n', 'zh-CN.json');
const EN = join(__dirname, 'i18n', 'en.json');

let html = readFileSync(HTML_FILE, 'utf8');
let zhCN = JSON.parse(readFileSync(ZH_CN, 'utf8'));
let en = JSON.parse(readFileSync(EN, 'utf8'));

let newKeys = [];

function guessKey(text, context) {
  let category = 'common';
  if (context.includes('title') || context.includes('button')) category = 'common';
  const key = `${category}.${text.replace(/[^\w\s\-_]/g, '').trim().substring(0, 20).replace(/\s+/g, '-').toLowerCase()}`;
  return key || 'common.text';
}

function addKey(key, text) {
  if (zhCN[key] !== undefined) return;
  zhCN[key] = text;
  en[key] = text; // TODO: translate
  newKeys.push({ key, text });
}

// 1. Handle title="中文" attributes
let titleRegex = /title="([\u4e00-\u9fa5][\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]*)"/g;
let match;
while ((match = titleRegex.exec(html)) !== null) {
  const text = match[1];
  const key = guessKey(text, 'title');
  addKey(key, text);
  const replacement = `data-i18n-title="${key}" title="${text}"`;
  html = html.replace(`title="${text}"`, replacement);
}

// 2. Handle text content: >中文< or >中文</tag>
// This is complex — let me just handle simple cases
const textRegex = />([^<]*[\u4e00-\u9fa5][^<]*)</g;
let textMatches = [...html.matchAll(textRegex)];
for (const m of textMatches) {
  const text = m[1].trim();
  if (text.length < 2) continue;
  const key = guessKey(text, 'text');
  addKey(key, text);
  // Replace carefully
  const search = `>${text}<`;
  const replace = `><span data-i18n="${key}">${text}</span><`;
  if (html.includes(search)) {
    html = html.replace(search, replace);
  }
}

// Write back
writeFileSync(HTML_FILE, html, 'utf8');
writeFileSync(ZH_CN, JSON.stringify(zhCN, null, 2), 'utf8');
writeFileSync(EN, JSON.stringify(en, null, 2), 'utf8');

console.log(`Done! Added ${newKeys.length} new keys.`);
if (newKeys.length > 0) {
  console.log('\nNew keys:');
  newKeys.forEach(({ key, text }) => console.log(`  ${key} = "${text}"`));
}
