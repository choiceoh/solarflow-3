import { useState, useEffect, Fragment } from 'react';
import { Pencil, Trash2, CheckCircle2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate, formatUSD, formatNumber, moduleLabel } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { fetchWithAuth } from '@/lib/api';
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

function MaturityBadge({ date }: { date?: string }) {
  if (!date) return null;
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (diff < 0) return <Badge variant="destructive" className="text-[10px]">만기초과</Badge>;
  if (diff <= 7) return <Badge variant="destructive" className="text-[10px]">만기임박</Badge>;
  return null;
}

interface Props {
  items: LCRecord[];
  onEdit: (lc: LCRecord) => void;
  onNew: () => void;
  onDelete?: (lcId: string) => Promise<void>;
  onSettle?: (lc: LCRecord) => Promise<void>;
  onSelectBL?: (blId: string) => void;
  onNewBL?: (lc: LCRecord) => void;
  blsVersion?: number; // ProcurementPage에서 BL 생성 시 증가 → 현재 펼쳐진 BL 목록 재로드
}

export default function LCListTable({ items, onEdit, onNew, onDelete, onSettle, onSelectBL, onNewBL, blsVersion }: Props) {
  const [agg, setAgg] = useState<Record<string, LCAgg>>({});
  const [deleteTarget, setDeleteTarget] = useState<LCRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settleTarget, setSettleTarget] = useState<LCRecord | null>(null);
  const [settling, setSettling] = useState(false);

  // BL 드릴다운 상태
  const [expandedLCId, setExpandedLCId] = useState<string | null>(null);
  const [expandedBLs, setExpandedBLs] = useState<BLShipment[] | null>(null); // null = 로딩중

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
    if (!expandedLCId) { setExpandedBLs(null); return; }
    let cancelled = false;
    setExpandedBLs(null); // 로딩
    fetchWithAuth<BLShipment[]>(`/api/v1/bls?lc_id=${expandedLCId}`)
      .then((bls) => { if (!cancelled) setExpandedBLs(bls ?? []); })
      .catch(() => { if (!cancelled) setExpandedBLs([]); });
    return () => { cancelled = true; };
  // blsVersion은 외부에서 BL 생성 시 증가 → 재조회 트리거
  }, [expandedLCId, blsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

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
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  const handleSettle = async () => {
    if (!settleTarget || !onSettle) return;
    setSettling(true);
    try {
      await onSettle(settleTarget);
      setSettleTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '상환완료 처리에 실패했습니다');
    } finally {
      setSettling(false);
    }
  };

  if (items.length === 0) return <EmptyState message="등록된 LC가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="p-3 text-left font-medium text-muted-foreground">LC 정보</th>
              <th className="p-3 text-left font-medium text-muted-foreground">품목</th>
              <th className="p-3 text-right font-medium">개설 내역</th>
              <th className="p-3 text-left font-medium text-muted-foreground">만기 / 결제</th>
              <th className="p-3 text-center font-medium text-muted-foreground w-[100px]">상태</th>
            </tr>
          </thead>
          <tbody>
            {items.map((lc) => {
              const a = agg[lc.lc_id];
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
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {lc.target_qty != null ? formatNumber(lc.target_qty) + ' EA' : '—'}
                        {lc.usance_days != null ? ` · Usance ${lc.usance_days}일` : ''}
                      </div>
                    </td>

                    {/* 만기 / 결제 */}
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px]">{formatDate(lc.maturity_date ?? '')}</span>
                        {!isRepaid && <MaturityBadge date={lc.maturity_date} />}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {lc.settlement_date ? `결제 ${formatDate(lc.settlement_date)}` : '결제일 미정'}
                      </div>
                      {isRepaid && lc.repayment_date && (
                        <div className="text-[10px] text-green-600 font-medium mt-0.5">
                          상환 {formatDate(lc.repayment_date)}
                        </div>
                      )}
                    </td>

                    {/* 상태 + 액션 */}
                    <td className="p-3 text-center align-top" onClick={(e) => e.stopPropagation()}>
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', LC_STATUS_COLOR[lc.status])}>
                        {LC_STATUS_LABEL[lc.status]}
                      </span>
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
                              onClick={() => setSettleTarget(lc)}
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
                          {/* 헤더 */}
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-blue-700">
                              입고 B/L{expandedBLs !== null ? ` (${expandedBLs.length}건)` : ''}
                            </span>
                            {onNewBL && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                                onClick={(e) => { e.stopPropagation(); onNewBL(lc); }}
                              >
                                <Plus className="h-3 w-3 mr-1" />입고 등록
                              </Button>
                            )}
                          </div>

                          {/* BL 목록 */}
                          {expandedBLs === null ? (
                            <p className="text-xs text-muted-foreground py-1">로딩 중…</p>
                          ) : expandedBLs.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-1">
                              등록된 입고(B/L)가 없습니다.
                              {onNewBL && <span className="ml-1">위 [입고 등록] 버튼으로 추가하세요.</span>}
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-blue-200">
                                  <th className="pb-1 text-left font-medium text-muted-foreground">B/L 번호</th>
                                  <th className="pb-1 text-left font-medium text-muted-foreground">구분</th>
                                  <th className="pb-1 text-left font-medium text-muted-foreground">입항일</th>
                                  <th className="pb-1 text-left font-medium text-muted-foreground">창고</th>
                                  <th className="pb-1 text-center font-medium text-muted-foreground w-20">상태</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedBLs.map((bl) => (
                                  <tr
                                    key={bl.bl_id}
                                    className="border-t border-blue-100 hover:bg-blue-100/50 cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); onSelectBL?.(bl.bl_id); }}
                                  >
                                    <td className="py-1.5 font-mono font-medium">{bl.bl_number}</td>
                                    <td className="py-1.5 text-muted-foreground">{INBOUND_TYPE_LABEL[bl.inbound_type] ?? bl.inbound_type}</td>
                                    <td className="py-1.5 text-muted-foreground">{formatDate(bl.actual_arrival ?? '') || '—'}</td>
                                    <td className="py-1.5 text-muted-foreground">{bl.warehouse_name ?? '—'}</td>
                                    <td className="py-1.5 text-center">
                                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', BL_STATUS_COLOR[bl.status])}>
                                        {BL_STATUS_LABEL[bl.status]}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
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
        title="LC 삭제"
        description={deleteTarget ? `LC "${deleteTarget.lc_number ?? ''}"를 삭제하시겠습니까?` : ''}
        onConfirm={handleDelete}
        loading={deleting}
      />
      <ConfirmDialog
        open={!!settleTarget}
        onOpenChange={(v) => { if (!v) setSettleTarget(null); }}
        title="상환완료 처리"
        description={settleTarget ? `LC "${settleTarget.lc_number ?? ''}"를 상환완료로 처리하시겠습니까? 오늘 날짜로 상환일이 기록되며 한도 계산에서 제외됩니다.` : ''}
        onConfirm={handleSettle}
        loading={settling}
      />
    </>
  );
}
