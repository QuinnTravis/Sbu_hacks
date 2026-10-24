import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { eventDetector } from './events-server.ts'

// `npm run build` produces a normal static site in dist/.
// `npm run build:single` inlines everything into one HTML file (dist-single/).
// `npm run dev` / `npm run preview` also serve /api/events (AI event detection).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const plugins = [react(), eventDetector(env)]
  return {
    plugins: mode === 'single' ? [...plugins, viteSingleFile()] : plugins,
    build: mode === 'single' ? { outDir: 'dist-single' } : undefined,
  }
})
