<template>
  <div class="test-page">
    <h1>Wrzuć obrazek postaci</h1>
    <form class="upload-form" @submit.prevent="upload">
      <label class="file-label">
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          @change="onFileSelect"
        />
        <span class="file-button">{{ selectedFile ? selectedFile.name : 'Wybierz obrazek' }}</span>
      </label>
      <button type="submit" class="submit-btn" :disabled="!selectedFile || uploading">
        {{ uploading ? 'Wysyłanie…' : 'Wrzuć i generuj' }}
      </button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiUrl } from '../config/api';

const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const uploading = ref(false);
const error = ref('');

function onFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  selectedFile.value = file ?? null;
  error.value = '';
}

async function upload() {
  if (!selectedFile.value) return;
  uploading.value = true;
  error.value = '';
  const formData = new FormData();
  formData.append('image', selectedFile.value);
  try {
    const res = await fetch(apiUrl('upload/image'), {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Upload failed');
    router.push(`/character/${data.id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Błąd wysyłania';
  } finally {
    uploading.value = false;
  }
}
</script>

<style scoped>
.test-page {
  max-width: 420px;
}
h1 {
  margin-top: 0;
  font-size: 1.5rem;
}
.upload-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.file-label {
  display: block;
}
.file-label input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}
.file-button {
  display: inline-block;
  padding: 0.75rem 1.25rem;
  background: #2d2d44;
  border: 1px solid #444;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}
.file-button:hover {
  background: #3d3d54;
}
.submit-btn {
  padding: 0.75rem 1.25rem;
  background: #1976d2;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
}
.submit-btn:hover:not(:disabled) {
  background: #1565c0;
}
.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error {
  color: #f44336;
  margin-top: 1rem;
}
</style>
