import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separate from vite.config.ts so the dev server's proxy does not have to be
// loaded to run a test. The `@` alias is not optional here: it is duplicated
// rather than shared, so a component imported by a test resolves the same way
// it does in a build.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
