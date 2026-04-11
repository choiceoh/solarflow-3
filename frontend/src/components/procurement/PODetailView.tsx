import { useState, useEffect } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn, formatDate } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import POForm from './POForm';
import POLineTable from './POLineTable';
import POLineForm from './POLineForm';
import TTForm from './TTForm';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import POInboundProgress from './POInboundProgress';
import { fetchWithAuth } from '@/lib/api';
import { usePOLines, useLCList, useTTList } from '@/hooks/useProcurement';
import type { BLShipment, BLLineItem } from '@/types/inbound';
import { PO_STATUS_LABEL, PO_STATUS_COLOR, CONTRACT_TYPE_LABEL, type PurchaseOrder, type POLineItem, type LCRecord, type TTRemittance } from '@/types/procurement';
import { LC_STATUS_LABEL, LC_STATUS_COLOR, TT_STATUS_LABEL, TT_STATUS_COLOR } from '@/types/procurement';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatUSD, formatNumber } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';

interface Props { po: PurchaseOrder; onBack: () => void; onReload: () => void; allPos?: PurchaseOrder[]; }

function Field({ label, value }: { label: string; value: string | undefined }) {
  return <div><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-sm">{value || '—'}</p></div>;
}

function LCSubTable({ items }: { items: LCRecord[] }) {
  if (items.length === 0) return <EmptyState message="연결된 LC가 없습니다" />;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader><TableRow>
          <TableHead>LC번호</TableHead><TableHead>은행</TableHead><TableHead>개설일</TableHead>
          <TableHead className="text-right">금액(USD)</TableHead><TableHead>만기일</TableHead><TableHead>상태</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((lc) => (
            <TableRow key={lc.lc_id}>
              <TableCell className="font-mono">{lc.lc_number || '—'}</TableCell>
              <TableCell>{lc.bank_name ?? '—'}</TableCell>
              <TableCell>{formatDate(lc.open_date ?? '')}</TableCell>
              <TableCell className="text-right">{formatUSD(lc.amount_usd)}</TableCell>
              <TableCell>{formatDate(lc.maturity_date ?? '')}</TableCell>
              <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', LC_STATUS_COLOR[lc.status])}>{LC_STATUS_LABEL[lc.status]}</span></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TTSubTable({ items, poLines }: { items: TTRemittance[]; poLines: POLineItem[] }) {
  if (items.length === 0) return <EmptyState message="연결된 TT가 없습니다" />;
  const totalUsd = items.reduce((s, t) => s + t.amount_usd, 0);
  // 송금비율: TT합계 / PO 라인아이템 총액 합계
  const poTotalUsd = poLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
  const remitRatio = poTotalUsd > 0 ? (totalUsd / poTotalUsd) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-x-auto">
        <Table className="text-xs">
          <TableHeader><TableRow>
            <TableHead>송금일</TableHead><TableHead className="text-right">금액(USD)</TableHead>
            <TableHead className="text-right">원화</TableHead><TableHead className="text-right">환율</TableHead>
            <TableHead>목적</TableHead><TableHead>상태</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((tt) => (
              <TableRow key={tt.tt_id}>
                <TableCell>{formatDate(tt.remit_date ?? '')}</TableCell>
                <TableCell className="text-right">{formatUSD(tt.amount_usd)}</TableCell>
                <TableCell className="text-right">{tt.amount_krw != null ? `${formatNumber(tt.amount_krw)}원` : '—'}</TableCell>
                <TableCell className="text-right">{tt.exchange_rate?.toFixed(2) ?? '—'}</TableCell>
                <TableCell>{tt.purpose ?? '—'}</TableCell>
                <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', TT_STATUS_COLOR[tt.status])}>{TT_STATUS_LABEL[tt.status]}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>TT 합계: {formatUSD(totalUsd)}</span>
        <span>송금비율: {remitRatio.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export default function PODetailView({ po: initialPo, onBack, onReload, allPos = [] }: Props) {
  // 로컬 PO 미러 — 저장 후 서버 fresh로 갱신 (parent prop은 stale일 수 있음)
  const [po, setPo] = useState<PurchaseOrder>(initialPo);
  // 부모 selectedPO 변경 시(다른 PO 선택 등) 동기화
  useEffect(() => { setPo(initialPo); }, [initialPo]);

  const [editOpen, setEditOpen] = useState(false);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [editLine, setEditLine] = useState<POLineItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { data: lines, loading: linesLoading, reload: reloadLines } = usePOLines(po.po_id);
  const { data: lcs, loading: lcsLoading } = useLCList({ po_id: po.po_id });
  const { data: tts, loading: ttsLoading, reload: reloadTTs } = useTTList({ po_id: po.po_id });

  const [ttFormOpen, setTtFormOpen] = useState(false);
  const handleCreateTT = async (d: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/tts', { method: 'POST', body: JSON.stringify({ ...d, po_id: po.po_id }) });
    reloadTTs();
  };

  // 4단계 MW 진행률용 BL 데이터 — D-061 동일 패턴 (TODO: Rust 계산엔진 연동)
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
          const mw = (lineMap[bl.bl_id] ?? []).reduce((s, l) => s + (l.capacity_kw ?? 0) * (l.quantity ?? 0), 0) / 1000;
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

  // R1-5: PO 헤더 PUT + 발주품목 diff CRUD (UPDATE 기존 / INSERT 신규 / DELETE 제거)
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
  // PO 삭제 — 연결된 BL이 있으면 차단
  const handleDeletePO = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const linkedBls = await fetchWithAuth<{ bl_id: string }[]>(`/api/v1/bls?po_id=${po.po_id}`);
      if (Array.isArray(linkedBls) && linkedBls.length > 0) {
        setDeleteError(`이 PO에 연결된 입고(B/L)가 ${linkedBls.length}건 있어 삭제할 수 없습니다. 입고를 먼저 삭제하거나 PO 연결을 해제하세요.`);
        setDeleting(false);
        return;
      }
      await fetchWithAuth(`/api/v1/pos/${po.po_id}`, { method: 'DELETE' });
      setDeleteOpen(false);
      onBack();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '삭제에 실패했습니다');
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
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <h2 className="text-base font-semibold flex-1">PO {po.po_number || '—'}</h2>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PO_STATUS_COLOR[po.status])}>{PO_STATUS_LABEL[po.status]}</span>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-1 h-3.5 w-3.5" />수정</Button>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"
          onClick={() => { setDeleteError(''); setDeleteOpen(true); }}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />삭제
        </Button>
        {/* D-085: PO → 입고 데이터 전달 */}
        <Button size="sm" onClick={() => { window.location.href = `/inbound?po=${po.po_id}`; }}>
          입고 등록
        </Button>
      </div>

      {/* R1-8: 종합정보 / 입고품목 / LC현황 / 입고현황 — TT이력은 종합정보에 병합 */}
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">종합정보</TabsTrigger>
          <TabsTrigger value="lines">입고품목</TabsTrigger>
          <TabsTrigger value="deposit">계약금 현황</TabsTrigger>
          <TabsTrigger value="lc">LC현황</TabsTrigger>
          <TabsTrigger value="inbound">입고현황</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card><CardContent className="pt-4 pb-4 space-y-4">
            {/* 기본정보 필드 */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              <Field label="계약유형" value={CONTRACT_TYPE_LABEL[po.contract_type]} />
              <Field label="제조사" value={po.manufacturer_name} />
              <Field label="계약일" value={formatDate(po.contract_date ?? '')} />
              <Field label="Incoterms" value={po.incoterms} />
              <Field label="결제조건" value={po.payment_terms} />
              {po.total_qty != null && <Field label="총수량" value={formatNumber(po.total_qty).toString()} />}
              {po.total_mw != null && <Field label="총 MW" value={`${po.total_mw.toFixed(2)}MW`} />}
              {po.memo && <Field label="메모" value={po.memo} />}
              {po.parent_po_id && (() => {
                const parent = allPos.find((x) => x.po_id === po.parent_po_id);
                const label = parent?.po_number ?? po.parent_po_id.slice(0, 8);
                return (
                  <div className="col-span-full rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2">
                    <span className="text-[10px] font-medium text-amber-700">원계약</span>
                    <span className="text-xs font-mono text-amber-900">{label}</span>
                    {parent?.total_mw != null && (
                      <span className="text-[10px] text-amber-600">{parent.total_mw.toFixed(0)}MW · {parent.status}</span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* R1-8: T/T 납부현황 + LC 개설현황 요약 */}
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
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, ttPct)}%` }} />
                    </div>
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
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-green-600" style={{ width: `${Math.min(100, lcPct)}%` }} />
                    </div>
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
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div className={cn('h-full', color)} style={{ width: `${pctVal}%` }} />
                  </div>
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

            {/* F6: 입고품목 / LC / 입고 요약 (종합정보에 통합) */}
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
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="lines">
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setEditLine(null); setLineFormOpen(true); }}><Plus className="mr-1 h-3.5 w-3.5" />추가</Button>
            </div>
            {linesLoading ? <LoadingSpinner /> : <POLineTable items={lines} onEdit={(l) => { setEditLine(l); setLineFormOpen(true); }} />}
          </div>
        </TabsContent>

        <TabsContent value="deposit">
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setTtFormOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />계약금 등록</Button>
            </div>
            {ttsLoading ? <LoadingSpinner /> : <TTSubTable items={tts} poLines={lines} />}
          </div>
        </TabsContent>
        <TabsContent value="lc">{lcsLoading ? <LoadingSpinner /> : <LCSubTable items={lcs} />}</TabsContent>
        <TabsContent value="inbound"><POInboundProgress poId={po.po_id} poLines={lines} /></TabsContent>
      </Tabs>

      <LinkedMemoWidget linkedTable="purchase_orders" linkedId={po.po_id} />

      <POForm open={editOpen} onOpenChange={setEditOpen} onSubmit={handleUpdatePO} editData={po} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(v) => { if (!v) { setDeleteOpen(false); setDeleteError(''); } }}
        title="PO 삭제"
        description={deleteError || `PO "${po.po_number ?? po.po_id}"를 삭제하시겠습니까? 발주품목도 함께 제거됩니다.`}
        onConfirm={handleDeletePO}
        loading={deleting}
      />
      <POLineForm open={lineFormOpen} onOpenChange={setLineFormOpen} onSubmit={editLine ? handleUpdateLine : handleCreateLine} editData={editLine} poId={po.po_id} />
      <TTForm open={ttFormOpen} onOpenChange={setTtFormOpen} onSubmit={handleCreateTT} editData={null} defaultPoId={po.po_id} />
    </div>
  );
}
