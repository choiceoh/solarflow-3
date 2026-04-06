import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
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

  // 현재 상태 이외의 모든 상태를 선택 가능하게
  const otherStatuses = BL_STATUS_ORDER.filter(s => s !== currentStatus);

  return (
    <>
      <Select value="" onValueChange={(v) => { if (v) setTarget(v as BLStatus); }}>
        <SelectTrigger className="h-7 w-28 text-xs">
          <span className="flex flex-1 text-left truncate text-muted-foreground" data-slot="select-value">상태 변경</span>
        </SelectTrigger>
        <SelectContent>
          {otherStatuses.map(s => (
            <SelectItem key={s} value={s}>{BL_STATUS_LABEL[s]}</SelectItem>
          ))}
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
