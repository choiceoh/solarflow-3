import { formatKRW } from '@/lib/utils';
import type { LCFeeCalc } from '@/types/banking';

interface Props {
  fee: LCFeeCalc;
}

// LC 수수료 펼침 상세 (D-030)
export default function LCFeeDetail({ fee }: Props) {
  return (
    <div
      className="rounded-md p-3 text-xs"
      style={{ background: 'var(--sf-bg-2)', border: '1px solid var(--sf-line)' }}
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="sf-eyebrow">개설수수료</span>
          <span className="sf-mono text-[12px] font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>
            {formatKRW(fee.opening_fee)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="sf-eyebrow">인수수수료</span>
          <span className="sf-mono text-[12px] font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>
            {formatKRW(fee.acceptance_fee)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="sf-eyebrow" style={{ color: 'var(--sf-solar-3)' }}>합계</span>
          <span className="sf-mono text-[13px] font-bold tabular-nums" style={{ color: 'var(--sf-solar-3)' }}>
            {formatKRW(fee.total_fee)}
          </span>
        </div>
      </div>
      <p className="sf-mono mt-2 text-[10px]" style={{ color: 'var(--sf-ink-3)' }}>
        {fee.fee_note || '예상 금액 · 실제 청구와 차이 가능'}
      </p>
    </div>
  );
}
