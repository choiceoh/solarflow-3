import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { useBLList } from '@/hooks/useInbound';
import { fetchWithAuth } from '@/lib/api';
import type { Manufacturer } from '@/types/masters';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import BLListTable from '@/components/inbound/BLListTable';
import BLDetailView from '@/components/inbound/BLDetailView';
import BLForm from '@/components/inbound/BLForm';
import { INBOUND_TYPE_LABEL, BL_STATUS_LABEL, type InboundType, type BLStatus } from '@/types/inbound';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

/* 필터 드롭다운 표시용 헬퍼 — UUID/영문 대신 한글 표시 */
function FilterText({ text }: { text: string }) {
  return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
}

export default function InboundPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedBL, setSelectedBL] = useState<string | null>(null);
  const [presetPOId, setPresetPOId] = useState<string | null>(null);
  const location = useLocation();
  // 사이드바 "B/L 입고 관리" 클릭 시 상세에서 목록으로 복귀
  useEffect(() => { setSelectedBL(null); }, [location.key]);
  // D-085: ?po=xxx 쿼리 감지 → 입고 등록 폼 자동 열기
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const po = params.get('po');
    if (po) {
      setPresetPOId(po);
      setFormOpen(true);
    }
  }, [location.search]);
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then(setManufacturers).catch(() => {});
  }, []);

  const mfgNameMap = useMemo(
    () => Object.fromEntries(manufacturers.map(m => [m.manufacturer_id, m.name_kr])),
    [manufacturers]
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { lines, bl_id: existingId, ...blData } = formData as any;
    let blId: string;
    try {
      if (existingId) {
        // 수정 모드: PUT
        await fetchWithAuth(`/api/v1/bls/${existingId}`, {
          method: 'PUT', body: JSON.stringify(blData),
        });
        blId = existingId;
      } else {
        // 신규 등록: POST
        const created = await fetchWithAuth<{ bl_id: string }>('/api/v1/bls', {
          method: 'POST', body: JSON.stringify(blData),
        });
        blId = created.bl_id;
      }
      // 라인아이템 개별 생성 — 부분 실패 시 명확히 알려줌
      if (!existingId && Array.isArray(lines) && lines.length > 0) {
        const failures: string[] = [];
        for (const line of lines) {
          try {
            await fetchWithAuth(`/api/v1/bls/${blId}/lines`, {
              method: 'POST', body: JSON.stringify({ ...line, bl_id: blId }),
            });
          } catch (err) {
            failures.push(err instanceof Error ? err.message : '알 수 없는 오류');
          }
        }
        if (failures.length > 0) {
          throw new Error(`품목 ${failures.length}건 등록 실패: ${failures.join('; ')}`);
        }
      }
      setToast(existingId ? '입고 수정이 완료되었습니다' : '입고등록이 완료되었습니다');
    } finally {
      // 성공/실패 무관하게 목록 새로고침 — 부분 성공도 화면에 반영
      reload();
    }
  };

  const handleDelete = async (blId: string) => {
    await fetchWithAuth(`/api/v1/bls/${blId}`, { method: 'DELETE' });
    reload();
  };

  const typeFilterLabel = typeFilter ? (INBOUND_TYPE_LABEL[typeFilter as InboundType] ?? typeFilter) : '입고 구분';
  const statusFilterLabel = statusFilter ? (BL_STATUS_LABEL[statusFilter as BLStatus] ?? statusFilter) : '입고 현황';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">B/L 입고 관리</h1>
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
            <FilterText text={typeFilterLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">입고 구분</SelectItem>
            {(Object.entries(INBOUND_TYPE_LABEL) as [InboundType, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <FilterText text={statusFilterLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">입고 현황</SelectItem>
            {(Object.entries(BL_STATUS_LABEL) as [BLStatus, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingSpinner /> : (
        <BLListTable
          items={data.map(bl => ({ ...bl, manufacturer_name: bl.manufacturer_name ?? mfgNameMap[bl.manufacturer_id] ?? '—' }))}
          onSelect={(bl) => setSelectedBL(bl.bl_id)}
          onNew={() => setFormOpen(true)}
          onDelete={handleDelete}
        />
      )}

      <BLForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setPresetPOId(null); }}
        onSubmit={handleCreate}
        presetPOId={presetPOId}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-md bg-green-600 text-white px-4 py-3 text-sm shadow-lg">
          <CheckCircle2 className="h-4 w-4" />
          {toast}
        </div>
      )}
    </div>
  );
}
