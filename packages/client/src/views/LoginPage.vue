<template>
  <div class="login-page">
    <h1>Zaloguj się</h1>
    <p class="hint">Wpisz unikalny login (tylko małe litery a-z i cyfry 0-9)</p>
    <form class="login-form" @submit.prevent="submit">
      <input
        v-model="loginInput"
        type="text"
        class="login-input"
        placeholder="np. gracz123"
        autocomplete="username"
        pattern="[a-z0-9]+"
        maxlength="64"
      />
      <button type="submit" class="submit-btn" :disabled="!canSubmit || loading">
        {{ loading ? 'Logowanie…' : 'Wejdź' }}
      </button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '../stores/player';

const router = useRouter();
const playerStore = usePlayerStore();

const loginInput = ref('');
const loading = ref(false);
const error = ref('');

const canSubmit = computed(() => /^[a-z0-9]+$/.test(loginInput.value.trim()));

async function submit() {
  const login = loginInput.value.trim().toLowerCase();
  if (!login || !/^[a-z0-9]+$/.test(login)) {
    error.value = 'Login: tylko a-z i 0-9';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await playerStore.login(login);
    router.replace('/my-characters');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Błąd logowania';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  max-width: 360px;
  padding: 2rem;
}
h1 {
  margin-top: 0;
  font-size: 1.5rem;
}
.hint {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.login-input {
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border: 1px solid #444;
  border-radius: 8px;
  background: #2d2d44;
  color: #fff;
}
.login-input::placeholder {
  color: #888;
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
  color: #f48a8a;
  margin-top: 1rem;
}
</style>
