// ============================================================
// DAP Electron Transport — IPC-based transport for debug adapters
// ============================================================
import type { DAPTransport } from './dap-client';

export function createDAPElectronTransport(electronAPI: any, sessionId: string): DAPTransport {
  const messageCallbacks: ((data: string) => void)[] = [];
  const closeCallbacks: (() => void)[] = [];

  const handler = (_event: any, data: string) => {
    for (const cb of messageCallbacks) { cb(data); }
  };

  const closeHandler = () => {
    for (const cb of closeCallbacks) { cb(); }
  };

  electronAPI.dap.onData?.(sessionId, handler);
  electronAPI.dap.onClose?.(sessionId, closeHandler);

  return {
    send(data: string) {
      electronAPI.dap.write(sessionId, data);
    },
    onMessage(cb: (data: string) => void) {
      messageCallbacks.push(cb);
    },
    onClose(cb: () => void) {
      closeCallbacks.push(cb);
    },
    close() {
      electronAPI.dap.stop(sessionId);
    },
  };
}
