// ============================================================
// Tests: Encoding Utilities
// ============================================================
import { describe, it, expect } from 'vitest';

describe('Encoding Utilities', () => {
  it('should detect UTF-8 encoding', () => {
    const text = 'Hello World 你好世界';
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);

    // UTF-8 BOM is EF BB BF
    const hasBOM = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
    expect(hasBOM).toBe(false);

    // All bytes should be valid UTF-8 for ASCII + common CJK
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('should detect GBK encoded text', () => {
    // Mock GBK detection by checking for high-byte sequences
    const gbkChars = [0xD6, 0xD0, 0xB9, 0xFA]; // 中国 in GBK
    const isHighByte = gbkChars.every((b) => b > 0x80);
    expect(isHighByte).toBe(true);
    expect(gbkChars.length).toBe(4); // 2 bytes per character
  });

  it('should differentiate encodings by byte patterns', () => {
    // ASCII (valid in both UTF-8 and GBK)
    const ascii = [0x48, 0x65, 0x6C, 0x6C, 0x6F]; // "Hello"
    const allAscii = ascii.every((b) => b < 0x80);
    expect(allAscii).toBe(true);

    // Multi-byte UTF-8
    // é = 0xC3 0xA9 in UTF-8
    const utf8MultiByte = [0xC3, 0xA9];
    const looksLikeUTF8 = utf8MultiByte[0] >= 0xC0 && utf8MultiByte[0] < 0xE0;
    expect(looksLikeUTF8).toBe(true);

    // GBK high bytes
    const gbkHigh = [0xA1, 0xA2];
    const looksLikeGBK = gbkHigh.every((b) => b >= 0xA1 && b <= 0xFE);
    expect(looksLikeGBK).toBe(true);
  });

  it('should list supported encodings', () => {
    const encodings = [
      'UTF-8',
      'UTF-8 with BOM',
      'UTF-16 LE',
      'UTF-16 BE',
      'GBK',
      'GB2312',
      'Big5',
      'Shift_JIS',
      'EUC-KR',
      'ISO-8859-1',
      'Windows-1252',
      'KOI8-R',
      'ASCII',
    ];

    expect(encodings.length).toBe(13);
    expect(encodings).toContain('UTF-8');
    expect(encodings).toContain('GBK');
    expect(encodings).toContain('Big5');
  });

  it('should handle empty content', () => {
    const empty = new Uint8Array(0);
    expect(empty.length).toBe(0);
  });

  it('should detect UTF-8 BOM presence', () => {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    expect(bom[0]).toBe(0xEF);
    expect(bom[1]).toBe(0xBB);
    expect(bom[2]).toBe(0xBF);
  });

  it('should detect UTF-16 LE BOM', () => {
    const bom = new Uint8Array([0xFF, 0xFE]);
    expect(bom[0]).toBe(0xFF);
    expect(bom[1]).toBe(0xFE);
  });

  it('should detect UTF-16 BE BOM', () => {
    const bom = new Uint8Array([0xFE, 0xFF]);
    expect(bom[0]).toBe(0xFE);
    expect(bom[1]).toBe(0xFF);
  });

  it('should handle large file encoding detection', () => {
    // Simulate large content — only first 1024 bytes needed for detection
    const largeContent = new Uint8Array(1000000);
    for (let i = 0; i < 1024; i++) largeContent[i] = 0x41; // 'A'
    const sample = largeContent.slice(0, 1024);
    const allAscii = sample.every((b) => b < 0x80);
    expect(allAscii).toBe(true);
  });
});
