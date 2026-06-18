// ============================================================
// Quota & Token Counting Tests
// ============================================================
import { describe, it, expect } from 'vitest';

describe('Quota System', () => {
  it('should format token counts correctly', () => {
    // These are simple formatting functions
    const formatTokens = (n: number): string => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
      return String(n);
    };

    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(100)).toBe('100');
    expect(formatTokens(1500)).toBe('1.5K');
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });

  it('should format costs correctly', () => {
    const formatCost = (n: number): string => {
      if (n >= 1) return '$' + n.toFixed(2);
      if (n >= 0.01) return '$' + n.toFixed(4);
      return '<$0.01';
    };

    expect(formatCost(0)).toBe('<$0.01');
    expect(formatCost(0.0015)).toBe('<$0.01');
    expect(formatCost(0.05)).toBe('$0.0500');
    expect(formatCost(2.5)).toBe('$2.50');
    expect(formatCost(100)).toBe('$100.00');
  });

  it('should calculate costs from token counts', () => {
    // GPT-4o pricing: $2.50/$10.00 per 1M tokens
    const inputPrice = 2.50;
    const outputPrice = 10.00;

    const calcCost = (promptTokens: number, completionTokens: number): number => {
      return (promptTokens / 1_000_000) * inputPrice +
             (completionTokens / 1_000_000) * outputPrice;
    };

    // 1000 prompt + 500 completion
    expect(calcCost(1000, 500)).toBeCloseTo(0.0075, 4);
    // 10K prompt + 5K completion
    expect(calcCost(10000, 5000)).toBeCloseTo(0.075, 4);
  });

  it('should aggregate usage records', () => {
    const records = [
      { promptTokens: 1000, completionTokens: 500 },
      { promptTokens: 2000, completionTokens: 800 },
      { promptTokens: 500, completionTokens: 200 },
    ];

    const totalTokens = records.reduce(
      (sum, r) => sum + r.promptTokens + r.completionTokens, 0
    );
    expect(totalTokens).toBe(5000);
    expect(records.length).toBe(3);
  });
});
