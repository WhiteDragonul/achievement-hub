import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // În dezvoltare, cererile către /api merg la API-ul local, deci browserul vede o singură origine (fără CORS).
    proxy: { '/api': 'http://localhost:3000' },
  },
});
