import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { fetchWithAuth } from '@/lib/api';
import { BL_STATUS_ORDER, BL_STATUS_LABEL, type BLStatus } from '@/types/inbound';

interface Props {
  blId: string;
  currentStatus: BLStatus;
  onChanged: () => void;
}

export default function StatusChanger({ blId, currentStatus, onChanged }: Props) {
  const [target, setTarget] = useState<BLStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const currentIdx = BL_STATUS_ORDER.indexOf(currentStatus);
  const nextStatus = currentIdx < BL_STATUS_ORDER.length - 1 ? BL_STATUS_ORDER[currentIdx + 1] : null;

  if (!nextStatus) return null;

  const handleConfirm = async () => {
    if (!target) return;
    setLoading(true);
    try {
      await fetchWithAuth(`/api/v1/bls/${blId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: target }),
      });
      onChanged();
    } catch { /* empty */ }
    setLoading(false);
    setTarget(null);
  };

  return (
    <>
      <Select value="" onValueChange={(v) => setTarget(v as BLStatus)}>
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue placeholder="상태 변경" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={nextStatus}>{BL_STATUS_LABEL[nextStatus]}</SelectItem>
        </SelectContent>
      </Select>
      <ConfirmDialog
        open={!!target}
        onOpenChange={() => setTarget(null)}
        title="상태 변경"
        description={`상태를 '${target ? BL_STATUS_LABEL[target] : ''}'(으)로 변경하시겠습니까?`}
        onConfirm={handleConfirm}
        loading={loading}
      />
    </>
  );
}
