import { useState, useEffect, Fragment } from 'react';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/api';
import { formatUSD, formatDate } from '@/lib/utils';
import type { PurchaseOrder, TTRemittance, POLineItem } from '@/types/procurement';
import DepositPaymentForm from './DepositPaymentForm';

/* ── 계약금 텍스트 파싱 ── */
export interface DepositInfo {
  hasDeposit: boolean;
  depositPercent: number;
  depositAmountUsd: number;  // payment_terms에 이미 계산된 값
  plannedSplits: number;
}
export function parseDeposit(text?: string): DepositInfo {
  if (!text) return { hasDeposit: false, depositPercent: 0, depositAmountUsd: 0, plannedSplits: 0 };
  // "계약금 5% T/T 2,987,501" 패턴
  const m = text.match(/계약금\s*([\d.]+)%?\s*(?:T\/T|L\/C)\s*([\d,]+)/i);
  const splitM = text.match(/분할\s*(\d+)회/);
  if (!m) return { hasDeposit: false, depositPercent: 0, depositAmountUsd: 0, plannedSplits: 0 };
  return {
    hasDeposit: true,
    depositPercent: parseFloat(m[1]),
    depositAmountUsd: parseFloat(m[2].replace(/,/g, '')),
    plannedSplits: splitM ? parseInt(splitM[1]) : 0,
  };
}

/* ── 라인 요약 ── */
interface LineSummary {
  products: string;
  specs: string;
  avgCentsPerWp: number;
  totalMw: number;
  totalUsd: number;
}
function summarizeLines(lines: POLineItem[]): LineSummary {
  if (lines.length === 0) return { products: '—', specs: '—', avgCentsPerWp: 0, totalMw: 0, totalUsd: 0 };
  const names = [...new Set(lines.map((l) => {
    const p = l.products;
    if (p?.product_code) return p.product_code.split('|')[0]?.trim() ?? p.product_name ?? '—';
    return l.product_name ?? '—';
  }))];
  const specs = [...new Set(lines.map((l) => {
    const wp = l.products?.spec_wp ?? l.spec_wp;
    return wp ? `${wp}Wp` : '—';
  }))];
  const totalUsd = lines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
  const totalWp = lines.reduce((s, l) => {
    const wp = (l.products?.spec_wp ?? l.spec_wp ?? 0) / 1000; // Wp → kW
    return s + (l.quantity ?? 0) * wp;
  }, 0);
  const avgCents = totalWp > 0 ? (totalUsd / totalWp / 10) : 0; // USD/kWp → ¢/Wp
  const totalMw = totalWp / 1000;
  return { products: names.join(', '), specs: specs.join(', '), avgCentsPerWp: avgCents, totalMw, totalUsd };
}

/* ── Props ── */
export interface DepositStatusPanelProps {
  pos: PurchaseOrder[];
  tts: TTRemittance[];
  onPaymentCreated: (poId: string) => void;
}

/* ── 메인 컴포넌트 ── */
export default function DepositStatusPanel({ pos, tts, onPaymentCreated }: DepositStatusPanelProps) {
  // 계약금 있는 PO만 필터
  const depositPOs = pos.filter((p) => parseDeposit(p.payment_terms).hasDeposit);

  // PO별 lines 로딩 (마운트 시 병렬)
  const [linesMap, setLinesMap] = useState<Record<string, POLineItem[]>>({});
  const [linesLoading, setLinesLoading] = useState(false);

  const depositPOKey = depositPOs.map((p) => p.po_id).join(',');
  useEffect(() => {
    if (depositPOs.length === 0) return;
    setLinesLoading(true);
    Promise.all(
      depositPOs.map((p) =>
        fetchWithAuth<POLineItem[]>(`/api/v1/pos/${p.po_id}/lines`)
          .then((lines) => [p.po_id, lines] as const)
          .catch(() => [p.po_id, [] as POLineItem[]] as const)
      )
    ).then((results) => {
      setLinesMap(Object.fromEntries(results));
      setLinesLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositPOKey]);

  // 지급 등록 폼 상태
  const [payFormPo, setPayFormPo] = useState<PurchaseOrder | null>(null);

  // 행 펼침 상태 (지급 이력)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (poId: string) =>
    setExpanded((prev) => { const s = new Set(prev); s.has(poId) ? s.delete(poId) : s.add(poId); return s; });

  if (depositPOs.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        계약금 있는 PO가 없습니다 — PO 등록 시 결제조건에서 <strong>계약금 있음</strong>을 선택하세요
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 w-6"></th>
              <th className="px-3 py-2 whitespace-nowrap">PO번호</th>
              <th className="px-3 py-2 whitespace-nowrap">제조사</th>
              <th className="px-3 py-2 whitespace-nowrap">품목/규격</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">단가(¢/Wp)</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">용량(MW)</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">계약금%</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">계약금 총액</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">기지급</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">잔여</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">지급률</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">차수</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {depositPOs.map((po) => {
              const dep = parseDeposit(po.payment_terms);
              const lines = linesMap[po.po_id] ?? [];
              const summary = summarizeLines(lines);
              const totalMw = summary.totalMw > 0 ? summary.totalMw : (po.total_mw ?? 0);

              // TT 집계 (이 PO의 완료 송금만)
              const poTts = tts.filter((t) => t.po_id === po.po_id);
              const completedTts = poTts.filter((t) => t.status === 'completed');
              const paidUsd = completedTts.reduce((s, t) => s + (t.amount_usd ?? 0), 0);
              const remainingUsd = Math.max(0, dep.depositAmountUsd - paidUsd);
              const paidRate = dep.depositAmountUsd > 0 ? (paidUsd / dep.depositAmountUsd) * 100 : 0;
              const isFullyPaid = paidUsd >= dep.depositAmountUsd;
              const rateColor = isFullyPaid ? 'text-green-600 font-bold'
                : paidRate >= 50 ? 'text-blue-600'
                : 'text-orange-500';

              return (
                <Fragment key={po.po_id}>
                  <tr
                    className="border-t hover:bg-muted/20 cursor-pointer"
                    onClick={() => poTts.length > 0 && toggleExpand(po.po_id)}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {poTts.length > 0
                        ? (expanded.has(po.po_id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)
                        : null}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{po.po_number ?? po.po_id.slice(0, 8)}</td>
                    <td className="px-3 py-2.5">{po.manufacturer_name ?? '—'}</td>
                    <td className="px-3 py-2.5 max-w-[160px]">
                      {linesLoading ? (
                        <span className="text-muted-foreground">로딩중…</span>
                      ) : (
                        <div>
                          <div className="truncate">{summary.products}</div>
                          <div className="text-muted-foreground truncate">{summary.specs}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {linesLoading ? '—' : summary.avgCentsPerWp > 0 ? summary.avgCentsPerWp.toFixed(3) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {totalMw > 0 ? `${totalMw.toFixed(3)}MW` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-blue-700">
                      {dep.depositPercent}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">
                      {formatUSD(dep.depositAmountUsd)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-orange-600">
                      {formatUSD(paidUsd)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${isFullyPaid ? 'text-green-600' : 'text-red-600'}`}>
                      {formatUSD(remainingUsd)}
                    </td>
                    {/* 지급률 바 */}
                    <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isFullyPaid ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(100, paidRate).toFixed(0)}%` }}
                          />
                        </div>
                        <span className={`text-[10px] ${rateColor}`}>{paidRate.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {completedTts.length > 0 ? (
                        <span className="bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 text-[10px]">
                          {completedTts.length}차 완료
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">미납</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {!isFullyPaid ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2 whitespace-nowrap"
                          onClick={() => setPayFormPo(po)}
                        >
                          <Plus className="h-3 w-3 mr-0.5" />
                          지급 등록
                        </Button>
                      ) : (
                        <span className="text-[10px] bg-green-50 text-green-700 rounded px-1.5 py-0.5">납부완료</span>
                      )}
                    </td>
                  </tr>

                  {/* 지급 이력 펼침 행 */}
                  {expanded.has(po.po_id) && poTts.length > 0 && (
                    <tr className="bg-blue-50/40">
                      <td colSpan={13} className="px-8 py-2">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">지급 이력</p>
                          {poTts
                            .sort((a, b) => (a.remit_date ?? '').localeCompare(b.remit_date ?? ''))
                            .map((t, i) => (
                              <div key={t.tt_id} className="flex items-center gap-4 text-[11px]">
                                <span className="w-10 text-muted-foreground">{i + 1}차</span>
                                <span className="w-28 font-mono font-semibold">{formatUSD(t.amount_usd)}</span>
                                <span className="text-muted-foreground w-24">{t.remit_date ? formatDate(t.remit_date) : '날짜 미정'}</span>
                                {t.purpose && <span className="text-blue-600">{t.purpose}</span>}
                                <span className={`text-[10px] rounded px-1.5 py-0.5 ${t.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {t.status === 'completed' ? '완료' : '예정'}
                                </span>
                                {t.amount_krw != null && (
                                  <span className="text-muted-foreground">₩{t.amount_krw.toLocaleString('ko-KR')}</span>
                                )}
                              </div>
                            ))}
                          <div className="flex items-center gap-4 text-[11px] border-t pt-1.5 mt-1 font-semibold">
                            <span className="w-10">소계</span>
                            <span className="w-28 font-mono text-orange-600">{formatUSD(paidUsd)}</span>
                            <span className="text-muted-foreground">/ 총 계약금 {formatUSD(dep.depositAmountUsd)}</span>
                            <span className={isFullyPaid ? 'text-green-600' : 'text-red-600'}>
                              (잔여 {formatUSD(remainingUsd)})
                            </span>
                          </div>
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

      {/* 지급 등록 폼 */}
      {payFormPo && (() => {
        const dep = parseDeposit(payFormPo.payment_terms);
        const poTts = tts.filter((t) => t.po_id === payFormPo.po_id);
        const paidUsd = poTts.filter((t) => t.status === 'completed').reduce((s, t) => s + t.amount_usd, 0);
        return (
          <DepositPaymentForm
            open={!!payFormPo}
            po={payFormPo}
            depositInfo={dep}
            paidUsd={paidUsd}
            nextInstallment={poTts.length + 1}
            onOpenChange={(open) => { if (!open) setPayFormPo(null); }}
            onSubmit={async (data) => {
              await fetchWithAuth('/api/v1/tts', { method: 'POST', body: JSON.stringify(data) });
              setPayFormPo(null);
              onPaymentCreated(payFormPo.po_id);
            }}
          />
        );
      })()}
    </div>
  );
}
