// ============================================================
// Tests: Error Logger (pure logic, no IndexedDB)
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
// Test the module through dynamic import (Vite handles TS transform)
import {
  logError, logWarn, logInfo, logDebug,
  getErrorCount, getErrorLogs, getAllLogs, clearLogs, onLog,
} from '../src/core/error-logger';

describe('Error Logger', () => {
  beforeEach(() => {
    clearLogs();
  });

  it('should create log entries with correct severity', () => {
    const errEntry = logError('test', 'error message');
    expect(errEntry.severity).toBe('error');
    expect(errEntry.module).toBe('test');
    expect(errEntry.message).toBe('error message');
    expect(errEntry.stack).toBeDefined();

    const warnEntry = logWarn('test', 'warn message');
    expect(warnEntry.severity).toBe('warn');
    expect(warnEntry.stack).toBeDefined();

    const infoEntry = logInfo('test', 'info message');
    expect(infoEntry.severity).toBe('info');
    expect(infoEntry.stack).toBeUndefined();

    const debugEntry = logDebug('test', 'debug message');
    expect(debugEntry.severity).toBe('debug');
    expect(debugEntry.stack).toBeUndefined();
  });

  it('should track error count by module', () => {
    logError('module-a', 'err1');
    logError('module-a', 'err2');
    logError('module-b', 'err3');
    logError('module-a', 'err4');

    expect(getErrorCount('module-a')).toBe(3);
    expect(getErrorCount('module-b')).toBe(1);
    expect(getErrorCount()).toBe(4);
  });

  it('should filter logs by severity and module', () => {
    logError('api', 'api error');
    logWarn('api', 'api warning');
    logError('editor', 'editor error');

    const errors = getErrorLogs('error');
    expect(errors.length).toBe(2);

    const apiErrors = getErrorLogs('error', 'api');
    expect(apiErrors.length).toBe(1);
    expect(apiErrors[0].message).toBe('api error');
  });

  it('should support log subscription', () => {
    let receivedMessage = '';
    const unsub = onLog((entry) => {
      receivedMessage = entry.message;
    });

    logError('test', 'subscribed error');
    expect(receivedMessage).toBe('subscribed error');

    unsub();
    receivedMessage = '';
    logError('test', 'after unsub');
    expect(receivedMessage).toBe('');
  });

  it('should have unique IDs for each entry', () => {
    const e1 = logError('test', 'msg1');
    const e2 = logError('test', 'msg2');
    const e3 = logError('test', 'msg3');

    expect(e1.id).not.toBe(e2.id);
    expect(e2.id).not.toBe(e3.id);
    expect(e1.id).toBeLessThan(e2.id);
  });

  it('should handle getAllLogs after multiple entries', () => {
    logError('x', 'a');
    logError('y', 'b');

    const all = getAllLogs();
    expect(all.length).toBe(2);
    expect(all[0].module).toBe('x');
    expect(all[1].module).toBe('y');
  });

  it('should clear all logs', () => {
    logError('a', 'msg');
    logError('b', 'msg');
    expect(getAllLogs().length).toBe(2);

    clearLogs();
    expect(getAllLogs().length).toBe(0);
  });

  it('should return empty results for unknown module', () => {
    const result = getErrorLogs('error', 'nonexistent');
    expect(result).toEqual([]);
    expect(getErrorCount('nonexistent')).toBe(0);
  });
});
