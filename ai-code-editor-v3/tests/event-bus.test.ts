// ============================================================
// Event Bus Unit Tests
// ============================================================
import { describe, it, expect, vi } from 'vitest';

// Minimal EventBus implementation for testing
class EventBus {
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  on(event: string, cb: (...args: any[]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  once(event: string, cb: (...args: any[]) => void): () => void {
    const unsub = this.on(event, (...args) => {
      unsub();
      cb(...args);
    });
    return unsub;
  }

  emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach((cb) => {
      try { cb(data); } catch (err) { /* suppress handler errors */ }
    });
  }

  clear(event?: string): void {
    event ? this.listeners.delete(event) : this.listeners.clear();
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }
}

describe('EventBus', () => {
  it('should subscribe and receive events', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on('test:event', handler);
    bus.emit('test:event', { value: 42 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('should allow multiple subscribers', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on('multi', h1);
    bus.on('multi', h2);
    bus.emit('multi', 'data');

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('should handle unsubscription', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.on('test', handler);
    unsub();
    bus.emit('test', 'data');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should fire once listeners only once', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.once('once', handler);
    bus.emit('once', 'a');
    bus.emit('once', 'b');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('a');
  });

  it('should count listeners', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('test')).toBe(0);

    bus.on('test', () => {});
    bus.on('test', () => {});
    expect(bus.listenerCount('test')).toBe(2);
  });

  it('should clear all listeners', () => {
    const bus = new EventBus();
    bus.on('a', () => {});
    bus.on('b', () => {});
    bus.clear();
    expect(bus.listenerCount('a')).toBe(0);
    expect(bus.listenerCount('b')).toBe(0);
  });

  it('should clear specific event listeners', () => {
    const bus = new EventBus();
    bus.on('a', () => {});
    bus.on('b', () => {});
    bus.clear('a');
    expect(bus.listenerCount('a')).toBe(0);
    expect(bus.listenerCount('b')).toBe(1);
  });

  it('should not fail when emitting with no listeners', () => {
    const bus = new EventBus();
    expect(() => bus.emit('none', null)).not.toThrow();
  });

  it('should catch handler errors without breaking other handlers', () => {
    const bus = new EventBus();
    const good = vi.fn();
    const bad = vi.fn(() => { throw new Error('bad handler'); });

    bus.on('test', bad);
    bus.on('test', good);
    bus.emit('test', null);

    expect(good).toHaveBeenCalledTimes(1);
  });
});
