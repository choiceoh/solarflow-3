#!/bin/bash
# ============================================================
# SolarFlow 3.0 — Step 4-A: 프론트엔드 프로젝트 초기화
# 터미널 1에서 실행: bash setup_step4a.sh
# Vite + React + TypeScript + Tailwind CSS + React Router
# ============================================================

set -e

FRONTEND_DIR=~/solarflow-3/frontend
cd "$FRONTEND_DIR"

echo "🔧 Step 4-A 시작: 프론트엔드 프로젝트 초기화"
echo "================================================"

# ── 1. 기존 index.html 백업 ──
echo "📁 기존 파일 백업..."
if [ -f index.html ]; then
    mv index.html index.html.bak
fi

# ── 2. Vite 프로젝트 생성 (현재 폴더에) ──
echo "📦 Vite + React + TypeScript 설치..."
npm create vite@latest . -- --template react-ts --yes 2>/dev/null || {
    # 폴더가 비어있지 않으면 temp로 생성 후 복사
    echo "📦 대안 방식으로 설치..."
    cd ~
    rm -rf _solarflow_temp_frontend
    npm create vite@latest _solarflow_temp_frontend -- --template react-ts
    cp -r ~/_solarflow_temp_frontend/* "$FRONTEND_DIR/"
    cp ~/_solarflow_temp_frontend/.gitignore "$FRONTEND_DIR/" 2>/dev/null || true
    rm -rf ~/_solarflow_temp_frontend
    cd "$FRONTEND_DIR"
}

# ── 3. 의존성 설치 ──
echo "📦 npm install..."
npm install

# ── 4. Tailwind CSS 설치 ──
echo "📦 Tailwind CSS 설치..."
npm install -D tailwindcss @tailwindcss/vite

# ── 5. React Router 설치 ──
echo "📦 React Router 설치..."
npm install react-router-dom

# ── 6. vite.config.ts 수정 (Tailwind 플러그인 + API 프록시) ──
echo "📄 vite.config.ts 설정..."
cat > vite.config.ts << 'TSEOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'https://solarflow-backend.fly.dev',
        changeOrigin: true,
      }
    }
  }
})
TSEOF

# ── 7. Tailwind CSS 적용 ──
echo "📄 CSS 설정..."
cat > src/index.css << 'CSSEOF'
@import "tailwindcss";

/* SolarFlow 커스텀 스타일 */
body {
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
}
CSSEOF

# ── 8. API 연결 유틸 ──
echo "📄 API 유틸 생성..."
mkdir -p src/lib
cat > src/lib/api.ts << 'TSEOF'
// API 기본 URL — 개발에서는 프록시, 운영에서는 직접 연결
const API_BASE = import.meta.env.PROD
  ? 'https://solarflow-backend.fly.dev'
  : '';

// 공통 fetch 함수
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '요청 실패' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// 마스터 API 함수들
export const masterApi = {
  // 법인
  companies: {
    list: () => api<any[]>('/api/v1/companies'),
    get: (id: string) => api<any>(`/api/v1/companies/${id}`),
    create: (data: any) => api<any>('/api/v1/companies', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => api<any>(`/api/v1/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  // 제조사
  manufacturers: {
    list: () => api<any[]>('/api/v1/manufacturers'),
    get: (id: string) => api<any>(`/api/v1/manufacturers/${id}`),
    create: (data: any) => api<any>('/api/v1/manufacturers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => api<any>(`/api/v1/manufacturers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  // 품번
  products: {
    list: (params?: string) => api<any[]>(`/api/v1/products${params ? '?' + params : ''}`),
    get: (id: string) => api<any>(`/api/v1/products/${id}`),
    create: (data: any) => api<any>('/api/v1/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => api<any>(`/api/v1/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  // 거래처
  partners: {
    list: (params?: string) => api<any[]>(`/api/v1/partners${params ? '?' + params : ''}`),
    get: (id: string) => api<any>(`/api/v1/partners/${id}`),
    create: (data: any) => api<any>('/api/v1/partners', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => api<any>(`/api/v1/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  // 창고
  warehouses: {
    list: (params?: string) => api<any[]>(`/api/v1/warehouses${params ? '?' + params : ''}`),
    get: (id: string) => api<any>(`/api/v1/warehouses/${id}`),
    create: (data: any) => api<any>('/api/v1/warehouses', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => api<any>(`/api/v1/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  // 은행
  banks: {
    list: (params?: string) => api<any[]>(`/api/v1/banks${params ? '?' + params : ''}`),
    get: (id: string) => api<any>(`/api/v1/banks/${id}`),
    create: (data: any) => api<any>('/api/v1/banks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => api<any>(`/api/v1/banks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
};
TSEOF

# ── 9. 레이아웃 컴포넌트 ──
echo "📄 레이아웃 생성..."
mkdir -p src/components
cat > src/components/Layout.tsx << 'TSEOF'
import { Link, Outlet, useLocation } from 'react-router-dom';

const menuItems = [
  { path: '/', label: '대시보드', icon: '📊' },
  { path: '/companies', label: '법인', icon: '🏢' },
  { path: '/manufacturers', label: '제조사', icon: '🏭' },
  { path: '/products', label: '품번', icon: '📦' },
  { path: '/partners', label: '거래처', icon: '🤝' },
  { path: '/warehouses', label: '창고/장소', icon: '🏗️' },
  { path: '/banks', label: '은행', icon: '🏦' },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 사이드바 */}
      <nav className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-blue-600">☀️ SolarFlow</h1>
          <p className="text-xs text-gray-400 mt-1">v3.0 — 마스터 관리</p>
        </div>
        <div className="flex-1 py-2">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-4 py-2.5 text-sm transition-colors ${
                location.pathname === item.path
                  ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
        <div className="p-3 border-t border-gray-200 text-xs text-gray-400">
          탑솔라 그룹
        </div>
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
TSEOF

# ── 10. 대시보드 페이지 (임시) ──
echo "📄 대시보드 페이지 생성..."
mkdir -p src/pages
cat > src/pages/Dashboard.tsx << 'TSEOF'
import { useEffect, useState } from 'react';
import { masterApi } from '../lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState({ companies: 0, manufacturers: 0, products: 0, partners: 0, warehouses: 0, banks: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [companies, manufacturers, products, partners, warehouses, banks] = await Promise.all([
          masterApi.companies.list(),
          masterApi.manufacturers.list(),
          masterApi.products.list(),
          masterApi.partners.list(),
          masterApi.warehouses.list(),
          masterApi.banks.list(),
        ]);
        setStats({
          companies: companies.length,
          manufacturers: manufacturers.length,
          products: products.length,
          partners: partners.length,
          warehouses: warehouses.length,
          banks: banks.length,
        });
      } catch (e) {
        console.error('데이터 로드 실패:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>;

  const cards = [
    { label: '법인', count: stats.companies, icon: '🏢', color: 'blue' },
    { label: '제조사', count: stats.manufacturers, icon: '🏭', color: 'green' },
    { label: '품번', count: stats.products, icon: '📦', color: 'purple' },
    { label: '거래처', count: stats.partners, icon: '🤝', color: 'orange' },
    { label: '창고/장소', count: stats.warehouses, icon: '🏗️', color: 'teal' },
    { label: '은행', count: stats.banks, icon: '🏦', color: 'red' },
  ];

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">대시보드</h2>
      <div className="grid grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{card.count}</p>
              </div>
              <span className="text-3xl">{card.icon}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
TSEOF

# ── 11. 법인 목록 페이지 (첫 번째 마스터 화면) ──
echo "📄 법인 관리 페이지 생성..."
cat > src/pages/Companies.tsx << 'TSEOF'
import { useEffect, useState } from 'react';
import { masterApi } from '../lib/api';

export default function Companies() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    masterApi.companies.list()
      .then(setCompanies)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>;
  if (error) return <div className="p-8 text-red-500">오류: {error}</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">🏢 법인 관리</h2>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">법인코드</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">법인명</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">사업자번호</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">상태</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.company_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono font-medium text-blue-600">{c.company_code}</td>
                <td className="px-4 py-3 text-sm text-gray-800">{c.company_name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.business_number || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                    c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {c.is_active ? '활성' : '비활성'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
TSEOF

# ── 12. 제조사 목록 페이지 ──
echo "📄 제조사 관리 페이지 생성..."
cat > src/pages/Manufacturers.tsx << 'TSEOF'
import { useEffect, useState } from 'react';
import { masterApi } from '../lib/api';

export default function Manufacturers() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    masterApi.manufacturers.list()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-400">로딩 중...</div>;

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">🏭 제조사 관리</h2>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">제조사명(한글)</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">제조사명(영문)</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">국가</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">구분</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">상태</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.manufacturer_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{m.name_kr}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{m.name_en || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{m.country}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                    m.domestic_foreign === '해외' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {m.domestic_foreign}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">활성</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
TSEOF

# ── 13. 나머지 페이지 (준비 중 표시) ──
echo "📄 나머지 페이지 스켈레톤 생성..."

for page in Products Partners Warehouses Banks; do
cat > "src/pages/${page}.tsx" << TSEOF
export default function ${page}() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">${page} 관리</h2>
      <p className="text-gray-500">Step 4-B에서 구현 예정</p>
    </div>
  );
}
TSEOF
done

# ── 14. App.tsx — 라우터 설정 ──
echo "📄 App.tsx 교체..."
cat > src/App.tsx << 'TSEOF'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import Manufacturers from './pages/Manufacturers';
import Products from './pages/Products';
import Partners from './pages/Partners';
import Warehouses from './pages/Warehouses';
import Banks from './pages/Banks';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/manufacturers" element={<Manufacturers />} />
          <Route path="/products" element={<Products />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/warehouses" element={<Warehouses />} />
          <Route path="/banks" element={<Banks />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
TSEOF

# ── 15. main.tsx 정리 ──
echo "📄 main.tsx 정리..."
cat > src/main.tsx << 'TSEOF'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
TSEOF

# ── 16. 불필요한 기본 파일 삭제 ──
echo "🧹 불필요한 파일 정리..."
rm -f src/App.css
rm -f index.html.bak

# ── 17. Cloudflare Pages용 리다이렉트 (SPA 라우팅) ──
echo "📄 Cloudflare Pages SPA 설정..."
cat > public/_redirects << 'EOF'
/*    /index.html   200
EOF

# ── 18. 빌드 테스트 ──
echo ""
echo "🔨 빌드 테스트..."
if npx tsc --noEmit 2>/dev/null && npm run build; then
    echo ""
    echo "================================================"
    echo "✅ Step 4-A 완료! 프론트엔드 빌드 성공!"
    echo "================================================"
    echo ""
    echo "📁 주요 파일:"
    echo "  src/App.tsx          — 라우터"
    echo "  src/lib/api.ts       — API 연결"
    echo "  src/components/      — 공통 컴포넌트"
    echo "  src/pages/           — 페이지들"
    echo ""
    echo "🧪 로컬 테스트: npm run dev"
    echo ""
    echo "다음 명령어를 순서대로 실행하세요:"
    echo '  git add -A'
    echo '  git commit -m "feat: Step 4-A — 프론트엔드 초기화 (Vite+React+Tailwind+라우터)"'
    echo '  git push origin main'
else
    echo ""
    echo "❌ 빌드 실패 — 에러 메시지를 Claude에게 보내주세요"
fi
