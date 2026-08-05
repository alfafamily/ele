// Точечные юнит-тесты чистой логики фронта (B42). НЕ дублируют E2E: покрывают
// только модули без React/сети (права, форматирование, разбор ошибок, статусы).
// Окружение node (DOM не нужен) — минимум инструментов, без jsdom.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
})
