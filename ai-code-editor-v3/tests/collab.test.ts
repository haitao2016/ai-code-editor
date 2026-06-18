// ============================================================
// Collaboration Engine — CollabManager Unit Tests
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { collabManager } from '../src/core/collab';

describe('CollabManager', () => {
  beforeEach(() => {
    // Ensure clean state — leave any existing room
    if (collabManager.getRoomId()) {
      collabManager.leaveRoom();
    }
  });

  describe('Initial state', () => {
    it('should start disconnected with no room', () => {
      expect(collabManager.isConnected()).toBe(false);
      expect(collabManager.getRoomId()).toBeNull();
    });

    it('should have a default username', () => {
      const username = collabManager.getUsername();
      expect(username).toMatch(/^User-\d+$/);
    });

    it('should have a color from the COLORS palette', () => {
      const color = collabManager.getColor();
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('should have no collaborators initially', () => {
      const state = collabManager.getState();
      expect(state.collaborators).toHaveLength(0);
    });
  });

  describe('Username management', () => {
    it('should update username', () => {
      collabManager.setUsername('Alice');
      expect(collabManager.getUsername()).toBe('Alice');
    });

    it('should return updated state after username change', () => {
      collabManager.setUsername('Bob');
      const state = collabManager.getState();
      expect(state.username).toBe('Bob');
    });
  });

  describe('Room ID', () => {
    it('should generate random room IDs', () => {
      const id1 = collabManager.generateRoomId();
      const id2 = collabManager.generateRoomId();

      expect(id1).toMatch(/^[a-z0-9]{8}$/);
      expect(id2).toMatch(/^[a-z0-9]{8}$/);
      // Different each time (very likely)
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs of consistent length', () => {
      for (let i = 0; i < 20; i++) {
        const id = collabManager.generateRoomId();
        expect(id.length).toBe(8);
      }
    });
  });

  describe('State management', () => {
    it('should return immutable copy of state', () => {
      const state1 = collabManager.getState();
      const state2 = collabManager.getState();
      expect(state1).not.toBe(state2); // Different references
      expect(state1.roomId).toBe(state2.roomId);
    });

    it('should reflect connected status', () => {
      // Initially disconnected
      expect(collabManager.isConnected()).toBe(false);
      collabManager.leaveRoom(); // Should be safe to call even when not connected
      expect(collabManager.isConnected()).toBe(false);
    });
  });

  describe('Subscription', () => {
    it('should subscribe and receive notifications', () => {
      const listener = vi.fn();
      const unsubscribe = collabManager.subscribe(listener);

      // setUsername triggers notification
      collabManager.setUsername('NotifyTest');

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      listener.mockClear();

      // No more notifications after unsubscribe
      collabManager.setUsername('NoNotify');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle multiple subscribers', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      collabManager.subscribe(listener1);
      collabManager.subscribe(listener2);
      collabManager.subscribe(listener3);

      collabManager.setUsername('Multi');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });

    it('should return unsubscribe function that works', () => {
      const listener = vi.fn();
      const unsub = collabManager.subscribe(listener);

      unsub();
      collabManager.setUsername('AfterUnsub');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('leaveRoom', () => {
    it('should be safe to call multiple times', () => {
      expect(() => {
        collabManager.leaveRoom();
        collabManager.leaveRoom();
        collabManager.leaveRoom();
      }).not.toThrow();
    });

    it('should reset state after leaveRoom', () => {
      collabManager.setUsername('Temp');
      collabManager.leaveRoom();

      expect(collabManager.isConnected()).toBe(false);
      expect(collabManager.getRoomId()).toBeNull();
      expect(collabManager.getState().collaborators).toHaveLength(0);
    });
  });
});
