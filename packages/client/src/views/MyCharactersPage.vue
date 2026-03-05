<template>
  <div class="my-characters-page">
    <header class="ui-bar ui-top">
      <span class="title">Moje postacie</span>
      <button class="logout-btn" @click="logout">Wyloguj</button>
    </header>

    <div v-if="!playerStore.isLoggedIn" class="center-msg">
      <p>Musisz się zalogować.</p>
      <router-link to="/login">Zaloguj się</router-link>
    </div>

    <div v-else class="content">
      <div class="actions">
        <label class="file-label">
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            @change="onFileSelect"
          />
          <span class="file-button">{{ selectedFile ? selectedFile.name : 'Nowa postać (wrzuć obrazek)' }}</span>
        </label>
        <button
          type="button"
          class="submit-btn"
          :disabled="!selectedFile || uploading"
          @click="upload"
        >
          {{ uploading ? 'Wysyłanie…' : 'Utwórz postać' }}
        </button>
      </div>
      <p v-if="uploadError" class="error">{{ uploadError }}</p>

      <ul class="character-list">
        <li v-for="c in characters" :key="c._id" class="character-card">
          <div class="card-preview">
            <img
              v-if="c.thumbnailUrl"
              :src="thumbnailUrl(c.thumbnailUrl)"
              alt=""
              class="thumb"
            />
            <span v-else class="thumb-placeholder">⏳</span>
          </div>
          <div class="card-info">
            <span class="card-status">{{ statusLabel(c.status) }}</span>
            <p v-if="c.description" class="card-desc">{{ c.description }}</p>
          </div>
          <router-link
            v-if="c.status === 'completed' && c.riggedModelUrl"
            :to="`/game/${c._id}`"
            class="play-btn"
          >
            Graj
          </router-link>
          <router-link v-else :to="`/character/${c._id}`" class="view-btn">Podejrzyj</router-link>
        </li>
      </ul>
      <p v-if="listError" class="error">{{ listError }}</p>
      <p v-if="!loading && characters.length === 0 && !listError" class="muted">Brak postaci. Utwórz pierwszą.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { usePlayerStore } from '../stores/player';
import { apiUrl, assetUrl } from '../config/api';

const playerStore = usePlayerStore();

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const uploading = ref(false);
const uploadError = ref('');
const loading = ref(true);
const listError = ref('');
const characters = ref<
  Array<{
    _id: string;
    status: string;
    description?: string;
    thumbnailUrl?: string;
    modelUrl?: string;
    riggedModelUrl?: string;
  }>
>([]);

function thumbnailUrl(url: string) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return assetUrl(url.startsWith('/') ? url : `/${url}`);
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pending: 'Oczekuje',
    processing: 'Generowanie…',
    completed: 'Gotowa',
    failed: 'Błąd',
  };
  return map[s] ?? s;
}

function onFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  selectedFile.value = target.files?.[0] ?? null;
  uploadError.value = '';
}

async function fetchList() {
  const playerId = playerStore.currentPlayerId;
  if (!playerId) return;
  loading.value = true;
  listError.value = '';
  try {
    const res = await fetch(apiUrl(`characters?playerId=${encodeURIComponent(playerId)}`), {
      headers: { 'X-Player-Id': playerId },
    });
    if (!res.ok) throw new Error('Nie udało się załadować listy');
    characters.value = await res.json();
  } catch (e) {
    listError.value = e instanceof Error ? e.message : 'Błąd';
  } finally {
    loading.value = false;
  }
}

async function upload() {
  if (!selectedFile.value || !playerStore.currentPlayerId) return;
  uploading.value = true;
  uploadError.value = '';
  const formData = new FormData();
  formData.append('image', selectedFile.value);
  formData.append('playerId', playerStore.currentPlayerId);
  try {
    const res = await fetch(apiUrl('upload/image'), {
      method: 'POST',
      headers: { 'X-Player-Id': playerStore.currentPlayerId },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Upload failed');
    characters.value = [{ _id: data.id, status: 'pending' } as (typeof characters.value)[0], ...characters.value];
    selectedFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : 'Błąd wysyłania';
  } finally {
    uploading.value = false;
  }
}

function logout() {
  playerStore.logout();
  window.location.href = '/login';
}

onMounted(fetchList);
watch(() => playerStore.currentPlayerId, (id) => id && fetchList());
</script>

<style scoped>
.my-characters-page {
  min-height: 100vh;
  padding-top: 3.5rem;
}
.ui-bar {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  z-index: 10;
  padding: 0.75rem 1.25rem;
  background: rgba(26, 26, 46, 0.55);
  backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  font-size: 1.1rem;
  font-weight: 600;
}
.logout-btn {
  padding: 0.4rem 0.8rem;
  background: transparent;
  color: #a0a0ff;
  border: 1px solid #444;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}
.center-msg {
  text-align: center;
  padding: 2rem;
}
.center-msg a {
  color: #64b5f6;
}
.content {
  padding: 1rem 1.25rem;
  max-width: 720px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.file-label input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}
.file-button {
  display: inline-block;
  padding: 0.6rem 1rem;
  background: #2d2d44;
  border: 1px solid #444;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
}
.submit-btn {
  padding: 0.6rem 1rem;
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.character-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1rem;
}
.character-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.card-preview {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a2e;
  flex-shrink: 0;
}
.thumb,
.thumb-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}
.card-info {
  flex: 1;
  min-width: 0;
}
.card-status {
  font-weight: 600;
  font-size: 0.95rem;
}
.card-desc {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.play-btn,
.view-btn {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  text-decoration: none;
  font-size: 0.9rem;
  flex-shrink: 0;
}
.play-btn {
  background: #2e7d32;
  color: #fff;
}
.view-btn {
  background: #37474f;
  color: #fff;
}
.error,
.muted {
  margin-top: 0.5rem;
}
.error {
  color: #f48a8a;
}
.muted {
  color: rgba(255, 255, 255, 0.5);
}
</style>
