<template>
  <div class="character-page">
    <!-- Full-screen 3D canvas (when viewer active) -->
    <div
      v-if="character?.status === 'completed' && (character?.riggedModelUrl || character?.modelUrl)"
      ref="canvasWrap"
      class="canvas-wrap"
    />

    <!-- Fixed top bar: liquid glass -->
    <header class="ui-bar ui-top">
      <router-link to="/" class="back">← Strona główna</router-link>
      <template v-if="characterId && !character && !loading">
        <span class="muted">Brak danych postaci.</span>
      </template>
      <template v-else-if="character">
        <h1 class="title">Postać {{ characterId }}</h1>
        <div v-if="character.status !== 'completed'" class="progress-inline">
          <span>Status: {{ character.status }}</span>
          <span v-if="character.jobProgress != null"> · {{ character.jobProgress }}%</span>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: (character.jobProgress ?? 0) + '%' }" />
          </div>
          <p v-if="character.error" class="error">{{ character.error }}</p>
        </div>
      </template>
    </header>

    <!-- Centered messages when no full viewer -->
    <div v-if="!characterId" class="center-msg">
      <p class="error">Brak ID postaci w adresie (oczekiwany adres: /character/:id).</p>
    </div>
    <div v-else-if="loading && !character" class="center-msg">
      <p>Ładowanie…</p>
    </div>
    <div v-else-if="error" class="center-msg">
      <p class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useCharacterProgress } from '../composables/useSocket';
import { initViewer, disposeViewer } from '../components/ModelViewer';
import { apiUrl, assetUrl } from '../config/api';

const route = useRoute();
const characterId = computed(() => route.params.id as string);

const loading = ref(true);
const error = ref('');
const character = ref<{
  status: string;
  jobProgress?: number;
  error?: string;
  modelUrl?: string;
  riggedModelUrl?: string;
  animationUrls?: { id: string; name: string; url: string }[];
} | null>(null);

const canvasWrap = ref<HTMLElement | null>(null);

let unsubscribeSocket: (() => void) | null = null;

const log = (msg: string, data?: object) => {
  console.log(`[CharacterPage] ${msg}`, data ?? '');
};

async function fetchCharacter() {
  const id = characterId.value;
  if (!id) return;
  log('fetchCharacter: start', { id });
  loading.value = true;
  error.value = '';
  character.value = null;
  const url = apiUrl(`characters/${id}`);
  try {
    const res = await fetch(url);
    log('fetchCharacter: response', { status: res.status, url });
    if (!res.ok) {
      const body = await res.text();
      let msg = res.status === 404 ? 'Nie znaleziono postaci' : `Błąd ${res.status}`;
      try {
        const data = JSON.parse(body);
        if (data?.error) msg = data.error;
      } catch (_) {}
      throw new Error(msg);
    }
    character.value = (await res.json()) as typeof character.value;
    log('fetchCharacter: ok', {
      status: character.value?.status,
      hasModelUrl: !!character.value?.modelUrl,
      hasRiggedModel: !!character.value?.riggedModelUrl,
      animationsCount: character.value?.animationUrls?.length ?? 0,
    });
    if (
      character.value?.status === 'completed' &&
      character.value?.modelUrl &&
      !character.value?.riggedModelUrl
    ) {
      fetch(apiUrl(`characters/${id}/request-rig`), { method: 'POST' }).catch(() => {});
    }
  } catch (e) {
    log('fetchCharacter: error', { err: e });
    error.value = e instanceof Error ? e.message : 'Błąd';
    character.value = null;
  } finally {
    loading.value = false;
  }
}

function handleProgress(data: { progress?: number; status?: string; modelUrl?: string; error?: string }) {
  if (!character.value) return;
  if (data.progress != null) character.value.jobProgress = data.progress;
  if (data.status) character.value.status = data.status;
  if (data.modelUrl) character.value.modelUrl = data.modelUrl;
  if (data.error) character.value.error = data.error;
}

onMounted(() => {});

onUnmounted(() => {
  unsubscribeSocket?.();
  disposeViewer();
});

watch(
  () => route.params.id as string,
  (id, oldId) => {
    unsubscribeSocket?.();
    if (!id) return;
    unsubscribeSocket = useCharacterProgress(id, handleProgress);
    fetchCharacter();
  },
  { immediate: true }
);

watch(
  () => ({
    modelUrl: character.value?.modelUrl,
    riggedModelUrl: character.value?.riggedModelUrl,
    animationUrls: character.value?.animationUrls,
  }),
  (data) => {
    const id = characterId.value;
    const modelUrl = data.riggedModelUrl
      ? assetUrl(data.riggedModelUrl)
      : data.modelUrl
        ? apiUrl(`characters/${id}/model`)
        : '';
    const animationUrls = (data.animationUrls ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      url: assetUrl(a.url),
    }));
    log('watch model', { hasModelUrl: !!modelUrl, animationsCount: animationUrls.length });
    if (!modelUrl || !id) return;
    nextTick(() => {
      const el = canvasWrap.value;
      if (!el) return;
      initViewer(el, { modelUrl, animationUrls }, () => {});
    });
  },
  { immediate: true, deep: true }
);
</script>

<style scoped>
.character-page {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
}

/* Full viewport canvas */
.canvas-wrap {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  z-index: 0;
  background: #9dd4f0;
}

/* Liquid glass bars (backdrop blur + semi-transparent) */
.ui-bar {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 10;
  padding: 0.75rem 1.25rem;
  background: rgba(26, 26, 46, 0.55);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
}
.ui-top {
  top: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
}
.ui-top .title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}
.ui-top .back {
  color: #a0a0ff;
  text-decoration: none;
  font-size: 0.95rem;
}
.ui-top .back:hover {
  text-decoration: underline;
}
.progress-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
.progress-inline .progress-bar {
  width: 120px;
  height: 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #64b5f6;
  transition: width 0.3s;
}
.progress-inline .error {
  width: 100%;
  margin: 0;
}

.center-msg {
  position: fixed;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.center-msg p {
  margin: 0;
  font-size: 1rem;
}
.error {
  color: #f48a8a;
}
.muted {
  color: rgba(255, 255, 255, 0.5);
}
</style>
