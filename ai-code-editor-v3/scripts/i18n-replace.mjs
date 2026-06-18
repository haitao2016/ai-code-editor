// i18n-replace.mjs — ES module version
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const SRC_DIR = process.argv[2] || join(__dirname, '..', 'src');
const LOCALE_DIR = join(__dirname, '..', 'src', 'i18n');
const ZH_CN = join(LOCALE_DIR, 'zh-CN.json');
const EN = join(LOCALE_DIR, 'en.json');

let zhCN = JSON.parse(readFileSync(ZH_CN, 'utf8'));
let en = JSON.parse(readFileSync(EN, 'utf8'));

const newKeys = [];

function guessKey(text, filePath) {
  let category = 'common';
  if (filePath.includes('settings')) category = 'settings';
  else if (filePath.includes('debug')) category = 'debug';
  else if (filePath.includes('git')) category = 'git';
  else if (filePath.includes('chat')) category = 'ai';
  else if (filePath.includes('terminal')) category = 'terminal';
  else if (filePath.includes('search')) category = 'search';
  else if (filePath.includes('preview')) category = 'preview';
  else if (filePath.includes('welcome')) category = 'welcome';
  else if (filePath.includes('a11y')) category = 'accessibility';
  
  const keyBase = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s\-_]/g, '').trim().substring(0, 20);
  const key = `${category}.${keyBase.replace(/\s+/g, '-').toLowerCase() || 'text'}`;
  return key;
}

function addLocaleKey(key, chineseText) {
  if (zhCN[key] !== undefined) return;
  zhCN[key] = chineseText;
  en[key] = chineseText; // TODO: translate
  newKeys.push({ key, text: chineseText });
}

function replaceChineseInFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  let modified = false;
  const lines = content.split('\n');
  const newLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.includes('i18n.t(')) {
      newLines.push(line);
      continue;
    }
    
    // Find Chinese strings in quotes
    const regex = /(?<=["'`])([\u4e00-\u9fa5][\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]*[\u4e00-\u9fa5])(?=["'`])/g;
    let newLine = line;
    const replacements = [];
    
    let match;
    while ((match = regex.exec(line)) !== null) {
      const text = match[1];
      const key = guessKey(text, filePath);
      addLocaleKey(key, text);
      replacements.push({ text, key });
    }
    
    if (replacements.length > 0) {
      for (let r = replacements.length - 1; r >= 0; r--) {
        const { text, key } = replacements[r];
        const search = `"${text}"`;
        const replace = `i18n.t('${key}')`;
        if (newLine.includes(search)) {
          newLine = newLine.replace(search, replace);
        }
      }
      modified = true;
    }
    
    newLines.push(newLine);
  }
  
  if (modified) {
    writeFileSync(filePath, newLines.join('\n'), 'utf8');
    return true;
  }
  return false;
}

const files = [];
function walkDir(dir) {
  readdirSync(dir).forEach(f => {
    const fp = join(dir, f);
    if (statSync(fp).isDirectory() && !f.startsWith('.') && f !== 'node_modules') {
      walkDir(fp);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      files.push(fp);
    }
  });
}
walkDir(SRC_DIR);

console.log(`Found ${files.length} TS files to scan...`);

let replacedCount = 0;
files.forEach(f => {
  if (replaceChineseInFile(f)) {
    replacedCount++;
    console.log(`  Replaced in: ${f}`);
  }
});

writeFileSync(ZH_CN, JSON.stringify(zhCN, null, 2), 'utf8');
writeFileSync(EN, JSON.stringify(en, null, 2), 'utf8');

console.log(`\nDone!`);
console.log(`  Files modified: ${replacedCount}`);
console.log(`  New locale keys: ${newKeys.length}`);
if (newKeys.length > 0) {
  console.log(`\nNew keys added to zh-CN.json and en.json:`);
  newKeys.forEach(({ key, text }) => console.log(`  ${key} = "${text}"`));
}
