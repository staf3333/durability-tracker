import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const DEPLOY_ENV = process.env.VITE_DEPLOY_ENV === 'staging' ? 'staging' : 'production';
const STAGING_HOST = process.env.VITE_STAGING_DEFAULT_HOST ?? '';
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 12)
  ?? new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __DEPLOY_ENV__: JSON.stringify(DEPLOY_ENV),
    __STAGING_HOST__: JSON.stringify(STAGING_HOST),
  },
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icon-192.png', 'icon-512.png'],
      workbox: {
        // Without this the SPA navigation fallback swallows every navigation,
        // including /api/* and the /.auth/* sign-in redirect, and serves the
        // cached app shell instead. Auth can never complete.
        navigateFallbackDenylist: [/^\/api\//, /^\/\.auth\//],
      },
      manifest: {
        name: DEPLOY_ENV === 'staging' ? 'Durability Tracker Staging' : 'Durability Tracker',
        short_name: DEPLOY_ENV === 'staging' ? 'Durability STG' : 'Durability',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: DEPLOY_ENV === 'staging' ? '#b42318' : '#5a9e2f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
