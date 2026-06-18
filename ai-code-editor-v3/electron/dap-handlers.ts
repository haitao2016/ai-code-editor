// ============================================================
// Electron DAP Handlers — spawn debug adapters in main process
// ============================================================
import { ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';

interface DAPProcess {
  process: ChildProcess | null;
  status: 'starting' | 'running' | 'stopped' | 'error';
  onMessage?: (data: string) => void;
  onClose?: () => void;
}

const dapProcesses = new Map<string, DAPProcess>();

export function setupDAPHandlers(): void {
  // Start a debug adapter — returns sessionId on success, error string on failure
  ipcMain.handle('dap:start', async (_event, sessionId: string, config: any) => {
    console.log(`[DAP] Starting session ${sessionId} for ${config.type}`);

    const proc: DAPProcess = { process: null, status: 'starting' };
    dapProcesses.set(sessionId, proc);

    try {
      let command: string;
      let args: string[] = [];
      const sender = _event.sender;
      const senderWindow = sender.getOwnerBrowserWindow ? sender : _event.sender;

      // Select debug adapter based on type
      switch (config.type) {
        case 'node': {
          // Use node as debug adapter with --inspect-brk
          // The debug adapter protocol goes over the --inspect WebSocket
          const port = config.port || 9229;
          command = 'node';
          args = [`--inspect-brk=0.0.0.0:${port}`, config.program || 'index.js'];
          if (config.args) args.push(...config.args);
          // Store port for WebSocket DAP client
          proc.status = 'running';
          break;
        }
        case 'python': {
          command = config.runtimeExecutable || 'python';
          args = ['-m', 'debugpy', '--listen', `${config.host || 'localhost'}:${config.port || 5678}`];
          if (config.program) args.push(config.program);
          if (config.args) args.push(...config.args);
          break;
        }
        case 'node_dap':
        case 'js-debug': {
          // Use VS Code js-debug or standalone DAP
          command = config.runtimeExecutable || 'node';
          const adapterPath = config.adapterPath || 'js-debug';
          args = [adapterPath, String(config.port || 9229)];
          break;
        }
        default: {
          dapProcesses.delete(sessionId);
          return { error: `Unsupported debug type: ${config.type}` };
        }
      }

      const child = spawn(command, args, {
        cwd: config.cwd || process.cwd(),
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      proc.process = child;
      proc.status = 'running';

      // Build DAP message buffer for Content-Length framed messages
      let dapBuffer = '';

      // Forward stdout messages (DAP protocol via Content-Length header)
      child.stdout?.on('data', (data: Buffer) => {
        dapBuffer += data.toString();
        // Parse Content-Length framed messages
        while (true) {
          const headerMatch = dapBuffer.match(/^Content-Length: (\d+)\r\n\r\n/);
          if (!headerMatch) break;
          const length = parseInt(headerMatch[1]);
          const headerEnd = headerMatch[0].length;
          if (dapBuffer.length < headerEnd + length) break; // Wait for full message
          const jsonBody = dapBuffer.substring(headerEnd, headerEnd + length);
          dapBuffer = dapBuffer.substring(headerEnd + length);
          sender.send(`dap:data:${sessionId}`, jsonBody);
        }
      });

      // Forward stderr
      child.stderr?.on('data', (data: Buffer) => {
        sender.send(`dap:error:${sessionId}`, data.toString().trim());
      });

      child.on('error', (err) => {
        proc.status = 'error';
        sender.send(`dap:error:${sessionId}`, err.message);
      });

      child.on('exit', (code) => {
        proc.status = 'stopped';
        sender.send(`dap:closed:${sessionId}`, code || 0);
        dapProcesses.delete(sessionId);
      });

      return { success: true, sessionId };
    } catch (err: any) {
      proc.status = 'error';
      return { error: err.message };
    }
  });

  // Write to debug adapter stdin
  ipcMain.on('dap:write', (_event, sessionId: string, data: string) => {
    const proc = dapProcesses.get(sessionId);
    if (proc?.process?.stdin) {
      proc.process.stdin.write(data + '\n');
    }
  });

  // Register message handler
  ipcMain.on('dap:onMessage', (_event, sessionId: string) => {
    const proc = dapProcesses.get(sessionId);
    if (proc) {
      proc.onMessage = (data) => {
        _event.sender.send(`dap:data:${sessionId}`, data);
      };
    }
  });

  // Register close handler
  ipcMain.on('dap:onClose', (_event, sessionId: string) => {
    const proc = dapProcesses.get(sessionId);
    if (proc) {
      proc.onClose = () => {
        _event.sender.send(`dap:closed:${sessionId}`, 0);
      };
    }
  });

  // Stop a debug session
  ipcMain.on('dap:stop', (_event, sessionId: string) => {
    const proc = dapProcesses.get(sessionId);
    if (proc?.process) {
      try { proc.process.kill(); } catch {}
    }
    dapProcesses.delete(sessionId);
  });
}
