import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Test environment
    environment: 'jsdom',

    // Setup files
    setupFiles: ['./vitest.setup.ts'],

    // Include patterns
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],

    // Global test APIs
    globals: true,

    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
      ],
      // 이전 설정은 Jest 문법(thresholds.global)이라 Vitest가 무시했다. 문서의 70%는 한 번도 적용된 적이 없고
      // 실제 커버리지는 약 28%였다. 현재값을 하한으로 고정해 떨어지지 않게 하고, 올리면 함께 올린다 (DECISION_LOG A-31)
      thresholds: {
        branches: 18,
        functions: 18,
        lines: 29,
        statements: 27,
      },
    },

    // CSS handling
    css: true,

    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,

    // Timeout
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@shared': resolve(__dirname, '../shared/src'),
    },
  },
});
