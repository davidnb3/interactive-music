import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Project Pages live at https://<user>.github.io/<repo>/
  base: process.env.GITHUB_PAGES === 'true' ? '/interactive-music/' : '/',
  server: { port: 5173 },
})
