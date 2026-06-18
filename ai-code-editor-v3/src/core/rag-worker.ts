// ============================================================
// RAG Web Worker — offload TF-IDF / embedding computation
// ============================================================

// ─── Message types ────────────────────────────────────────
interface WorkerMessage {
  id: number;
  type: 'search_tfidf' | 'index_tfidf' | 'compute_embedding';
  payload: any;
}

interface WorkerResponse {
  id: number;
  type: string;
  payload: any;
  error?: string;
}

// ─── TF-IDF Engine (worker-local) ────────────────────────
interface DocumentEntry {
  path: string;
  content: string;
}

interface TFIDFIndex {
  documents: DocumentEntry[];
  df: Map<string, number>;  // document frequency
  idf: Map<string, number>; // inverse document frequency (cached)
  vectors: Map<string, Map<string, number>>; // path → term → tfidf
}

let tfidfIndex: TFIDFIndex | null = null;
let stopWords: Set<string> = new Set();

// ─── Stop words initialization ───────────────────────────
function initStopWords(): void {
  const words = [
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'just', 'and', 'but', 'or', 'if', 'while', 'it',
    'its', 'this', 'that', 'these', 'those', 'they', 'them', 'their',
    'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him',
    'his', 'she', 'her', 'let', 'const', 'var', 'function', 'return',
    'export', 'import', 'class', 'interface', 'type', 'extends',
    'implements', 'public', 'private', 'protected', 'static', 'readonly',
  ];
  stopWords = new Set(words);
}

// ─── Tokenization ──────────────────────────────────────────
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff_$]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopWords.has(t));
}

// ─── Index building ────────────────────────────────────────
function buildTFIDFIndex(documents: DocumentEntry[]): TFIDFIndex {
  const df = new Map<string, number>();
  const vectors = new Map<string, Map<string, number>>();
  const N = documents.length;

  // Step 1: count document frequency
  for (const doc of documents) {
    const terms = new Set(tokenize(doc.content));
    for (const term of terms) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  // Step 2: compute IDF
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
  }

  // Step 3: compute TF-IDF vectors
  for (const doc of documents) {
    const terms = tokenize(doc.content);
    const tf = new Map<string, number>();
    for (const term of terms) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }

    const vec = new Map<string, number>();
    const maxTF = Math.max(...tf.values(), 1);
    for (const [term, count] of tf) {
      const tfidf = (count / maxTF) * (idf.get(term) || 0);
      vec.set(term, tfidf);
    }
    vectors.set(doc.path, vec);
  }

  return { documents, df, idf, vectors };
}

// ─── Search ────────────────────────────────────────────────
function searchTFIDF(query: string, topK: number = 5): { path: string; score: number; snippet: string }[] {
  if (!tfidfIndex) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // Build query vector
  const queryVec = new Map<string, number>();
  for (const term of queryTerms) {
    queryVec.set(term, (queryVec.get(term) || 0) + 1);
  }

  // Compute cosine similarity against all documents
  const scores: { path: string; score: number }[] = [];
  for (const doc of tfidfIndex.documents) {
    const docVec = tfidfIndex.vectors.get(doc.path);
    if (!docVec || docVec.size === 0) continue;

    let dotProduct = 0;
    let queryNorm = 0;
    let docNorm = 0;

    for (const [term, qv] of queryVec) {
      const dv = docVec.get(term) || 0;
      dotProduct += qv * dv;
      queryNorm += qv * qv;
    }

    for (const [, dv] of docVec) {
      docNorm += dv * dv;
    }

    const score = dotProduct / (Math.sqrt(queryNorm) * Math.sqrt(docNorm) + 1e-9);
    if (score > 0) {
      scores.push({ path: doc.path, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK).map((s) => {
    const doc = tfidfIndex!.documents.find((d) => d.path === s.path);
    const snippet = doc ? doc.content.substring(0, 200).replace(/\n/g, ' ') : '';
    return { ...s, snippet };
  });
}

// ─── Cosine similarity helper ──────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}

// ─── Message handler ──────────────────────────────────────
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = e.data;

  try {
    switch (type) {
      case 'index_tfidf': {
        initStopWords();
        const docs: DocumentEntry[] = payload.documents;
        tfidfIndex = buildTFIDFIndex(docs);
        const response: WorkerResponse = { id, type, payload: { docCount: docs.length, termCount: tfidfIndex.idf.size } };
        self.postMessage(response);
        break;
      }

      case 'search_tfidf': {
        const results = searchTFIDF(payload.query, payload.topK || 5);
        const response: WorkerResponse = { id, type, payload: { results } };
        self.postMessage(response);
        break;
      }

      case 'compute_embedding': {
        // Embedding computation for small batches
        const vectors: number[][] = payload.vectors;
        const query: number[] = payload.query;
        if (vectors && query) {
          const similarities = vectors.map((v, i) => ({
            index: i,
            score: cosineSimilarity(v, query),
          }));
          similarities.sort((a, b) => b.score - a.score);
          const response: WorkerResponse = {
            id, type,
            payload: { similarities: similarities.slice(0, payload.topK || 5) },
          };
          self.postMessage(response);
        } else {
          const response: WorkerResponse = { id, type, payload: null, error: 'Missing vectors/query' };
          self.postMessage(response);
        }
        break;
      }

      default: {
        const response: WorkerResponse = { id, type, payload: null, error: `Unknown type: ${type}` };
        self.postMessage(response);
      }
    }
  } catch (err: any) {
    const response: WorkerResponse = { id, type, payload: null, error: err.message };
    self.postMessage(response);
  }
};
