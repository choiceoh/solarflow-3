import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils';

interface Props {
  receiptAmount: number;
  selectedTotal: number;
}

// 비유: 차액 = 입금액 - 선택 합계. 양수=선수금(돈이 남음), 음수=부족(매칭 불가), 0=정확 일치
export default function MatchDifferenceDisplay({ receiptAmount, selectedTotal }: Props) {
  const diff = receiptAmount - selectedTotal;

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
        <span>입금액</span>
        <span className="font-medium">{formatNumber(receiptAmount)}원</span>
      </div>
      <div className="flex justify-between">
        <span>선택 합계</span>
        <span className="font-medium">{formatNumber(selectedTotal)}원</span>
      </div>
      <div className="flex justify-between border-t pt-1 font-semibold">
        <span>차액 ({label})</span>
        <span>{diff >= 0 ? '+' : ''}{formatNumber(diff)}원</span>
      </div>
    </div>
  );
}
