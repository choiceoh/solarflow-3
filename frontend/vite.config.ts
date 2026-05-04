import path from 'path'
import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 마지막 머지 PR 번호 — 로그인 화면 푸터에 빌드 시점 값으로 주입.
// "Merge pull request #NNN" 패턴 커밋만 신뢰. git 미설치/얕은 클론/매치 실패 시 빈 문자열 → 컴포넌트 폴백.
// execFileSync로 직접 호출 — 쉘을 거치지 않아 윈도우/유닉스 모두에서 인자 분리 안전.
function lastMergedPrNumber(): string {
  try {
    const subject = execFileSync(
      'git',
      ['log', '--grep=^Merge pull request', '-n', '1', '--pretty=%s'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const match = subject.match(/#(\d+)/)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

export default defineConfig({
  define: {
    __LAST_MERGED_PR__: JSON.stringify(lastMergedPrNumber()),
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/recharts/')) return 'recharts';
          if (id.includes('/lucide-react/')) return 'icons';
          if (id.includes('/@supabase/')) return 'supabase';
          if (id.includes('/zod/') || id.includes('/react-hook-form/') || id.includes('/@hookform/')) return 'forms';
          if (
            id.includes('/@base-ui/') ||
            id.includes('/@radix-ui/') ||
            id.includes('/cmdk/') ||
            id.includes('/class-variance-authority/') ||
            id.includes('/clsx/') ||
            id.includes('/tailwind-merge/')
          ) return 'ui-vendor';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'react-vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    // e2e/는 Playwright 전용 — vitest가 picking up 하지 않게 제외
    exclude: ['node_modules', 'dist', 'e2e/**'],
  }
})
