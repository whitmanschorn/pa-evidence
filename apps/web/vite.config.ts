import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { API_PATHS } from './src/apiPaths.ts';

// The API serves the built app at /ui, so every asset URL is prefixed with /ui/.
// In dev, API paths are proxied to a locally running API (Playwright's `ui` project mocks them instead).
const API_TARGET = process.env.API_URL ?? 'http://localhost:8080';

const proxy: Record<string, string> = {};
for (const path of API_PATHS) {
  proxy[path] = API_TARGET;
}

export default defineConfig({
  base: '/ui/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy,
  },
});
