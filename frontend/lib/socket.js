/**
 * Socket.io client helper with tenant/token room isolation.
 * Lazy-initializes a single socket connection.
 */
import { io } from 'socket.io-client';

let socket = null;

export function getSocket(token) {
  if (socket) return socket;

  const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

  socket = io(url, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    auth: token ? { token } : {},
  });

  socket.on('connect', () => {
    console.log('[SOCKET] connected', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('[SOCKET] connect_error', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[SOCKET] disconnected', reason);
  });

  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export default { getSocket, closeSocket };
