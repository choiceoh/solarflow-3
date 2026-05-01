// 결재안 유형 선택 카드 6개 (Step 30)
import { FileText, Ship, Receipt, Truck, Wallet, HardHat } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApprovalType } from '@/types/approval';
import { APPROVAL_TYPE_LABEL, APPROVAL_TYPE_DESC } from '@/types/approval';

interface Props {
  selected: ApprovalType | null;
  onSelect: (type: ApprovalType) => void;
}

const ICONS: Record<ApprovalType, React.ReactNode> = {
  1: <Ship className="h-4 w-4" />,
  2: <FileText className="h-4 w-4" />,
  3: <Receipt className="h-4 w-4" />,
  4: <Truck className="h-4 w-4" />,
  5: <Wallet className="h-4 w-4" />,
  6: <HardHat className="h-4 w-4" />,
};

const TONE: Record<ApprovalType, string> = {
  1: 'bg-[var(--sf-info-bg)] text-[var(--sf-info)]',     // 입항 결재
  2: 'bg-[var(--sf-bg-2)] text-[var(--sf-ink-2)]',       // 일반 문서
  3: 'bg-[var(--sf-warn-bg)] text-[var(--sf-warn)]',     // 영수/계산서
  4: 'bg-[var(--sf-pos-bg)] text-[var(--sf-pos)]',       // 출고
  5: 'bg-[var(--sf-solar-bg)] text-[var(--sf-solar-3)]', // 입금/수금
  6: 'bg-[var(--sf-bg-2)] text-[var(--sf-ink-2)]',       // 현장
};

export default function ApprovalTypeSelector({ selected, onSelect }: Props) {
  const types: ApprovalType[] = [1, 2, 3, 4, 5, 6];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {types.map((t) => {
        const isSelected = selected === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              'sf-card-hover flex flex-col gap-2 rounded-md border bg-[var(--sf-surface)] p-4 text-left',
              isSelected
                ? 'border-[var(--sf-solar-2)] shadow-[var(--sf-shadow-2),0_0_0_3px_rgb(245_184_0_/_0.15)]'
                : 'border-[var(--sf-line)] shadow-[var(--sf-shadow-1)]',
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-md', TONE[t])}>
                {ICONS[t]}
              </span>
              <span className="text-sm font-semibold tracking-[-0.005em] text-[var(--sf-ink)]">
                {APPROVAL_TYPE_LABEL[t]}
              </span>
            </div>
            <p className="text-[11.5px] leading-snug text-[var(--sf-ink-3)]">
              {APPROVAL_TYPE_DESC[t]}
            </p>
          </button>
        );
      })}
    </div>
  );
}
