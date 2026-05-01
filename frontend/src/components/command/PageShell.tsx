import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageShellProps {
  rail: ReactNode;
  children: ReactNode;
  /** sf-page 외에 추가할 클래스 (예: sf-sales-page) */
  className?: string;
}

/**
 * 2단 레이아웃(메인 + 오른쪽 rail)의 페이지 셸.
 * MasterConsole 외부에서 같은 grid를 직접 작성하던 페이지들이 공유.
 *
 * grid 클래스 자체는 index.css의 .sf-procurement-layout / -main / -rail
 * (역사적 이름이라 sf-procurement-* 그대로 사용 — TODO(sf-page-rename): sf-page-*로 정리).
 */
export function PageShell({ rail, children, className }: PageShellProps) {
  return (
    <div className={cn('sf-page', className)}>
      <div className="sf-procurement-layout">
        <section className="sf-procurement-main">{children}</section>
        <aside className="sf-procurement-rail card">{rail}</aside>
      </div>
    </div>
  );
}
