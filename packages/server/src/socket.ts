import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { initGameRoom, registerGameSocket } from './gameRoom.js';

let io: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: true },
    path: '/socket.io',
  });

  initGameRoom(io);

  io.on('connection', (socket) => {
    socket.on('subscribe:character', (characterId: string) => {
      socket.join(`character:${characterId}`);
    });
    socket.on('unsubscribe:character', (characterId: string) => {
      socket.leave(`character:${characterId}`);
    });
    registerGameSocket(socket);
  });

  return io;
}

export function getIo(): Server | null {
  return io;
}

export function emitCharacterProgress(characterId: string, data: { progress?: number; status?: string; modelUrl?: string; error?: string }): void {
  io?.to(`character:${characterId}`).emit('character:progress', data);
}
