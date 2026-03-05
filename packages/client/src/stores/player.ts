import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiUrl } from '../config/api';

const PLAYER_ID_KEY = 'poly-game-playerId';

export const usePlayerStore = defineStore('player', () => {
  const storedId = typeof localStorage !== 'undefined' ? localStorage.getItem(PLAYER_ID_KEY) : null;
  const currentPlayerId = ref<string | null>(storedId);

  const isLoggedIn = computed(() => !!currentPlayerId.value);

  async function login(loginStr: string): Promise<string> {
    const res = await fetch(apiUrl('players/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: loginStr }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Login failed');
    const playerId = data.playerId as string;
    currentPlayerId.value = playerId;
    if (typeof localStorage !== 'undefined') localStorage.setItem(PLAYER_ID_KEY, playerId);
    return playerId;
  }

  function logout(): void {
    currentPlayerId.value = null;
    if (typeof localStorage !== 'undefined') localStorage.removeItem(PLAYER_ID_KEY);
  }

  return { currentPlayerId, isLoggedIn, login, logout };
});
