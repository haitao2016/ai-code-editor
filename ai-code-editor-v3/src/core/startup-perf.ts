// ============================================================
// Startup Performance — 懒加载 + 骨架屏 + 缓存优化
// ============================================================

// ─── Lazy module loader with priority ─────────────────────
type ModuleLoader = () => Promise<any>;

interface LazyModule {
  name: string;
  loader: ModuleLoader;
  priority: 'critical' | 'high' | 'normal' | 'low' | 'idle';
  loaded: boolean;
}

const lazyModules: LazyModule[] = [];

// ─── Register lazy modules ─────────────────────────────────
export function registerLazyModule(
  name: string,
  loader: ModuleLoader,
  priority: LazyModule['priority'] = 'normal',
): void {
  lazyModules.push({ name, loader, priority, loaded: false });
}

// ─── Load modules by priority ──────────────────────────────
export async function loadByPriority(): Promise<void> {
  const priorities: LazyModule['priority'][] = ['critical', 'high', 'normal', 'low', 'idle'];

  for (const priority of priorities) {
    const modules = lazyModules.filter((m) => m.priority === priority && !m.loaded);

    if (priority === 'idle') {
      // Load idle-priority modules in requestIdleCallback or after delay
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => loadModules(modules));
      } else {
        setTimeout(() => loadModules(modules), 3000);
      }
    } else {
      await loadModules(modules);
    }
  }
}

async function loadModules(modules: LazyModule[]): Promise<void> {
  for (const mod of modules) {
    try {
      await mod.loader();
      mod.loaded = true;
    } catch (e) {
      console.warn(`[Startup] Failed to load module: ${mod.name}`, e);
    }
  }
}

// ─── Skeleton screen ──────────────────────────────────────
export function showSkeletonScreen(): void {
  const app = document.getElementById('workspace');
  if (!app) return;

  const skeleton = document.createElement('div');
  skeleton.id = 'skeletonScreen';
  skeleton.style.cssText = `
    position: absolute;
    inset: 0;
    background: var(--bg-primary);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    opacity: 1;
    transition: opacity 0.3s ease;
  `;

  skeleton.innerHTML = `
    <!-- Titlebar skeleton -->
    <div style="height:36px;background:var(--bg-tertiary);display:flex;align-items:center;padding:0 12px;gap:8px;">
      <div style="width:18px;height:18px;background:var(--bg-hover);border-radius:4px;"></div>
      <div style="width:120px;height:14px;background:var(--bg-hover);border-radius:6px;"></div>
    </div>
    <!-- Main content skeleton -->
    <div style="flex:1;display:flex;min-height:0;">
      <!-- Activity bar -->
      <div style="width:44px;background:var(--bg-tertiary);display:flex;flex-direction:column;align-items:center;padding:8px 0;gap:4px;">
        ${Array(8).fill('<div style="width:28px;height:28px;background:var(--bg-hover);border-radius:6px;"></div>').join('')}
      </div>
      <!-- Sidebar -->
      <div style="width:260px;background:var(--bg-sidebar);border-right:1px solid var(--border-color);padding:12px;">
        ${Array(6).fill('<div style="height:24px;background:var(--bg-hover);border-radius:4px;margin-bottom:6px;width:' + (40 + Math.random() * 40) + '%;"></div>').join('')}
      </div>
      <!-- Editor area -->
      <div style="flex:1;padding:16px;display:flex;flex-direction:column;gap:10px;">
        <div style="height:24px;background:var(--bg-hover);border-radius:4px;width:60%;"></div>
        ${Array(10).fill('<div style="display:flex;gap:8px;align-items:center;"><div style="width:30px;height:16px;background:var(--bg-hover);border-radius:3px;"></div><div style="flex:1;height:16px;background:var(--bg-hover);border-radius:3px;width:' + (30 + Math.random() * 50) + '%;"></div></div>').join('')}
      </div>
    </div>
  `;

  app.appendChild(skeleton);
}

export function hideSkeletonScreen(): void {
  const skeleton = document.getElementById('skeletonScreen');
  if (!skeleton) return;

  skeleton.style.opacity = '0';
  setTimeout(() => {
    skeleton.remove();
  }, 300);
}

// ─── Performance metrics ───────────────────────────────────
interface PerfMetric {
  name: string;
  startTime: number;
  duration?: number;
}

const metrics: PerfMetric[] = [];
const metricMap: Map<string, PerfMetric> = new Map();

export function startPerfMeasure(name: string): void {
  const metric: PerfMetric = { name, startTime: performance.now() };
  metrics.push(metric);
  metricMap.set(name, metric);
}

export function endPerfMeasure(name: string): void {
  const metric = metricMap.get(name);
  if (metric) {
    metric.duration = performance.now() - metric.startTime;
  }
}

export function getPerfMetrics(): PerfMetric[] {
  return [...metrics];
}

export function logPerfMetrics(): void {
  const total = metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
  console.group('🚀 Startup Performance');
  metrics.forEach((m) => {
    const bar = '█'.repeat(Math.round((m.duration || 0) / 20));
    console.log(`${m.name.padEnd(25)} ${(m.duration || 0).toFixed(1).padStart(7)}ms  ${bar}`);
  });
  console.log(`${'TOTAL'.padEnd(25)} ${total.toFixed(1).padStart(7)}ms`);
  console.groupEnd();
}

// ─── Preload critical resources ────────────────────────────
export function preloadCriticalCSS(): void {
  // Preload font
  const fontLink = document.createElement('link');
  fontLink.rel = 'preload';
  fontLink.as = 'style';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap';
  document.head.appendChild(fontLink);
}

// ─── IndexedDB cache management ────────────────────────────
export async function preloadFilesCache(): Promise<void> {
  try {
    const { loadAllFiles, initDefaultFiles } = await import('./files');
    const { useFilesStore } = await import('./stores');

    const files = await initDefaultFiles();
    useFilesStore.getState().loadFiles(files);

    return files;
  } catch {
    // Silent failure — app continues without preloaded cache
  }
}

// ─── Bundle size reporter (dev only) ──────────────────────
export function reportBundleSize(): void {
  if (import.meta.env.DEV) {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    let totalJS = 0;
    let totalCSS = 0;

    resources.forEach((r) => {
      if (r.name.endsWith('.js') || r.name.includes('.js?')) totalJS += r.transferSize || 0;
      if (r.name.endsWith('.css')) totalCSS += r.transferSize || 0;
    });

    console.log(`📦 JS: ${(totalJS / 1024).toFixed(1)}KB | CSS: ${(totalCSS / 1024).toFixed(1)}KB`);
  }
}
