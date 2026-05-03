import { useState, useEffect, Fragment } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { formatUSD, formatDate, shortMfgName } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import type { PurchaseOrder, TTRemittance, POLineItem } from '@/types/procurement';
import { parseDeposit } from './depositStatus';

/* ─────────────────────────────────────────────
   PO 체인 탐색
   leaf PO → parent → grandparent 순으로 배열 반환
   [grandparent, parent, leaf]
   ───────────────────────────────────────────── */
function buildChain(po: PurchaseOrder, allPos: PurchaseOrder[]): PurchaseOrder[] {
  const chain: PurchaseOrder[] = [];
  let cur: PurchaseOrder | undefined = po;
  const visited = new Set<string>();
  while (cur && !visited.has(cur.po_id)) {
    visited.add(cur.po_id);
    chain.unshift(cur);
    const parentId: string | undefined = cur.parent_po_id;
    cur = parentId ? allPos.find(p => p.po_id === parentId) : undefined;
  }
  return chain; // [가장 오래된 PO, ..., 현재 PO]
}

/* ─────────────────────────────────────────────
   라인 요약
   ───────────────────────────────────────────── */
interface LineSummary { products: string; specs: string; avgCentsPerWp: number; totalMw: number; totalUsd: number; }
function summarizeLines(lines: POLineItem[]): LineSummary {
  if (lines.length === 0) return { products: '—', specs: '—', avgCentsPerWp: 0, totalMw: 0, totalUsd: 0 };
  const names = [...new Set(lines.map(l => l.products?.product_code?.split('|')[0]?.trim() ?? l.product_name ?? '—'))];
  const specs = [...new Set(lines.map(l => { const wp = l.products?.spec_wp ?? l.spec_wp; return wp ? `${wp}Wp` : '—'; }))];
  const totalUsd = lines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
  const totalWp  = lines.reduce((s, l) => s + (l.quantity ?? 0) * ((l.products?.spec_wp ?? l.spec_wp ?? 0) / 1000), 0);
  return {
    products: names.join(', '),
    specs: specs.join(', '),
    avgCentsPerWp: totalWp > 0 ? (totalUsd / totalWp / 10) : 0,
    totalMw: totalWp / 1000,
    totalUsd,
  };
}

/* ─────────────────────────────────────────────
   진행률 바
   ───────────────────────────────────────────── */
function ProgressBar({ pct, done }: { pct: number; done: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${Math.min(100, pct).toFixed(0)}%` }}
        />
      </div>
      <span className={`text-[10px] tabular-nums font-medium ${
        done ? 'text-green-600' : pct >= 70 ? 'text-blue-600' : 'text-orange-500'
      }`}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   T/T 행 (펼침 내부 테이블용)
   ───────────────────────────────────────────── */
function TTRow({ idx, tt }: {
  idx: number;
  tt: TTRemittance;
}) {
  const isDone = tt.status === 'completed';
  const krw = tt.amount_krw ?? (tt.exchange_rate ? tt.amount_usd * tt.exchange_rate : null);
  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="px-3 py-2 text-muted-foreground text-center">{idx}</td>
      <td className="px-3 py-2">{tt.purpose || '—'}</td>
      <td className="px-3 py-2 text-right font-mono font-semibold">{formatUSD(tt.amount_usd)}</td>
      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
        {krw != null ? `₩${Math.round(krw).toLocaleString('ko-KR')}` : '—'}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {tt.remit_date ? formatDate(tt.remit_date) : '날짜 미정'}
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap ${
          isDone ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {isDone ? '완료' : '예정'}
        </span>
      </td>
      <td className="px-3 py-2" />
    </tr>
  );
}

/* ─────────────────────────────────────────────
   Props
   ───────────────────────────────────────────── */
export interface DepositStatusPanelProps {
  pos: PurchaseOrder[];          // 전체 PO 목록 (completed 포함)
  tts: TTRemittance[];           // 전체 T/T 목록
}

/* ─────────────────────────────────────────────
   메인 컴포넌트
   ───────────────────────────────────────────── */
export default function DepositStatusPanel({ pos, tts }: DepositStatusPanelProps) {
  const companies = useAppStore((s) => s.companies);
  const companyMap = Object.fromEntries(companies.map((c) => [c.company_id, c.company_name]));

  /* ① 계약금 있는 PO만 */
  const depositPOs = pos.filter(p => parseDeposit(p.payment_terms).hasDeposit);

  /* ② 다른 PO에 의해 승계된(parent인) PO ID 집합
       → 이 PO들은 별도 행으로 표시하지 않고, 자식 행 안에 흡수 */
  const supersededIds = new Set(
    depositPOs.map(p => p.parent_po_id).filter((id): id is string => !!id)
  );

  /* ③ 화면에 표시할 "최신(leaf)" PO만 */
  const leafPOs = depositPOs.filter(p => !supersededIds.has(p.po_id));

  /* ④ PO별 lines 로딩 (leaf만) */
  const [linesMap, setLinesMap] = useState<Record<string, POLineItem[]>>({});
  const leafKey = leafPOs.map(p => p.po_id).join(',');
  useEffect(() => {
    if (leafPOs.length === 0) return;
    Promise.all(
      leafPOs.map(p =>
        fetchWithAuth<POLineItem[]>(`/api/v1/pos/${p.po_id}/lines`)
          .then(lines => [p.po_id, lines] as const)
          .catch(() => [p.po_id, [] as POLineItem[]] as const)
      )
    ).then(results => setLinesMap(Object.fromEntries(results)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafKey]);

  /* 행 펼침 상태 */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  if (leafPOs.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        계약금 있는 PO가 없습니다 — PO 등록 시 결제조건에서 <strong>계약금 있음</strong>을 선택하세요
      </div>
    );
  }

  const depositTotals = leafPOs.reduce((acc, po) => {
    const chain = buildChain(po, pos);
    const chainPoIds = new Set(chain.map(c => c.po_id));
    const chainTTs = tts.filter(t => chainPoIds.has(t.po_id));
    const paidUsd = chainTTs.filter(t => t.status === 'completed').reduce((s, t) => s + t.amount_usd, 0);
    const plannedUsd = chainTTs.filter(t => t.status === 'planned').reduce((s, t) => s + t.amount_usd, 0);
    const totalUsd = parseDeposit(po.payment_terms).depositAmountUsd;
    const remainUsd = Math.max(0, totalUsd - paidUsd);
    return {
      totalUsd: acc.totalUsd + totalUsd,
      paidUsd: acc.paidUsd + paidUsd,
      plannedUsd: acc.plannedUsd + plannedUsd,
      remainUsd: acc.remainUsd + remainUsd,
    };
  }, { totalUsd: 0, paidUsd: 0, plannedUsd: 0, remainUsd: 0 });

  return (
    <div className="space-y-0">
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="p-3 w-6" />
              <th className="p-3 text-left font-medium text-muted-foreground">발주 정보</th>
              <th className="p-3 text-left font-medium text-muted-foreground">품목</th>
              <th className="p-3 text-right font-medium">계약금 현황</th>
              <th className="p-3 text-center font-medium text-muted-foreground w-[90px]">진행률</th>
              <th className="p-3 text-center font-medium text-muted-foreground w-[100px]" />
            </tr>
          </thead>
          <tbody>
            {leafPOs.map(po => {
              /* ── 이 PO의 체인 전체 ── */
              const chain       = buildChain(po, pos);
              const hasChain    = chain.length > 1;
              const chainPoIds  = new Set(chain.map(c => c.po_id));

              /* ── 체인 전체 T/T ── */
              const chainTTs    = tts.filter(t => chainPoIds.has(t.po_id));
              const doneTTs     = chainTTs.filter(t => t.status === 'completed');
              const plannedTTs  = chainTTs.filter(t => t.status === 'planned');
              const paidUsd     = doneTTs.reduce((s, t) => s + t.amount_usd, 0);
              const plannedUsd  = plannedTTs.reduce((s, t) => s + t.amount_usd, 0);

              /* ── 계약금 총액은 현재(leaf) PO 기준 ── */
              const dep         = parseDeposit(po.payment_terms);
              const totalUsd    = dep.depositAmountUsd;
              const remainUsd   = Math.max(0, totalUsd - paidUsd);
              const paidPct     = totalUsd > 0 ? (paidUsd / totalUsd) * 100 : 0;
              const isDone      = paidUsd >= totalUsd - 0.01;

              /* ── 품목 요약 (현재 PO 기준) ── */
              const summary     = summarizeLines(linesMap[po.po_id] ?? []);
              const totalMw     = summary.totalMw > 0 ? summary.totalMw : (po.total_mw ?? 0);

              const isExpanded  = expanded.has(po.po_id);

              return (
                <Fragment key={po.po_id}>
                  {/* ── 메인 행 ── */}
                  <tr
                    className="border-t transition-colors hover:bg-muted/20 cursor-pointer"
                    onClick={() => toggle(po.po_id)}
                    title="클릭하여 펼치기 / 닫기"
                  >
                    {/* 펼침 토글 */}
                    <td className="p-3 text-muted-foreground">
                      {isExpanded
                        ? <ChevronDown className="h-3 w-3" />
                        : <ChevronRight className="h-3 w-3" />}
                    </td>

                    {/* 발주 정보 */}
                    <td className="p-3 align-top">
                      {companyMap[po.company_id] && (
                        <div className="text-[10px] text-muted-foreground mb-0.5">{companyMap[po.company_id]}</div>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-semibold">
                          {po.po_number ?? po.po_id.slice(0, 8)}
                        </span>
                        {hasChain && (
                          <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[9px] font-medium whitespace-nowrap">
                            변경계약
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {shortMfgName(po.manufacturer_name) ?? '—'}
                      </div>
                      <div className="text-[10px] text-blue-600 mt-0.5">
                        계약금 {dep.depositPercent}%
                        {dep.plannedSplits > 0 ? ` · 분할 ${dep.plannedSplits}회` : ''}
                      </div>
                      {/* 승계 체인 표시 */}
                      {hasChain && (
                        <div className="mt-1 space-y-0.5">
                          {chain.slice(0, -1).map(ancestor => (
                            <div key={ancestor.po_id} className="text-[10px] text-muted-foreground">
                              ↑ 원계약 {ancestor.po_number ?? ancestor.po_id.slice(0, 8)}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* 품목 */}
                    <td className="p-3 align-top min-w-[160px]">
                      <div className="font-medium truncate max-w-[180px]">{summary.products}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{summary.specs}</div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {totalMw > 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                            {totalMw.toFixed(2)} MW
                          </span>
                        )}
                        {summary.avgCentsPerWp > 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                            {summary.avgCentsPerWp.toFixed(3)} ¢/Wp
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 계약금 현황 */}
                    <td className="p-3 text-right align-top min-w-[190px]">
                      {/* 총액 */}
                      <div className="font-semibold tabular-nums font-mono">
                        {formatUSD(totalUsd)}
                        <span className="ml-1 text-[10px] text-muted-foreground font-normal font-sans">
                          ({dep.depositPercent}%)
                        </span>
                      </div>

                      <div className="mt-1.5 space-y-0.5">
                        {/* 기지급 완료 */}
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[10px] text-muted-foreground">기지급</span>
                          <span className={`text-[11px] tabular-nums font-mono font-semibold ${
                            isDone ? 'text-green-600' : 'text-orange-600'
                          }`}>
                            {formatUSD(paidUsd)}
                          </span>
                          {isDone && <span className="text-green-600 text-[10px]">✓</span>}
                        </div>

                        {/* 잔여 */}
                        {!isDone && remainUsd > 0 && (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-red-500">잔여</span>
                            <span className="text-[11px] tabular-nums font-mono font-semibold text-red-600">
                              {formatUSD(remainUsd)}
                            </span>
                          </div>
                        )}

                        {/* 예정 */}
                        {plannedUsd > 0 && (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-muted-foreground">지급예정</span>
                            <span className="text-[11px] tabular-nums font-mono text-yellow-600">
                              {formatUSD(plannedUsd)}
                            </span>
                          </div>
                        )}

                        {/* 미등록 잔여 */}
                        {!isDone && remainUsd > plannedUsd + 0.01 && (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-muted-foreground">미등록</span>
                            <span className="text-[11px] tabular-nums font-mono text-muted-foreground">
                              {formatUSD(remainUsd - plannedUsd)}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 진행률 */}
                    <td className="p-3 text-center align-top" onClick={e => e.stopPropagation()}>
                      <ProgressBar pct={paidPct} done={isDone} />
                      {doneTTs.length > 0 && (
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {doneTTs.length}건 완료
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-center align-top">
                      {isDone && (
                        <span className="text-[10px] bg-green-50 text-green-700 rounded px-1.5 py-0.5">
                          납부완료
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* ── 펼침: 지급 이력 ── */}
                  {isExpanded && (
                    <tr className="bg-muted/10">
                      <td colSpan={6} className="px-10 py-4">
                        <div className="space-y-4">

                          {hasChain ? (
                            /* ── 변경계약 체인: PO별 섹션 분리 ── */
                            chain.map((chainPo, chainIdx) => {
                              const isLeaf       = chainPo.po_id === po.po_id;
                              const poTTs        = tts.filter(t => t.po_id === chainPo.po_id)
                                .sort((a, b) => (a.remit_date ?? '').localeCompare(b.remit_date ?? ''));
                              const sectionPaid  = poTTs.filter(t => t.status === 'completed').reduce((s, t) => s + t.amount_usd, 0);

                              // 이전 PO들의 T/T 인덱스 누적
                              const prevTTCount  = chain
                                .slice(0, chainIdx)
                                .reduce((s, c) => s + tts.filter(t => t.po_id === c.po_id).length, 0);

                              if (poTTs.length === 0) return null;

                              return (
                                <div key={chainPo.po_id}>
                                  {/* 섹션 헤더 */}
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                      isLeaf
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {isLeaf
                                        ? `현재 계약 — ${chainPo.po_number ?? chainPo.po_id.slice(0, 8)}`
                                        : `원계약 승계 — ${chainPo.po_number ?? chainPo.po_id.slice(0, 8)}`}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {poTTs.filter(t => t.status === 'completed').length}건 완료 · {formatUSD(sectionPaid)}
                                    </span>
                                  </div>

                                  {/* T/T 테이블 */}
                                  <TTSection
                                    tts={poTTs}
                                    startIdx={prevTTCount + 1}
                                  />
                                </div>
                              );
                            })
                          ) : (
                            /* ── 단일 PO: 섹션 구분 없이 바로 테이블 ── */
                            <TTSection
                              tts={chainTTs.sort((a, b) => (a.remit_date ?? '').localeCompare(b.remit_date ?? ''))}
                              startIdx={1}
                            />
                          )}

                          {/* ── 소계 ── */}
                          <div className="rounded-md bg-muted/40 px-4 py-2.5 flex items-center gap-6 text-xs flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground">계약금 총액</span>
                              <span className="font-mono font-semibold">{formatUSD(totalUsd)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground">기지급</span>
                              <span className={`font-mono font-semibold ${isDone ? 'text-green-600' : 'text-orange-600'}`}>
                                {formatUSD(paidUsd)}
                              </span>
                            </div>
                            {plannedUsd > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">지급예정</span>
                                <span className="font-mono text-yellow-600">{formatUSD(plannedUsd)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <span className={isDone ? 'text-green-600' : 'text-red-500'}>
                                {isDone ? '납부완료 ✓' : '잔여'}
                              </span>
                              {!isDone && (
                                <span className="font-mono font-semibold text-red-600">
                                  {formatUSD(remainUsd)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/20">
              <td />
              <td className="p-3">
                <span className="whitespace-nowrap font-medium">
                  합계 · {leafPOs.length.toLocaleString('ko-KR')}건
                </span>
              </td>
              <td />
              <td className="p-3 text-right font-mono font-medium tabular-nums">
                <div>{formatUSD(depositTotals.totalUsd)}</div>
                <div className="text-[10px] text-muted-foreground">
                  기지급 {formatUSD(depositTotals.paidUsd)}
                  {depositTotals.plannedUsd > 0 ? ` · 예정 ${formatUSD(depositTotals.plannedUsd)}` : ''}
                </div>
                <div className="text-[10px] text-red-600">잔여 {formatUSD(depositTotals.remainUsd)}</div>
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TTSection — T/T 목록 테이블 (섹션 내부 공통)
   ───────────────────────────────────────────── */
function TTSection({
  tts, startIdx,
}: {
  tts: TTRemittance[];
  startIdx: number;
}) {
  const totals = tts.reduce((acc, tt) => {
    const krw = tt.amount_krw ?? (tt.exchange_rate ? tt.amount_usd * tt.exchange_rate : 0);
    return {
      usd: acc.usd + tt.amount_usd,
      krw: acc.krw + krw,
    };
  }, { usd: 0, krw: 0 });

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full min-w-[700px] text-xs">
        <thead>
          <tr className="bg-muted/40 border-b">
            <th className="px-3 py-1.5 text-center font-medium text-muted-foreground w-10">차수</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">목적</th>
            <th className="px-3 py-1.5 text-right font-medium">금액 (USD)</th>
            <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">원화 (KRW)</th>
            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">송금일</th>
            <th className="px-3 py-1.5 text-center font-medium text-muted-foreground w-16">상태</th>
            <th className="px-3 py-1.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {tts.map((tt, i) => (
            <TTRow key={tt.tt_id} idx={startIdx + i} tt={tt} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/20">
            <td className="px-3 py-1.5 text-center font-medium">합계</td>
            <td className="px-3 py-1.5 text-xs text-muted-foreground">{tts.length.toLocaleString('ko-KR')}건</td>
            <td className="px-3 py-1.5 text-right font-mono font-medium">{formatUSD(totals.usd)}</td>
            <td className="px-3 py-1.5 text-right font-medium tabular-nums">
              {totals.krw > 0 ? `₩${Math.round(totals.krw).toLocaleString('ko-KR')}` : '—'}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
