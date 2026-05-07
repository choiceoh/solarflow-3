// 결재안 유형 선택 카드 6개 (Step 30)
import { FileText, Ship, Receipt, Truck, Wallet, HardHat } from 'lucide-react';
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

const TONE_CLASS: Record<ApprovalType, string> = {
  1: 'sf-tone-info',  // 입항 결재
  2: 'sf-tone-muted', // 일반 문서
  3: 'sf-tone-warn',  // 영수/계산서
  4: 'sf-tone-pos',   // 출고
  5: 'sf-tone-solar', // 입금/수금
  6: 'sf-tone-muted', // 현장
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
            aria-pressed={isSelected}
            aria-label={`결재 유형 선택: ${APPROVAL_TYPE_LABEL[t]}`}
            className="sf-card-hover flex flex-col gap-2 rounded-md p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
            style={{
              background: 'var(--sf-surface)',
              border: `1px solid ${isSelected ? 'var(--sf-solar-2)' : 'var(--sf-line)'}`,
              boxShadow: isSelected ? 'var(--sf-shadow-selected)' : 'var(--sf-shadow-1)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-md ${TONE_CLASS[t]}`}
                aria-hidden="true"
              >
                {ICONS[t]}
              </span>
              <span className="sf-text-ink text-sm font-semibold" style={{ letterSpacing: '-0.005em' }}>
                {APPROVAL_TYPE_LABEL[t]}
              </span>
            </div>
            <p className="sf-text-ink-3 text-[11.5px] leading-snug">
              {APPROVAL_TYPE_DESC[t]}
            </p>
          </button>
        );
      })}
    </div>
  );
}
