import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      'process.env': {},
    },
    optimizeDeps: {
      exclude: ['node-pty'],
    },
    build: {
      commonjsOptions: {
        ignore: ['node-pty'],
      },
      rollupOptions: {
        external: ['node-pty'],
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/socket.io': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
