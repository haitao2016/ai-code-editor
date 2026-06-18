#!/usr/bin/env python3
"""
为 index.html 添加 data-i18n 属性 - 简化版
直接对每个已知的中文字符串进行精确替换
"""

import json
import re
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_PATH = os.path.join(ROOT, 'index.html')
ZH_PATH = os.path.join(ROOT, 'src', 'i18n', 'zh-CN.json')
EN_PATH = os.path.join(ROOT, 'src', 'i18n', 'en.json')

# 加载现有翻译
with open(ZH_PATH, 'r', encoding='utf-8') as f:
    zhCN = json.load(f)
with open(EN_PATH, 'r', encoding='utf-8') as f:
    en = json.load(f)

zh_to_key = {v: k for k, v in zhCN.items()}

def get_key(text):
    text = text.strip()
    if text in zh_to_key:
        return zh_to_key[text]
    # 生成 key
    clean = re.sub(r'[^\w\u4e00-\u9fa5]', '', text)
    prefix = clean[:4] if clean else 'text'
    key = f"html.{prefix}"
    orig = key
    n = 1
    while key in zhCN:
        key = f"{orig}{n}"
        n += 1
    zhCN[key] = text
    en[key] = text  # 待翻译
    zh_to_key[text] = key
    return key

# 读取 HTML
with open(HTML_PATH, 'r', encoding='utf-8') as f:
    html = f.read()

changes = []

# ─── 处理 title 属性中的中文 ──────────────────────
# 格式: title="中文"
title_pattern = r'title="([^"]*[\u4e00-\u9fa5]+[^"]*)"'

def replace_title(m):
    full = m.group(0)
    val = m.group(1)
    key = get_key(val)
    attr = f'data-i18n-title="{key}"'
    changes.append(f"title: {val} -> {key}")
    # 在 title="..." 后面插入 data-i18n-title，如果还没有的话
    return full + ' ' + attr

# 只替换还没有 data-i18n-title 的行
new_html = []
for line in html.split('\n'):
    if 'title=' in line and re.search(r'[\u4e00-\u9fa5]', line):
        # 检查是否已有 data-i18n-title
        if 'data-i18n-title=' not in line:
            line = re.sub(r'(title="[^"]*[\u4e00-\u9fa5]+[^"]*")', replace_title, line)
    new_html.append(line)

html = '\n'.join(new_html)

# ─── 处理 placeholder 属性中的中文 ───────────────
new_html = []
for line in html.split('\n'):
    if 'placeholder=' in line and re.search(r'[\u4e00-\u9fa5]', line):
        if 'data-i18n-placeholder=' not in line:
            changes.append(f"placeholder line: {line[:60]}")
    new_html.append(line)
html = '\n'.join(new_html)

# ─── 处理标签文本内容中的中文 ────────────────────
# 找出 >中文< 的模式，在前面那个开标签添加 data-i18n
# 这需要多行处理，改用全局替换

# 先收集所有需要处理的 (中文文本, key) 对
text_pattern = r'>([^<]*[\u4e00-\u9fa5]+[^<]*)<'

text_replacements = []
for m in re.finditer(text_pattern, html):
    text = m.group(1).strip()
    if text and '<' not in text and 'SCRIPT' not in html[max(0,m.start()-20):m.start()].upper():
        key = get_key(text)
        text_replacements.append((m.start(), m.end(), text, key))

# 按逆序替换（从后往前，避免位置偏移）
text_replacements.sort(reverse=True)
for start, end, text, key in text_replacements:
    # 在 > 前面的开标签中添加 data-i18n="key"
    # 找到最近的开标签
    before = html[:start]
    # 找最后一个 '<' 在 '>' 之前的位置
    last_lt = before.rfind('<')
    if last_lt == -1:
        continue
    
    # 检查这个标签是否已经有 data-i18n
    tag_section = before[last_lt:]
    if 'data-i18n=' in tag_section:
        continue
    
    # 在 > 前插入 data-i18n="key"
    # 找到标签结束的 >
    tag_end = before.find('>', last_lt)
    if tag_end == -1 or tag_end >= start:
        continue
    
    html = html[:tag_end] + f' data-i18n="{key}"' + html[tag_end:]
    changes.append(f"text: {text} -> {key}")

# 写回文件
with open(HTML_PATH, 'w', encoding='utf-8') as f:
    f.write(html)

# 写回翻译
with open(ZH_PATH, 'w', encoding='utf-8') as f:
    json.dump(zhCN, f, ensure_ascii=False, indent=2)
with open(EN_PATH, 'w', encoding='utf-8') as f:
    json.dump(en, f, ensure_ascii=False, indent=2)

print(f"Done! {len(changes)} changes made.")
for c in changes[:20]:
    print(f"  {c}")
if len(changes) > 20:
    print(f"  ... and {len(changes)-20} more")
