// ============================================================
// Git Feature Tests — VirtualFS, stage/unstage, commit, remote
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';

// ─── Virtual FS for isomorphic-git (recreated from git.ts) ────────

interface FileStore {
  path: string;
  content: string;
  language: string;
  updatedAt: number;
}

function createVirtualFS(fileStore: FileStore[]): any {
  const encoder = new TextEncoder();
  const fileMap = new Map<string, { content: Uint8Array; mode: number }>();

  for (const f of fileStore) {
    fileMap.set(f.path, { content: encoder.encode(f.content), mode: 0o100644 });
  }

  return {
    readFile: async (path: string): Promise<Uint8Array> => {
      const cleaned = path.replace(/^\//, '');
      const file = fileMap.get(cleaned);
      if (!file) throw new Error(`ENOENT: ${path}`);
      return file.content;
    },
    writeFile: async (path: string, data: Uint8Array): Promise<void> => {
      fileMap.set(path.replace(/^\//, ''), { content: data, mode: 0o100644 });
    },
    unlink: async (path: string): Promise<void> => {
      fileMap.delete(path.replace(/^\//, ''));
    },
    readdir: async (path: string): Promise<string[]> => {
      const prefix = path.replace(/^\//, '').replace(/\/$/, '');
      const entries = new Set<string>();
      for (const p of fileMap.keys()) {
        if (p.startsWith(prefix)) {
          const relative = p.substring(prefix.length).replace(/^\//, '');
          const seg = relative.split('/')[0];
          if (seg) entries.add(seg);
        }
      }
      return Array.from(entries);
    },
    mkdir: async (): Promise<void> => {},
    rmdir: async (): Promise<void> => {},
    stat: async (path: string): Promise<any> => {
      const cleaned = path.replace(/^\//, '');
      const file = fileMap.get(cleaned);
      if (file) return { type: 'file', mode: file.mode, size: file.content.length };
      if (cleaned === '' || fileMap.size > 0) {
        // root dir exists
        return { type: 'dir', mode: 0o040000, size: 0 };
      }
      throw new Error(`ENOENT: ${path}`);
    },
    lstat: async (path: string): Promise<any> => {
      const cleaned = path.replace(/^\//, '');
      if (fileMap.has(cleaned)) {
        return { type: 'file', mode: 0o100644, size: 0 };
      }
      throw new Error(`ENOENT: ${path}`);
    },
    readlink: async (): Promise<string> => '',
    symlink: async (): Promise<void> => {},
    chmod: async (): Promise<void> => {},
  };
}

// ─── Git state management ──────────────────────────────────

interface CommitEntry {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}

interface RemoteEntry {
  name: string;
  url: string;
}

interface GitState {
  dir: string;
  branch: string;
  commits: CommitEntry[];
  stagedPaths: Set<string>;
  remotes: RemoteEntry[];
  initialized: boolean;
}

function createGitState(): GitState {
  return {
    dir: '/repo',
    branch: 'main',
    commits: [],
    stagedPaths: new Set(),
    remotes: [],
    initialized: false,
  };
}

function initGit(state: GitState, dir: string = '/repo'): void {
  state.dir = dir;
  state.initialized = true;
  state.branch = 'main';
  state.commits = [];
  state.stagedPaths.clear();

  // Mock initial commit
  state.commits.push({
    oid: 'abc1234def5678',
    message: 'Initial commit',
    author: 'AI Code Editor',
    timestamp: Date.now() - 86400000,
  });
}

function stageFile(state: GitState, path: string): void {
  state.stagedPaths.add(path);
}

function unstageFile(state: GitState, path: string): void {
  state.stagedPaths.delete(path);
}

function stageAll(state: GitState, filePaths: string[]): void {
  for (const path of filePaths) {
    state.stagedPaths.add(path);
  }
}

function unstageAll(state: GitState): void {
  state.stagedPaths.clear();
}

function gitCommit(state: GitState, message: string): CommitEntry {
  const oid = Math.random().toString(16).substring(2, 18);
  const commit: CommitEntry = {
    oid,
    message,
    author: 'AI Code Editor',
    timestamp: Date.now(),
  };
  state.commits.unshift(commit);
  state.stagedPaths.clear();
  return commit;
}

function addRemote(state: GitState, name: string, url: string): void {
  const existing = state.remotes.findIndex((r) => r.name === name);
  if (existing >= 0) {
    state.remotes[existing].url = url;
  } else {
    state.remotes.push({ name, url });
  }
}

function removeRemote(state: GitState, name: string): void {
  state.remotes = state.remotes.filter((r) => r.name !== name);
}

// ================================================================
describe('Git — Virtual FS', () => {
  it('should create an empty virtual filesystem', () => {
    const fs = createVirtualFS([]);
    expect(fs).toBeDefined();
    expect(fs.readFile).toBeDefined();
    expect(fs.writeFile).toBeDefined();
  });

  it('should readFile that exists', async () => {
    const fs = createVirtualFS([{ path: 'src/index.ts', content: 'console.log("hi")', language: 'typescript', updatedAt: 100 }]);
    const data = await fs.readFile('/src/index.ts');
    const text = new TextDecoder().decode(data);
    expect(text).toBe('console.log("hi")');
  });

  it('should readFile without leading slash', async () => {
    const fs = createVirtualFS([{ path: 'src/index.ts', content: 'x', language: 'typescript', updatedAt: 100 }]);
    const data = await fs.readFile('src/index.ts');
    const text = new TextDecoder().decode(data);
    expect(text).toBe('x');
  });

  it('should throw ENOENT for missing file', async () => {
    const fs = createVirtualFS([]);
    await expect(fs.readFile('/missing.txt')).rejects.toThrow('ENOENT');
  });

  it('should writeFile', async () => {
    const fs = createVirtualFS([]);
    const data = new TextEncoder().encode('new content');
    await fs.writeFile('/new.txt', data);
    const read = await fs.readFile('/new.txt');
    expect(new TextDecoder().decode(read)).toBe('new content');
  });

  it('should unlink (delete) file', async () => {
    const fs = createVirtualFS([{ path: 'file.txt', content: 'to delete', language: 'plaintext', updatedAt: 100 }]);
    await fs.unlink('/file.txt');
    await expect(fs.readFile('/file.txt')).rejects.toThrow('ENOENT');
  });

  it('should readdir returning file entries', async () => {
    const fs = createVirtualFS([
      { path: 'src/a.ts', content: 'a', language: 'typescript', updatedAt: 1 },
      { path: 'src/b.ts', content: 'b', language: 'typescript', updatedAt: 1 },
      { path: 'lib/c.ts', content: 'c', language: 'typescript', updatedAt: 1 },
    ]);
    const entries = await fs.readdir('src');
    expect(entries).toContain('a.ts');
    expect(entries).toContain('b.ts');
    expect(entries).not.toContain('c.ts');
  });

  it('should readdir with leading slash', async () => {
    const fs = createVirtualFS([
      { path: 'src/index.ts', content: 'x', language: 'typescript', updatedAt: 1 },
    ]);
    const entries = await fs.readdir('/src');
    expect(entries).toContain('index.ts');
  });

  it('should stat existing file', async () => {
    const fs = createVirtualFS([{ path: 'main.ts', content: 'hello world', language: 'typescript', updatedAt: 1 }]);
    const s = await fs.stat('/main.ts');
    expect(s.type).toBe('file');
    expect(s.mode).toBe(0o100644);
    expect(s.size).toBe(11);
  });

  it('should lstat existing file', async () => {
    const fs = createVirtualFS([{ path: 'main.ts', content: 'x', language: 'typescript', updatedAt: 1 }]);
    const s = await fs.lstat('/main.ts');
    expect(s.type).toBe('file');
  });

  it('should lstat throw for missing file', async () => {
    const fs = createVirtualFS([]);
    await expect(fs.lstat('/missing.txt')).rejects.toThrow('ENOENT');
  });

  it('should mkdir and rmdir be no-ops', async () => {
    const fs = createVirtualFS([]);
    await expect(fs.mkdir('/newdir')).resolves.toBeUndefined();
    await expect(fs.rmdir('/newdir')).resolves.toBeUndefined();
  });
});

describe('Git — State management', () => {
  let state: GitState;

  beforeEach(() => {
    state = createGitState();
  });

  it('should start uninitialized', () => {
    expect(state.initialized).toBe(false);
    expect(state.commits.length).toBe(0);
    expect(state.branch).toBe('main');
  });

  it('should initialize git successfully', () => {
    initGit(state);
    expect(state.initialized).toBe(true);
    expect(state.commits.length).toBe(1);
    expect(state.commits[0].message).toBe('Initial commit');
    expect(state.commits[0].oid).toBe('abc1234def5678');
  });

  it('should initialize git with custom directory', () => {
    initGit(state, '/my-project');
    expect(state.dir).toBe('/my-project');
    expect(state.initialized).toBe(true);
  });

  it('should stage files', () => {
    stageFile(state, 'src/index.ts');
    expect(state.stagedPaths.has('src/index.ts')).toBe(true);
  });

  it('should not duplicate staged files', () => {
    stageFile(state, 'src/a.ts');
    stageFile(state, 'src/a.ts');
    expect(state.stagedPaths.size).toBe(1);
  });

  it('should unstage files', () => {
    stageFile(state, 'src/a.ts');
    unstageFile(state, 'src/a.ts');
    expect(state.stagedPaths.has('src/a.ts')).toBe(false);
  });

  it('should stage all files', () => {
    stageAll(state, ['a.ts', 'b.ts', 'c.ts']);
    expect(state.stagedPaths.size).toBe(3);
  });

  it('should unstage all files', () => {
    stageAll(state, ['a.ts', 'b.ts']);
    unstageAll(state);
    expect(state.stagedPaths.size).toBe(0);
  });

  it('should create commit and clear staged', () => {
    stageFile(state, 'src/a.ts');
    const commit = gitCommit(state, 'feat: add a.ts');

    expect(commit.message).toBe('feat: add a.ts');
    expect(commit.oid.length).toBeGreaterThan(5);
    expect(state.commits[0]).toBe(commit);
    expect(state.stagedPaths.size).toBe(0);
  });

  it('should stack commits in order (most recent first)', () => {
    const c1 = gitCommit(state, 'first');
    const c2 = gitCommit(state, 'second');

    expect(state.commits[0].message).toBe('second');
    expect(state.commits[1].message).toBe('first');
  });
});

describe('Git — Remote management', () => {
  let state: GitState;

  beforeEach(() => {
    state = createGitState();
  });

  it('should add new remote', () => {
    addRemote(state, 'origin', 'https://github.com/user/repo.git');
    expect(state.remotes.length).toBe(1);
    expect(state.remotes[0].name).toBe('origin');
  });

  it('should update existing remote URL', () => {
    addRemote(state, 'origin', 'old-url');
    addRemote(state, 'origin', 'new-url');
    expect(state.remotes.length).toBe(1);
    expect(state.remotes[0].url).toBe('new-url');
  });

  it('should add multiple remotes', () => {
    addRemote(state, 'origin', 'url1');
    addRemote(state, 'upstream', 'url2');
    expect(state.remotes.length).toBe(2);
  });

  it('should remove remote', () => {
    addRemote(state, 'origin', 'url1');
    addRemote(state, 'upstream', 'url2');
    removeRemote(state, 'origin');
    expect(state.remotes.length).toBe(1);
    expect(state.remotes[0].name).toBe('upstream');
  });

  it('should handle removing non-existent remote', () => {
    removeRemote(state, 'nonexistent');
    expect(state.remotes.length).toBe(0);
  });
});
