import { useState } from 'react';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import type { OutboundStatus } from '@/types/outbound';

interface Props {
  outboundId: string;
  currentStatus: OutboundStatus;
  onChanged: () => void;
}

// 비유: 출고 취소는 3단계 안전장치. active→cancel_pending→cancelled. 복원도 가능.
export default function OutboundCancelFlow({ outboundId, currentStatus, onChanged }: Props) {
  const [action, setAction] = useState<'cancel_pending' | 'cancelled' | 'restore' | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!action) return;
    setLoading(true);
    try {
      const newStatus = action === 'restore' ? 'active' : action;
      await fetchWithAuth(`/api/v1/outbounds/${outboundId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      onChanged();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : '상태 변경에 실패했습니다');
    }
    setLoading(false);
    setAction(null);
  };

  if (currentStatus === 'cancelled') return null;

  return (
    <>
      {currentStatus === 'active' && (
        <Button variant="outline" size="sm" className="text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => setAction('cancel_pending')}>
          취소예정
        </Button>
      )}

      {currentStatus === 'cancel_pending' && (
        <>
          <Button variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setAction('cancelled')}>
            취소 확정
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAction('restore')}>
            복원
          </Button>
        </>
      )}

      <ConfirmDialog
        open={action === 'cancel_pending'}
        onOpenChange={(o) => !o && setAction(null)}
        title="취소 예정"
        description="출고를 취소 예정으로 변경하시겠습니까? 가용재고에 아직 반영되지 않습니다."
        onConfirm={handleConfirm}
        loading={loading}
      />
      <ConfirmDialog
        open={action === 'cancelled'}
        onOpenChange={(o) => !o && setAction(null)}
        title="취소 확정"
        description="출고를 최종 취소하시겠습니까? 재고가 복원됩니다. 되돌릴 수 없습니다."
        onConfirm={handleConfirm}
        loading={loading}
      />
      <ConfirmDialog
        open={action === 'restore'}
        onOpenChange={(o) => !o && setAction(null)}
        title="복원"
        description="출고를 정상 상태로 복원하시겠습니까?"
        onConfirm={handleConfirm}
        loading={loading}
      />
    </>
  );
}
