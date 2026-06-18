// ============================================================
// Electron LSP Handlers — spawn language servers in main process
// ============================================================
import { ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import type { LSPServerConfig } from '../src/core/lsp-types';

interface LSPProcess {
  config: LSPServerConfig;
  process: ChildProcess | null;
  status: 'starting' | 'running' | 'stopped' | 'error';
}

const lspProcesses = new Map<string, LSPProcess>();

function ensureProcess(config: LSPServerConfig): LSPProcess {
  let proc = lspProcesses.get(config.id);
  if (!proc) {
    proc = { config, process: null, status: 'stopped' };
    lspProcesses.set(config.id, proc);
  }
  return proc;
}

export function setupLSPHandlers(): void {
  // Start a language server
  ipcMain.handle('lsp:start', async (_event, config: LSPServerConfig) => {
    const proc = ensureProcess(config);

    if (proc.process) {
      try { proc.process.kill(); } catch {}
    }

    return new Promise<string>((resolve, reject) => {
      try {
        const child = spawn(config.command, config.args || [], {
          env: { ...process.env, ...config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        proc.process = child;
        proc.status = 'starting';

        const channel = `lsp:${config.id}`;

        // Forward stdout (LSP messages) to renderer
        child.stdout?.on('data', (data: Buffer) => {
          const text = data.toString();
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                // Try parsing as LSP message (Content-Length header)
                if (line.startsWith('Content-Length:')) {
                  _event.sender.send(`lsp:data:${config.id}`, line);
                } else {
                  // Raw JSON
                  _event.sender.send(`lsp:data:${config.id}`, line);
                }
              } catch {
                _event.sender.send(`lsp:data:${config.id}`, line);
              }
            }
          }
        });

        // Forward stderr as debug info
        child.stderr?.on('data', (data: Buffer) => {
          console.log(`[LSP ${config.id}] ${data.toString().trim()}`);
        });

        child.on('error', (err) => {
          proc.status = 'error';
          _event.sender.send(`lsp:error:${config.id}`, err.message);
          reject(err.message);
        });

        child.on('exit', (code) => {
          proc.status = 'stopped';
          proc.process = null;
          _event.sender.send(`lsp:closed:${config.id}`, code);
        });

        proc.status = 'running';
        resolve(channel);
      } catch (err: any) {
        proc.status = 'error';
        reject(err.message);
      }
    });
  });

  // Write data to language server stdin
  ipcMain.on('lsp:write', (_event, channel: string, data: string) => {
    const id = channel.replace('lsp:', '');
    const proc = lspProcesses.get(id);
    if (proc?.process?.stdin) {
      proc.process.stdin.write(data);
    }
  });

  // Close a language server
  ipcMain.on('lsp:close', (_event, channel: string) => {
    const id = channel.replace('lsp:', '');
    const proc = lspProcesses.get(id);
    if (proc?.process) {
      try { proc.process.kill(); } catch {}
      proc.process = null;
      proc.status = 'stopped';
    }
    lspProcesses.delete(id);
  });

  // Shutdown all LSP servers
  ipcMain.on('lsp:shutdownAll', () => {
    for (const [id, proc] of lspProcesses) {
      try { proc.process?.kill(); } catch {}
    }
    lspProcesses.clear();
  });
}
