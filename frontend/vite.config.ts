import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Proxy de dev vers l'ENT local (traefik :8090)
const proxyTarget = { target: 'http://localhost:8090', changeOrigin: false };

export default defineConfig(({ mode }) => ({
  // Servi sous /calendar par entcore (cf. view/calendar-react.html -> /calendar/public/index.js)
  base: mode === 'production' ? '/calendar' : '',
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'react-i18next',
      'i18next',
      'react-router-dom',
      '@open-ent/client',
      '@open-ent/react',
      '@open-ent/bootstrap',
    ],
    alias: {
      // Illustrations du socle (écrans vides), comme dans blog.
      '@images': resolve(__dirname, 'node_modules/@open-ent/bootstrap/dist/images'),
    },
  },
  build: {
    assetsDir: 'public',
    rollupOptions: {
      output: {
        /**
         * Tout porte une empreinte de contenu, y compris l'entrée — comme blog, wiki et video.
         *
         * La vue n'est donc plus écrite à la main avec un `?v=<horodatage>` : elle est GÉNÉRÉE
         * par Vite (`dist/index.html`) et référence les fichiers empreintés. Deux défauts
         * disparaissent ensemble : l'entrée à nom fixe que les navigateurs resservaient après un
         * déploiement, et la double URL qu'introduisait le `?v=` — un morceau différé importe
         * l'entrée par `./index.js` SANS la requête, le navigateur y voit une autre ressource,
         * la sert depuis son cache, et l'import échoue (« does not provide an export named … »)
         * en laissant la fenêtre jamais rendue.
         */
        entryFileNames: 'public/[name]-[hash].js',
        chunkFileNames: 'public/[name]-[hash].js',
        assetFileNames: 'public/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 4200,
    // Autorise la lecture des images/polices du paquet bootstrap (hors racine du projet).
    fs: { allow: ['../../'] },
    proxy: {
      '/calendar': proxyTarget,
      '^/(?=assets|theme|locale|i18n|skin)': proxyTarget,
      '^/(?=auth|userbook|directory|portal|session|timeline|workspace|infra|conf|applications-list)':
        proxyTarget,
    },
  },
  plugins: [react()],
}));
