// ============================================================
// RAG Worker Manager — bridge main thread ↔ worker thread
// ============================================================

type WorkerCallbacks = Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>;

let worker: Worker | null = null;
let callbacks: WorkerCallbacks = new Map();
let lastId = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./rag-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, payload, error } = e.data;
      const cb = callbacks.get(id);
      if (cb) {
        callbacks.delete(id);
        if (error) {
          cb.reject(new Error(error));
        } else {
          cb.resolve(payload);
        }
      }
    };
    worker.onerror = (err) => {
      console.error('[RAG Worker] Error:', err);
      // Reject all pending callbacks
      for (const [id, cb] of callbacks) {
        cb.reject(new Error('Worker error'));
      }
      callbacks.clear();
    };
  }
  return worker;
}

function sendToWorker(type: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++lastId;
    callbacks.set(id, { resolve, reject });
    try {
      getWorker().postMessage({ id, type, payload });
      // Timeout after 30s
      setTimeout(() => {
        if (callbacks.has(id)) {
          callbacks.delete(id);
          reject(new Error('Worker timeout'));
        }
      }, 30000);
    } catch (err) {
      callbacks.delete(id);
      reject(err);
    }
  });
}

// ─── Public API ──────────────────────────────────────────
export async function buildWorkerIndex(documents: { path: string; content: string }[]): Promise<{ docCount: number; termCount: number }> {
  return sendToWorker('index_tfidf', { documents });
}

export async function searchWorkerRAG(query: string, topK: number = 5): Promise<{ path: string; score: number; snippet: string }[]> {
  const result = await sendToWorker('search_tfidf', { query, topK });
  return result.results || [];
}

export async function computeWorkerEmbedding(vectors: number[][], query: number[], topK: number = 5): Promise<{ index: number; score: number }[]> {
  const result = await sendToWorker('compute_embedding', { vectors, query, topK });
  return result.similarities || [];
}

export function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    callbacks.clear();
  }
}

export function isWorkerReady(): boolean {
  return worker !== null;
}
