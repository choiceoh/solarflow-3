import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { useBLList } from '@/hooks/useInbound';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import BLListTable from '@/components/inbound/BLListTable';
import BLDetailView from '@/components/inbound/BLDetailView';
import BLForm from '@/components/inbound/BLForm';
import { INBOUND_TYPE_LABEL, BL_STATUS_LABEL, type InboundType, type BLStatus } from '@/types/inbound';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

export default function InboundPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedBL, setSelectedBL] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const filters: { inbound_type?: string; status?: string } = {};
  if (typeFilter) filters.inbound_type = typeFilter;
  if (statusFilter) filters.status = statusFilter;

  const { data, loading, reload } = useBLList(filters);

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  if (selectedBL) {
    return (
      <div className="p-6">
        <BLDetailView blId={selectedBL} onBack={() => { setSelectedBL(null); reload(); }} />
      </div>
    );
  }

  const handleCreate = async (formData: Record<string, unknown>) => {
    try {
      await fetchWithAuth('/api/v1/bls', { method: 'POST', body: JSON.stringify(formData) });
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '입고 등록에 실패했습니다');
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">입고 관리</h1>
        <div className="flex items-center gap-2">
          <ExcelToolbar type="inbound" />
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />새로 등록
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="입고유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            {(Object.entries(INBOUND_TYPE_LABEL) as [InboundType, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {(Object.entries(BL_STATUS_LABEL) as [BLStatus, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingSpinner /> : (
        <BLListTable items={data} onSelect={(bl) => setSelectedBL(bl.bl_id)} onNew={() => setFormOpen(true)} />
      )}

      <BLForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} />
    </div>
  );
}
