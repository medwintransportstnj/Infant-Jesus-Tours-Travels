import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/** Public site origin for canonical / Open Graph tags: VITE_SITE_URL, else Vercel's production domain. */
function siteUrl(mode: string): string {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
  return (env.VITE_SITE_URL || vercel || '').replace(/\/+$/, '');
}

function injectSiteUrl(mode: string): Plugin {
  return {
    name: 'ijt-inject-site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl(mode)),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), injectSiteUrl(mode)],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Make the resolved site URL available to the app even when only Vercel's variable is set.
  define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl(mode)) },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
