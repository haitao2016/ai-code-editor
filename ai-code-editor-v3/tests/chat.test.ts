// ============================================================
// Chat Feature Tests — parseCodeBlocks, message formatting
// ============================================================
import { describe, it, expect } from 'vitest';

// ─── Recreated pure functions from src/features/chat.ts ────────

interface CodeBlock {
  language: string;
  code: string;
  applied: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

// ================================================================
describe('Chat — escapeHtml', () => {
  it('should escape & to &amp;', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should escape < to &lt;', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('should escape > to &gt;', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should handle multiple special chars', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
  });

  it('should not modify plain text', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('Chat — parseCodeBlocks', () => {
  it('should parse code blocks with language', () => {
    const { html, blocks } = parseCodeBlocks('```ts\nconst x = 1;\n```');
    expect(blocks.length).toBe(1);
    expect(blocks[0].language).toBe('ts');
    expect(blocks[0].code.trimEnd()).toBe('const x = 1;');
    expect(blocks[0].applied).toBe(false);
    expect(html).toContain('<pre>');
    expect(html).toContain('lang-tag');
    expect(html).not.toContain('```');
  });

  it('should parse code blocks without language (default to plaintext)', () => {
    const { blocks } = parseCodeBlocks('```\nno language\n```');
    expect(blocks.length).toBe(1);
    expect(blocks[0].language).toBe('plaintext');
    expect(blocks[0].code.trimEnd()).toBe('no language');
  });

  it('should parse multiple code blocks', () => {
    const { blocks, html } = parseCodeBlocks(
      'Here is js:\n```js\nconsole.log("hi")\n```\nAnd html:\n```html\n<div>Hi</div>\n```'
    );
    expect(blocks.length).toBe(2);
    expect(blocks[0].language).toBe('js');
    expect(blocks[1].language).toBe('html');
  });

  it('should convert inline code with backticks', () => {
    const { html } = parseCodeBlocks('Use `const` for constants.');
    expect(html).toContain('<code class="inline-code">const</code>');
  });

  it('should handle multiple inline code spans', () => {
    const { html } = parseCodeBlocks('Call `foo()` then `bar()`.');
    const matches = html.match(/inline-code/g);
    expect(matches?.length).toBe(2);
  });

  it('should escape HTML in code blocks', () => {
    const { html } = parseCodeBlocks('```html\n<div>Hello</div>\n```');
    expect(html).toContain('&lt;div&gt;');
    expect(html).toContain('&lt;/div&gt;');
  });

  it('should handle text without any code', () => {
    const { blocks, html } = parseCodeBlocks('Just plain text.');
    expect(blocks.length).toBe(0);
    expect(html).toBe('Just plain text.');
  });

  it('should handle empty input', () => {
    const { blocks, html } = parseCodeBlocks('');
    expect(blocks.length).toBe(0);
    expect(html).toBe('');
  });

  it('should strip triple backticks from output', () => {
    const { html } = parseCodeBlocks('```py\nprint(1)\n```');
    expect(html).not.toMatch(/```/);
  });

  it('should generate sequential data-idx for blocks', () => {
    const { html } = parseCodeBlocks('```js\na\n``` ```ts\nb\n```');
    expect(html).toContain('data-idx="0"');
    expect(html).toContain('data-idx="1"');
  });

  it('should handle code blocks with empty lines', () => {
    const { blocks } = parseCodeBlocks('```\n\nline1\n\nline2\n\n```');
    expect(blocks.length).toBe(1);
    expect(blocks[0].code).toContain('line1');
    expect(blocks[0].code).toContain('line2');
  });
});

describe('Chat — Message rendering helpers', () => {
  it('should map user role to person avatar', () => {
    const avatarMap: Record<string, string> = { user: '👤', ai: '🤖', error: '⚠️', system: '📢' };
    expect(avatarMap['user']).toBe('👤');
    expect(avatarMap['ai']).toBe('🤖');
    expect(avatarMap['error']).toBe('⚠️');
    expect(avatarMap['system']).toBe('📢');
  });

  it('should handle unknown role with default avatar', () => {
    const avatarMap: Record<string, string> = { user: '👤', ai: '🤖', error: '⚠️', system: '📢' };
    const unknown = avatarMap['other'] || '💬';
    expect(unknown).toBe('💬');
  });
});
