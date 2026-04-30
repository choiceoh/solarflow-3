import { useState, useEffect, useRef, useCallback, type DragEvent as ReactDragEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, FileText, Banknote, Landmark, Ship, History, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

import { useAppStore } from '@/stores/appStore';
import { usePOList, useLCList, useTTList, usePriceHistoryList } from '@/hooks/useProcurement';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import POListTable from '@/components/procurement/POListTable';
import PODetailView from '@/components/procurement/PODetailView';
import POForm from '@/components/procurement/POForm';
import LCListTable from '@/components/procurement/LCListTable';
import LCForm from '@/components/procurement/LCForm';
import TTListTable from '@/components/procurement/TTListTable';
import TTForm from '@/components/procurement/TTForm';
import DepositStatusPanel from '@/components/procurement/DepositStatusPanel';
import PriceHistoryTable from '@/components/procurement/PriceHistoryTable';
import PriceHistoryForm from '@/components/procurement/PriceHistoryForm';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import { PO_STATUS_LABEL, CONTRACT_TYPE_LABEL, CONTRACT_TYPES_ACTIVE, LC_STATUS_LABEL, TT_STATUS_LABEL } from '@/types/procurement';
import type { PurchaseOrder, POLineItem, LCRecord, TTRemittance, PriceHistory, POStatus, ContractType, LCStatus, TTStatus } from '@/types/procurement';
import type { Manufacturer, Bank } from '@/types/masters';
import { useBLList } from '@/hooks/useInbound';
import BLListTable from '@/components/inbound/BLListTable';
import BLDetailView from '@/components/inbound/BLDetailView';
import BLForm from '@/components/inbound/BLForm';
import { saveBLShipmentWithLines } from '@/lib/blShipment';
import { INBOUND_TYPE_LABEL, BL_STATUS_LABEL, type InboundType, type BLStatus } from '@/types/inbound';

function FT({ text }: { text: string }) {
  return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
}

const PROCUREMENT_TABS = new Set(['po', 'tt', 'lc', 'bl', 'price']);

function isCustomsOCRAcceptedFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type === 'application/pdf'
    || file.type.startsWith('image/')
    || /\.(pdf|png|jpe?g|webp|heic|heif|bmp|tiff?)$/i.test(name);
}

function firstCustomsOCRFile(files: FileList | null) {
  return files ? Array.from(files).find(isCustomsOCRAcceptedFile) ?? null : null;
}

export default function ProcurementPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = new URLSearchParams(location.search).get('tab') ?? 'po';
  const [activeTab, setActiveTab] = useState(PROCUREMENT_TABS.has(initialTab) ? initialTab : 'po');
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  // 계약금 탭용 전체 PO 목록 (필터 없음) — usePOList hook으로 관리하여 취소 처리 시 reloadPoList()로 동기화
  const { data: poList, reload: reloadPoList } = usePOList({});

  const [poStatusFilter, setPoStatusFilter] = useState('');
  const [poMfgFilter, setPoMfgFilter] = useState('');
  const [poTypeFilter, setPoTypeFilter] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  // R1-1: 사이드바 "발주/결제" 클릭 시 슬라이드 패널 닫기
  useEffect(() => { setSelectedPO(null); }, [location.key]);
  useEffect(() => {
    const nextTab = new URLSearchParams(location.search).get('tab') ?? 'po';
    if (PROCUREMENT_TABS.has(nextTab)) setActiveTab(nextTab);
  }, [location.search]);
  const [poFormOpen, setPoFormOpen] = useState(false);
  const poFilters: Record<string, string> = {};
  if (poStatusFilter) poFilters.status = poStatusFilter;
  if (poMfgFilter) poFilters.manufacturer_id = poMfgFilter;
  if (poTypeFilter) poFilters.contract_type = poTypeFilter;
  const { data: pos, loading: poLoading, reload: reloadPO } = usePOList(poFilters);

  const [lcAggVersion, setLcAggVersion] = useState(0);
  const [lcStatusFilter, setLcStatusFilter] = useState('');
  const [lcBankFilter, setLcBankFilter] = useState('');
  const [lcMfgFilter, setLcMfgFilter] = useState('');
  const [lcFormOpen, setLcFormOpen] = useState(false);
  const [editLC, setEditLC] = useState<LCRecord | null>(null);
  const [newLcDefaultPoId, setNewLcDefaultPoId] = useState<string | undefined>(undefined);
  const lcFilters: Record<string, string> = {};
  if (lcStatusFilter) lcFilters.status = lcStatusFilter;
  if (lcBankFilter) lcFilters.bank_id = lcBankFilter;
  const { data: lcs, loading: lcLoading, reload: reloadLC } = useLCList(lcFilters);

  const [ttStatusFilter, setTtStatusFilter] = useState('');
  const [ttPoFilter, setTtPoFilter] = useState('');
  const [ttFormOpen, setTtFormOpen] = useState(false);
  const [editTT, setEditTT] = useState<TTRemittance | null>(null);
  const ttFilters: Record<string, string> = {};
  if (ttStatusFilter) ttFilters.status = ttStatusFilter;
  if (ttPoFilter) ttFilters.po_id = ttPoFilter;
  const { data: tts, loading: ttLoading, reload: reloadTT } = useTTList(ttFilters);

  // BL 탭
  const [blTypeFilter, setBlTypeFilter] = useState('');
  const [blStatusFilter, setBlStatusFilter] = useState('');
  const [blMfgFilter, setBlMfgFilter] = useState('');
  const [selectedBL, setSelectedBL] = useState<string | null>(null);
  const [blFormOpen, setBlFormOpen] = useState(false);
  const [blFormPresetPOId, setBlFormPresetPOId] = useState<string | null>(null);
  const [blFormPresetLCId, setBlFormPresetLCId] = useState<string | null>(null);
  const [blOCRDropActive, setBlOCRDropActive] = useState(false);
  const [blOCRDropError, setBlOCRDropError] = useState('');
  const [blOCRDropFile, setBlOCRDropFile] = useState<File | null>(null);
  const [blOCRDropFileKey, setBlOCRDropFileKey] = useState(0);
  const [blsVersion, setBlsVersion] = useState(0);
  const blFilters: { inbound_type?: string; status?: string; manufacturer_id?: string } = {};
  if (blTypeFilter) blFilters.inbound_type = blTypeFilter;
  if (blStatusFilter) blFilters.status = blStatusFilter;
  if (blMfgFilter) blFilters.manufacturer_id = blMfgFilter;
  const { data: bls, loading: blLoading, reload: reloadBL } = useBLList(blFilters);

  const [depositMfgFilter, setDepositMfgFilter] = useState('');

  const [phMfgFilter, setPhMfgFilter] = useState('');
  const [phFormOpen, setPhFormOpen] = useState(false);
  const [editPH, setEditPH] = useState<PriceHistory | null>(null);
  const { data: phs, loading: phLoading, reload: reloadPH } = usePriceHistoryList(phMfgFilter ? { manufacturer_id: phMfgFilter } : {});
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ created: number; skipped: number; failed: number } | null>(null);
  const [autoCompletedMsg, setAutoCompletedMsg] = useState<string | null>(null);

  // 우측 슬라이드 패널 — 드래그 리사이즈
  const [panelWidth, setPanelWidth] = useState(900);
  const panelRef = useRef<HTMLDivElement>(null);

  function onDragHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.max(520, Math.min(window.innerWidth - 60, startW + delta)));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ESC 키로 패널 닫기
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedPO) { setSelectedPO(null); reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPO]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${selectedCompanyId}`)
        .then((list) => setBanks(list.filter((b) => b.is_active))).catch(() => {});
    }
  }, [selectedCompanyId]);

  const hasDraggedFiles = useCallback((dataTransfer: DataTransfer | null) => {
    return Boolean(dataTransfer && Array.from(dataTransfer.types).includes('Files'));
  }, []);

  const openBLDropFile = useCallback((file: File | null) => {
    if (!file) {
      setBlOCRDropError('PDF 또는 사진 파일만 등록할 수 있습니다');
      return;
    }

    setBlOCRDropError('');
    setSelectedBL(null);
    setBlFormPresetPOId(null);
    setBlFormPresetLCId(null);
    setBlOCRDropFile(file);
    setBlOCRDropFileKey((value) => value + 1);
    setActiveTab('bl');
    setBlFormOpen(true);
  }, []);

  useEffect(() => {
    if (!selectedCompanyId || activeTab !== 'bl' || selectedBL || blFormOpen) {
      setBlOCRDropActive(false);
      return;
    }

    const handleWindowDrag = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setBlOCRDropActive(true);
    };
    const handleWindowDragLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight
      ) {
        setBlOCRDropActive(false);
      }
    };
    const handleWindowDrop = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      setBlOCRDropActive(false);
      openBLDropFile(firstCustomsOCRFile(event.dataTransfer?.files ?? null));
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
  }, [activeTab, blFormOpen, hasDraggedFiles, openBLDropFile, selectedBL, selectedCompanyId]);

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p></div>;
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate(tab === 'po' ? '/procurement' : `/procurement?tab=${tab}`, { replace: true });
  };

  const handleCreatePO = async (d: Record<string, unknown>) => {
    // 발주품목(po_lines)을 PO 본체와 분리하여 등록 (입고관리와 동일 패턴)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { lines, ...poData } = d as any;
    const parentPoId: string | undefined = poData.parent_po_id;
    try {
      const created = await fetchWithAuth<{ po_id: string }>('/api/v1/pos', { method: 'POST', body: JSON.stringify(poData) });
      if (Array.isArray(lines) && lines.length > 0 && created?.po_id) {
        const failures: string[] = [];
        for (const line of lines) {
          // 신규 생성 경로에서는 po_line_id는 무시
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { po_line_id: _plid, _price_per_wp_usd: _pp, _spec_wp: _sw, ...body } = line;
          try {
            await fetchWithAuth(`/api/v1/pos/${created.po_id}/lines`, {
              method: 'POST', body: JSON.stringify({ ...body, po_id: created.po_id }),
            });
          } catch (err) {
            failures.push(err instanceof Error ? err.message : '알 수 없는 오류');
          }
        }
        if (failures.length > 0) {
          throw new Error(`발주품목 ${failures.length}건 등록 실패: ${failures.join('; ')}`);
        }

        // ── 단가이력 자동 등록 (PO 신규 등록 시) ──
        const changeDate = (poData.contract_date as string | undefined) ?? new Date().toISOString().slice(0, 10);
        const incotermsStr = (poData.incoterms as string | undefined) ?? '';
        const paymentStr = (poData.payment_terms as string | undefined) ?? '';
        for (const line of lines) {
          const pricePerWpUsd: number | undefined = line._price_per_wp_usd;
          if (!pricePerWpUsd || pricePerWpUsd <= 0) continue;
          const specWp: number | undefined = line._spec_wp;
          const mw = specWp && line.quantity ? (line.quantity * specWp) / 1_000_000 : undefined;
          const memoParts = [
            incotermsStr && `선적조건: ${incotermsStr}`,
            paymentStr && `결제조건: ${paymentStr}`,
            mw != null && mw > 0 && `발주용량: ${mw.toFixed(3)}MW`,
          ].filter(Boolean);
          const phPayload = {
            product_id: line.product_id,
            manufacturer_id: poData.manufacturer_id,
            company_id: poData.company_id,
            change_date: changeDate,
            new_price: Number(pricePerWpUsd.toFixed(6)), // USD/Wp
            reason: '최초계약',
            related_po_id: created.po_id,
            memo: memoParts.length > 0 ? memoParts.join(' | ') : undefined,
          };
          // 실패해도 PO 등록은 성공 처리 (단가이력은 부가정보)
          await fetchWithAuth('/api/v1/price-histories', {
            method: 'POST', body: JSON.stringify(phPayload),
          }).catch(() => {});
        }
        reloadPH();
      }

      // ── 변경계약 등록 시 원계약 자동 완료 처리 ──
      // 원계약 PO를 completed 로 전환 → 이후 LC/BL 드롭다운에서 자동 제외
      if (created?.po_id && parentPoId) {
        const parentPo = pos.find((p) => p.po_id === parentPoId);
        try {
          await fetchWithAuth(`/api/v1/pos/${parentPoId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'completed' }),
          });
          const label = parentPo?.po_number ?? parentPoId.slice(0, 8);
          setAutoCompletedMsg(`원계약 ${label}이 완료(completed) 처리되었습니다. 이제 해당 PO로 LC/입고 신규 등록이 차단됩니다.`);
        } catch {
          // 실패해도 변경계약 PO 등록 자체는 성공
        }
      }
    } finally {
      reloadPO();
      reloadPoList(); // 계약금 현황 갱신 (결제조건 변경 반영)
    }
  };
  const handleDeletePO = async (poId: string) => {
    await fetchWithAuth(`/api/v1/pos/${poId}`, { method: 'DELETE' });
    reloadPO();
    reloadTT();
    reloadPoList(); // DepositStatusPanel용 전체 PO 목록 재동기화
  };
  const handleCreateBL = async (formData: Record<string, unknown>) => {
    await saveBLShipmentWithLines(formData);
    reloadBL();
    setBlsVersion(v => v + 1); // LC 탭의 BL 드릴다운 목록 재조회 트리거
  };

  const openLCWork = (lc: LCRecord | null = null, defaultPoId?: string) => {
    setActiveTab('lc');
    setEditLC(lc);
    setNewLcDefaultPoId(lc ? undefined : defaultPoId);
    setLcFormOpen(true);
  };

  const closeLCWork = () => {
    setLcFormOpen(false);
    setEditLC(null);
    setNewLcDefaultPoId(undefined);
  };

  const openBLWork = (presetPOId: string | null = null, presetLCId: string | null = null) => {
    setActiveTab('bl');
    setBlFormPresetPOId(presetPOId);
    setBlFormPresetLCId(presetLCId);
    setBlOCRDropFile(null);
    setBlOCRDropError('');
    setBlFormOpen(true);
  };

  const closeBLWork = () => {
    setBlFormOpen(false);
    setBlFormPresetPOId(null);
    setBlFormPresetLCId(null);
    setBlOCRDropFile(null);
  };

  const handleNewBLFromLC = (lc: { lc_id: string; po_id: string }) => {
    openBLWork(lc.po_id, lc.lc_id);
  };

  const handleDeleteBL = async (blId: string) => {
    await fetchWithAuth(`/api/v1/bls/${blId}`, { method: 'DELETE' });
    reloadBL();
  };

  const handleCreateLC = async (d: Record<string, unknown>) => { await fetchWithAuth('/api/v1/lcs', { method: 'POST', body: JSON.stringify(d) }); reloadLC(); setLcAggVersion(v => v + 1); };
  const handleUpdateLC = async (d: Record<string, unknown>) => { if (!editLC) return; await fetchWithAuth(`/api/v1/lcs/${editLC.lc_id}`, { method: 'PUT', body: JSON.stringify(d) }); setEditLC(null); reloadLC(); };
  const handleSettleLC = async (lc: import('@/types/procurement').LCRecord, repaymentDate: string) => {
    await fetchWithAuth(`/api/v1/lcs/${lc.lc_id}`, { method: 'PUT', body: JSON.stringify({ repaid: true, repayment_date: repaymentDate, status: 'settled' }) });
    reloadLC();
  };
  const handleDeleteLC = async (lcId: string) => {
    await fetchWithAuth(`/api/v1/lcs/${lcId}`, { method: 'DELETE' });
    reloadLC();
  };
  const handleCreateTT = async (d: Record<string, unknown>) => { await fetchWithAuth('/api/v1/tts', { method: 'POST', body: JSON.stringify(d) }); reloadTT(); };
  const handleUpdateTT = async (d: Record<string, unknown>) => { if (!editTT) return; await fetchWithAuth(`/api/v1/tts/${editTT.tt_id}`, { method: 'PUT', body: JSON.stringify(d) }); setEditTT(null); reloadTT(); };
  const handleDeleteTT = async (ttId: string) => { await fetchWithAuth(`/api/v1/tts/${ttId}`, { method: 'DELETE' }); reloadTT(); };
  const handleCreatePH = async (d: Record<string, unknown>) => { await fetchWithAuth('/api/v1/price-histories', { method: 'POST', body: JSON.stringify(d) }); reloadPH(); };
  const handleUpdatePH = async (d: Record<string, unknown>) => { if (!editPH) return; await fetchWithAuth(`/api/v1/price-histories/${editPH.price_history_id}`, { method: 'PUT', body: JSON.stringify(d) }); setEditPH(null); reloadPH(); };

  // 기존 PO → 단가이력 일괄 생성 (신규 등록 이전 PO 소급 처리)
  const handleBackfillPriceHistory = async () => {
    if (!selectedCompanyId) return;
    setBackfilling(true);
    setBackfillResult(null);
    let created = 0, skipped = 0, failed = 0;
    try {
      // 기존 단가이력 조회 (중복 방지: product_id + related_po_id 조합)
      const existingPH = await fetchWithAuth<PriceHistory[]>(
        `/api/v1/price-histories?company_id=${selectedCompanyId}`
      ).catch(() => [] as PriceHistory[]);
      const existingKeys = new Set(
        existingPH.map((ph) => `${ph.product_id}__${ph.related_po_id ?? ''}`)
      );

      // 전체 PO 조회
      const allPos = await fetchWithAuth<PurchaseOrder[]>(
        `/api/v1/pos?company_id=${selectedCompanyId}`
      );

      // 각 PO의 라인 병렬 조회
      const poLines = await Promise.all(
        allPos.map((po) =>
          fetchWithAuth<POLineItem[]>(`/api/v1/pos/${po.po_id}/lines`)
            .then((lines) => ({ po, lines }))
            .catch(() => ({ po, lines: [] as POLineItem[] }))
        )
      );

      for (const { po, lines } of poLines) {
        for (const line of lines) {
          const specWp = line.products?.spec_wp ?? line.spec_wp;
          if (!specWp || specWp <= 0) { skipped++; continue; }

          // 단가 계산: total / (qty × specWp) = USD/Wp
          let pricePerWpUsd: number | undefined;
          if (line.total_amount_usd && line.quantity && specWp) {
            pricePerWpUsd = line.total_amount_usd / (line.quantity * specWp);
          } else if (line.unit_price_usd && specWp) {
            pricePerWpUsd = line.unit_price_usd / specWp;
          }
          if (!pricePerWpUsd || pricePerWpUsd <= 0) { skipped++; continue; }

          // 중복 스킵
          const key = `${line.product_id}__${po.po_id}`;
          if (existingKeys.has(key)) { skipped++; continue; }

          const mw = (line.quantity * specWp) / 1_000_000;
          const memoParts = [
            po.incoterms && `선적조건: ${po.incoterms}`,
            po.payment_terms && `결제조건: ${po.payment_terms}`,
            mw > 0 && `발주용량: ${mw.toFixed(3)}MW`,
          ].filter(Boolean);

          try {
            await fetchWithAuth('/api/v1/price-histories', {
              method: 'POST',
              body: JSON.stringify({
                product_id: line.product_id,
                manufacturer_id: po.manufacturer_id,
                company_id: po.company_id,
                change_date: po.contract_date ?? new Date().toISOString().slice(0, 10),
                new_price: Number(pricePerWpUsd.toFixed(6)),
                reason: '최초계약',
                related_po_id: po.po_id,
                memo: memoParts.length > 0 ? memoParts.join(' | ') : undefined,
              }),
            });
            existingKeys.add(key);
            created++;
          } catch { failed++; }
        }
      }
    } catch { failed++; }
    setBackfilling(false);
    setBackfillResult({ created, skipped, failed });
    reloadPH();
  };

  // 필터 라벨 (한글 보장)
  const poStatusLabel = poStatusFilter ? (PO_STATUS_LABEL[poStatusFilter as POStatus] ?? poStatusFilter) : '전체 상태';
  const poMfgLabel = poMfgFilter ? (manufacturers.find(m => m.manufacturer_id === poMfgFilter)?.name_kr ?? '') : '전체 제조사';
  const poTypeLabel = poTypeFilter ? (CONTRACT_TYPE_LABEL[poTypeFilter as ContractType] ?? poTypeFilter) : '전체 유형';
  const lcStatusLabel = lcStatusFilter ? (LC_STATUS_LABEL[lcStatusFilter as LCStatus] ?? lcStatusFilter) : '전체 상태';
  const lcBankLabel = lcBankFilter ? (banks.find(b => b.bank_id === lcBankFilter)?.bank_name ?? '') : '전체 은행';
  const lcMfgLabel = lcMfgFilter ? (manufacturers.find(m => m.manufacturer_id === lcMfgFilter)?.name_kr ?? '') : '전체 제조사';
  const blMfgLabel = blMfgFilter ? (manufacturers.find(m => m.manufacturer_id === blMfgFilter)?.name_kr ?? '') : '전체 제조사';
  const depositMfgLabel = depositMfgFilter ? (manufacturers.find(m => m.manufacturer_id === depositMfgFilter)?.name_kr ?? '') : '전체 제조사';
  const ttStatusLabel = ttStatusFilter ? (TT_STATUS_LABEL[ttStatusFilter as TTStatus] ?? ttStatusFilter) : '전체 상태';
  const ttPoLabel = ttPoFilter ? (poList.find(p => p.po_id === ttPoFilter)?.po_number ?? '') : '전체 PO';
  const phMfgLabel = phMfgFilter ? (manufacturers.find(m => m.manufacturer_id === phMfgFilter)?.name_kr ?? '') : '전체 제조사';

  const handleBLDropZoneDrag = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setBlOCRDropActive(true);
  };

  const handleBLDropZoneDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setBlOCRDropActive(false);
  };

  const handleBLDropZoneDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setBlOCRDropActive(false);
    openBLDropFile(firstCustomsOCRFile(event.dataTransfer.files));
  };

  return (
    <div
      className={`min-h-[calc(100vh-5rem)] p-6 space-y-4 transition-shadow ${
        activeTab === 'bl' && blOCRDropActive ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background' : ''
      }`}
      onDragEnter={activeTab === 'bl' && !selectedBL && !blFormOpen ? handleBLDropZoneDrag : undefined}
      onDragOver={activeTab === 'bl' && !selectedBL && !blFormOpen ? handleBLDropZoneDrag : undefined}
      onDragLeave={activeTab === 'bl' && !selectedBL && !blFormOpen ? handleBLDropZoneDragLeave : undefined}
      onDrop={activeTab === 'bl' && !selectedBL && !blFormOpen ? handleBLDropZoneDrop : undefined}
    >
      <h1 className="text-lg font-semibold">P/O 발주 / 결제</h1>

      {/* 변경계약 등록 후 원계약 자동 완료 알림 */}
      {autoCompletedMsg && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="flex-1">{autoCompletedMsg}</span>
          <button className="text-amber-600 hover:text-amber-900 font-bold text-base leading-none" onClick={() => setAutoCompletedMsg(null)}>×</button>
        </div>
      )}

      {/* BL 상세 — 탭 바깥에서 전체 화면으로 표시 */}
      {selectedBL && (
        <div className="fixed inset-0 z-50 bg-background overflow-auto">
          <div className="p-6">
            <BLDetailView blId={selectedBL} onBack={() => { setSelectedBL(null); reloadBL(); }} />
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="po"><FileText className="h-3.5 w-3.5" />PO</TabsTrigger>
          <TabsTrigger value="tt"><Banknote className="h-3.5 w-3.5" />계약금</TabsTrigger>
          <TabsTrigger value="lc"><Landmark className="h-3.5 w-3.5" />LC</TabsTrigger>
          <TabsTrigger value="bl"><Ship className="h-3.5 w-3.5" />B/L</TabsTrigger>
          <TabsTrigger value="price"><History className="h-3.5 w-3.5" />단가이력</TabsTrigger>
        </TabsList>

        <TabsContent value="po">
          <div className="flex items-center gap-2 mb-3">
            <Select value={poStatusFilter || 'all'} onValueChange={(v) => setPoStatusFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-28 text-xs"><FT text={poStatusLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{(Object.entries(PO_STATUS_LABEL) as [POStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={poMfgFilter || 'all'} onValueChange={(v) => setPoMfgFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={poMfgLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 제조사</SelectItem>{manufacturers.map((m) => <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>)}</SelectContent></Select>
            <Select value={poTypeFilter || 'all'} onValueChange={(v) => setPoTypeFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-28 text-xs"><FT text={poTypeLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 유형</SelectItem>{CONTRACT_TYPES_ACTIVE.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <div className="flex-1" />
            <Button size="sm" onClick={() => setPoFormOpen(true)}><Plus className="mr-1 h-4 w-4" />새로 등록</Button>
          </div>
          {poLoading ? <LoadingSpinner /> : (
            <POListTable
              items={pos.map(p => {
                const mfg = manufacturers.find(m => m.manufacturer_id === p.manufacturer_id);
                return { ...p, manufacturer_name: mfg?.short_name?.trim() || mfg?.name_kr || p.manufacturer_name || '—' };
              })}
              onDetail={setSelectedPO}
              onNew={() => setPoFormOpen(true)}
              onEditLC={(lc) => openLCWork(lc)}
              onNewLC={(po) => openLCWork(null, po.po_id)}
              onDelete={handleDeletePO}
              onDeleteLC={handleDeleteLC}
              onSelectBL={setSelectedBL}
              aggVersion={lcAggVersion}
            />
          )}
          <POForm open={poFormOpen} onOpenChange={setPoFormOpen} onSubmit={handleCreatePO} />
        </TabsContent>

        <TabsContent value="lc">
          {lcFormOpen ? (
            <LCForm
              embedded
              open={lcFormOpen}
              onOpenChange={(o) => { if (!o) closeLCWork(); }}
              onSubmit={editLC ? handleUpdateLC : handleCreateLC}
              editData={editLC}
              defaultPoId={editLC ? undefined : newLcDefaultPoId}
            />
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Select value={lcStatusFilter || 'all'} onValueChange={(v) => setLcStatusFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-28 text-xs"><FT text={lcStatusLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{(Object.entries(LC_STATUS_LABEL) as [LCStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
                <Select value={lcBankFilter || 'all'} onValueChange={(v) => setLcBankFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={lcBankLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 은행</SelectItem>{banks.map((b) => <SelectItem key={b.bank_id} value={b.bank_id}>{b.bank_name}</SelectItem>)}</SelectContent></Select>
                <Select value={lcMfgFilter || 'all'} onValueChange={(v) => setLcMfgFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={lcMfgLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 제조사</SelectItem>{manufacturers.map((m) => <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>)}</SelectContent></Select>
                <div className="flex-1" />
                <Button size="sm" onClick={() => openLCWork()}><Plus className="mr-1 h-4 w-4" />새로 등록</Button>
              </div>
              {lcLoading ? <LoadingSpinner /> : (
                <LCListTable
                  items={lcMfgFilter ? lcs.filter(lc => poList.find(p => p.po_id === lc.po_id)?.manufacturer_id === lcMfgFilter) : lcs}
                  onEdit={(lc) => openLCWork(lc)}
                  onNew={() => openLCWork()}
                  onDelete={handleDeleteLC}
                  onSettle={handleSettleLC}
                  onSelectBL={setSelectedBL}
                  onNewBL={handleNewBLFromLC}
                  blsVersion={blsVersion}
                />
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="tt" className="space-y-5">
          {/* 계약금 현황 — PO별 계약금 자동 집계 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">계약금 현황</h2>
              <div className="flex-1" />
              <Select value={depositMfgFilter || 'all'} onValueChange={(v) => setDepositMfgFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={depositMfgLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 제조사</SelectItem>{manufacturers.map((m) => <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>)}</SelectContent></Select>
            </div>
            <DepositStatusPanel
              pos={depositMfgFilter ? poList.filter(p => p.manufacturer_id === depositMfgFilter) : poList}
              tts={tts}
              onPaymentCreated={() => reloadTT()}
              onEditTT={(tt) => { setEditTT(tt); setTtFormOpen(true); }}
            />
          </div>

          {/* 구분선 */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">T/T 송금 이력</h2>
              <div className="flex-1" />
              <Select value={ttStatusFilter || 'all'} onValueChange={(v) => setTtStatusFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-28 text-xs"><FT text={ttStatusLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem>{(Object.entries(TT_STATUS_LABEL) as [TTStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
              <Select value={ttPoFilter || 'all'} onValueChange={(v) => setTtPoFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-36 text-xs"><FT text={ttPoLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 PO</SelectItem>{poList.map((p) => <SelectItem key={p.po_id} value={p.po_id}>{p.po_number || p.po_id.slice(0, 8)}</SelectItem>)}</SelectContent></Select>
              <Button size="sm" onClick={() => { setEditTT(null); setTtFormOpen(true); }}><Plus className="mr-1 h-4 w-4" />수동 등록</Button>
            </div>
            {ttLoading ? <LoadingSpinner /> : <TTListTable items={tts} onEdit={(tt) => { setEditTT(tt); setTtFormOpen(true); }} onNew={() => { setEditTT(null); setTtFormOpen(true); }} onDelete={handleDeleteTT} />}
            <TTForm open={ttFormOpen} onOpenChange={setTtFormOpen} onSubmit={editTT ? handleUpdateTT : handleCreateTT} editData={editTT} />
          </div>
        </TabsContent>

        <TabsContent value="bl" className="space-y-3">
          {blFormOpen ? (
            <BLForm
              embedded
              open={blFormOpen}
              onOpenChange={(o) => { if (!o) closeBLWork(); }}
              onSubmit={handleCreateBL}
              presetPOId={blFormPresetPOId}
              presetLCId={blFormPresetLCId}
              initialCustomsOCRFile={blOCRDropFile}
              initialCustomsOCRFileKey={blOCRDropFileKey}
            />
          ) : (
            <>
              <div
                className={`rounded-md border-2 border-dashed p-4 transition-colors ${
                  blOCRDropActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-primary/40 bg-primary/5 text-foreground'
                }`}
                onDragEnter={handleBLDropZoneDrag}
                onDragOver={handleBLDropZoneDrag}
                onDragLeave={handleBLDropZoneDragLeave}
                onDrop={handleBLDropZoneDrop}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-background ${
                    blOCRDropActive ? 'border-primary text-primary' : 'border-primary/30 text-primary'
                  }`}>
                    <ScanText className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold">여기에 면장 PDF/사진을 끌어다 놓으세요</div>
                    <div className={`mt-1 text-sm ${blOCRDropActive ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
                      {blOCRDropActive ? '지금 놓으면 해외직수입 입고등록으로 이동합니다' : '놓으면 입고등록 창과 OCR 입력값 확인창이 자동으로 열립니다'}
                    </div>
                    {blOCRDropError && <div className="mt-2 text-xs font-medium text-destructive">{blOCRDropError}</div>}
                  </div>
                  <div className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    PDF · JPG · PNG
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Select value={blTypeFilter || 'all'} onValueChange={(v) => setBlTypeFilter(v === 'all' ? '' : (v ?? ''))}>
                  <SelectTrigger className="h-8 w-36 text-xs"><FT text={blTypeFilter ? (INBOUND_TYPE_LABEL[blTypeFilter as InboundType] ?? blTypeFilter) : '입고 구분'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">입고 구분 (전체)</SelectItem>
                    {(Object.entries(INBOUND_TYPE_LABEL) as [InboundType, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={blStatusFilter || 'all'} onValueChange={(v) => setBlStatusFilter(v === 'all' ? '' : (v ?? ''))}>
                  <SelectTrigger className="h-8 w-28 text-xs"><FT text={blStatusFilter ? (BL_STATUS_LABEL[blStatusFilter as BLStatus] ?? blStatusFilter) : '전체 현황'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 현황</SelectItem>
                    {(Object.entries(BL_STATUS_LABEL) as [BLStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={blMfgFilter || 'all'} onValueChange={(v) => setBlMfgFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={blMfgLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 제조사</SelectItem>{manufacturers.map((m) => <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>)}</SelectContent></Select>
                <div className="flex-1" />
                <ExcelToolbar type="inbound" onImportComplete={() => { reloadBL(); setBlsVersion(v => v + 1); }} />
                <Button size="sm" onClick={() => openBLWork()}><Plus className="mr-1 h-4 w-4" />새로 등록</Button>
              </div>
              {blLoading ? <LoadingSpinner /> : (
                <BLListTable items={bls} onSelect={(bl) => setSelectedBL(bl.bl_id)} onNew={() => openBLWork()} onDelete={handleDeleteBL} />
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="price" className="space-y-3">
          <div className="flex items-center gap-2">
            <Select value={phMfgFilter || 'all'} onValueChange={(v) => setPhMfgFilter(v === 'all' ? '' : (v ?? ''))}><SelectTrigger className="h-8 w-32 text-xs"><FT text={phMfgLabel} /></SelectTrigger><SelectContent><SelectItem value="all">전체 제조사</SelectItem>{manufacturers.map((m) => <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>)}</SelectContent></Select>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={handleBackfillPriceHistory} disabled={backfilling}>
              {backfilling ? '생성 중…' : '기존 PO에서 일괄 생성'}
            </Button>
            <Button size="sm" onClick={() => { setEditPH(null); setPhFormOpen(true); }}><Plus className="mr-1 h-4 w-4" />새로 등록</Button>
          </div>

          {/* 일괄 생성 결과 배너 */}
          {backfillResult && (
            <div className={`flex items-center justify-between rounded-md px-4 py-2.5 text-sm border ${backfillResult.created > 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-muted border-muted-foreground/20 text-muted-foreground'}`}>
              <span>
                {backfillResult.created > 0
                  ? `✓ ${backfillResult.created}건 단가이력 생성 완료`
                  : '새로 생성할 단가이력이 없습니다'}
                {backfillResult.skipped > 0 && <span className="ml-2 opacity-70">(이미 존재 {backfillResult.skipped}건 건너뜀)</span>}
                {backfillResult.failed > 0 && <span className="ml-2 text-red-600">{backfillResult.failed}건 실패</span>}
              </span>
              <button className="text-xs opacity-50 hover:opacity-100 ml-4" onClick={() => setBackfillResult(null)}>✕</button>
            </div>
          )}

          {phLoading ? <LoadingSpinner /> : <PriceHistoryTable items={phs} onEdit={(ph) => { setEditPH(ph); setPhFormOpen(true); }} onNew={() => { setEditPH(null); setPhFormOpen(true); }} />}
          <PriceHistoryForm open={phFormOpen} onOpenChange={setPhFormOpen} onSubmit={editPH ? handleUpdatePH : handleCreatePH} editData={editPH} />
        </TabsContent>
      </Tabs>

      {/* 딤 오버레이 — 클릭하면 패널 닫기 */}
      {selectedPO && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity"
          onClick={() => { setSelectedPO(null); reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }}
        />
      )}

      {/* PO 우측 슬라이드 패널 — 왼쪽 드래그 핸들로 폭 조절 */}
      <div
        ref={panelRef}
        className={[
          'fixed inset-y-0 right-0 z-50 flex flex-col bg-background border-l shadow-2xl',
          'transition-transform duration-200 ease-out',
          selectedPO ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        style={{ width: panelWidth }}
      >
        {/* 왼쪽 드래그 핸들 */}
        <div
          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-10 group select-none"
          onMouseDown={onDragHandleMouseDown}
          title="드래그하여 패널 너비 조절"
        >
          <div className="h-full w-full transition-colors group-hover:bg-primary/20 group-active:bg-primary/30" />
          {/* 가운데 그립 점 */}
          <div className="absolute top-1/2 left-0 -translate-y-1/2 flex flex-col gap-1 items-center w-2">
            {[0,1,2].map(i => (
              <div key={i} className="w-0.5 h-3 rounded-full bg-border group-hover:bg-primary/40" />
            ))}
          </div>
        </div>

        {/* 상단 헤더 — 너비 표시 + 닫기 버튼 */}
        <div className="flex items-center justify-between border-b px-6 py-2.5 shrink-0 bg-muted/30">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {Math.round(panelWidth)}px
          </span>
          <div className="flex items-center gap-1">
            {/* 너비 프리셋 버튼 */}
            {[600, 800, 1000, 1200].map(w => (
              <button
                key={w}
                onClick={() => setPanelWidth(w)}
                className={[
                  'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                  Math.abs(panelWidth - w) < 50
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground',
                ].join(' ')}
              >
                {w}px
              </button>
            ))}
            <button
              onClick={() => { setSelectedPO(null); reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }}
              className="ml-2 rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="닫기 (ESC)"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 스크롤 가능한 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedPO && (
            <PODetailView
              po={selectedPO}
              onBack={() => { setSelectedPO(null); reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }}
              onReload={() => { reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }}
              allPos={pos}
            />
          )}
        </div>
      </div>
    </div>
  );
}
