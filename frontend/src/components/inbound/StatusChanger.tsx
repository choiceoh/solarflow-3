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

  // D-083: 입고유형에 따라 상태 드롭다운 항목 필터링
  const allowed = STATUS_BY_TYPE[inboundType] ?? STATUS_BY_TYPE.import;
  const otherStatuses = allowed.filter(s => s !== currentStatus);

  return (
    <>
      <Select value="" onValueChange={(v) => { if (v) setTarget(v as BLStatus); }}>
        <SelectTrigger className="h-7 w-28 text-xs">
          <span className="flex flex-1 text-left truncate text-muted-foreground" data-slot="select-value">상태 변경</span>
        </SelectTrigger>
        <SelectContent>
          {otherStatuses.map(s => (
            <SelectItem key={s} value={s}>{statusLabel(inboundType, s)}</SelectItem>
          ))}
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
