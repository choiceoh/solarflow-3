// 유형 1: 수입 모듈대금 — LC 선택 → 자동 조회 → 텍스트 생성
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useType1 } from '@/hooks/useApproval';
import { useLCList } from '@/hooks/useProcurement';
import { generateType1 } from '@/lib/approvalTemplates';

interface Props { onGenerate: (text: string) => void }

export default function Type1ImportPayment({ onGenerate }: Props) {
  const [lcId, setLcId] = useState('');
  const { data: lcs, loading: lcsLoading } = useLCList();
  const { data, loading, generate } = useType1();

  useEffect(() => {
    if (data) onGenerate(generateType1(data));
  }, [data, onGenerate]);

  return (
    <div className="space-y-4">
      <div>
        <Label>LC 선택</Label>
        <select
          className="w-full mt-1 border rounded px-3 py-2 text-sm"
          value={lcId}
          onChange={(e) => setLcId(e.target.value)}
          disabled={lcsLoading}
        >
          <option value="">LC 선택...</option>
          {lcs.map((lc) => (
            <option key={lc.lc_id} value={lc.lc_id}>
              {lc.lc_number ?? lc.lc_id.slice(0, 8)} — {lc.bank_name} — USD {lc.amount_usd.toLocaleString()}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={() => generate(lcId)} disabled={!lcId || loading} size="sm">
        {loading ? '생성 중...' : '결재안 생성'}
      </Button>
    </div>
  );
}
