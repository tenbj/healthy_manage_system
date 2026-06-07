import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT ?? 5173),
      proxy: {
        '/api': env.VITE_API_PROXY ?? 'http://127.0.0.1:4310',
      },
    },
    test: {
      environment: 'node',
      include: ['server/tests/**/*.test.ts'],
    },
  }
})
