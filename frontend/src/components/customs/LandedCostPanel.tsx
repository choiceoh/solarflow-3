import { useState } from 'react';
import { Eye, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/api';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import AllocatedExpensesView from './AllocatedExpensesView';

interface LandedCostResponse {
  costs: {
    cost_id: string;
    landed_total_krw: number;
    landed_wp_krw: number;
    allocated_expenses: Record<string, number>;
  }[];
}

interface Props {
  declarationId: string;
  onRefresh: () => void;
}

// 비유: Landed Cost 미리보기/저장 2단계 (D-025)
export default function LandedCostPanel({ declarationId, onRefresh }: Props) {
  const [previewData, setPreviewData] = useState<LandedCostResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'preview' | 'saved'>('idle');
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // POST /api/v1/calc/landed-cost { declaration_id, save: false }
  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Rust 계산엔진 연동
      const result = await fetchWithAuth<LandedCostResponse>('/api/v1/calc/landed-cost', {
        method: 'POST',
        body: JSON.stringify({ declaration_id: declarationId, save: false }),
      });
      setPreviewData(result);
      setStatus('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Landed Cost 미리보기 실패');
    }
    setLoading(false);
  };

  // POST /api/v1/calc/landed-cost { declaration_id, save: true }
  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Rust 계산엔진 연동
      await fetchWithAuth('/api/v1/calc/landed-cost', {
        method: 'POST',
        body: JSON.stringify({ declaration_id: declarationId, save: true }),
      });
      setStatus('saved');
      setConfirmOpen(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Landed Cost 저장 실패');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handlePreview} disabled={loading}>
          <Eye className="mr-1 h-3.5 w-3.5" />미리보기
        </Button>
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={loading || status !== 'preview'}
        >
          <Save className="mr-1 h-3.5 w-3.5" />저장
        </Button>

        {status === 'preview' && (
          <Badge className="bg-blue-100 text-blue-700 border-blue-300">미리보기</Badge>
        )}
        {status === 'saved' && (
          <Badge className="bg-green-100 text-green-700 border-green-300">저장완료</Badge>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {previewData && previewData.costs.length > 0 && (
        <div className="space-y-2">
          {previewData.costs.map((c) => (
            <div
              key={c.cost_id}
              className={`rounded-md p-3 ${
                status === 'preview' ? 'bg-blue-50 border border-blue-200' :
                status === 'saved' ? 'bg-green-50 border border-green-200' : ''
              }`}
            >
              <div className="flex gap-4 text-xs mb-2">
                <span>Landed 합계: <strong>{c.landed_total_krw.toLocaleString('ko-KR')}원</strong></span>
                <span>Landed Wp단가: <strong>{c.landed_wp_krw.toFixed(2)} 원/Wp</strong></span>
              </div>
              {c.allocated_expenses && Object.keys(c.allocated_expenses).length > 0 && (
                <AllocatedExpensesView allocatedExpenses={c.allocated_expenses} />
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Landed Cost 저장"
        description="Landed Cost를 저장하시겠습니까? 기존 값이 덮어씌워집니다."
        onConfirm={handleSave}
        loading={loading}
      />
    </div>
  );
}
