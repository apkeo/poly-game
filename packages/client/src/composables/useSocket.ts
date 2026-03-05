import { io } from 'socket.io-client';
import { apiBaseUrl } from '../config/api';

/** Gdy VITE_API_BASE_URL jest ustawione – łączymy się tam; inaczej ten sam host (proxy). */
const SOCKET_URL = apiBaseUrl || '';

let socket: ReturnType<typeof io> | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      path: '/socket.io',
      autoConnect: true,
    });
  }
  return socket;
}

export function useCharacterProgress(characterId: string, onProgress: (data: { progress?: number; status?: string; modelUrl?: string; error?: string }) => void) {
  const s = getSocket();
  s.emit('subscribe:character', characterId);
  const handler = (data: { progress?: number; status?: string; modelUrl?: string; error?: string }) => onProgress(data);
  s.on('character:progress', handler);
  return () => {
    s.off('character:progress', handler);
    s.emit('unsubscribe:character', characterId);
  };
}
