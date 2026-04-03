// 유형 2: CIF 비용/제경비 — B/L 선택 → 부대비용 조회 → 텍스트 생성
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useType2 } from '@/hooks/useApproval';
import { generateType2 } from '@/lib/approvalTemplates';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';

interface Props { onGenerate: (text: string) => void }

export default function Type2CIFExpense({ onGenerate }: Props) {
  const [blId, setBlId] = useState('');
  const [bls, setBls] = useState<any[]>([]);
  const [blsLoading, setBlsLoading] = useState(true);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const { data, loading, generate } = useType2();

  useEffect(() => {
    if (!selectedCompanyId) { setBls([]); setBlsLoading(false); return; }
    setBlsLoading(true);
    fetchWithAuth<any[]>(`/api/v1/bls?company_id=${selectedCompanyId}`)
      .then(setBls)
      .catch(() => setBls([]))
      .finally(() => setBlsLoading(false));
  }, [selectedCompanyId]);

  useEffect(() => {
    if (data) onGenerate(generateType2(data));
  }, [data, onGenerate]);

  return (
    <div className="space-y-4">
      <div>
        <Label>B/L 선택</Label>
        <select
          className="w-full mt-1 border rounded px-3 py-2 text-sm"
          value={blId}
          onChange={(e) => setBlId(e.target.value)}
          disabled={blsLoading}
        >
          <option value="">B/L 선택...</option>
          {bls.map((bl: any) => (
            <option key={bl.bl_id} value={bl.bl_id}>
              {bl.bl_number} — {bl.manufacturers?.name_kr ?? ''} — {bl.status}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={() => generate(blId)} disabled={!blId || loading} size="sm">
        {loading ? '생성 중...' : '결재안 생성'}
      </Button>
    </div>
  );
}
