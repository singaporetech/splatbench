import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // add dev hostnames here when running behind a tunnel or LAN
    allowedHosts: ['localhost'],
  },
})
