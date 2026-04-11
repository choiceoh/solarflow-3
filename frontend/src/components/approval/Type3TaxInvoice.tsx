// 유형 3: 판매 세금계산서 — 거래처+기간 → 매출 조회 → 텍스트 생성
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { useType3 } from '@/hooks/useApproval';
import { generateType3 } from '@/lib/approvalTemplates';
import { fetchWithAuth } from '@/lib/api';

interface Props { onGenerate: (text: string) => void }

function defaultFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function Type3TaxInvoice({ onGenerate }: Props) {
  const [partners, setPartners] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { data, loading, generate } = useType3();

  useEffect(() => {
    fetchWithAuth<any[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p: any) =>
        p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'),
      )))
      .catch(() => setPartners([]));
  }, []);

  useEffect(() => {
    if (data) onGenerate(generateType3(data));
  }, [data, onGenerate]);

  return (
    <div className="space-y-4">
      <div>
        <Label>거래처</Label>
        <select
          className="w-full mt-1 border rounded px-3 py-2 text-sm"
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            const p = partners.find((p: any) => p.partner_id === e.target.value);
            setCustomerName(p?.partner_name ?? '');
          }}
        >
          <option value="">거래처 선택...</option>
          {partners.map((p: any) => (
            <option key={p.partner_id} value={p.partner_id}>{p.partner_name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>시작일</Label>
          <DateInput value={from} onChange={setFrom} />
        </div>
        <div>
          <Label>종료일</Label>
          <DateInput value={to} onChange={setTo} />
        </div>
      </div>
      <Button onClick={() => generate(customerId, customerName, from, to)} disabled={!customerId || loading} size="sm">
        {loading ? '생성 중...' : '결재안 생성'}
      </Button>
    </div>
  );
}
