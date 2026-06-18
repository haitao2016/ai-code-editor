// ============================================================
// WebSocket Signaling Server for Collaboration
// ============================================================
// Run: npx tsx server/index.ts  OR  node server/index.js
//
// This server relays Yjs CRDT updates between collaborators.
// It does NOT store any document state — all state is in the
// clients' Yjs documents. The server is a dumb relay.
// ============================================================
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 4173;

interface Room {
  clients: Set<WebSocket>;
}

const rooms = new Map<string, Room>();

const wss = new WebSocketServer({ port: PORT });

console.log(`[Collab Server] Listening on ws://localhost:${PORT}`);

wss.on('connection', (ws: WebSocket, req: any) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const roomId = url.pathname.slice(1) || 'default';

  let room = rooms.get(roomId);
  if (!room) {
    room = { clients: new Set() };
    rooms.set(roomId, room);
  }
  room.clients.add(ws);

  console.log(`[Collab] Client joined room: ${roomId} (total: ${room.clients.size})`);

  // Notify others of new client
  const joinMsg = JSON.stringify({ type: 'system', event: 'join', room: roomId });
  room.clients.forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(joinMsg);
    }
  });

  ws.on('message', (data: Buffer) => {
    // Relay message to all other clients in the room
    if (!room) return;
    room.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });

  ws.on('close', () => {
    if (room) {
      room.clients.delete(ws);
      console.log(`[Collab] Client left room: ${roomId} (remaining: ${room.clients.size})`);

      // Notify others of client leaving
      const leaveMsg = JSON.stringify({ type: 'system', event: 'leave', room: roomId });
      room.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(leaveMsg);
        }
      });

      // Clean up empty rooms
      if (room.clients.size === 0) {
        rooms.delete(roomId);
        console.log(`[Collab] Room deleted: ${roomId}`);
      }
    }
  });

  ws.on('error', (err: Error) => {
    console.error(`[Collab] WebSocket error:`, err.message);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Collab] Shutting down...');
  wss.clients.forEach((ws) => ws.close());
  wss.close();
  process.exit(0);
});
