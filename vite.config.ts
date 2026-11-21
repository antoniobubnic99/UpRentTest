import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Security headers from vercel.json, so `npm run preview` behaves like production. */
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { headers: { key: string; value: string }[] }[]
}
const securityHeaders = Object.fromEntries(vercel.headers[0].headers.map((h) => [h.key, h.value]))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The Excel library (exceljs, ~930 kB) is a separate chunk loaded only when Excel import /
  // export is used, so it does not affect the first page load.
  build: { chunkSizeWarningLimit: 1000 },
  preview: { headers: securityHeaders },
})
