// ============================================================
// 项目级 RAG 上下文 — Embedding 语义搜索 + TF-IDF 兜底
// ============================================================
// Dual-mode RAG: uses real embedding vectors when API available,
// falls back to TF-IDF vectorization for offline/API-limited scenarios.
// Vectors are persisted in IndexedDB for fast rebuild.

import { useFilesStore } from './stores';
import { getEmbeddings, cosineSimilarity } from './ai';

// ─── Types ─────────────────────────────────────────────────
interface ChunkMetadata {
  filePath: string;
  startLine: number;
  endLine: number;
  chunkType: 'function' | 'class' | 'imports' | 'other';
  name?: string;
}

interface IndexedChunk {
  id: number;
  content: string;
  contentHash: string; // Quick hash for change detection
  metadata: ChunkMetadata;
  /** TF-IDF vector: term → frequency (always computed as fallback) */
  tf: Map<string, number>;
  tokenCount: number;
  /** Embedding vector (only when embedding mode is active) */
  embedding?: number[];
}

// ─── Tokenization ──────────────────────────────────────────
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_$]+/i)
    .filter((t) => t.length > 1)
    .flatMap((t) => t.replace(/([a-z])([A-Z])/g, '$1 $2').split(' '))
    .filter((t) => t.length > 1);
}

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
  'in', 'with', 'to', 'for', 'of', 'that', 'by', 'this', 'it', 'as',
  'be', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'from',
  'they', 'them', 'their', 'its', 'if', 'then', 'than', 'so',
  'const', 'let', 'var', 'function', 'return', 'export', 'import',
  'default', 'type', 'interface', 'class', 'extends', 'implements',
  'new', 'try', 'catch', 'throw', 'finally', 'async', 'await',
]);

// ─── Simple hash for change detection ─────────────────────
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 2000); i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

// ─── Chunking ──────────────────────────────────────────────
function chunkFile(filePath: string, content: string): IndexedChunk[] {
  const lines = content.split('\n');
  const chunks: IndexedChunk[] = [];
  let id = 0;

  let currentChunk: string[] = [];
  let chunkStartLine = 1;
  let currentType: ChunkMetadata['chunkType'] = 'other';
  let currentName: string | undefined;
  let inImportBlock = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
    const classMatch = trimmed.match(/^(?:export\s+)?class\s+(\w+)/);

    if (inImportBlock && !trimmed.startsWith('import') && !trimmed.startsWith('//') && trimmed !== '') {
      if (currentChunk.length > 0) {
        chunks.push(buildChunk(id++, currentChunk.join('\n'), {
          filePath, startLine: chunkStartLine, endLine: lineNum - 1,
          chunkType: 'imports', name: undefined,
        }));
        currentChunk = [];
      }
      inImportBlock = false;
    }

    const isBlank = trimmed === '';

    if (funcMatch || arrowMatch || classMatch) {
      if (currentChunk.length > 0) {
        chunks.push(buildChunk(id++, currentChunk.join('\n'), {
          filePath, startLine: chunkStartLine, endLine: lineNum - 1,
          chunkType: currentType, name: currentName,
        }));
      }
      currentChunk = [line];
      chunkStartLine = lineNum;
      if (classMatch) {
        currentType = 'class';
        currentName = classMatch[1];
      } else {
        currentType = 'function';
        currentName = funcMatch?.[1] || arrowMatch?.[1];
      }
    } else if (isBlank && currentChunk.length > 0 && currentChunk[currentChunk.length - 1] === '') {
      continue;
    } else {
      currentChunk.push(line);
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(buildChunk(id++, currentChunk.join('\n'), {
      filePath, startLine: chunkStartLine, endLine: lines.length,
      chunkType: currentType, name: currentName,
    }));
  }

  return chunks;
}

function buildChunk(id: number, content: string, metadata: ChunkMetadata): IndexedChunk {
  const tokens = tokenize(content).filter((t) => !STOP_WORDS.has(t));
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return {
    id,
    content,
    contentHash: simpleHash(content),
    metadata,
    tf,
    tokenCount: tokens.length,
  };
}

// ═══════════════════════════════════════════════════════════
// IndexedDB Vector Store — persists embeddings across sessions
// ═══════════════════════════════════════════════════════════
const VECTOR_DB_NAME = 'ai-code-editor-vectors';
const VECTOR_STORE_NAME = 'chunk-embeddings';
const DB_VERSION = 1;

function openVectorDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VECTOR_DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VECTOR_STORE_NAME)) {
        db.createObjectStore(VECTOR_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadVectors(): Promise<Map<string, number[]>> {
  try {
    const db = await openVectorDB();
    return new Promise((resolve) => {
      const tx = db.transaction(VECTOR_STORE_NAME, 'readonly');
      const store = tx.objectStore(VECTOR_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const map = new Map<string, number[]>();
        for (const item of req.result) {
          map.set(item.key, item.vector);
        }
        db.close();
        resolve(map);
      };
      req.onerror = () => { db.close(); resolve(new Map()); };
    });
  } catch {
    return new Map();
  }
}

async function saveVectors(chunkVectors: Array<{ key: string; vector: number[] }>): Promise<void> {
  try {
    const db = await openVectorDB();
    const tx = db.transaction(VECTOR_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VECTOR_STORE_NAME);
    for (const item of chunkVectors) {
      store.put(item);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* IndexedDB not available */ }
}

async function clearAllVectors(): Promise<void> {
  try {
    const db = await openVectorDB();
    const tx = db.transaction(VECTOR_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VECTOR_STORE_NAME);
    store.clear();
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  } catch { /* ignore */ }
}

// ─── Embedding key format ──────────────────────────────────
function chunkKey(chunk: IndexedChunk): string {
  return `${chunk.metadata.filePath}#${chunk.metadata.startLine}#${chunk.contentHash}`;
}

// ═══════════════════════════════════════════════════════════
// RAG Index — dual-mode: Embedding + TF-IDF
// ═══════════════════════════════════════════════════════════
class RAGIndex {
  private chunks: IndexedChunk[] = [];
  private df: Map<string, number> = new Map();
  private _isBuilt = false;
  private _embeddingMode = false;
  private _embeddingLoading = false;
  private _embeddingAvailable: boolean | null = null;

  get isBuilt(): boolean { return this._isBuilt; }
  get size(): number { return this.chunks.length; }
  get embeddingMode(): boolean { return this._embeddingMode; }

  /** Index all files, using cached embeddings where possible */
  async indexAllAsync(): Promise<{ mode: 'embedding' | 'tfidf'; chunkCount: number }> {
    const files = useFilesStore.getState().files;
    this.chunks = [];
    this.df = new Map();

    for (const [path, entry] of files.entries()) {
      if (!isCodeFile(path)) continue;
      const fileChunks = chunkFile(path, entry.content);
      this.chunks.push(...fileChunks);
      for (const chunk of fileChunks) {
        for (const term of chunk.tf.keys()) {
          this.df.set(term, (this.df.get(term) || 0) + 1);
        }
      }
    }

    this._isBuilt = true;

    // Try to load cached embeddings
    if (this._embeddingAvailable === null) {
      // Don't check on first index to avoid API hit on every file change
      this._embeddingMode = false;
    }

    return { mode: this._embeddingMode ? 'embedding' : 'tfidf', chunkCount: this.chunks.length };
  }

  /** Index all files (sync wrapper — legacy TF-IDF only) */
  indexAll(): void {
    const files = useFilesStore.getState().files;
    this.chunks = [];
    this.df = new Map();

    for (const [path, entry] of files.entries()) {
      if (!isCodeFile(path)) continue;
      const fileChunks = chunkFile(path, entry.content);
      this.chunks.push(...fileChunks);
      for (const chunk of fileChunks) {
        for (const term of chunk.tf.keys()) {
          this.df.set(term, (this.df.get(term) || 0) + 1);
        }
      }
    }
    this._isBuilt = true;
    this._embeddingMode = false;
  }

  /** Build embedding vectors for all chunks via API */
  async buildEmbeddings(onProgress?: (current: number, total: number) => void): Promise<boolean> {
    if (this._embeddingLoading) return false;
    this._embeddingLoading = true;

    try {
      // Load cached vectors
      const cachedVectors = await loadVectors();
      const newChunks: IndexedChunk[] = [];
      const textsToEmbed: string[] = [];

      // Figure out which chunks need new embeddings
      for (const chunk of this.chunks) {
        const key = chunkKey(chunk);
        const cached = cachedVectors.get(key);
        if (cached) {
          chunk.embedding = cached;
        } else {
          newChunks.push(chunk);
          // Prepare text for embedding: [type] name: truncated content
          const meta = chunk.metadata;
          const label = meta.name
            ? `${meta.chunkType} ${meta.name}: ${chunk.content.substring(0, 800)}`
            : `${meta.chunkType}: ${chunk.content.substring(0, 800)}`;
          textsToEmbed.push(label);
        }
      }

      if (textsToEmbed.length > 0) {
        // Batch embed (max 100 per API call)
        const BATCH_SIZE = 50;
        for (let i = 0; i < textsToEmbed.length; i += BATCH_SIZE) {
          const batch = textsToEmbed.slice(i, i + BATCH_SIZE);
          const vectors = await getEmbeddings(batch);

          for (let j = 0; j < batch.length; j++) {
            newChunks[j].embedding = vectors[j];
          }

          if (onProgress) {
            onProgress(Math.min(i + BATCH_SIZE, textsToEmbed.length), textsToEmbed.length);
          }
        }

        // Save new vectors to IndexedDB
        const toSave = newChunks.map((chunk) => ({
          key: chunkKey(chunk),
          vector: chunk.embedding!,
        }));
        await saveVectors(toSave);
      }

      this._embeddingMode = true;
      this._embeddingAvailable = true;
      return true;
    } catch (err) {
      console.warn('[RAG] Embedding build failed, using TF-IDF fallback:', err);
      this._embeddingAvailable = false;
      this._embeddingMode = false;
      return false;
    } finally {
      this._embeddingLoading = false;
    }
  }

  /** Search using embeddings (cosine similarity) */
  private searchEmbedding(query: string, topK: number): { chunk: IndexedChunk; score: number }[] {
    return new Promise(async (resolve) => {
      try {
        const queryVec = (await getEmbeddings([query]))[0];
        if (!queryVec || queryVec.length === 0) {
          resolve(this.searchTFIDF(query, topK));
          return;
        }

        const scored = this.chunks
          .filter((c) => c.embedding && c.embedding.length > 0)
          .map((chunk) => ({
            chunk,
            score: cosineSimilarity(queryVec, chunk.embedding!),
          }));

        scored.sort((a, b) => b.score - a.score);
        resolve(scored.slice(0, topK));
      } catch {
        resolve(this.searchTFIDF(query, topK));
      }
    }) as any;
  }

  /** TF-IDF search (fallback) */
  private searchTFIDF(query: string, topK: number): { chunk: IndexedChunk; score: number }[] {
    const queryTokens = tokenize(query).filter((t) => !STOP_WORDS.has(t));
    if (queryTokens.length === 0) return [];

    const N = this.chunks.length;

    const results = this.chunks.map((chunk) => {
      let score = 0;
      for (const term of queryTokens) {
        const tf = chunk.tf.get(term) || 0;
        if (tf === 0) continue;
        const docFreq = this.df.get(term) || 1;
        const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
        const tfNorm = tf / (tf + 1.5);
        score += tfNorm * idf;
      }
      score = score / (1 + 0.001 * chunk.tokenCount);
      return { chunk, score };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /** Search — uses embeddings if available, TF-IDF otherwise */
  async searchAsync(query: string, topK: number = 5): Promise<{ chunk: IndexedChunk; score: number }[]> {
    if (!this._isBuilt || this.chunks.length === 0) return [];

    if (this._embeddingMode) {
      return this.searchEmbedding(query, topK);
    }

    return this.searchTFIDF(query, topK);
  }

  /** Sync search (TF-IDF only, for quick results) */
  search(query: string, topK: number = 5): { chunk: IndexedChunk; score: number }[] {
    return this.searchTFIDF(query, topK);
  }

  /** Check if embedding API is usable */
  async checkEmbeddingSupport(): Promise<boolean> {
    if (this._embeddingAvailable !== null) return this._embeddingAvailable;
    try {
      await getEmbeddings(['test']);
      this._embeddingAvailable = true;
      return true;
    } catch {
      this._embeddingAvailable = false;
      return false;
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────
const ragIndex = new RAGIndex();

export function getRAGIndex(): RAGIndex {
  return ragIndex;
}

/** Rebuild TF-IDF index synchronously */
export function rebuildRAGIndex(): void {
  ragIndex.indexAll();
}

/** Rebuild index with embeddings (async) */
export async function rebuildRAGIndexWithEmbeddings(
  onProgress?: (current: number, total: number) => void,
): Promise<{ mode: string; chunkCount: number }> {
  const result = await ragIndex.indexAllAsync();
  if (ragIndex.embeddingMode) {
    return result;
  }
  // Try to build embeddings
  const success = await ragIndex.buildEmbeddings(onProgress);
  return { mode: success ? 'embedding' : 'tfidf', chunkCount: result.chunkCount };
}

/** Search for relevant code snippets (sync fallback) */
export function searchRAG(query: string, topK: number = 5): string {
  const results = ragIndex.search(query, topK);
  return formatSearchResults(results);
}

/** Search for relevant code snippets (async, embedding-aware) */
export async function searchRAGAsync(query: string, topK: number = 5): Promise<string> {
  const results = await ragIndex.searchAsync(query, topK);
  return formatSearchResults(results);
}

function formatSearchResults(results: { chunk: IndexedChunk; score: number }[]): string {
  if (results.length === 0) return '';

  const parts: string[] = [];
  const mode = ragIndex.embeddingMode ? 'Embedding' : 'TF-IDF';

  for (const { chunk, score } of results) {
    const meta = chunk.metadata;
    const header = meta.name
      ? `### ${meta.filePath} — ${meta.chunkType} \`${meta.name}\` (行 ${meta.startLine}-${meta.endLine}, 相关性: ${score.toFixed(3)})`
      : `### ${meta.filePath} (行 ${meta.startLine}-${meta.endLine}, 相关性: ${score.toFixed(3)})`;

    let content = chunk.content;
    if (content.length > 1500) {
      content = content.substring(0, 1500) + '\n... (截断)';
    }

    parts.push(`${header}\n\`\`\`\n${content}\n\`\`\``);
  }

  return `\n\n### 🔍 RAG 语义搜索结果 (${mode})\n\n${parts.join('\n\n')}`;
}

// ─── Helpers ───────────────────────────────────────────────
function isCodeFile(path: string): boolean {
  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.cs', '.rb', '.php', '.swift', '.kt', '.scala'];
  return codeExts.some((ext) => path.endsWith(ext));
}

// ─── Auto-rebuild on file changes ──────────────────────────
let _rebuildDebounce: ReturnType<typeof setTimeout> | null = null;
export function scheduleRAGRebuild(): void {
  if (_rebuildDebounce) clearTimeout(_rebuildDebounce);
  _rebuildDebounce = setTimeout(() => {
    rebuildRAGIndex();
  }, 2000);
}

/** Clear all cached embedding vectors */
export async function clearEmbeddingCache(): Promise<void> {
  await clearAllVectors();
  ragIndex.indexAll(); // Rebuild TF-IDF fresh
}
