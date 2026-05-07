import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { fetchWithAuth } from '@/lib/api';
import { STATUS_BY_TYPE, statusLabel, type BLStatus, type InboundType } from '@/types/inbound';

interface Props {
  blId: string;
  currentStatus: BLStatus;
  inboundType: InboundType;
  onChanged: () => void;
}

export default function StatusChanger({ blId, currentStatus, inboundType, onChanged }: Props) {
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

  // D-083: 입고유형에 따라 상태 드롭다운 항목 필터링. 현재 상태가 기본 표시.
  const allowed = STATUS_BY_TYPE[inboundType] ?? STATUS_BY_TYPE.import;
  const currentIndex = allowed.indexOf(currentStatus);
  const nextStatus = currentIndex >= 0 ? allowed[currentIndex + 1] : null;

  return (
    <>
      <Select
        value={currentStatus}
        disabled={!nextStatus}
        onValueChange={(v) => { if (v && v !== currentStatus) setTarget(v as BLStatus); }}
      >
        <SelectTrigger className="h-7 w-28 text-xs">
          <span className="flex flex-1 text-left truncate" data-slot="select-value">{statusLabel(inboundType, currentStatus)}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={currentStatus} disabled>{statusLabel(inboundType, currentStatus)}</SelectItem>
          {nextStatus ? (
            <SelectItem value={nextStatus}>{statusLabel(inboundType, nextStatus)}</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      <ConfirmDialog
        open={!!target}
        onOpenChange={() => setTarget(null)}
        title="상태 변경"
        description={`상태를 '${target ? statusLabel(inboundType, target) : ''}'(으)로 변경하시겠습니까?`}
        onConfirm={handleConfirm}
        loading={loading}
      />
    </>
  );
}
