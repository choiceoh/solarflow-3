// 유형 4: 운송비 월정산 — 거래처+기간 → 운송비 조회 → 텍스트 생성
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useType4 } from '@/hooks/useApproval';
import { generateType4 } from '@/lib/approvalTemplates';

interface Props { onGenerate: (text: string) => void }

export default function Type4TransportMonthly({ onGenerate }: Props) {
  const [vendor, setVendor] = useState('');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [manualDetails, setManualDetails] = useState('');
  const { data, loading, generate } = useType4();

  useEffect(() => {
    if (data) {
      const updated = { ...data, manualDetails };
      onGenerate(generateType4(updated));
    }
  }, [data, manualDetails, onGenerate]);

  return (
    <div className="space-y-4">
      <div>
        <Label>거래처(운송사)</Label>
        <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="운송사명 입력" />
      </div>
      <div>
        <Label>정산 월</Label>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <Button onClick={() => generate(vendor, month)} disabled={!vendor || loading} size="sm">
        {loading ? '조회 중...' : '데이터 조회'}
      </Button>
      {data && (
        <div>
          <Label>차량별 상세 <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 ml-1">[수동 입력]</span></Label>
          <Textarea
            className="mt-1 bg-yellow-50 border-yellow-200"
            rows={5}
            placeholder="차량번호, 구간, 금액 등 입력"
            value={manualDetails}
            onChange={(e) => setManualDetails(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
