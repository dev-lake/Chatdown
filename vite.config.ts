import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json';

function getDefaultServerPermission(rawUrl: string): string {
  const url = new URL(rawUrl);
  return `${url.origin}/*`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const defaultServerUrl = env.VITE_CHATDOWN_DEFAULT_SERVER_URL || 'https://localhost:5001';

  return {
    plugins: [
      react(),
      crx({
        manifest: {
          ...manifest,
          host_permissions: Array.from(new Set([
            ...manifest.host_permissions,
            getDefaultServerPermission(defaultServerUrl),
          ])),
        },
      })
    ],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          login: 'src/login/index.html',
        },
      },
    }
  };
});
