import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatNumber } from '@/lib/utils';
import {
  RECEIPT_BALANCE_DISPOSITION_LABEL,
  type ReceiptBalanceDisposition,
} from '@/types/orders';

interface Props {
  availableAmount: number;
  selectedTotal: number;
  balanceDisposition: ReceiptBalanceDisposition;
  balanceNote: string;
  amountIssue?: string | null;
  onBalanceDispositionChange: (value: ReceiptBalanceDisposition) => void;
  onBalanceNoteChange: (value: string) => void;
}

const BALANCE_OPTIONS: ReceiptBalanceDisposition[] = ['advance', 'next_settlement', 'refund_review'];

// 비유: 차액 = 매칭 가능액 - 선택 합계. 양수=선수금(돈이 남음), 음수=부족(매칭 불가), 0=정확 일치
export default function MatchDifferenceDisplay({
  availableAmount,
  selectedTotal,
  balanceDisposition,
  balanceNote,
  amountIssue,
  onBalanceDispositionChange,
  onBalanceNoteChange,
}: Props) {
  const diff = availableAmount - selectedTotal;

  let label: string;
  let colorClass: string;

  if (diff > 0) {
    label = '선수금';
    colorClass = 'text-green-700 bg-green-50 border-green-200';
  } else if (diff < 0) {
    label = '부족';
    colorClass = 'text-red-700 bg-red-50 border-red-200';
  } else {
    label = '정확 일치';
    colorClass = 'text-blue-700 bg-blue-50 border-blue-200';
  }

  return (
    <div className={cn('rounded-md border p-3 text-xs space-y-1', colorClass)}>
      <div className="flex justify-between">
        <span>매칭 가능액</span>
        <span className="font-medium">{formatNumber(availableAmount)}원</span>
      </div>
      <div className="flex justify-between">
        <span>선택 합계</span>
        <span className="font-medium">{formatNumber(selectedTotal)}원</span>
      </div>
      <div className="flex justify-between border-t pt-1 font-semibold">
        <span>차액 ({label})</span>
        <span>{diff >= 0 ? '+' : ''}{formatNumber(diff)}원</span>
      </div>
      {amountIssue && (
        <div className="border-t pt-1 text-red-700">{amountIssue}</div>
      )}
      {diff > 0 && !amountIssue && (
        <div className="space-y-2 border-t pt-2">
          <div className="font-semibold text-foreground">선수금/잔액 처리</div>
          <div className="grid gap-1 sm:grid-cols-3">
            {BALANCE_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={balanceDisposition === option ? 'default' : 'outline'}
                className="h-8 text-xs"
                onClick={() => onBalanceDispositionChange(option)}
              >
                {RECEIPT_BALANCE_DISPOSITION_LABEL[option]}
              </Button>
            ))}
          </div>
          <Textarea
            value={balanceNote}
            maxLength={500}
            placeholder="처리 메모"
            className="min-h-14 text-xs text-foreground"
            onChange={(event) => onBalanceNoteChange(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}
