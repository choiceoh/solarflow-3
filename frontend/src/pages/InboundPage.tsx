import { useState, useEffect, useMemo, useCallback, type DragEvent as ReactDragEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, CheckCircle2, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/appStore';
import { useBLList } from '@/hooks/useInbound';
import { fetchWithAuth } from '@/lib/api';
import type { Manufacturer } from '@/types/masters';
import SkeletonRows from '@/components/common/SkeletonRows';
import BLListTable from '@/components/inbound/BLListTable';
import BLDetailView from '@/components/inbound/BLDetailView';
import BLForm from '@/components/inbound/BLForm';
import { MasterConsole } from '@/components/command/MasterConsole';
import { FilterButton, RailBlock, Sparkline } from '@/components/command/MockupPrimitives';
import { INBOUND_TYPE_LABEL, BL_STATUS_LABEL, type InboundType, type BLStatus } from '@/types/inbound';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import { saveBLShipmentWithLines } from '@/lib/blShipment';

function isCustomsOCRAcceptedFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type === 'application/pdf'
    || file.type.startsWith('image/')
    || /\.(pdf|png|jpe?g|webp|heic|heif|bmp|tiff?)$/i.test(name);
}

function firstCustomsOCRFile(files: FileList | null) {
  return files ? Array.from(files).find(isCustomsOCRAcceptedFile) ?? null : null;
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
  // D-085: ?po=xxx 쿼리 감지 → 입고 등록 폼 자동 열기 / ?lc=xxx&po=xxx → LC 프리셋
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const po = params.get('po');
    const lc = params.get('lc');
    if (po) setPresetPOId(po);
    if (lc) setPresetLCId(lc);
    if (po || lc) setFormOpen(true);
  }, [location.search]);
  const [presetLCId, setPresetLCId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [customsOCRDropActive, setCustomsOCRDropActive] = useState(false);
  const [customsOCRDropFile, setCustomsOCRDropFile] = useState<File | null>(null);
  const [customsOCRDropFileKey, setCustomsOCRDropFileKey] = useState(0);

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then(setManufacturers).catch(() => {});
  }, []);

  const mfgNameMap = useMemo(
    () => Object.fromEntries(manufacturers.map(m => [m.manufacturer_id, m.short_name?.trim() || m.name_kr])),
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

  const hasDraggedFiles = useCallback((dataTransfer: DataTransfer | null) => {
    return Boolean(dataTransfer && Array.from(dataTransfer.types).includes('Files'));
  }, []);

  const openCustomsOCRDropFile = useCallback((file: File | null) => {
    if (!file) {
      setToast('PDF 또는 사진 파일만 등록할 수 있습니다');
      return;
    }

    setSelectedBL(null);
    setPresetPOId(null);
    setPresetLCId(null);
    setCustomsOCRDropFile(file);
    setCustomsOCRDropFileKey((value) => value + 1);
    setFormOpen(true);
  }, []);

  useEffect(() => {
    if (!selectedCompanyId || selectedBL || formOpen) {
      setCustomsOCRDropActive(false);
      return;
    }

    const handleWindowDrag = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setCustomsOCRDropActive(true);
    };
    const handleWindowDragLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight
      ) {
        setCustomsOCRDropActive(false);
      }
    };
    const handleWindowDrop = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      setCustomsOCRDropActive(false);
      openCustomsOCRDropFile(firstCustomsOCRFile(event.dataTransfer?.files ?? null));
    };

    window.addEventListener('dragenter', handleWindowDrag);
    window.addEventListener('dragover', handleWindowDrag);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragenter', handleWindowDrag);
      window.removeEventListener('dragover', handleWindowDrag);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [formOpen, hasDraggedFiles, openCustomsOCRDropFile, selectedBL, selectedCompanyId]);

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
    const existingId = typeof formData.bl_id === 'string' ? formData.bl_id : '';
    try {
      await saveBLShipmentWithLines(formData);
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
  const importCount = data.filter((bl) => bl.inbound_type === 'import').length;
  const completedCount = data.filter((bl) => bl.status === 'completed').length;
  const pendingCount = data.length - completedCount;
  const recentRows = data.slice(0, 4);

  const handleCustomsOCRPageDrag = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setCustomsOCRDropActive(true);
  };

  const handleCustomsOCRPageDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setCustomsOCRDropActive(false);
  };

  const handleCustomsOCRPageDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setCustomsOCRDropActive(false);

    openCustomsOCRDropFile(firstCustomsOCRFile(event.dataTransfer.files));
  };

  return (
    <div
      className="sf-dropzone-page min-h-[calc(100vh-5rem)] transition-shadow"
      data-active={customsOCRDropActive}
      onDragEnter={handleCustomsOCRPageDrag}
      onDragOver={handleCustomsOCRPageDrag}
      onDragLeave={handleCustomsOCRPageDragLeave}
      onDrop={handleCustomsOCRPageDrop}
    >
      <MasterConsole
        eyebrow="INBOUND OPS"
        title="B/L 입고 관리"
        description="B/L, 면장 OCR, 입고 상태를 하나의 수입 물류 콘솔에서 관리합니다."
        tableTitle="B/L 목록"
        tableSub={`${data.length.toLocaleString()}건 · ${typeFilterLabel} · ${statusFilterLabel}`}
        toolbar={
          <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
            <FilterButton items={[
              {
                label: '입고 구분',
                value: typeFilter,
                onChange: setTypeFilter,
                options: (Object.entries(INBOUND_TYPE_LABEL) as [InboundType, string][]).map(([k, v]) => ({ value: k, label: v })),
              },
              {
                label: '입고 현황',
                value: statusFilter,
                onChange: setStatusFilter,
                options: (Object.entries(BL_STATUS_LABEL) as [BLStatus, string][]).map(([k, v]) => ({ value: k, label: v })),
              },
            ]} />
            <ExcelToolbar type="inbound" />
            <Button size="xs" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 h-3 w-3" />새로 등록
            </Button>
          </div>
        }
        metrics={[
          { label: 'B/L 건수', value: data.length.toLocaleString(), sub: statusFilterLabel, tone: 'solar', spark: [12, 14, 13, 18, data.length || 1] },
          { label: '해외직수입', value: importCount.toLocaleString(), sub: typeFilterLabel, tone: 'info' },
          { label: '입고 완료', value: completedCount.toLocaleString(), sub: '정산 가능', tone: 'pos' },
          { label: '진행중', value: pendingCount.toLocaleString(), sub: '입항/통관/창고', tone: pendingCount > 0 ? 'warn' : 'ink' },
        ]}
        rail={
          <>
            <RailBlock title="OCR 드롭존" accent="var(--solar-3)" count="PDF · JPG">
              <div className="space-y-2 text-[11px] leading-5 text-[var(--ink-3)]">
                <p>면장 파일을 화면에 놓으면 해외직수입 등록창과 OCR 확인창이 이어집니다.</p>
                <Sparkline data={[10, 18, 14, 26, 22, 34]} color="var(--solar-3)" area />
              </div>
            </RailBlock>
            <RailBlock title="최근 B/L" count={recentRows.length}>
              <div className="space-y-2">
                {recentRows.map((bl) => (
                  <div key={bl.bl_id} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
                    <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{bl.bl_number}</div>
                    <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">{BL_STATUS_LABEL[bl.status] ?? bl.status} · {bl.manufacturer_name ?? mfgNameMap[bl.manufacturer_id] ?? '제조사 미지정'}</div>
                  </div>
                ))}
              </div>
            </RailBlock>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className="sf-dropzone rounded-md border-2 border-dashed p-4 transition-colors"
            data-active={customsOCRDropActive}
            onDragEnter={handleCustomsOCRPageDrag}
            onDragOver={handleCustomsOCRPageDrag}
            onDragLeave={handleCustomsOCRPageDragLeave}
            onDrop={handleCustomsOCRPageDrop}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="sf-dropzone-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-background">
                <ScanText className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold" style={{ color: 'var(--sf-ink)' }}>면장 PDF/사진 드롭</div>
                <div className="mt-1 text-sm sf-dropzone-sub">
                  {customsOCRDropActive ? '지금 놓으면 해외직수입 입고등록으로 이동합니다' : '놓으면 입고등록 창과 OCR 입력값 확인창이 자동으로 열립니다'}
                </div>
              </div>
              <span className="sf-pill ghost">PDF · JPG · PNG</span>
            </div>
          </div>

          {loading ? <SkeletonRows rows={6} /> : (
            <BLListTable
              items={data.map(bl => ({ ...bl, manufacturer_name: bl.manufacturer_name ?? mfgNameMap[bl.manufacturer_id] ?? '—' }))}
              onSelect={(bl) => setSelectedBL(bl.bl_id)}
              onNew={() => setFormOpen(true)}
              onDelete={handleDelete}
            />
          )}
        </div>
      </MasterConsole>

      <BLForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) { setPresetPOId(null); setPresetLCId(null); setCustomsOCRDropFile(null); } }}
        onSubmit={handleCreate}
        presetPOId={presetPOId}
        presetLCId={presetLCId}
        initialCustomsOCRFile={customsOCRDropFile}
        initialCustomsOCRFileKey={customsOCRDropFileKey}
      />

      {customsOCRDropActive && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="mx-6 flex max-w-md flex-col items-center gap-3 rounded-md border border-primary bg-background p-6 text-center shadow-lg">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ScanText className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-medium">입고등록으로 바로 불러오기</div>
              <div className="mt-1 text-xs text-muted-foreground">PDF/사진을 놓으면 해외직수입 등록창으로 이동합니다</div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="sf-toast fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-md px-4 py-2.5 text-xs font-medium"
          style={{
            background: 'var(--sf-ink)',
            color: 'var(--sf-bg)',
            boxShadow: 'var(--sf-shadow-3)',
            borderLeft: '3px solid var(--sf-pos)',
          }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--sf-pos)' }} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
