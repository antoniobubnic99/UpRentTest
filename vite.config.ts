import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The Excel library (exceljs, ~930 kB) is a separate chunk loaded only when Excel import /
  // export is used, so it does not affect the first page load.
  build: { chunkSizeWarningLimit: 1000 },
})
