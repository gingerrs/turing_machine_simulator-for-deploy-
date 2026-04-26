import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/turing_machine_simulator-for-deploy-/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Optional flag for environments where hot reloading should be turned off.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});