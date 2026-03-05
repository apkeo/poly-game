<template>
  <div class="app">
    <nav class="nav">
      <router-link to="/">Test</router-link>
      <router-link to="/character/demo">Character (demo)</router-link>
    </nav>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.nav {
  padding: 1rem 1.5rem;
  background: #1a1a2e;
  display: flex;
  gap: 1rem;
}
.nav a {
  color: #eee;
  text-decoration: none;
}
.nav a.router-link-active {
  color: #64b5f6;
}
.main {
  flex: 1;
  padding: 1.5rem;
}
</style>

<style>
* {
  box-sizing: border-box;
}
:root {
  --poly-cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M4 3.5V18.5L8.8 13.8L11.8 21L15.1 19.5L12.1 12.3H19L4 3.5Z' fill='%23101828' stroke='%23F2F4F7' stroke-width='1.3' stroke-linejoin='round'/%3E%3Cpath d='M6.2 5.6L15.6 11.5H10.9L13.3 18.1L12.2 18.6L9.8 12.1H6.2V5.6Z' fill='%231570EF'/%3E%3C/svg%3E");
}
html,
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0f0f1a;
  color: #e0e0e0;
}
#app,
#app * {
  cursor: var(--poly-cursor) 3 2, auto !important;
}
</style>
