<template>
  <div class="game-page">
    <div ref="canvasWrap" class="canvas-wrap" />

    <!-- Celownik (środek ekranu) -->
    <div
      v-if="canvasLocked && !joining && !gameError"
      class="crosshair"
      :class="[`crosshair--${crosshairType}`, `crosshair--${crosshairColor}`]"
      aria-hidden="true"
    >
      <template v-if="crosshairType === 'cross'">
        <span class="crosshair__line crosshair__line--h" />
        <span class="crosshair__line crosshair__line--v" />
      </template>
      <template v-else-if="crosshairType === 'dot'">
        <span class="crosshair__dot" />
      </template>
      <template v-else-if="crosshairType === 'circle'">
        <span class="crosshair__circle" />
      </template>
      <template v-else-if="crosshairType === 'cross-dot'">
        <span class="crosshair__line crosshair__line--h" />
        <span class="crosshair__line crosshair__line--v" />
        <span class="crosshair__dot" />
      </template>
    </div>

    <header class="ui-bar ui-top">
      <router-link to="/my-characters" class="back">← Moje postacie</router-link>
      <div class="hp-bar">
        <span v-for="i in 10" :key="i" class="heart" :class="{ empty: i > myHp }">♥</span>
      </div>
    </header>

    <div v-if="screenshotNotice" class="screenshot-toast">{{ screenshotNotice }}</div>

    <!-- Menu (brak focusu canvasa / X) – styl Untitled UI -->
    <Teleport to="body">
      <Transition name="menu-fade">
        <div v-if="showMenu" class="menu-backdrop" @click.self="closeMenu">
          <div class="menu-panel">
            <div class="menu-header">
              <h2 class="menu-title">{{ menuView === 'shop' ? 'Sklep' : menuView === 'gallery' ? 'Galeria' : 'Menu' }}</h2>
              <button type="button" class="menu-close" aria-label="Zamknij" @click="closeMenu">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <div v-if="menuView === 'main'" class="menu-body">
              <button type="button" class="menu-btn" @click="menuView = 'shop'">Sklep</button>
              <button type="button" class="menu-btn menu-btn--secondary" @click="menuView = 'gallery'">Galeria</button>
              <button type="button" class="menu-btn menu-btn--secondary" @click="closeMenu">Wznów grę</button>
            </div>
            <div v-else-if="menuView === 'shop'" class="menu-body">
              <p class="menu-label">Celownik</p>
              <div class="crosshair-options">
                <button
                  v-for="t in crosshairTypes"
                  :key="t.id"
                  type="button"
                  class="crosshair-opt"
                  :class="{ active: crosshairType === t.id }"
                  :title="t.name"
                  @click="setCrosshairType(t.id)"
                >
                  <span :class="`crosshair-preview crosshair-preview--${t.id}`" />
                </button>
              </div>
              <p class="menu-label">Kolor</p>
              <div class="crosshair-colors">
                <button
                  v-for="c in crosshairColors"
                  :key="c.id"
                  type="button"
                  class="color-swatch"
                  :class="{ active: crosshairColor === c.id }"
                  :style="{ background: c.hex }"
                  :title="c.name"
                  @click="setCrosshairColor(c.id)"
                />
              </div>
              <button type="button" class="menu-btn menu-btn--secondary" @click="menuView = 'main'">← Wstecz</button>
            </div>
            <div v-else class="menu-body">
              <div v-if="screenshots.length" class="gallery-preview-wrap">
                <img
                  v-if="selectedScreenshot"
                  :src="selectedScreenshot.dataUrl"
                  class="gallery-preview"
                  alt="Zrzut ekranu"
                />
                <div v-if="selectedScreenshot" class="gallery-meta">
                  {{ formatScreenshotDate(selectedScreenshot.createdAt) }}
                </div>
                <div class="gallery-actions">
                  <button type="button" class="menu-btn" @click="saveScreenshotToDisk(selectedScreenshot)">Zapisz na dysk</button>
                  <button
                    v-if="selectedScreenshot"
                    type="button"
                    class="menu-btn menu-btn--secondary"
                    @click="removeScreenshot(selectedScreenshot.id)"
                  >
                    Usuń
                  </button>
                </div>
                <div class="gallery-grid">
                  <button
                    v-for="(shot, idx) in screenshots"
                    :key="shot.id"
                    type="button"
                    class="gallery-thumb"
                    :class="{ active: selectedScreenshot?.id === shot.id }"
                    @click="selectedScreenshotId = shot.id"
                  >
                    <img :src="shot.dataUrl" class="gallery-thumb-img" :alt="`Screenshot ${idx + 1}`" />
                  </button>
                </div>
              </div>
              <div v-else class="gallery-empty">
                Brak screenshotów. Naciśnij F2, aby zrobić pierwszy.
              </div>
              <button type="button" class="menu-btn menu-btn--secondary" @click="menuView = 'main'">← Wstecz</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div v-if="!joining && !gameError" class="inventory-bar">
      <div class="inventory-slot" :class="{ empty: mySnowballs <= 0 }">
        <span class="inventory-icon" aria-hidden="true">❄</span>
        <span class="inventory-name">Śnieżka</span>
        <span class="inventory-count">x{{ mySnowballs }}</span>
      </div>
      <span class="inventory-hint">Rzut: LPM</span>
    </div>

    <div class="chat-panel">
      <div class="chat-messages" ref="chatScroll">
        <div v-for="(msg, idx) in chatMessages" :key="idx" class="chat-msg">
          <span class="chat-name">{{ msg.displayName || msg.playerId?.slice(-6) || msg.socketId?.slice(-6) }}:</span>
          {{ msg.text }}
        </div>
      </div>
      <form class="chat-form" @submit.prevent="sendChat">
        <input v-model="chatInput" type="text" class="chat-input" placeholder="Czat..." maxlength="500" />
        <button type="submit" class="chat-send">Wyślij</button>
      </form>
    </div>

    <div v-if="gameError" class="game-error">{{ gameError }}</div>
    <div v-if="joining" class="joining">Dołączanie do gry...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { getSocket } from '../composables/useSocket';
import {
  initGameViewer,
  setGameViewerData,
  disposeGameViewer,
  captureGameViewerScreenshot,
  type OtherPlayer,
  type SnowballState,
} from '../components/GameViewer';
import { apiUrl, assetUrl } from '../config/api';

const route = useRoute();
const characterId = computed(() => route.params.characterId as string);
const playerStore = usePlayerStore();

const canvasWrap = ref<HTMLElement | null>(null);
const joining = ref(true);
const gameError = ref('');
const mySocketId = ref<string | null>(null);
const myHp = ref(10);
const mySnowballs = ref(0);
const chatMessages = ref<Array<{ socketId?: string; playerId?: string; displayName?: string; text: string }>>([]);
const chatInput = ref('');
const chatScroll = ref<HTMLElement | null>(null);
const gameViewerInited = ref(false);

const CROSSHAIR_STORAGE_KEY = 'poly-game-crosshair';
const SCREENSHOTS_STORAGE_KEY = 'poly-game-screenshots';
const MAX_SCREENSHOTS = 20;
const defaultCrosshair = () => ({ type: 'cross', color: 'white' });
type ScreenshotItem = { id: string; createdAt: number; dataUrl: string };

function loadCrosshair(): { type: string; color: string } {
  try {
    const raw = localStorage.getItem(CROSSHAIR_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { type?: string; color?: string };
      if (p.type && p.color) return { type: p.type, color: p.color };
    }
  } catch (_) {}
  return defaultCrosshair();
}

function saveCrosshair(type: string, color: string) {
  localStorage.setItem(CROSSHAIR_STORAGE_KEY, JSON.stringify({ type, color }));
}

const crosshairType = ref(loadCrosshair().type);
const crosshairColor = ref(loadCrosshair().color);
const canvasLocked = ref(false);
const showMenu = computed(() => !joining.value && !gameError.value && !canvasLocked.value);
const menuView = ref<'main' | 'shop' | 'gallery'>('main');
const screenshotNotice = ref('');
let screenshotNoticeTimer: ReturnType<typeof window.setTimeout> | null = null;

function loadScreenshots(): ScreenshotItem[] {
  try {
    const raw = localStorage.getItem(SCREENSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<ScreenshotItem>> | null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => typeof s?.id === 'string' && typeof s?.createdAt === 'number' && typeof s?.dataUrl === 'string')
      .map((s) => ({ id: s.id as string, createdAt: s.createdAt as number, dataUrl: s.dataUrl as string }))
      .slice(0, MAX_SCREENSHOTS);
  } catch {
    return [];
  }
}

function storeScreenshots(list: ScreenshotItem[]) {
  try {
    localStorage.setItem(SCREENSHOTS_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SCREENSHOTS)));
  } catch {
    setScreenshotNotice('Brak miejsca na zapis kolejnego screena.');
  }
}

const screenshots = ref<ScreenshotItem[]>(loadScreenshots());
const selectedScreenshotId = ref<string | null>(screenshots.value[0]?.id ?? null);
const selectedScreenshot = computed<ScreenshotItem | null>(() => {
  if (!screenshots.value.length) return null;
  return screenshots.value.find((s) => s.id === selectedScreenshotId.value) ?? screenshots.value[0];
});

const crosshairTypes = [
  { id: 'cross', name: 'Krzyżyk' },
  { id: 'dot', name: 'Kropka' },
  { id: 'circle', name: 'Kółko' },
  { id: 'cross-dot', name: 'Krzyżyk + kropka' },
];
const crosshairColors = [
  { id: 'white', name: 'Biały', hex: '#ffffff' },
  { id: 'black', name: 'Czarny', hex: '#101828' },
  { id: 'red', name: 'Czerwony', hex: '#d92d20' },
  { id: 'green', name: 'Zielony', hex: '#039855' },
  { id: 'cyan', name: 'Cyjan', hex: '#0e9384' },
];

function setScreenshotNotice(message: string) {
  screenshotNotice.value = message;
  if (screenshotNoticeTimer != null) window.clearTimeout(screenshotNoticeTimer);
  screenshotNoticeTimer = window.setTimeout(() => {
    screenshotNotice.value = '';
    screenshotNoticeTimer = null;
  }, 2200);
}

function screenshotFileName(createdAt: number): string {
  const d = new Date(createdAt);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `poly-game-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

function formatScreenshotDate(createdAt: number): string {
  return new Date(createdAt).toLocaleString('pl-PL');
}

function setCrosshairType(id: string) {
  crosshairType.value = id;
  saveCrosshair(id, crosshairColor.value);
}

function setCrosshairColor(id: string) {
  crosshairColor.value = id;
  saveCrosshair(crosshairType.value, id);
}

function getGameCanvas(): HTMLCanvasElement | null {
  const el = canvasWrap.value?.querySelector('canvas');
  return el instanceof HTMLCanvasElement ? el : null;
}

async function captureScreenshot() {
  const canvas = getGameCanvas();
  if (!canvas) {
    setScreenshotNotice('Canvas nie jest jeszcze gotowy.');
    return;
  }
  try {
    const dataUrl = (await captureGameViewerScreenshot()) ?? canvas.toDataURL('image/png');
    const shot: ScreenshotItem = {
      id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      dataUrl,
    };
    const next = [shot, ...screenshots.value].slice(0, MAX_SCREENSHOTS);
    screenshots.value = next;
    selectedScreenshotId.value = shot.id;
    storeScreenshots(next);
    setScreenshotNotice('Screenshot zapisany w galerii.');
  } catch {
    setScreenshotNotice('Nie udało się zrobić screenshotu.');
  }
}

function saveScreenshotToDisk(shot: ScreenshotItem | null) {
  if (!shot) return;
  const link = document.createElement('a');
  link.href = shot.dataUrl;
  link.download = screenshotFileName(shot.createdAt);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function removeScreenshot(id: string) {
  const next = screenshots.value.filter((s) => s.id !== id);
  screenshots.value = next;
  if (!next.some((s) => s.id === selectedScreenshotId.value)) {
    selectedScreenshotId.value = next[0]?.id ?? null;
  }
  storeScreenshots(next);
}

function syncCanvasLockState() {
  const canvas = getGameCanvas();
  canvasLocked.value = !!canvas && document.pointerLockElement === canvas;
}

function focusCanvas() {
  const canvas = getGameCanvas();
  if (!canvas) return;
  if (typeof canvas.focus === 'function') canvas.focus();
  if (document.pointerLockElement !== canvas && typeof canvas.requestPointerLock === 'function') {
    canvas.requestPointerLock();
  }
}

function closeMenu() {
  menuView.value = 'main';
  focusCanvas();
}

function onKeyDown(e: KeyboardEvent) {
  const active = document.activeElement as HTMLElement | null;
  const inputFocused = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || !!active?.isContentEditable;
  if (e.code === 'F2') {
    if (inputFocused) return;
    captureScreenshot();
    e.preventDefault();
    return;
  }
  if (e.code === 'Escape' && document.pointerLockElement) {
    document.exitPointerLock();
    e.preventDefault();
  }
}

function onPointerLockChange() {
  syncCanvasLockState();
  if (canvasLocked.value) menuView.value = 'main';
}

const character = ref<{
  _id: string;
  status: string;
  riggedModelUrl?: string;
  modelUrl?: string;
  animationUrls?: { id: string; name: string; url: string }[];
} | null>(null);

const playerId = computed(() => playerStore.currentPlayerId);

function modelUrl(): string {
  const c = character.value;
  if (!c) return '';
  if (c.riggedModelUrl) return assetUrl(c.riggedModelUrl);
  return apiUrl(`characters/${c._id}/model`);
}

function animationUrls(): { id: string; name: string; url: string }[] {
  const c = character.value;
  if (!c?.animationUrls) return [];
  return c.animationUrls.map((a) => ({
    id: a.id,
    name: a.name,
    url: assetUrl(a.url.startsWith('/') ? a.url : `/${a.url}`),
  }));
}

async function fetchCharacter() {
  if (!characterId.value) return;
  const res = await fetch(apiUrl(`characters/${characterId.value}`));
  if (!res.ok) {
    gameError.value = 'Nie znaleziono postaci';
    return;
  }
  character.value = await res.json();
}

function mapStatePlayer(p: {
  socketId: string;
  playerId: string;
  characterId: string;
  position: [number, number, number];
  rotationY: number;
  animation: string;
  hp: number;
  riggedModelUrl?: string;
  animationUrls?: { id: string; name: string; url: string }[];
  displayName?: string;
}): OtherPlayer {
  return {
    socketId: p.socketId,
    characterId: p.characterId,
    position: p.position,
    rotationY: p.rotationY,
    animation: p.animation,
    hp: p.hp,
    modelUrl: p.riggedModelUrl
      ? assetUrl(p.riggedModelUrl.startsWith('/') ? p.riggedModelUrl : `/${p.riggedModelUrl}`)
      : apiUrl(`characters/${p.characterId}/model`),
    animationUrls: p.animationUrls?.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url.startsWith('/') ? a.url : `/${a.url}`,
    })),
  };
}

onMounted(async () => {
  if (!playerId.value) {
    gameError.value = 'Zaloguj się';
    joining.value = false;
    return;
  }
  await fetchCharacter();
  if (!character.value || character.value.status !== 'completed') {
    gameError.value = 'Postać nie jest gotowa do gry';
    joining.value = false;
    return;
  }

  const socket = getSocket();
  socket.on('game:joined', (data: { socketId: string }) => {
    mySocketId.value = data.socketId;
    mySnowballs.value = 1;
    joining.value = false;
  });
  socket.on('game:error', (data: { message: string }) => {
    gameError.value = data.message || 'Błąd';
    joining.value = false;
  });
  socket.on('game:state', (data: { players: unknown[] }) => {
    const players = (data.players ?? []) as Array<{
      socketId: string;
      playerId: string;
      characterId: string;
      position: [number, number, number];
      rotationY: number;
      animation: string;
      hp: number;
      snowballs: number;
      riggedModelUrl?: string;
      animationUrls?: { id: string; name: string; url: string }[];
      displayName?: string;
    }>;
    if (mySocketId.value == null) return;
    const others = players
      .filter((p) => p.socketId !== mySocketId.value)
      .map(mapStatePlayer);
    setGameViewerData({ otherPlayers: others });
    const me = players.find((p) => p.socketId === mySocketId.value);
    if (me) {
      myHp.value = me.hp;
      mySnowballs.value = me.snowballs;
    }
  });
  socket.on('game:snowballs', (data: { snowballs: SnowballState[] }) => {
    setGameViewerData({ snowballs: data.snowballs ?? [] });
  });
  socket.on('game:snowball-hit', (data: { position: [number, number, number] }) => {
    setGameViewerData({ hitPositions: [{ position: data.position }] });
  });
  socket.on('game:hp', (data: { socketId: string; hp: number }) => {
    if (data.socketId === mySocketId.value) myHp.value = data.hp;
  });
  socket.on('game:chat', (msg: { socketId: string; playerId?: string; displayName?: string; text: string }) => {
    chatMessages.value.push(msg);
    nextTick(() => {
      const el = chatScroll.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  });

  socket.emit('game:join', { characterId: characterId.value, playerId: playerId.value });

  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  syncCanvasLockState();
});

watch(
  () => ({ modelUrl: modelUrl(), animationUrls: animationUrls() }),
  (opts) => {
    if (!opts.modelUrl || !canvasWrap.value || gameViewerInited.value) return;
    gameViewerInited.value = true;
    nextTick(() => {
      const el = canvasWrap.value;
      if (!el) return;
      initGameViewer(
        el,
        { modelUrl: opts.modelUrl, animationUrls: opts.animationUrls },
        {
          onState: (state) => {
            getSocket().emit('game:state', state);
          },
          onThrow: (position, direction) => {
            getSocket().emit('game:throw', { position, direction });
          },
          canThrow: () => mySnowballs.value > 0,
        }
      );
      const canvas = getGameCanvas();
      if (canvas) canvas.tabIndex = 0;
      syncCanvasLockState();
    });
  },
  { immediate: true, deep: true }
);

onUnmounted(() => {
  if (screenshotNoticeTimer != null) window.clearTimeout(screenshotNoticeTimer);
  window.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('pointerlockchange', onPointerLockChange);
  disposeGameViewer();
  const s = getSocket();
  s.off('game:joined');
  s.off('game:error');
  s.off('game:state');
  s.off('game:snowballs');
  s.off('game:snowball-hit');
  s.off('game:hp');
  s.off('game:chat');
});

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  getSocket().emit('game:chat', { text });
  chatInput.value = '';
}
</script>

<style scoped>
.game-page {
  position: relative;
  min-height: 100vh;
}
.canvas-wrap {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  z-index: 0;
  background: #9dd4f0;
}
.ui-bar {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  z-index: 10;
  padding: 0.5rem 1rem;
  background: rgba(26, 26, 46, 0.6);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.back {
  color: #a0a0ff;
  text-decoration: none;
  font-size: 0.95rem;
}
.hp-bar {
  display: flex;
  gap: 2px;
}
.heart {
  color: #e53935;
  font-size: 1.2rem;
}
.heart.empty {
  color: rgba(255, 255, 255, 0.25);
}
.chat-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  max-height: 200px;
  display: flex;
  flex-direction: column;
  background: rgba(26, 26, 46, 0.7);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.inventory-bar {
  position: fixed;
  left: 50%;
  bottom: 210px;
  transform: translateX(-50%);
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  background: rgba(16, 24, 40, 0.72);
  backdrop-filter: blur(8px);
}
.inventory-slot {
  min-width: 140px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid rgba(83, 177, 253, 0.5);
  border-radius: 10px;
  background: rgba(21, 112, 239, 0.15);
  color: #eaf2ff;
}
.inventory-slot.empty {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}
.inventory-icon {
  font-size: 1rem;
  line-height: 1;
}
.inventory-name {
  font-size: 0.85rem;
  font-weight: 600;
}
.inventory-count {
  margin-left: auto;
  font-size: 0.85rem;
  font-weight: 700;
}
.inventory-hint {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.75);
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  font-size: 0.85rem;
  max-height: 120px;
}
.chat-msg {
  margin-bottom: 0.25rem;
}
.chat-name {
  color: #64b5f6;
  margin-right: 0.35rem;
}
.chat-form {
  display: flex;
  padding: 0.5rem;
  gap: 0.5rem;
}
.chat-input {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid #444;
  border-radius: 6px;
  background: #2d2d44;
  color: #fff;
  font-size: 0.9rem;
}
.chat-send {
  padding: 0.4rem 0.8rem;
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}
.game-error,
.joining {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 1.1rem;
}
.game-error {
  color: #f48a8a;
}
.screenshot-toast {
  position: fixed;
  top: 4.25rem;
  right: 1rem;
  z-index: 35;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(83, 177, 253, 0.45);
  background: rgba(16, 24, 40, 0.8);
  color: #eaf2ff;
  font-size: 0.8rem;
  backdrop-filter: blur(6px);
}

/* Celownik – środek ekranu */
.crosshair {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  pointer-events: none;
  z-index: 5;
}
.crosshair__line {
  position: absolute;
  background: currentColor;
}
.crosshair__line--h {
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  transform: translateX(-50%);
}
.crosshair__line--v {
  top: 50%;
  left: 0;
  width: 100%;
  height: 2px;
  transform: translateY(-50%);
}
.crosshair__dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: currentColor;
}
.crosshair__circle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: transparent;
}
.crosshair--white { color: #fff; }
.crosshair--black { color: #101828; }
.crosshair--red { color: #d92d20; }
.crosshair--green { color: #039855; }
.crosshair--cyan { color: #0e9384; }

/* Menu – styl Untitled UI (neutral, czyste krawędzie, cienie) */
.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(16, 24, 40, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.menu-panel {
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  overflow: auto;
  background: #f9fafb;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  box-shadow: 0 20px 24px -4px rgba(16, 24, 40, 0.08), 0 8px 8px -4px rgba(16, 24, 40, 0.03);
  transition: transform 0.2s ease;
}
.menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e4e7ec;
}
.menu-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #101828;
  letter-spacing: -0.01em;
}
.menu-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #667085;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.menu-close:hover {
  background: #f2f4f7;
  color: #344054;
}
.menu-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.menu-label {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: #344054;
}
.menu-btn {
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #fff;
  background: #1570ef;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  text-align: center;
}
.menu-btn:hover {
  background: #155eef;
}
.menu-btn--secondary {
  background: transparent;
  color: #344054;
  border: 1px solid #d0d5dd;
}
.menu-btn--secondary:hover {
  background: #f9fafb;
}
.crosshair-options {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.crosshair-opt {
  width: 48px;
  height: 48px;
  padding: 0;
  border: 2px solid #e4e7ec;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.crosshair-opt:hover {
  border-color: #d0d5dd;
}
.crosshair-opt.active {
  border-color: #1570ef;
  box-shadow: 0 0 0 1px #1570ef;
}
.crosshair-preview {
  display: block;
  width: 20px;
  height: 20px;
  position: relative;
  color: #344054;
}
.crosshair-preview--cross::before,
.crosshair-preview--cross::after {
  content: '';
  position: absolute;
  background: currentColor;
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  transform: translateX(-50%);
}
.crosshair-preview--cross::after {
  width: 100%;
  height: 2px;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}
.crosshair-preview--dot {
  border-radius: 50%;
  background: currentColor;
  margin: auto;
}
.crosshair-preview--circle {
  border: 2px solid currentColor;
  border-radius: 50%;
  box-sizing: border-box;
}
.crosshair-preview--cross-dot {
  background: radial-gradient(circle at center, currentColor 2px, transparent 2px);
}
.crosshair-preview--cross-dot::before,
.crosshair-preview--cross-dot::after {
  content: '';
  position: absolute;
  background: currentColor;
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
  transform: translateX(-50%);
}
.crosshair-preview--cross-dot::after {
  width: 100%;
  height: 1px;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}
.crosshair-colors {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.gallery-preview-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.gallery-preview {
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid #d0d5dd;
  background: #fff;
}
.gallery-meta {
  font-size: 0.78rem;
  color: #667085;
}
.gallery-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
  max-height: 180px;
  overflow: auto;
  padding-right: 0.25rem;
}
.gallery-thumb {
  padding: 0;
  border: 2px solid #e4e7ec;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  cursor: pointer;
  aspect-ratio: 1 / 1;
}
.gallery-thumb.active {
  border-color: #1570ef;
  box-shadow: 0 0 0 1px #1570ef;
}
.gallery-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.gallery-empty {
  padding: 1rem;
  border-radius: 10px;
  border: 1px dashed #d0d5dd;
  background: #fff;
  text-align: center;
  color: #667085;
  font-size: 0.9rem;
}
.color-swatch {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 2px solid #e4e7ec;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.color-swatch:hover {
  border-color: #d0d5dd;
}
.color-swatch.active {
  border-color: #1570ef;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #1570ef;
}
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.2s ease;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
}
.menu-fade-enter-active .menu-panel,
.menu-fade-leave-active .menu-panel {
  transition: transform 0.2s ease;
}
.menu-fade-enter-from .menu-panel,
.menu-fade-leave-to .menu-panel {
  transform: scale(0.96);
}
</style>
