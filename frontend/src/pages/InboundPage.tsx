// Phase 4 — Inbound Step 1: 메타 ListScreen 으로 전환
// 기존 InboundPage 의 list/filter/metric/rail 은 config/screens/inbound.ts 로 이전.
// 이 페이지는: OCR 드롭존 + BLForm 다이얼로그 + Toast 등 페이지 고유 직무만 담당.
// 행 클릭 → ListScreen 내장 detailComponent (BLDetailView wrapper) 가 처리.

import { useState, useEffect, useCallback, type DragEvent as ReactDragEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, ScanText } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import BLForm from '@/components/inbound/BLForm';
import { saveBLShipmentWithLines } from '@/lib/blShipment';
import ListScreen from '@/templates/ListScreen';
import { useActionHandler } from '@/templates/registry';
import inboundConfig from '@/config/screens/inbound';
import type { BLShipment } from '@/types/inbound';

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
  const location = useLocation();

  // BLForm 다이얼로그 — ListScreen 의 actionHandler 가 이벤트 발행하면 열림
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BLShipment | null>(null);
  const [presetPOId, setPresetPOId] = useState<string | null>(null);
  const [presetLCId, setPresetLCId] = useState<string | null>(null);
  const [customsOCRDropFile, setCustomsOCRDropFile] = useState<File | null>(null);
  const [customsOCRDropFileKey, setCustomsOCRDropFileKey] = useState(0);
  const [customsOCRDropActive, setCustomsOCRDropActive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ListScreen actionHandler 직접 콜백 등록 — CustomEvent 우회 패턴 제거
  useActionHandler('inbound_open_create', () => {
    setEditTarget(null);
    setPresetPOId(null);
    setPresetLCId(null);
    setCustomsOCRDropFile(null);
    setFormOpen(true);
  });
  useActionHandler('inbound_open_edit', (row) => {
    setEditTarget(row as BLShipment);
    setFormOpen(true);
  });

  // D-085: ?po=xxx?lc=xxx 쿼리 → 입고 등록 자동 열기 + 프리셋
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const po = params.get('po');
    const lc = params.get('lc');
    if (po) setPresetPOId(po);
    if (lc) setPresetLCId(lc);
    if (po || lc) setFormOpen(true);
  }, [location.search]);

  // Toast 자동 닫기
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const hasDraggedFiles = useCallback((dt: DataTransfer | null) =>
    Boolean(dt && Array.from(dt.types).includes('Files')), []);

  const openCustomsOCRDropFile = useCallback((file: File | null) => {
    if (!file) {
      setToast('PDF 또는 사진 파일만 등록할 수 있습니다');
      return;
    }
    setEditTarget(null);
    setPresetPOId(null);
    setPresetLCId(null);
    setCustomsOCRDropFile(file);
    setCustomsOCRDropFileKey((v) => v + 1);
    setFormOpen(true);
  }, []);

  // 페이지 전체 드롭존 — 폼 안 열렸을 때만
  useEffect(() => {
    if (!selectedCompanyId || formOpen) {
      setCustomsOCRDropActive(false);
      return;
    }
    const onDrag = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setCustomsOCRDropActive(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (event.clientX <= 0 || event.clientY <= 0
        || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
        setCustomsOCRDropActive(false);
      }
    };
    const onDrop = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault(); event.stopPropagation();
      setCustomsOCRDropActive(false);
      openCustomsOCRDropFile(firstCustomsOCRFile(event.dataTransfer?.files ?? null));
    };
    window.addEventListener('dragenter', onDrag);
    window.addEventListener('dragover', onDrag);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDrag);
      window.removeEventListener('dragover', onDrag);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [formOpen, hasDraggedFiles, openCustomsOCRDropFile, selectedCompanyId]);

  const handleSave = async (formData: Record<string, unknown>) => {
    const isEdit = !!editTarget;
    try {
      await saveBLShipmentWithLines(formData);
      setToast(isEdit ? '입고 수정이 완료되었습니다' : '입고등록이 완료되었습니다');
      // ListScreen 내부 reload 트리거 — sf-bl-saved 이벤트
      window.dispatchEvent(new CustomEvent('sf-bl-list-reload'));
    } catch (err) {
      // saveBLShipmentWithLines 가 부분 실패도 처리 — 그래도 reload
      window.dispatchEvent(new CustomEvent('sf-bl-list-reload'));
      throw err;
    }
  };

  // ListScreen 의 reload 는 ListScreen 내부에서 처리 (action confirm_call 후 자동)
  // BLForm 저장 후 명시적 reload 가 필요한데 ListScreen 외부에서 트리거 어려움 →
  // 임시: 페이지 새로고침 대신 location.key 트릭. 추후 ListScreen.reloadFromOutside API 검토.
  // 현재는 BLForm onSubmit 후 ListScreen 의 dataHook 이 React Query 라 자동 invalidate 안 됨.
  // 향후 addressed: useBLListWithAgg 가 React Query key 무효화에 응하도록 + window 이벤트 listener 추가.

  const handleCustomsOCRPageDrag = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setCustomsOCRDropActive(true);
  };
  const handleCustomsOCRPageDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault(); event.stopPropagation();
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setCustomsOCRDropActive(false);
  };
  const handleCustomsOCRPageDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault(); event.stopPropagation();
    setCustomsOCRDropActive(false);
    openCustomsOCRDropFile(firstCustomsOCRFile(event.dataTransfer.files));
  };

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  return (
    <div
      className="sf-dropzone-page min-h-[calc(100vh-5rem)] transition-shadow"
      data-active={customsOCRDropActive}
      onDragEnter={handleCustomsOCRPageDrag}
      onDragOver={handleCustomsOCRPageDrag}
      onDragLeave={handleCustomsOCRPageDragLeave}
      onDrop={handleCustomsOCRPageDrop}
    >
      <ListScreen config={inboundConfig} />

      <BLForm
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) {
            setEditTarget(null);
            setPresetPOId(null);
            setPresetLCId(null);
            setCustomsOCRDropFile(null);
          }
        }}
        onSubmit={handleSave}
        editData={editTarget}
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
