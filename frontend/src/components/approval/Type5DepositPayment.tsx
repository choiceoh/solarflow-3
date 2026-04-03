// 유형 5: 계약금 지출 — PO 선택 + 수동입력(계약금율/분납) → 텍스트 생성
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useType5 } from '@/hooks/useApproval';
import { usePOList } from '@/hooks/useProcurement';
import { generateType5 } from '@/lib/approvalTemplates';

interface Props { onGenerate: (text: string) => void }

export default function Type5DepositPayment({ onGenerate }: Props) {
  const [poId, setPoId] = useState('');
  const [depositRate, setDepositRate] = useState(30);
  const [installments, setInstallments] = useState(1);
  const { data: pos, loading: posLoading } = usePOList();
  const { data, loading, generate } = useType5();

  useEffect(() => {
    if (data) onGenerate(generateType5(data));
  }, [data, onGenerate]);

  return (
    <div className="space-y-4">
      <div>
        <Label>PO 선택</Label>
        <select
          className="w-full mt-1 border rounded px-3 py-2 text-sm"
          value={poId}
          onChange={(e) => setPoId(e.target.value)}
          disabled={posLoading}
        >
          <option value="">PO 선택...</option>
          {pos.map((po) => (
            <option key={po.po_id} value={po.po_id}>
              {po.po_number ?? po.po_id.slice(0, 8)} — {po.manufacturer_name} — {po.status}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>계약금율(%) <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 ml-1">[수동 입력]</span></Label>
          <Input
            type="number"
            className="bg-yellow-50 border-yellow-200"
            value={depositRate}
            onChange={(e) => setDepositRate(Number(e.target.value))}
            min={0}
            max={100}
          />
        </div>
        <div>
          <Label>분납 횟수 <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 ml-1">[수동 입력]</span></Label>
          <Input
            type="number"
            className="bg-yellow-50 border-yellow-200"
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
            min={1}
          />
        </div>
      </div>
      <Button onClick={() => generate(poId, depositRate, installments)} disabled={!poId || loading} size="sm">
        {loading ? '생성 중...' : '결재안 생성'}
      </Button>
    </div>
  );
}
