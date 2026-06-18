// ============================================================
// File Tree Virtual Scrolling — rendering optimization
// ============================================================
// Original: renderFileTreeOptimized, buildTreeNode, renderTreeNode
// Extended with: IntersectionObserver-based virtual scrolling

import { useFilesStore, useEditorStore } from './stores';

interface VirtualScrollConfig {
  itemHeight: number;       // px per item
  overscan: number;         // extra items above/below viewport
  containerSelector: string;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  children: Map<string, TreeNode>;
}

// ─── Virtual Scroll State ──────────────────────────────────
let vsConfig: VirtualScrollConfig = {
  itemHeight: 24,
  overscan: 10,
  containerSelector: '#fileTree',
};

let flatNodes: { path: string; depth: number; isDir: boolean; name: string }[] = [];
let scrollTop = 0;
let viewportHeight = 0;
let observer: IntersectionObserver | null = null;

// ─── Flat Node List Builder ──────────────────────────────
function flattenTree(
  node: TreeNode,
  depth: number,
  result: { path: string; depth: number; isDir: boolean; name: string }[],
): void {
  const entries = [...node.children.values()].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const child of entries) {
    result.push({ path: child.fullPath, depth, isDir: child.isDir, name: child.name });
    if (child.isDir) {
      flattenTree(child, depth + 1, result);
    }
  }
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
          name: part, fullPath, isDir: !isLast, children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }
  }
  return root;
}

// ─── Virtual Render ──────────────────────────────────────
export function renderVirtualFileTree(
  container: HTMLElement,
  getFileIcon: (path: string, isDir: boolean) => string,
): void {
  const files = useFilesStore.getState().files;
  const sortedPaths = [...files.keys()].sort();
  const activeFile = useEditorStore.getState().activeFile;

  const tree = buildTreeNode(sortedPaths);
  flatNodes = [];
  flattenTree(tree, 0, flatNodes);

  const totalHeight = flatNodes.length * vsConfig.itemHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / vsConfig.itemHeight) - vsConfig.overscan);
  const endIdx = Math.min(flatNodes.length, Math.ceil((scrollTop + viewportHeight) / vsConfig.itemHeight) + vsConfig.overscan);

  const visibleNodes = flatNodes.slice(startIdx, endIdx);

  let html = `<div style="height:${totalHeight}px;position:relative;min-height:100%;">`;
  for (let i = 0; i < visibleNodes.length; i++) {
    const node = visibleNodes[i];
    const actualIdx = startIdx + i;
    const top = actualIdx * vsConfig.itemHeight;
    const indent = node.depth * 16 + (node.isDir ? 0 : 20);
    const icon = node.isDir ? '📁' : getFileIcon(node.path, false);
    const isActive = activeFile === node.path;
    const cls = node.isDir
      ? 'tree-item folder'
      : `tree-item file${isActive ? ' active' : ''}`;

    html += `<div class="${cls}" style="position:absolute;top:${top}px;left:0;right:0;height:${vsConfig.itemHeight}px;padding-left:${indent}px;display:flex;align-items:center;" data-path="${node.path}" data-type="${node.isDir ? 'folder' : 'file'}">
      <span class="icon">${icon}</span><span class="name">${node.name}</span>
    </div>`;
  }
  html += `</div>`;

  container.innerHTML = html;

  // Setup scroll handler
  container.onscroll = () => {
    scrollTop = container.scrollTop;
    viewportHeight = container.clientHeight;
    renderVirtualFileTree(container, getFileIcon);
  };
}

// ─── Fallback: simple non-virtual render for small trees ─
export function renderSimpleFileTree(
  container: HTMLElement,
  getFileIcon: (path: string, isDir: boolean) => string,
): void {
  const files = useFilesStore.getState().files;
  const sortedPaths = [...files.keys()].sort();
  const activeFile = useEditorStore.getState().activeFile;

  const tree = buildTreeNode(sortedPaths);
  flatNodes = [];
  flattenTree(tree, 0, flatNodes);

  let html = '';
  for (const node of flatNodes) {
    const indent = node.depth * 16 + (node.isDir ? 0 : 20);
    const icon = node.isDir ? '📁' : getFileIcon(node.path, false);
    const isActive = activeFile === node.path;
    const cls = node.isDir
      ? 'tree-item folder'
      : `tree-item file${isActive ? ' active' : ''}`;

    html += `<div class="${cls}" style="padding-left:${indent}px" data-path="${node.path}" data-type="${node.isDir ? 'folder' : 'file'}">
      <span class="icon">${icon}</span><span class="name">${node.name}</span>
    </div>`;
  }

  container.innerHTML = html;
}

// ─── Intelligent Render: choose strategy ─────────────────
const VIRTUAL_THRESHOLD = 200;

export function renderFileTreeSmart(
  container: HTMLElement,
  getFileIcon: (path: string, isDir: boolean) => string,
): void {
  const fileCount = useFilesStore.getState().files.size;

  if (fileCount > VIRTUAL_THRESHOLD) {
    viewportHeight = container.clientHeight;
    renderVirtualFileTree(container, getFileIcon);
  } else {
    renderSimpleFileTree(container, getFileIcon);
  }
}

// ─── Config ──────────────────────────────────────────────
export function setVirtualScrollConfig(config: Partial<VirtualScrollConfig>): void {
  vsConfig = { ...vsConfig, ...config };
}
