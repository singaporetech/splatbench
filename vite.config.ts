import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/splatbench/' : '/', // GitHub Pages base path only for production
  server: {
    allowedHosts: [
      'chekpoint.singapura-broadnose.ts.net',
      '100.80.98.29',
      '192.168.129.66',
      'localhost',
    ],
  },
}))
