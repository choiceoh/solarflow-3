import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BreakdownRowItem {
  key: string;
  label: ReactNode;
  count: ReactNode;
}

interface Props {
  items: BreakdownRowItem[];
}

/**
 * RailBlock 안에서 "label · count" 행을 행간 구분선과 함께 나열하는 패턴.
 *
 * 디자인 변경(셀 높이/구분선 톤/타이포)은 이 컴포넌트에서만 한다.
 * 사용처: OrdersPage(수주/출고/용도), CustomsPage(비용 유형), ProcurementPage(입고 상태/주요 항구).
 */
export function BreakdownRows({ items }: Props) {
  return (
    <>
      {items.map((item, index) => (
        <div
          key={item.key}
          className={cn(
            'flex justify-between py-1.5 text-[11.5px]',
            index > 0 && 'border-t border-[var(--line)]',
          )}
        >
          <span className="min-w-0 truncate text-[var(--ink-2)]">{item.label}</span>
          <span className="mono font-semibold text-[var(--ink-3)]">{item.count}</span>
        </div>
      ))}
    </>
  );
}
