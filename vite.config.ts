import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/splatbench/' : '/', // GitHub Pages base path only for production
  server: {
    // Add your dev hostnames here if running behind a tunnel or LAN.
    allowedHosts: ['localhost'],
  },
}))
