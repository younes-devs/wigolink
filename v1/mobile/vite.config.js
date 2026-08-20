import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(mobileDir, '..', 'client');

export default defineConfig({
  plugins: [react()],
  // The Android shell must always call the deployed API, even though the
  // shared frontend is built with the client directory as its Vite root.
  envDir: mobileDir,
  // Reuse the real Wigolink frontend inside the Android shell.
  root: clientDir,
  build: {
    outDir: path.resolve(mobileDir, 'dist'),
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['@vitejs/plugin-react']
  },
});
