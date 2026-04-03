import { formatKRW } from '@/lib/utils';
import type { LCFeeCalc } from '@/types/banking';

interface Props {
  fee: LCFeeCalc;
}

// LC 수수료 펼침 상세 (D-030)
export default function LCFeeDetail({ fee }: Props) {
  return (
    <div className="bg-muted/50 rounded p-3 text-xs space-y-1">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <span className="text-muted-foreground">개설수수료:</span>
          <span className="ml-1 font-medium">{formatKRW(fee.opening_fee)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">인수수수료:</span>
          <span className="ml-1 font-medium">{formatKRW(fee.acceptance_fee)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">합계:</span>
          <span className="ml-1 font-semibold">{formatKRW(fee.total_fee)}</span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground italic">{fee.fee_note || '예상 금액. 실제 청구와 차이 가능'}</p>
    </div>
  );
}
