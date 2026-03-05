import { createRouter, createWebHistory } from 'vue-router';
import { usePlayerStore } from '../stores/player';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: () => (usePlayerStore().isLoggedIn ? '/my-characters' : '/login') },
    { path: '/login', name: 'Login', component: () => import('../views/LoginPage.vue'), meta: { title: 'Logowanie' } },
    {
      path: '/my-characters',
      name: 'MyCharacters',
      component: () => import('../views/MyCharactersPage.vue'),
      meta: { title: 'Moje postacie' },
    },
    {
      path: '/character/:id',
      name: 'Character',
      component: () => import('../views/CharacterPage.vue'),
      meta: { title: 'Character' },
    },
    {
      path: '/game/:characterId',
      name: 'Game',
      component: () => import('../views/GamePage.vue'),
      meta: { title: 'Gra' },
    },
  ],
});

router.afterEach((to) => {
  const title = to.meta.title as string | undefined;
  if (title) document.title = `${title} – Poly Game`;
});

export default router;
