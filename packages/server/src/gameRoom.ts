import type { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { Character } from './models/Character.js';

const GAME_ROOM = 'game';
const DEFAULT_HP = 10;
const SNOWBALL_SPEED = 25;
const PLAYER_HIT_RADIUS = 0.8;
const THROW_COOLDOWN_MS = 800;
const START_SNOWBALLS = 1;

let gameIo: Server | null = null;

export interface GamePlayerState {
  socketId: string;
  playerId: string;
  characterId: string;
  displayName?: string;
  position: [number, number, number];
  rotationY: number;
  animation: string;
  hp: number;
  snowballs: number;
  riggedModelUrl?: string;
  animationUrls?: { id: string; name: string; url: string }[];
}

export interface SnowballState {
  id: string;
  fromSocketId: string;
  position: [number, number, number];
  direction: [number, number, number];
  startTime: number;
}

const players = new Map<string, GamePlayerState>();
const snowballs = new Map<string, SnowballState>();
let stateTickInterval: ReturnType<typeof setInterval> | null = null;

function broadcastState() {
  if (!gameIo) return;
  const list = Array.from(players.values()).map((p) => ({
    socketId: p.socketId,
    playerId: p.playerId,
    characterId: p.characterId,
    displayName: p.displayName,
    position: p.position,
    rotationY: p.rotationY,
    animation: p.animation,
    hp: p.hp,
    snowballs: p.snowballs,
    riggedModelUrl: p.riggedModelUrl,
    animationUrls: p.animationUrls,
  }));
  gameIo.to(GAME_ROOM).emit('game:state', { players: list });
}

function broadcastSnowballs() {
  if (!gameIo) return;
  const list = Array.from(snowballs.values()).map((s) => ({
    id: s.id,
    fromSocketId: s.fromSocketId,
    position: [...s.position],
    direction: [...s.direction],
    startTime: s.startTime,
  }));
  gameIo.to(GAME_ROOM).emit('game:snowballs', { snowballs: list });
}

function tick() {
  if (!gameIo) return;
  const now = Date.now() / 1000;
  for (const [id, ball] of snowballs.entries()) {
    const elapsed = now - ball.startTime;
    const dist = elapsed * SNOWBALL_SPEED;
    ball.position[0] += ball.direction[0] * SNOWBALL_SPEED * (1 / 60);
    ball.position[1] += ball.direction[1] * SNOWBALL_SPEED * (1 / 60);
    ball.position[2] += ball.direction[2] * SNOWBALL_SPEED * (1 / 60);
    if (dist > 30) {
      snowballs.delete(id);
      continue;
    }
    for (const [, p] of players) {
      if (p.socketId === ball.fromSocketId) continue;
      if (p.hp <= 0) continue;
      const dx = ball.position[0] - p.position[0];
      const dy = ball.position[1] - (p.position[1] + 1);
      const dz = ball.position[2] - p.position[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < PLAYER_HIT_RADIUS) {
        snowballs.delete(id);
        p.hp = Math.max(0, p.hp - 1);
        gameIo.to(GAME_ROOM).emit('game:snowball-hit', {
          snowballId: id,
          targetSocketId: p.socketId,
          position: [...ball.position],
        });
        gameIo.to(GAME_ROOM).emit('game:hp', { socketId: p.socketId, hp: p.hp });
        break;
      }
    }
  }
  broadcastSnowballs();
  broadcastState();
}

export function initGameRoom(io: Server) {
  gameIo = io;
  if (stateTickInterval) return;
  stateTickInterval = setInterval(tick, 1000 / 60);
}

export function registerGameSocket(socket: Socket): void {
  let lastThrowTime = 0;

  socket.on('game:join', async (payload: { characterId: string; playerId: string }) => {
    const { characterId, playerId } = payload ?? {};
    if (!characterId || !playerId) {
      socket.emit('game:error', { message: 'characterId and playerId required' });
      return;
    }
    const character = await Character.findById(characterId).lean();
    if (!character) {
      socket.emit('game:error', { message: 'Character not found' });
      return;
    }
    if (character.playerId?.toString() !== playerId) {
      socket.emit('game:error', { message: 'Character does not belong to player' });
      return;
    }
    if (character.status !== 'completed' || !character.riggedModelPath || !character.animations?.length) {
      socket.emit('game:error', { message: 'Postać musi być w pełni gotowa (rig + animacje)' });
      return;
    }

    const riggedModelUrl = character.riggedModelPath
      ? `/uploads/${String(character.riggedModelPath).replace(/\\/g, '/')}`
      : undefined;
    const animationUrls = character.animations?.map((a: { id: string; name: string; glbPath: string }) => ({
      id: a.id,
      name: a.name,
      url: `/uploads/${String(a.glbPath).replace(/\\/g, '/')}`,
    }));

    const myState: GamePlayerState = {
      socketId: socket.id,
      playerId,
      characterId,
      displayName: character.description ? String(character.description).slice(0, 80) : undefined,
      position: [0, 0, 0],
      rotationY: Math.PI,
      animation: '',
      hp: DEFAULT_HP,
      snowballs: START_SNOWBALLS,
      riggedModelUrl,
      animationUrls,
    };
    players.set(socket.id, myState);
    socket.join(GAME_ROOM);
    socket.emit('game:joined', { socketId: socket.id });
    broadcastState();
  });

  socket.on('game:state', (payload: { position: [number, number, number]; rotationY: number; animation: string }) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (Array.isArray(payload.position) && payload.position.length >= 3) {
      p.position = [payload.position[0], payload.position[1], payload.position[2]];
    }
    if (typeof payload.rotationY === 'number') p.rotationY = payload.rotationY;
    if (typeof payload.animation === 'string') p.animation = payload.animation;
  });

  socket.on('game:throw', (payload: { position: [number, number, number]; direction: [number, number, number] }) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (p.snowballs <= 0) return;
    const now = Date.now();
    if (now - lastThrowTime < THROW_COOLDOWN_MS) return;
    lastThrowTime = now;
    p.snowballs = Math.max(0, p.snowballs - 1);
    broadcastState();
    const id = `sb-${socket.id}-${now}`;
    const dir = payload.direction ?? [0, 0, -1];
    const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1;
    snowballs.set(id, {
      id,
      fromSocketId: socket.id,
      position: payload.position ?? [...p.position],
      direction: [dir[0] / len, dir[1] / len, dir[2] / len],
      startTime: now / 1000,
    });
  });

  socket.on('game:chat', (payload: { text: string }) => {
    const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 500) : '';
    if (!text) return;
    const p = players.get(socket.id);
    gameIo?.to(GAME_ROOM).emit('game:chat', {
      socketId: socket.id,
      playerId: p?.playerId,
      displayName: p?.displayName,
      text,
    });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    for (const [id, ball] of snowballs.entries()) {
      if (ball.fromSocketId === socket.id) snowballs.delete(id);
    }
    broadcastState();
  });
}
