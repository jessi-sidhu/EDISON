import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.js'],
    reporters: ['default', ['tdd-guard-vitest', { projectRoot: root }]],
  },
})
