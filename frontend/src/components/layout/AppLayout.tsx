import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';
import FloatingMwEaCalculator from '@/components/common/FloatingMwEaCalculator';

export default function AppLayout() {
  return (
    <div className="flex h-screen flex-col">
      <TopNav />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      {/* 전역 MW↔장수 계산기 (모든 보호 페이지에서 우하단 플로팅) */}
      <FloatingMwEaCalculator />
    </div>
  );
}
