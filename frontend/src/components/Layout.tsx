import { Link, Outlet, useLocation } from 'react-router-dom';

const menuItems = [
  { path: '/', label: '대시보드', icon: '📊' },
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
