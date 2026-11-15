/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 5173 landing, 5273 register, 5373 old minigame sandbox: the arcade gets its own port.
  server: { port: 5573, strictPort: true },
  preview: { port: 4474, strictPort: true },
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    // .mjs: the Olympus 21 tests ported from the minigame prototype (plain JS, like the game).
    include: ['tests/**/*.test.{ts,tsx,mjs}'],
  },
})
