import { defineConfig } from 'vite';

export default defineConfig({
  // Deux entrées : l’application RELIA et le prototype « plan de table », qui partagent le
  // moteur de graphe et le système visuel sans se mélanger.
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        seating: 'seating.html',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
