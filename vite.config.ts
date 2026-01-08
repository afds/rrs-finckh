import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const basePath = process.env.BASE_PATH ?? '/rrs-finckh/'

// https://vite.dev/config/
export default defineConfig({
  base: basePath,
  plugins: [react()],
})
