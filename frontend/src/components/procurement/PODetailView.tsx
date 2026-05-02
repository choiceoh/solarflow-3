import { useState, useEffect } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn, formatDate, shortMfgName } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { DetailSection, DetailField, DetailFieldGrid } from '@/components/common/detail';
import POForm from './POForm';
import POLineTable, { PO_LINE_TABLE_ID, PO_LINE_COLUMN_META } from './POLineTable';
import { ColumnVisibilityMenu } from '@/components/common/ColumnVisibilityMenu';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useColumnPinning } from '@/lib/columnPinning';
import POLineForm from './POLineForm';
import TTForm from './TTForm';
import LCForm from './LCForm';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import POInboundProgress from './POInboundProgress';
import AttachmentWidget from '@/components/common/AttachmentWidget';
import GroupedMiniTable, { type GroupedMiniTableColumn } from '@/components/common/GroupedMiniTable';
import ProgressMiniBar from '@/components/common/ProgressMiniBar';
import StatusPill from '@/components/common/StatusPill';
import { parseDeposit } from './depositStatus';
import { fetchWithAuth } from '@/lib/api';
import { usePOLines, useLCList, useTTList } from '@/hooks/useProcurement';
import type { BLShipment, BLLineItem } from '@/types/inbound';
import { PO_STATUS_LABEL, PO_STATUS_COLOR, CONTRACT_TYPE_LABEL, type PurchaseOrder, type POLineItem, type LCRecord, type TTRemittance } from '@/types/procurement';
import { LC_STATUS_LABEL, LC_STATUS_COLOR, TT_STATUS_LABEL, TT_STATUS_COLOR } from '@/types/procurement';
import { formatUSD, formatNumber } from '@/lib/utils';

interface Props { po: PurchaseOrder; onBack: () => void; onReload: () => void; allPos?: PurchaseOrder[]; }

function LCSubTable({ items }: { items: LCRecord[] }) {
  const totalUsd = items.reduce((s, l) => s + (l.amount_usd ?? 0), 0);
  const totalMw  = items.reduce((s, l) => s + (l.target_mw ?? 0), 0);
  const columns: GroupedMiniTableColumn<LCRecord>[] = [
    {
      key: 'lc_number',
      label: 'LC번호',
      render: (lc, idx) => (
        <span className="font-mono font-medium">
          <span className="mr-1 text-[10px] font-normal text-muted-foreground">#{idx + 1}</span>
          {lc.lc_number || '—'}
        </span>
      ),
    },
    {
      key: 'bank',
      label: '은행',
      className: 'text-muted-foreground',
      render: (lc) => lc.bank_name ?? '—',
    },
    {
      key: 'open_date',
      label: '개설일',
      className: 'text-muted-foreground',
      render: (lc) => formatDate(lc.open_date ?? ''),
    },
    {
      key: 'amount_usd',
      label: '금액(USD)',
      align: 'right',
      headerClassName: 'text-foreground',
      className: 'font-mono tabular-nums',
      render: (lc) => formatUSD(lc.amount_usd),
    },
    {
      key: 'target_mw',
      label: 'MW',
      className: 'font-mono',
      render: (lc) => lc.target_mw != null ? `${lc.target_mw.toFixed(2)} MW` : '—',
    },
    {
      key: 'maturity_date',
      label: '만기일',
      className: 'text-muted-foreground',
      render: (lc) => formatDate(lc.maturity_date ?? ''),
    },
    {
      key: 'status',
      label: '상태',
      align: 'center',
      render: (lc) => (
        <StatusPill
          label={LC_STATUS_LABEL[lc.status]}
          colorClassName={LC_STATUS_COLOR[lc.status]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <GroupedMiniTable
        columns={columns}
        data={items}
        getRowKey={(lc) => lc.lc_id}
        emptyMessage="연결된 LC가 없습니다"
        footerCells={items.length > 1 ? [
          { content: `합계 ${items.length}건`, colSpan: 3, className: 'text-[10px] text-muted-foreground' },
          { content: formatUSD(totalUsd), align: 'right', className: 'font-mono font-semibold tabular-nums' },
          { content: totalMw > 0 ? `${totalMw.toFixed(2)} MW` : '—', className: 'font-mono font-semibold text-[10px]' },
          { content: null, colSpan: 2 },
        ] : undefined}
      />
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {items.map((lc) => (
          <AttachmentWidget
            key={`${lc.lc_id}-attachments`}
            entityType="lc_records"
            entityId={lc.lc_id}
            fileType="lc_swift_pdf"
            title={`${lc.lc_number || 'LC'} 신용장 전문`}
            uploadLabel="전문 PDF 업로드"
            compact
          />
        ))}
      </div>
    </div>
  );
}

function TTSubTable({ items, poLines }: { items: TTRemittance[]; poLines: POLineItem[] }) {
  const totalUsd = items.reduce((s, t) => s + t.amount_usd, 0);
  const poTotalUsd = poLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
  const remitRatio = poTotalUsd > 0 ? (totalUsd / poTotalUsd) * 100 : 0;
  const columns: GroupedMiniTableColumn<TTRemittance>[] = [
    {
      key: 'remit_date',
      label: '송금일',
      className: 'text-muted-foreground',
      render: (tt) => formatDate(tt.remit_date ?? ''),
    },
    {
      key: 'amount_usd',
      label: '금액(USD)',
      align: 'right',
      headerClassName: 'text-foreground',
      className: 'font-mono tabular-nums',
      render: (tt) => formatUSD(tt.amount_usd),
    },
    {
      key: 'amount_krw',
      label: '원화',
      align: 'right',
      className: 'font-mono tabular-nums text-muted-foreground',
      render: (tt) => tt.amount_krw != null ? `${formatNumber(tt.amount_krw)}원` : '—',
    },
    {
      key: 'exchange_rate',
      label: '환율',
      align: 'right',
      className: 'font-mono text-muted-foreground',
      render: (tt) => tt.exchange_rate?.toFixed(2) ?? '—',
    },
    {
      key: 'purpose',
      label: '목적',
      className: 'text-muted-foreground',
      render: (tt) => tt.purpose ?? '—',
    },
    {
      key: 'status',
      label: '상태',
      align: 'center',
      render: (tt) => (
        <StatusPill
          label={TT_STATUS_LABEL[tt.status]}
          colorClassName={TT_STATUS_COLOR[tt.status]}
        />
      ),
    },
  ];

  return (
    <GroupedMiniTable
      columns={columns}
      data={items}
      getRowKey={(tt) => tt.tt_id}
      emptyMessage="연결된 TT가 없습니다"
      footerCells={[
        { content: `합계 ${items.length}건`, className: 'text-[10px] text-muted-foreground' },
        { content: formatUSD(totalUsd), align: 'right', className: 'font-mono font-semibold tabular-nums' },
        { content: `송금비율 ${remitRatio.toFixed(1)}%`, colSpan: 4, className: 'text-[10px] text-muted-foreground' },
      ]}
    />
  );
}

export default function PODetailView({ po: initialPo, onBack, onReload, allPos = [] }: Props) {
  // 로컬 PO 미러 — 저장 후 서버 fresh로 갱신 (parent prop은 stale일 수 있음)
  const [po, setPo] = useState<PurchaseOrder>(initialPo);
  // 부모 selectedPO 변경 시(다른 PO 선택 등) 동기화
  useEffect(() => { setPo(initialPo); }, [initialPo]);

  const [editingPO, setEditingPO] = useState(false);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [editLine, setEditLine] = useState<POLineItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { data: lines, loading: linesLoading, reload: reloadLines } = usePOLines(po.po_id);
  const poLineColVis = useColumnVisibility(PO_LINE_TABLE_ID, PO_LINE_COLUMN_META);
  const poLineColPin = useColumnPinning(PO_LINE_TABLE_ID);
  const { data: lcs, loading: lcsLoading, reload: reloadLcs } = useLCList({ po_id: po.po_id });
  const { data: tts, loading: ttsLoading, reload: reloadTTs } = useTTList({ po_id: po.po_id });

  const [ttFormOpen, setTtFormOpen] = useState(false);
  const [lcFormOpen, setLcFormOpen] = useState(false);

  const handleCreateLC = async (d: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/lcs', { method: 'POST', body: JSON.stringify(d) });
    reloadLcs();
    onReload();
  };

  const handleCreateTT = async (d: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/tts', { method: 'POST', body: JSON.stringify({ ...d, po_id: po.po_id }) });
    reloadTTs();
  };

  // 4단계 MW 진행률용 BL 데이터 — 백엔드에 합산 엔드포인트 없어 프론트에서 합산
  const [blShipped, setBlShipped] = useState<{ shippedMw: number; completedMw: number }>({ shippedMw: 0, completedMw: 0 });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const blList = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?po_id=${po.po_id}`);
        if (cancelled) return;
        const lineMap: Record<string, BLLineItem[]> = {};
        await Promise.all(
          (blList ?? []).map(async (bl) => {
            try { lineMap[bl.bl_id] = await fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${bl.bl_id}/lines`); }
            catch { lineMap[bl.bl_id] = []; }
          })
        );
        if (cancelled) return;
        const shipStatuses = new Set(['shipping', 'arrived', 'customs', 'completed', 'erp_done']);
        const compStatuses = new Set(['completed', 'erp_done']);
        let shippedMw = 0, completedMw = 0;
        for (const bl of blList ?? []) {
          // capacity_kw는 해당 라인의 총 kW (EA당이 아님) → quantity 곱셈 금지
          const mw = (lineMap[bl.bl_id] ?? []).reduce((s, l) => s + (l.capacity_kw ?? 0), 0) / 1000;
          if (shipStatuses.has(bl.status)) shippedMw += mw;
          if (compStatuses.has(bl.status)) completedMw += mw;
        }
        setBlShipped({ shippedMw, completedMw });
      } catch { if (!cancelled) setBlShipped({ shippedMw: 0, completedMw: 0 }); }
    })();
    return () => { cancelled = true; };
  }, [po.po_id]);

  // 저장 후 PO 헤더 새로고침
  const refreshPO = async () => {
    try {
      const fresh = await fetchWithAuth<PurchaseOrder>(`/api/v1/pos/${po.po_id}`);
      if (fresh) setPo(fresh);
    } catch { /* ignore */ }
  };

  // PO 헤더 PUT + 발주품목 diff CRUD (UPDATE 기존 / INSERT 신규 / DELETE 제거)
  const handleUpdatePO = async (data: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { lines: submittedLines, ...poBody } = data as any;
    try {
      // 1) PO 헤더 업데이트
      await fetchWithAuth(`/api/v1/pos/${po.po_id}`, { method: 'PUT', body: JSON.stringify(poBody) });

      if (Array.isArray(submittedLines)) {
        // 2) 기존 발주품목 목록 조회
        const existing = await fetchWithAuth<{ po_line_id: string }[]>(`/api/v1/pos/${po.po_id}/lines`);
        const existingIds = new Set((existing ?? []).map(l => l.po_line_id));
        const submittedIds = new Set(
          submittedLines
            .filter((l: { po_line_id?: string }) => l.po_line_id)
            .map((l: { po_line_id?: string }) => l.po_line_id as string),
        );

        const failures: string[] = [];

        // 3) 삭제: 기존엔 있는데 제출엔 없는 것
        for (const id of existingIds) {
          if (!submittedIds.has(id)) {
            try {
              await fetchWithAuth(`/api/v1/pos/${po.po_id}/lines/${id}`, { method: 'DELETE' });
            } catch (err) {
              failures.push(`삭제 실패: ${err instanceof Error ? err.message : '알 수 없음'}`);
            }
          }
        }

        // 4) 업데이트 or 삽입
        for (const line of submittedLines) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { po_line_id, ...body } = line as any;
          try {
            if (po_line_id && existingIds.has(po_line_id)) {
              await fetchWithAuth(`/api/v1/pos/${po.po_id}/lines/${po_line_id}`, {
                method: 'PUT', body: JSON.stringify(body),
              });
            } else {
              await fetchWithAuth(`/api/v1/pos/${po.po_id}/lines`, {
                method: 'POST', body: JSON.stringify({ ...body, po_id: po.po_id }),
              });
            }
          } catch (err) {
            failures.push(err instanceof Error ? err.message : '알 수 없는 오류');
          }
        }

        if (failures.length > 0) {
          throw new Error(`발주품목 ${failures.length}건 처리 실패: ${failures.join('; ')}`);
        }
      }
    } finally {
      onReload();
      reloadLines();
      await refreshPO();
    }
  };

  const handleCreateLine = async (data: Record<string, unknown>) => {
    await fetchWithAuth(`/api/v1/pos/${po.po_id}/lines`, { method: 'POST', body: JSON.stringify(data) });
    reloadLines();
  };
  // PO 취소 — 운영 이력 보존을 위해 실제 삭제 대신 cancelled로 전환
  const handleDeletePO = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await fetchWithAuth(`/api/v1/pos/${po.po_id}`, { method: 'DELETE' });
      setDeleteOpen(false);
      onBack();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '취소 처리에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateLine = async (data: Record<string, unknown>) => {
    if (!editLine) return;
    await fetchWithAuth(`/api/v1/pos/${po.po_id}/lines/${editLine.po_line_id}`, { method: 'PUT', body: JSON.stringify(data) });
    setEditLine(null); reloadLines();
  };

  return (
    <div className="space-y-4">
      <div className="sf-detail-header">
        <button type="button" className="sf-detail-header-back" onClick={onBack} aria-label="목록으로">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-base font-semibold" style={{ letterSpacing: '-0.012em' }}>
          PO <span className="sf-mono">{po.po_number || '—'}</span>
        </h2>
        <StatusPill label={PO_STATUS_LABEL[po.status]} colorClassName={PO_STATUS_COLOR[po.status]} className="px-2" />
        {!editingPO && (
          <>
            {po.status !== 'cancelled' && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"
                onClick={() => { setDeleteError(''); setDeleteOpen(true); }}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />취소 처리
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setLcFormOpen(true)}>
              LC 등록
            </Button>
            {/* PO → 입고 데이터 전달 */}
            <Button size="sm" onClick={() => { window.location.href = `/inbound?po=${po.po_id}`; }}>
              입고 등록
            </Button>
          </>
        )}
      </div>

      {editingPO && (
        <DetailSection title="PO 수정">
          <POForm
            variant="inline"
            onOpenChange={(o) => { if (!o) setEditingPO(false); }}
            onSubmit={async (d) => { await handleUpdatePO(d); setEditingPO(false); }}
            editData={po}
          />
        </DetailSection>
      )}

      {/* TT이력은 종합정보 탭에 병합 (별도 탭 만들지 않음) */}
      {!editingPO && (
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">종합정보</TabsTrigger>
          <TabsTrigger value="lines">발주품목</TabsTrigger>
          <TabsTrigger value="deposit">계약금 현황</TabsTrigger>
          <TabsTrigger value="lc">LC현황</TabsTrigger>
          <TabsTrigger value="inbound">입고현황</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <div className="space-y-4">
            <DetailSection
              title="기본 정보"
              actions={(
                <Button variant="outline" size="sm" onClick={() => setEditingPO(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />수정
                </Button>
              )}
            >
              <DetailFieldGrid cols={4}>
                <DetailField label="계약유형" value={CONTRACT_TYPE_LABEL[po.contract_type]} />
                <DetailField label="제조사" value={shortMfgName(po.manufacturer_name)} />
                <DetailField label="계약일" value={formatDate(po.contract_date ?? '')} />
                <DetailField label="Incoterms" value={po.incoterms} />
                <DetailField label="결제조건" value={po.payment_terms} span={2} />
                {po.total_qty != null && <DetailField label="총수량" value={formatNumber(po.total_qty)} />}
                {po.total_mw != null && <DetailField label="총 MW" value={`${po.total_mw.toFixed(2)}MW`} />}
              </DetailFieldGrid>
              {!linesLoading && lines.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">품목</p>
                  <div className="space-y-0.5">
                    {lines.map((l) => {
                      const name = l.products?.product_name ?? l.product_name ?? '';
                      const spec = l.products?.spec_wp ?? l.spec_wp;
                      const parts = [shortMfgName(po.manufacturer_name), name, spec ? `${spec}Wp` : ''].filter(Boolean).join(' ');
                      const isFree = l.payment_type === 'free';
                      return (
                        <p key={l.po_line_id} className="text-sm flex items-center gap-1.5">
                          {parts || '—'} × <span className="font-mono">{formatNumber(l.quantity)}EA</span>
                          {isFree && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700">무상</span>}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
              {po.parent_po_id && (() => {
                const parent = allPos.find((x) => x.po_id === po.parent_po_id);
                const label = parent?.po_number ?? po.parent_po_id.slice(0, 8);
                return (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2">
                    <span className="text-[10px] font-medium text-amber-700">원계약</span>
                    <span className="text-xs font-mono text-amber-900">{label}</span>
                    {parent?.total_mw != null && (
                      <span className="text-[10px] text-amber-600">{parent.total_mw.toFixed(0)}MW · {parent.status}</span>
                    )}
                  </div>
                );
              })()}
              {po.memo && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">메모</p>
                  <p className="text-sm whitespace-pre-wrap break-words">{po.memo}</p>
                </div>
              )}
            </DetailSection>

            {/* T/T 납부현황 + LC 개설현황 요약 */}
            {(() => {
              const poTotalUsd = lines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
              const ttTotalUsd = tts.reduce((s, t) => s + (t.amount_usd ?? 0), 0);
              const ttRemainUsd = Math.max(0, poTotalUsd - ttTotalUsd);
              const ttPct = poTotalUsd > 0 ? (ttTotalUsd / poTotalUsd) * 100 : 0;
              const lcTotalUsd = lcs.reduce((s, l) => s + (l.amount_usd ?? 0), 0);
              const lcRemainUsd = Math.max(0, poTotalUsd - lcTotalUsd);
              const lcPct = poTotalUsd > 0 ? (lcTotalUsd / poTotalUsd) * 100 : 0;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-md border p-3 space-y-1.5">
                    <div className="text-xs font-semibold">T/T 납부현황</div>
                    <div className="text-xs flex justify-between">
                      <span className="text-muted-foreground">기납부</span>
                      <span className="font-mono">{formatUSD(ttTotalUsd)}</span>
                    </div>
                    <div className="text-xs flex justify-between">
                      <span className="text-muted-foreground">잔여</span>
                      <span className="font-mono">{formatUSD(ttRemainUsd)}</span>
                    </div>
                    <ProgressMiniBar percent={ttPct} />
                    <div className="text-[10px] text-muted-foreground text-right">{ttPct.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-md border p-3 space-y-1.5">
                    <div className="text-xs font-semibold">LC 개설현황</div>
                    <div className="text-xs flex justify-between">
                      <span className="text-muted-foreground">기개설</span>
                      <span className="font-mono">{formatUSD(lcTotalUsd)}</span>
                    </div>
                    <div className="text-xs flex justify-between">
                      <span className="text-muted-foreground">미개설 잔액</span>
                      <span className="font-mono">{formatUSD(lcRemainUsd)}</span>
                    </div>
                    <ProgressMiniBar percent={lcPct} colorClassName="bg-green-600" />
                    <div className="text-[10px] text-muted-foreground text-right">{lcPct.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })()}

            {/* 4단계 MW 진행률 — 계약 → LC개설 → 선적(BL) → 입고완료 */}
            {(() => {
              const contractMw = po.total_mw ?? lines.reduce((s, l) => s + ((l.spec_wp ?? 0) * (l.quantity ?? 0)) / 1_000_000, 0);
              const lcMw = lcs.reduce((s, lc) => s + (lc.target_mw ?? 0), 0);
              const { shippedMw, completedMw } = blShipped;
              const pct = (v: number) => contractMw > 0 ? Math.min(100, (v / contractMw) * 100) : 0;
              const lcPct = pct(lcMw);
              const shipPct = pct(shippedMw);
              const compPct = pct(completedMw);
              const Step = ({ label, value, pctVal, color }: { label: string; value: string; pctVal: number; color: string }) => (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono">{value} ({pctVal.toFixed(1)}%)</span>
                  </div>
                  <ProgressMiniBar percent={pctVal} colorClassName={color} />
                </div>
              );
              return (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-xs font-semibold">진행률 (MW)</div>
                  <Step label="계약 MW" value={`${contractMw.toFixed(2)} MW`} pctVal={100} color="bg-slate-500" />
                  <Step label="LC 개설" value={`${lcMw.toFixed(2)} MW`} pctVal={lcPct} color="bg-blue-500" />
                  <Step label="선적 (BL 기준)" value={`${shippedMw.toFixed(2)} MW`} pctVal={shipPct} color="bg-amber-500" />
                  <Step label="입고완료" value={`${completedMw.toFixed(2)} MW`} pctVal={compPct} color="bg-green-600" />
                </div>
              );
            })()}

            {/* 입고품목 / LC / 입고 요약 (종합정보에 통합) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-md border p-3 space-y-1.5">
                <div className="text-xs font-semibold flex justify-between">
                  <span>입고품목 (총 {lines.length}건)</span>
                </div>
                {lines.slice(0, 3).map((l) => (
                  <div key={l.po_line_id} className="text-[10px] flex justify-between gap-2">
                    <span className="truncate">{l.products?.product_name ?? l.product_name ?? '—'}</span>
                    <span className="font-mono text-muted-foreground shrink-0">{formatNumber(l.quantity)}EA</span>
                  </div>
                ))}
                {lines.length > 3 && <div className="text-[10px] text-muted-foreground">… 외 {lines.length - 3}건</div>}
              </div>
              <div className="rounded-md border p-3 space-y-1.5">
                <div className="text-xs font-semibold">LC 현황 (총 {lcs.length}건)</div>
                {lcs.slice(0, 3).map((lc) => (
                  <div key={lc.lc_id} className="text-[10px] flex justify-between gap-2">
                    <span className="truncate font-mono">{lc.lc_number ?? lc.lc_id.slice(0, 8)}</span>
                    <span className="font-mono text-muted-foreground shrink-0">{formatUSD(lc.amount_usd)}</span>
                  </div>
                ))}
                {lcs.length === 0 && <div className="text-[10px] text-muted-foreground">—</div>}
                {lcs.length > 3 && <div className="text-[10px] text-muted-foreground">… 외 {lcs.length - 3}건</div>}
              </div>
              <div className="rounded-md border p-3 space-y-1.5">
                <div className="text-xs font-semibold">입고 현황</div>
                <div className="text-[10px] flex justify-between">
                  <span className="text-muted-foreground">선적 완료</span>
                  <span className="font-mono">{blShipped.shippedMw.toFixed(2)} MW</span>
                </div>
                <div className="text-[10px] flex justify-between">
                  <span className="text-muted-foreground">입고 완료</span>
                  <span className="font-mono">{blShipped.completedMw.toFixed(2)} MW</span>
                </div>
                <div className="text-[10px] text-muted-foreground">상세는 입고현황 탭에서 확인</div>
              </div>
            </div>

            {/* T/T 이력 테이블 (종합정보에 병합) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold">T/T 이력</h4>
                <Button size="sm" onClick={() => setTtFormOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />T/T 등록</Button>
              </div>
              {ttsLoading ? <LoadingSpinner /> : <TTSubTable items={tts} poLines={lines} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="lines">
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <ColumnVisibilityMenu tableId={PO_LINE_TABLE_ID} columns={PO_LINE_COLUMN_META} hidden={poLineColVis.hidden} setHidden={poLineColVis.setHidden} pinning={poLineColPin.pinning} pinLeft={poLineColPin.pinLeft} pinRight={poLineColPin.pinRight} unpin={poLineColPin.unpin} />
              <Button size="sm" onClick={() => { setEditLine(null); setLineFormOpen(true); }}><Plus className="mr-1 h-3.5 w-3.5" />추가</Button>
            </div>
            {linesLoading ? <LoadingSpinner /> : <POLineTable items={lines} hidden={poLineColVis.hidden} pinning={poLineColPin.pinning} onPinningChange={poLineColPin.setPinning} onEdit={(l) => { setEditLine(l); setLineFormOpen(true); }} manufacturerName={po.manufacturer_name} />}
          </div>
        </TabsContent>

        <TabsContent value="deposit">
          <div className="space-y-3">
            {(() => {
              const dep = parseDeposit(po.payment_terms);
              if (!dep.hasDeposit) return null;
              const paidUsd = tts.reduce((s, t) => s + t.amount_usd, 0);
              const remainUsd = Math.max(0, dep.depositAmountUsd - paidUsd);
              const paidPct = dep.depositAmountUsd > 0 ? (paidUsd / dep.depositAmountUsd) * 100 : 0;
              const isDone = paidUsd >= dep.depositAmountUsd - 0.01;
              return (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-xs font-semibold">계약금 요약</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <span className="text-muted-foreground">계약금 총액 <span className="font-mono font-medium text-foreground">{formatUSD(dep.depositAmountUsd)}</span> ({dep.depositPercent}%)</span>
                    <span className="text-muted-foreground">기지급 <span className={cn('font-mono font-medium', isDone ? 'text-green-600' : 'text-orange-600')}>{formatUSD(paidUsd)}</span></span>
                    {!isDone && remainUsd > 0 && <span className="text-muted-foreground">잔여 <span className="font-mono font-medium text-red-600">{formatUSD(remainUsd)}</span></span>}
                    {dep.plannedSplits > 0 && <span className="text-muted-foreground">분할 {dep.plannedSplits}회</span>}
                  </div>
                  <ProgressMiniBar percent={paidPct} colorClassName={isDone ? 'bg-green-600' : 'bg-orange-500'} />
                  <div className="text-[10px] text-muted-foreground text-right">{paidPct.toFixed(1)}%</div>
                </div>
              );
            })()}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setTtFormOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />계약금 등록</Button>
            </div>
            {ttsLoading ? <LoadingSpinner /> : <TTSubTable items={tts} poLines={lines} />}
          </div>
        </TabsContent>
        <TabsContent value="lc">
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setLcFormOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />LC 등록</Button>
            </div>
            {lcsLoading ? <LoadingSpinner /> : <LCSubTable items={lcs} />}
          </div>
        </TabsContent>
        <TabsContent value="inbound"><POInboundProgress poId={po.po_id} poLines={lines} /></TabsContent>
      </Tabs>
      )}

      <LinkedMemoWidget linkedTable="purchase_orders" linkedId={po.po_id} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(v) => { if (!v) { setDeleteOpen(false); setDeleteError(''); } }}
        title="PO 취소 처리"
        description={deleteError || `PO "${po.po_number ?? po.po_id}"를 취소 처리하시겠습니까? 발주품목과 연결 이력은 삭제되지 않습니다.`}
        onConfirm={handleDeletePO}
        loading={deleting}
      />
      <POLineForm open={lineFormOpen} onOpenChange={setLineFormOpen} onSubmit={editLine ? handleUpdateLine : handleCreateLine} editData={editLine} poId={po.po_id} />
      <TTForm open={ttFormOpen} onOpenChange={setTtFormOpen} onSubmit={handleCreateTT} editData={null} defaultPoId={po.po_id} />
      <LCForm open={lcFormOpen} onOpenChange={setLcFormOpen} onSubmit={handleCreateLC} editData={null} defaultPoId={po.po_id} />
    </div>
  );
}
