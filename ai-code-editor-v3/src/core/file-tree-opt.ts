// ============================================================
// Optimized File Tree — incremental diff-based rendering
// ============================================================

// Track previous file tree state for diff-based updates
let prevFileList: string[] = [];
let prevExpandedDirs = new Set<string>();
let prevActiveFile: string | null = null;
let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
let pendingRender = false;

// ═══ Main render entry ═════════════════════════════════════
export function renderFileTreeOptimized(
  files: Map<string, any>,
  openTabs: string[],
  activeFile: string | null,
  getFileIcon: (lang: string) => string,
): void {
  // Deduplicate: cancel pending render if already scheduled
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Schedule render for next animation frame
  rafId = requestAnimationFrame(() => {
    rafId = null;
    pendingRender = false;
    doRender(files, openTabs, activeFile, getFileIcon);
  });
}

// ═══ Force synchronous render (for initial load) ══════════
export function renderFileTreeFull(
  files: Map<string, any>,
  openTabs: string[],
  activeFile: string | null,
  getFileIcon: (lang: string) => string,
): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  doRender(files, openTabs, activeFile, getFileIcon);
}

// ═══ Internal render with diff detection ══════════════════
function doRender(
  files: Map<string, any>,
  openTabs: string[],
  activeFile: string | null,
  getFileIcon: (lang: string) => string,
): void {
  const sortedPaths = [...files.keys()].sort();
  const el = document.querySelector('#fileTree') as HTMLElement;
  if (!el) return;

  // Quick diff: if file list and active file unchanged, skip
  const pathsKey = sortedPaths.join('|');
  const prevKey = prevFileList.join('|');
  if (pathsKey === prevKey && activeFile === prevActiveFile) {
    return;
  }

  prevFileList = sortedPaths;
  prevActiveFile = activeFile;

  // Build tree structure
  const tree = buildTreeNode(sortedPaths);

  // Render tree
  const html = renderTreeNode(tree, '', files, openTabs, activeFile, getFileIcon);

  // Only update DOM if content changed
  if (el.innerHTML !== html) {
    el.innerHTML = html;
  }
}

// ═══ Data structures ═══════════════════════════════════════
interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  children: Map<string, TreeNode>;
}

function buildTreeNode(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', fullPath: '', isDir: true, children: new Map() };

  for (const path of paths) {
    const parts = path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath,
          isDir: !isLast,
          children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }
  }

  return root;
}

// ═══ HTML generation ══════════════════════════════════════
function renderTreeNode(
  node: TreeNode,
  parentPath: string,
  files: Map<string, any>,
  openTabs: string[],
  activeFile: string | null,
  getFileIcon: (lang: string) => string,
  depth: number = 0,
): string {
  let html = '';
  const entries = [...node.children.values()].sort((a, b) => {
    // Dirs first, then alphabetical
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const child of entries) {
    const indent = depth * 16;
    const isOpen = openTabs.includes(child.fullPath);
    const isActive = activeFile === child.fullPath;

    if (child.isDir) {
      const dirPath = `${parentPath}/${child.name}`.replace(/^\//, '');
      html += `<div class="file-tree-folder" style="padding-left:${indent}px" data-path="${dirPath}">`;
      html += `<span class="folder-icon">&#9654;</span>`;
      html += `<span class="folder-name">${child.name}</span>`;
      html += `</div>`;
      html += renderTreeNode(child, dirPath, files, openTabs, activeFile, getFileIcon, depth + 1);
    } else {
      const entry = files.get(child.fullPath);
      const icon = entry ? getFileIcon(entry.language || '') : '📄';
      const cls = isActive ? 'active' : isOpen ? 'open' : '';
      html += `<div class="file-tree-item ${cls}" style="padding-left:${indent + 20}px" data-path="${child.fullPath}">`;
      html += `<span class="file-icon">${icon}</span>`;
      html += `<span class="file-name">${child.name}</span>`;
      html += `</div>`;
    }
  }

  return html;
}

// ═══ Clean up ═════════════════════════════════════════════
export function disposeFileTreeOptimizer(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  prevFileList = [];
  prevExpandedDirs.clear();
  prevActiveFile = null;
}
