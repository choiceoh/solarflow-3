import { useState, useEffect, Fragment, memo } from 'react';
import { Pencil, Trash2, CheckCircle2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { cn, formatDate, formatUSD, formatNumber, moduleLabel } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ProgressMiniBar from '@/components/common/ProgressMiniBar';
import StatusPill from '@/components/common/StatusPill';
import SortableTH from '@/components/common/SortableTH';
import { fetchWithAuth } from '@/lib/api';
import { useSort } from '@/hooks/useSort';
import { LC_STATUS_LABEL, LC_STATUS_COLOR, type LCRecord, type PurchaseOrder, type POLineItem } from '@/types/procurement';
import type { BLShipment } from '@/types/inbound';
import { BL_STATUS_LABEL, BL_STATUS_COLOR, INBOUND_TYPE_LABEL } from '@/types/inbound';

interface LCAgg {
  manufacturerName: string;
  firstSpecWp: number;       // moduleLabel 렌더링용
  firstCode: string;         // 모델코드 (JKM640N-...)
  extraCount: number;
  avgCentsPerWp: number;
  totalMw: number;
}

const COMPLETED_BL_STATUSES = new Set(['completed', 'erp_done']);

function formatMw(mw: number, digits = 2): string {
  if (!Number.isFinite(mw) || mw <= 0) return '0 MW';
  return `${mw.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} MW`;
}

function progressPercent(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (done / total) * 100));
}

function MaturityBadge({ date, now }: { date?: string; now: number }) {
  if (!date) return null;
  const diff = Math.ceil((new Date(date).getTime() - now) / 86400000);
  if (diff < 0) return <Badge variant="destructive" className="text-[10px]">만기초과</Badge>;
  if (diff <= 7) return <Badge variant="destructive" className="text-[10px]">만기임박</Badge>;
  return null;
}

interface Props {
  items: LCRecord[];
  onEdit: (lc: LCRecord) => void;
  onNew: () => void;
  onDelete?: (lcId: string) => Promise<void>;
  onSettle?: (lc: LCRecord, repaymentDate: string) => Promise<void>;
  onSelectBL?: (blId: string) => void;
  onNewBL?: (lc: LCRecord) => void;
  blsVersion?: number;
}

function LCListTable({ items, onEdit, onNew, onDelete, onSettle, onSelectBL, onNewBL, blsVersion }: Props) {
  // 렌더 중 Date.now() 호출은 react-hooks/purity 위반 → useState lazy init으로 1회만 캡처
  const [now] = useState(() => Date.now());
  const [agg, setAgg] = useState<Record<string, LCAgg>>({});
  const [deleteTarget, setDeleteTarget] = useState<LCRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settleTarget, setSettleTarget] = useState<LCRecord | null>(null);
  const [settleDate, setSettleDate] = useState('');
  const [settling, setSettling] = useState(false);

  // BL 드릴다운 상태
  const [expandedLCId, setExpandedLCId] = useState<string | null>(null);
  const [expandedBLs, setExpandedBLs] = useState<BLShipment[] | null>(null); // null = 로딩중
  const [blMwMap, setBlMwMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) { setAgg({}); return; }
    (async () => {
      try {
        // PO별로 중복 제거하여 한 번씩만 조회
        const poIds = [...new Set(items.map((lc) => lc.po_id).filter(Boolean))];
        const poData: Record<string, LCAgg> = {};

        await Promise.all(poIds.map(async (poId) => {
          try {
            const [po, lines] = await Promise.all([
              fetchWithAuth<PurchaseOrder>(`/api/v1/pos/${poId}`).catch(() => null as PurchaseOrder | null),
              fetchWithAuth<POLineItem[]>(`/api/v1/pos/${poId}/lines`).catch(() => [] as POLineItem[]),
            ]);
            const totalUsd = (lines ?? []).reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
            const totalWp = (lines ?? []).reduce((s, l) => s + (l.quantity ?? 0) * (l.products?.spec_wp ?? l.spec_wp ?? 0), 0);
            const avgCentsPerWp = totalWp > 0 ? (totalUsd / totalWp) * 100 : 0;
            const totalMw = totalWp / 1_000_000;
            const first = (lines ?? [])[0];
            const distinctProductCount = new Set((lines ?? []).map((l) => l.product_id).filter(Boolean)).size;
            poData[poId] = {
              manufacturerName: po?.manufacturer_name ?? '—',
              firstSpecWp: first?.products?.spec_wp ?? first?.spec_wp ?? 0,
              firstCode: first?.products?.product_code ?? first?.product_code ?? '—',
              extraCount: Math.max(0, distinctProductCount - 1),
              avgCentsPerWp,
              totalMw,
            };
          } catch { /* skip */ }
        }));

        if (!cancelled) {
          const result: Record<string, LCAgg> = {};
          items.forEach((lc) => {
            result[lc.lc_id] = poData[lc.po_id] ?? { manufacturerName: '—', firstSpecWp: 0, firstCode: '—', extraCount: 0, avgCentsPerWp: 0, totalMw: 0 };
          });
          setAgg(result);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((lc) => lc.lc_id).join(',')]);

  /* BL 드릴다운: 확장된 LC 변경 또는 버전 변경 시 재조회 */
  useEffect(() => {
    if (!expandedLCId) { setExpandedBLs(null); setBlMwMap({}); return; }
    let cancelled = false;
    setExpandedBLs(null); setBlMwMap({});
    fetchWithAuth<BLShipment[]>(`/api/v1/bls?lc_id=${expandedLCId}`)
      .then(async (bls) => {
        if (cancelled) return;
        setExpandedBLs(bls ?? []);
        const mwMap: Record<string, number> = {};
        await Promise.all((bls ?? []).map(async (bl) => {
          try {
            const lines = await fetchWithAuth<Array<{ capacity_kw?: number }>>(`/api/v1/bls/${bl.bl_id}/lines`);
            mwMap[bl.bl_id] = (lines ?? []).reduce((s, l) => s + (l.capacity_kw ?? 0), 0) / 1000;
          } catch { mwMap[bl.bl_id] = 0; }
        }));
        if (!cancelled) setBlMwMap(mwMap);
      })
      .catch(() => { if (!cancelled) setExpandedBLs([]); });
    return () => { cancelled = true; };
  // blsVersion은 외부에서 BL 생성 시 증가 → 재조회 트리거
  }, [expandedLCId, blsVersion]);

  const toggleExpand = (lc: LCRecord) => {
    setExpandedLCId(prev => prev === lc.lc_id ? null : lc.lc_id);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.lc_id);
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '취소 처리에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  const handleSettle = async () => {
    if (!settleTarget || !onSettle) return;
    setSettling(true);
    try {
      await onSettle(settleTarget, settleDate);
      setSettleTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '상환완료 처리에 실패했습니다');
    } finally {
      setSettling(false);
    }
  };

  const { sorted, headerProps } = useSort<LCRecord>(items, (lc, f) => {
    switch (f) {
      case 'lc_number': return lc.lc_number ?? '';
      case 'manufacturer': return agg[lc.lc_id]?.manufacturerName ?? '';
      case 'amount_usd': return lc.amount_usd ?? 0;
      case 'maturity_date': return lc.maturity_date ?? '';
      case 'status': return lc.status;
      default: return null;
    }
  });

  if (items.length === 0) return <EmptyState message="등록된 LC가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full min-w-[800px] text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <SortableTH {...headerProps('lc_number')} className="p-3 font-medium text-muted-foreground">LC 정보</SortableTH>
              <SortableTH {...headerProps('manufacturer')} className="p-3 font-medium text-muted-foreground">품목</SortableTH>
              <SortableTH {...headerProps('amount_usd')} align="right" className="p-3 font-medium">개설 내역</SortableTH>
              <SortableTH {...headerProps('maturity_date')} className="p-3 font-medium text-muted-foreground">만기 / 결제</SortableTH>
              <SortableTH {...headerProps('status')} align="center" className="p-3 font-medium text-muted-foreground w-[100px]">상태</SortableTH>
            </tr>
          </thead>
          <tbody>
            {sorted.map((lc) => {
              const a = agg[lc.lc_id];
              const lcTargetMw = lc.target_mw ?? (
                lc.target_qty != null && a?.firstSpecWp ? (lc.target_qty * a.firstSpecWp) / 1_000_000 : 0
              );
              const poOpenRate = a?.totalMw ? progressPercent(lcTargetMw, a.totalMw) : 0;
              const isRepaid = lc.repaid === true;
              const isExpanded = expandedLCId === lc.lc_id;
              return (
                <Fragment key={lc.lc_id}>
                  {/* LC 행 */}
                  <tr
                    key={lc.lc_id}
                    className={cn(
                      'border-t hover:bg-muted/20 transition-colors cursor-pointer',
                      isRepaid && 'opacity-60',
                      isExpanded && 'bg-muted/10',
                    )}
                    onClick={() => toggleExpand(lc)}
                  >
                    {/* LC 정보 */}
                    <td className="p-3 align-top">
                      <div className="flex items-start gap-1.5">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                        <div>
                          <div className="font-mono font-semibold">{lc.lc_number || '—'}</div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            PO: {lc.po_number || '—'}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {lc.company_name ?? '—'} · {lc.bank_name ?? '—'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 품목 */}
                    <td className="p-3 align-top min-w-[180px]">
                      {a ? (
                        <>
                          <div className="font-semibold text-[11px]">
                            {moduleLabel(a.manufacturerName, a.firstSpecWp)}
                            {a.extraCount > 0 && (
                              <span className="font-normal text-muted-foreground ml-1">외 {a.extraCount}건</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[200px]">
                            {a.firstCode}
                          </div>
                        </>
                      ) : <span className="text-muted-foreground">—</span>}
                      <div className="mt-1 flex items-center gap-2">
                        {a && a.totalMw > 0 && (
                          <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                            {a.totalMw.toFixed(2)} MW
                          </span>
                        )}
                        {a && a.avgCentsPerWp > 0 && (
                          <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                            {a.avgCentsPerWp.toFixed(2)} ¢/Wp
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 개설 내역 */}
                    <td className="p-3 text-right align-top min-w-[150px]">
                      <div className="font-semibold tabular-nums font-mono">{formatUSD(lc.amount_usd)}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDate(lc.open_date ?? '')} 개설
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                        <span className="font-medium text-foreground">{formatMw(lcTargetMw, 2)}</span>
                        {a?.totalMw ? <span className="ml-1">/ PO {formatMw(a.totalMw, 2)}</span> : null}
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <ProgressMiniBar percent={poOpenRate} colorClassName="bg-blue-500" className="h-1.5 w-20" />
                        <span className="text-[10px] text-muted-foreground tabular-nums">{poOpenRate.toFixed(1)}%</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                        {lc.target_qty != null ? formatNumber(lc.target_qty) + ' EA' : '—'}
                        {lc.usance_days != null ? ` · Usance ${lc.usance_days}일` : ''}
                      </div>
                    </td>

                    {/* 만기 / 결제 */}
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px]">{formatDate(lc.maturity_date ?? '')}</span>
                        {!isRepaid && <MaturityBadge date={lc.maturity_date} now={now} />}
                      </div>
                      {isRepaid && lc.repayment_date ? (
                        <div className="text-[10px] text-green-600 font-medium mt-0.5">
                          상환완료 {formatDate(lc.repayment_date)}
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          상환예정일 {formatDate(lc.maturity_date ?? '')}
                        </div>
                      )}
                    </td>

                    {/* 상태 + 액션 */}
                    <td className="p-3 text-center align-top" onClick={(e) => e.stopPropagation()}>
                      <StatusPill label={LC_STATUS_LABEL[lc.status]} colorClassName={LC_STATUS_COLOR[lc.status]} className="px-2" />
                      {isRepaid ? (
                        <div className="flex items-center justify-center gap-1 mt-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          <span className="text-[10px] text-green-600 font-medium">상환완료</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-0.5 mt-1.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(lc)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {onDelete && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget(lc)}>
                              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </Button>
                          )}
                          {onSettle && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-green-600"
                              title="상환완료 처리"
                              onClick={() => { setSettleTarget(lc); setSettleDate(lc.maturity_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)); }}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* BL 드릴다운 행 */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} className="p-0 border-t bg-muted/5">
                        <div className="px-4 py-3 border-l-4 border-blue-300 bg-blue-50/40 space-y-2">
                          {expandedBLs !== null && (() => {
                            const totalRegisteredMw = Object.values(blMwMap).reduce((s, v) => s + v, 0);
                            const completedMw = (expandedBLs ?? []).reduce((sum, bl) => (
                              COMPLETED_BL_STATUSES.has(bl.status) ? sum + (blMwMap[bl.bl_id] ?? 0) : sum
                            ), 0);
                            const completedRate = progressPercent(completedMw, lcTargetMw);
                            const registeredRate = progressPercent(totalRegisteredMw, lcTargetMw);
                            const remainingMw = Math.max(lcTargetMw - completedMw, 0);
                            return (
                              <div className="rounded-md border border-blue-100 bg-background/80 px-3 py-2">
                                <div className="grid gap-3 text-[11px] md:grid-cols-4">
                                  <div>
                                    <div className="text-muted-foreground">LC 개설</div>
                                    <div className="font-semibold tabular-nums">{formatMw(lcTargetMw, 2)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">B/L 등록</div>
                                    <div className="font-semibold tabular-nums text-blue-700">{formatMw(totalRegisteredMw, 2)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">입고완료</div>
                                    <div className="font-semibold tabular-nums text-green-700">{formatMw(completedMw, 2)}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">입고 잔량</div>
                                    <div className="font-semibold tabular-nums text-orange-700">{formatMw(remainingMw, 2)}</div>
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  <div className="relative h-2 flex-1">
                                    <ProgressMiniBar percent={registeredRate} colorClassName="bg-blue-300" className="absolute inset-0" />
                                    <ProgressMiniBar percent={completedRate} colorClassName="bg-green-500" trackClassName="bg-transparent" className="absolute inset-0" />
                                  </div>
                                  <span className="w-16 text-right text-[10px] text-muted-foreground tabular-nums">
                                    {completedRate.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {/* 헤더 */}
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-blue-700">
                              입고 B/L
                              {expandedBLs !== null && (
                                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                                  {expandedBLs.length}건
                                  {expandedBLs.length > 0 && (() => {
                                    const totalMw = Object.values(blMwMap).reduce((s, v) => s + v, 0);
                                    const completedMw = (expandedBLs ?? []).reduce((sum, bl) => (
                                      COMPLETED_BL_STATUSES.has(bl.status) ? sum + (blMwMap[bl.bl_id] ?? 0) : sum
                                    ), 0);
                                    return totalMw > 0
                                      ? ` · 등록 ${formatMw(totalMw, 3)} · 완료 ${formatMw(completedMw, 3)}`
                                      : '';
                                  })()}
                                </span>
                              )}
                            </span>
                            {onNewBL && (
                              <Button
                                size="sm" variant="ghost"
                                className="h-6 text-[11px] px-2 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={(e) => { e.stopPropagation(); onNewBL(lc); }}
                              >
                                <Plus className="h-3 w-3" />입고 등록
                              </Button>
                            )}
                          </div>

                          {/* BL 목록 */}
                          {expandedBLs === null ? (
                            <p className="text-xs text-muted-foreground py-1">로딩 중…</p>
                          ) : expandedBLs.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-1">등록된 입고(B/L)가 없습니다.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-blue-200">
                                  <th className="pb-1 text-left font-medium text-muted-foreground">B/L 번호</th>
                                  <th className="pb-1 text-left font-medium text-muted-foreground">구분</th>
                                  <th className="pb-1 text-left font-medium text-muted-foreground">모듈 / 규격(W)</th>
                                  <th className="pb-1 text-left font-medium text-muted-foreground">입항일</th>
                                  <th className="pb-1 text-left font-medium text-muted-foreground">창고</th>
                                  <th className="pb-1 text-center font-medium text-muted-foreground w-20">상태</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedBLs.map((bl) => {
                                  const a = agg[lc.lc_id];
                                  const mLabel = a ? moduleLabel(a.manufacturerName, a.firstSpecWp) : '—';
                                  const blMw = blMwMap[bl.bl_id];
                                  return (
                                  <tr
                                    key={bl.bl_id}
                                    className="border-t border-blue-100 hover:bg-blue-100/50 cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); onSelectBL?.(bl.bl_id); }}
                                  >
                                    <td className="py-1.5 font-mono font-medium">{bl.bl_number}</td>
                                    <td className="py-1.5 text-muted-foreground">{INBOUND_TYPE_LABEL[bl.inbound_type] ?? bl.inbound_type}</td>
                                    <td className="py-1.5">
                                      <div className="text-[10px] font-medium">{mLabel}</div>
                                      <div className="text-[10px] text-muted-foreground font-mono">
                                        {blMw != null ? `${blMw.toFixed(3)} MW` : '—'}
                                      </div>
                                    </td>
                                    <td className="py-1.5 text-muted-foreground">{formatDate(bl.actual_arrival ?? '') || '—'}</td>
                                    <td className="py-1.5 text-muted-foreground">{bl.warehouse_name ?? '—'}</td>
                                    <td className="py-1.5 text-center">
                                      <StatusPill label={BL_STATUS_LABEL[bl.status]} colorClassName={BL_STATUS_COLOR[bl.status]} className="px-2" />
                                    </td>
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="LC 취소 처리"
        description={deleteTarget ? `LC "${deleteTarget.lc_number ?? ''}"를 취소 처리하시겠습니까? 연결 이력은 삭제되지 않습니다.` : ''}
        onConfirm={handleDelete}
        loading={deleting}
      />
      <Dialog open={!!settleTarget} onOpenChange={(v) => { if (!v) setSettleTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>상환완료 처리</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              LC <span className="font-medium text-foreground">{settleTarget?.lc_number ?? ''}</span>를 상환완료 처리합니다.
              상환완료 후 은행 한도 계산에서 제외됩니다.
            </p>
            <div className="space-y-1.5">
              <Label>상환일</Label>
              <DateInput value={settleDate} onChange={setSettleDate} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleTarget(null)}>취소</Button>
            <Button onClick={handleSettle} disabled={settling || !settleDate}>
              {settling ? '처리 중…' : '상환완료'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default memo(LCListTable);
