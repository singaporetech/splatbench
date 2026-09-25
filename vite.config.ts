import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function pkgVersion(path: string): string {
  try {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8')).version as string
  } catch {
    return 'unknown'
  }
}

const appVersion = pkgVersion('./package.json')
const sparkVersion = pkgVersion('./node_modules/@sparkjsdev/spark/package.json')
const threeVersion = pkgVersion('./node_modules/three/package.json')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // installed versions, recorded in the export provenance columns
    __APP_VERSION__: JSON.stringify(appVersion),
    __RENDERER_LIB_VERSIONS__: JSON.stringify(`spark@${sparkVersion};three@${threeVersion}`),
  },
  server: {
    // add dev hostnames here when running behind a tunnel or LAN
    allowedHosts: ['localhost'],
  },
})
