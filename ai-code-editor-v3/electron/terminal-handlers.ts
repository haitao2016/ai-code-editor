// ============================================================
// Native Terminal Handler (node-pty)
// ============================================================
import { ipcMain } from 'electron';
import * as os from 'os';
import * as path from 'path';
import { exec, spawn } from 'child_process';

let ptyModule: any = null;
let fallbackMode = false;

try {
  ptyModule = require('node-pty');
} catch {
  console.warn('[Terminal] node-pty not available, using fallback shell');
  fallbackMode = true;
}

interface TerminalInstance {
  pty: any;
  id: number;
  cols: number;
  rows: number;
}

const terminals = new Map<number, TerminalInstance>();
let nextId = 1;

export function setupTerminal(): void {
  ipcMain.handle('terminal:create', async (event, cols: number, rows: number) => {
    const id = nextId++;

    if (fallbackMode || !ptyModule) {
      terminals.set(id, { pty: null, id, cols, rows } as any);
      return { success: true, id, fallback: true };
    }

    try {
      const shell = process.platform === 'win32'
        ? (process.env.COMSPEC || 'cmd.exe')
        : (process.env.SHELL || '/bin/bash');

      const cwd = process.platform === 'win32'
        ? process.env.USERPROFILE || 'C:\\'
        : os.homedir();

      const ptyProcess = ptyModule.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      ptyProcess.onData((data: string) => {
        event.sender.send('terminal:data', id, data);
      });

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        event.sender.send('terminal:exit', id, exitCode);
        terminals.delete(id);
      });

      terminals.set(id, { pty: ptyProcess, id, cols, rows });

      // Send initial prompt
      setTimeout(() => {
        event.sender.send('terminal:data', id, `\x1b[32mAI Code Editor Terminal v3.0\x1b[0m\r\n`);
        event.sender.send('terminal:data', id, `\x1b[33m${cwd}\x1b[0m $ `);
      }, 100);

      return { success: true, id, fallback: false };
    } catch (err: any) {
      console.error('[Terminal] Failed to create:', err.message);
      terminals.set(id, { pty: null, id, cols, rows } as any);
      return { success: true, id, fallback: true };
    }
  });

  ipcMain.on('terminal:write', (_event, id: number, data: string) => {
    const term = terminals.get(id);
    if (term?.pty) {
      term.pty.write(data);
    }
  });

  ipcMain.on('terminal:resize', (_event, id: number, cols: number, rows: number) => {
    const term = terminals.get(id);
    if (term?.pty) {
      term.pty.resize(cols, rows);
    }
    if (term) {
      term.cols = cols;
      term.rows = rows;
    }
  });

  ipcMain.on('terminal:kill', (_event, id: number) => {
    const term = terminals.get(id);
    if (term?.pty) {
      term.pty.kill();
    }
    terminals.delete(id);
  });

  // ─── Agent command execution: real shell commands ────────
  ipcMain.handle('exec:command', async (_event, command: string, cwd?: string) => {
    const workDir = cwd || process.cwd();
    const timeout = 30000; // 30s timeout

    return new Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const child = exec(command, {
        cwd: workDir,
        timeout,
        maxBuffer: 1024 * 1024, // 1MB max output
        env: { ...process.env },
        shell: process.platform === 'win32'
          ? (process.env.COMSPEC || 'cmd.exe')
          : (process.env.SHELL || '/bin/bash'),
      }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error?.code || 0,
        });
      });

      // Ensure cleanup on timeout
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill();
        }
      }, timeout);
    });
  });

  // ─── Agent: spawn with real-time output ─────────────────
  ipcMain.handle('exec:spawn', async (event, command: string, args: string[], cwd?: string) => {
    const workDir = cwd || process.cwd();

    return new Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const child = spawn(command, args, {
        cwd: workDir,
        env: { ...process.env },
        shell: process.platform === 'win32',
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      child.on('error', (err) => {
        resolve({
          success: false,
          stdout,
          stderr: err.message,
          exitCode: 1,
        });
      });

      // Timeout after 60s
      setTimeout(() => {
        if (!child.killed) {
          child.kill();
        }
      }, 60000);
    });
  });
}
