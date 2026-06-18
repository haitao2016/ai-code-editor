// ============================================================
// Native File System Handlers (IPC)
// ============================================================
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { Stats } from 'fs';

export function setupFsHandlers(): void {
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = entries.map((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        let size = 0;
        let modified = 0;
        try {
          const st = fs.statSync(fullPath);
          size = st.size;
          modified = st.mtimeMs;
        } catch {
          /* ignore stat errors */
        }
        return {
          name: entry.name,
          path: fullPath,
          isDir: entry.isDirectory(),
          size,
          modified,
        };
      });
      return { success: true, items };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:stat', async (_event, filePath: string) => {
    try {
      const st = fs.statSync(filePath);
      return {
        success: true,
        stat: {
          size: st.size,
          isDir: st.isDirectory(),
          isFile: st.isFile(),
          mtime: st.mtimeMs,
          birthtime: st.birthtimeMs,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:exists', async (_event, filePath: string) => {
    return fs.existsSync(filePath);
  });

  ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:unlink', async (_event, filePath: string) => {
    try {
      fs.unlinkSync(filePath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fs:rmdir', async (_event, dirPath: string) => {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // File watching
  const watchers = new Map<string, fs.FSWatcher>();

  ipcMain.on('fs:watch', (event, watchPath: string) => {
    if (watchers.has(watchPath)) {
      watchers.get(watchPath)?.close();
    }

    try {
      const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
        if (filename) {
          event.sender.send('fs:change:change', { type: eventType, file: path.join(watchPath, filename) });
        }
      });
      watchers.set(watchPath, watcher);
    } catch {
      /* ignore watch errors */
    }
  });
}
