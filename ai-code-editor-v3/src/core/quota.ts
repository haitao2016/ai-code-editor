// ============================================================
// API 配额追踪 — 用量统计 + 可视化面板
// ============================================================
import { create } from 'zustand';
import { countTokens } from './stores';

// ─── Cost per 1M tokens (approximate, May 2026) ────────────
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
};

const PRICING_UNKNOWN = { input: 1.00, output: 4.00 };

export interface UsageRecord {
  id: string;
  timestamp: number;
  model: string;
  endpoint: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  /** True if this is an estimate (from streaming without usage field) */
  estimated: boolean;
}

export interface QuotaStats {
  today: { tokens: number; cost: number; calls: number };
  week: { tokens: number; cost: number; calls: number };
  month: { tokens: number; cost: number; calls: number };
  total: { tokens: number; cost: number; calls: number };
}

interface QuotaState {
  records: UsageRecord[];
  /** Track a new API usage */
  trackUsage: (record: Omit<UsageRecord, 'id' | 'estimatedCost' | 'estimated'>) => void;
  /** Clear all records */
  clearAll: () => void;
  /** Get stats */
  getStats: () => QuotaStats;
  /** Load records from storage */
  loadRecords: (records: UsageRecord[]) => void;
}

export const useQuotaStore = create<QuotaState>()((set, get) => ({
  records: [],

  trackUsage: (record) => {
    const pricing = MODEL_PRICING[record.model] || PRICING_UNKNOWN;
    const estimatedCost =
      (record.promptTokens / 1_000_000) * pricing.input +
      (record.completionTokens / 1_000_000) * pricing.output;

    const entry: UsageRecord = {
      ...record,
      id: `quota-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      estimatedCost,
      estimated: record.promptTokens === 0, // streaming without usage info = estimated
    };

    set((s) => {
      const records = [...s.records, entry];
      // Persist (max 1000 records)
      if (records.length > 1000) {
        records.splice(0, records.length - 1000);
      }
      persistQuota(records.slice(-500));
      return { records };
    });
  },

  clearAll: () => {
    set({ records: [] });
    persistQuota([]);
  },

  getStats: () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;

    const { records } = get();

    const filterSince = (since: number) =>
      records.filter((r) => r.timestamp >= now - since);

    const todayRecords = filterSince(DAY);
    const weekRecords = filterSince(WEEK);
    const monthRecords = filterSince(MONTH);

    return {
      today: aggregateUsage(todayRecords),
      week: aggregateUsage(weekRecords),
      month: aggregateUsage(monthRecords),
      total: aggregateUsage(records),
    };
  },

  loadRecords: (records) => set({ records }),
}));

function aggregateUsage(records: UsageRecord[]): { tokens: number; cost: number; calls: number } {
  return {
    tokens: records.reduce((sum, r) => sum + r.promptTokens + r.completionTokens, 0),
    cost: records.reduce((sum, r) => sum + r.estimatedCost, 0),
    calls: records.length,
  };
}

// ─── IndexedDB persistence ─────────────────────────────────
async function openQuotaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ai-code-editor-quota', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('usage')) {
        db.createObjectStore('usage', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistQuota(records: UsageRecord[]): Promise<void> {
  try {
    const db = await openQuotaDB();
    const tx = db.transaction('usage', 'readwrite');
    const store = tx.objectStore('usage');
    await new Promise<void>((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => reject(clearReq.error);
    });
    for (const record of records) {
      store.put(record);
    }
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  } catch { /* silent */ }
}

export async function loadQuotaRecords(): Promise<UsageRecord[]> {
  try {
    const db = await openQuotaDB();
    const tx = db.transaction('usage', 'readonly');
    const store = tx.objectStore('usage');
    const records: UsageRecord[] = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return records;
  } catch {
    return [];
  }
}

// ─── Integration: track from AI calls ──────────────────────
export function trackAICall(model: string, endpoint: string, promptText: string, completionText: string): void {
  const promptTokens = countTokens(promptText);
  const completionTokens = countTokens(completionText);
  useQuotaStore.getState().trackUsage({
    timestamp: Date.now(),
    model,
    endpoint,
    promptTokens,
    completionTokens,
  });
}

// ─── Formatting helpers ────────────────────────────────────
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function formatCost(n: number): string {
  if (n >= 1) return '$' + n.toFixed(2);
  if (n >= 0.01) return '$' + n.toFixed(4);
  return '<$0.01';
}
