import path from 'path';
import { fileURLToPath } from 'url';
import dotenvExtended from 'dotenv-extended';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, '.');

dotenvExtended.load({
  path: path.join(clientRoot, '.env'),
  defaults: path.join(clientRoot, '.env.defaults'),
});

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL ?? ''),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
