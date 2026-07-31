import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/inject.ts', import.meta.url)),
      name: 'forkjsInject',
      formats: ['iife'],
      fileName: () => 'board-reader.js',
    },
    minify: false,
  },
})
