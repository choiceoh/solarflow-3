import { useEffect, useState, Fragment, memo } from 'react';
import { ChevronDown, ChevronRight, FilePenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatUSD, moduleLabel, shortMfgName } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import ProgressMiniBar from '@/components/common/ProgressMiniBar';
import StatusPill from '@/components/common/StatusPill';
import SortableTH from '@/components/common/SortableTH';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { useSort } from '@/hooks/useSort';
import {
  PO_STATUS_LABEL, PO_STATUS_COLOR, CONTRACT_TYPE_LABEL,
  LC_STATUS_LABEL, LC_STATUS_COLOR,
  type PurchaseOrder, type POLineItem, type LCRecord, type TTRemittance,
} from '@/types/procurement';
import type { BLShipment, BLLineItem } from '@/types/inbound';

// ─── BL 상태 레이블 (인바운드 타입 복사 방지)
const BL_STATUS_LABEL: Record<string, string> = {
  planned: '예정', booking: '부킹', shipping: '선적중',
  arrived: '입항', customs: '통관중', completed: '입고완료', erp_done: 'ERP완료',
};
const BL_STATUS_COLOR: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-600', booking: 'bg-sky-100 text-sky-700',
  shipping: 'bg-blue-100 text-blue-700', arrived: 'bg-indigo-100 text-indigo-700',
  customs: 'bg-yellow-100 text-yellow-700', completed: 'bg-green-100 text-green-700',
  erp_done: 'bg-emerald-100 text-emerald-700',
};

interface Props {
  items: PurchaseOrder[];
  onDetail: (po: PurchaseOrder) => void;
  onSelectBL?: (blId: string) => void;
  aggVersion?: number;
}

// 행별 집계 (초기 fetch)
interface Agg {
  totalUsd: number;
  ttUsd: number;
  ttCount: number;    // T/T 전체 건수 (삭제 경고용)
  lcUsd: number;
  lcRemainUsd: number;
  lcMw: number;       // LC target_mw 합계
  avgCentsPerWp: number;
  totalMw: number;    // 계약 MW (PO 라인 기준)
  firstLine?: { name: string; spec: string; specWp?: number };
  extraCount: number;
  lcs: LCRecord[];    // LC 목록 (미니 테이블용)
}

// 펼침 시 lazy-load
interface BLDetail {
  loading: boolean;
  bls: BLShipment[];
  shippingMw: number;          // 선적중 이상
  inboundMw: number;           // 입고완료
  blMwMap: Record<string, number>; // BL별 MW (BL 행에 표시)
}

/** payment_terms → 계약금%, L/C Usance */
function parsePaymentTerms(terms?: string) {
  if (!terms) return {};
  const dep   = terms.match(/계약금\s*([\d.]+)\s*%/i);
  const tt    = terms.match(/T\/T\s*([\d.]+)\s*%/i);
  const us    = terms.match(/[Uu]sance\s*(\d+)|L\/C\s+(\d+)\s*days?/i);
  const split = terms.match(/분할\s*(\d+)회/);
  return {
    depositPct: dep ? parseFloat(dep[1]) : tt ? parseFloat(tt[1]) : undefined,
    lcUsance:   us  ? parseInt(us[1] ?? us[2]) : undefined,
    splitCount: split ? parseInt(split[1]) : undefined,
  };
}

/** 가로 진행률 바 (레이블 + 수치 포함) */
function ProgressRow({
  label, mw, totalMw, color, subLabel,
}: {
  label: string; mw: number; totalMw: number; color: string; subLabel?: string;
}) {
  const pct = totalMw > 0 ? Math.min(100, (mw / totalMw) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-[10px] text-muted-foreground text-right shrink-0">{label}</span>
      <ProgressMiniBar percent={pct} colorClassName={color} trackClassName="bg-gray-100" className="flex-1" />
      <span className="text-[10px] tabular-nums font-mono font-semibold w-20 text-right shrink-0">
        {mw.toFixed(2)} MW
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right shrink-0">
        {pct.toFixed(1)}%
      </span>
      {subLabel && (
        <span className="text-[10px] text-muted-foreground ml-1">{subLabel}</span>
      )}
    </div>
  );
}

function POListTable({ items, onDetail, onSelectBL, aggVersion }: Props) {
  const companies = useAppStore((s) => s.companies);
  const companyMap = Object.fromEntries(companies.map((c) => [c.company_id, c.company_name]));
  const [agg, setAgg] = useState<Record<string, Agg>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [blDetail, setBlDetail] = useState<Record<string, BLDetail>>({});

  // ── 초기 집계: lines + lcs + tts fetch ──
  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) { setAgg({}); return; }
    (async () => {
      const result: Record<string, Agg> = {};
      await Promise.all(items.map(async (po) => {
        try {
          const [lines, rawLcs, tts] = await Promise.all([
            fetchWithAuth<POLineItem[]>(`/api/v1/pos/${po.po_id}/lines`).catch(() => [] as POLineItem[]),
            fetchWithAuth<Array<LCRecord & { banks?: { bank_name?: string }; purchase_orders?: { po_number?: string } }>>(
              `/api/v1/lcs?po_id=${po.po_id}`
            ).catch(() => []),
            fetchWithAuth<TTRemittance[]>(`/api/v1/tts?po_id=${po.po_id}`).catch(() => [] as TTRemittance[]),
          ]);
          // LC 중첩 flatten
          const lcs: LCRecord[] = (rawLcs ?? []).map(r => ({
            ...r,
            bank_name: r.bank_name ?? r.banks?.bank_name,
            po_number: r.po_number ?? r.purchase_orders?.po_number,
          }));
          const totalUsd  = (lines ?? []).reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
          const ttUsd     = (tts ?? []).filter(t => t.status === 'completed').reduce((s, t) => s + t.amount_usd, 0);
          const ttCount   = (tts ?? []).length;
          const lcUsd     = lcs.reduce((s, l) => s + l.amount_usd, 0);
          const lcMw      = lcs.reduce((s, l) => s + (l.target_mw ?? 0), 0);
          const totalWp   = (lines ?? []).reduce((s, l) => s + (l.quantity ?? 0) * (l.products?.spec_wp ?? l.spec_wp ?? 0), 0);
          const first     = (lines ?? [])[0];
          result[po.po_id] = {
            totalUsd, ttUsd, ttCount, lcUsd, lcRemainUsd: totalUsd - lcUsd, lcMw,
            avgCentsPerWp: totalWp > 0 ? (totalUsd / totalWp) * 100 : 0,
            totalMw: totalWp / 1_000_000,
            firstLine: first ? {
              name: first.products?.product_name ?? first.product_name ?? '—',
              spec: first.products?.product_code ?? first.product_code ?? '—',
              specWp: first.products?.spec_wp ?? first.spec_wp,
            } : undefined,
            extraCount: Math.max(0, new Set((lines ?? []).map((l) => l.product_id).filter(Boolean)).size - 1),
            lcs,
          };
        } catch { /* skip */ }
      }));
      if (!cancelled) setAgg(result);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map(p => p.po_id).join(','), aggVersion]);

  // ── 행 펼침 시 BL lazy-load ──
  async function loadBL(poId: string) {
    if (blDetail[poId]) return; // 이미 로드됨
    setBlDetail(prev => ({ ...prev, [poId]: { loading: true, bls: [], shippingMw: 0, inboundMw: 0, blMwMap: {} } }));
    try {
      const blList = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?po_id=${poId}`).catch(() => [] as BLShipment[]);
      // 각 BL의 라인 capacity_kw 합계
      const lineMap: Record<string, BLLineItem[]> = {};
      await Promise.all((blList ?? []).map(async bl => {
        try { lineMap[bl.bl_id] = await fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${bl.bl_id}/lines`); }
        catch { lineMap[bl.bl_id] = []; }
      }));
      const shipStatuses = new Set(['shipping', 'arrived', 'customs', 'completed', 'erp_done']);
      const compStatuses = new Set(['completed', 'erp_done']);
      let shippingMw = 0, inboundMw = 0;
      const blMwMap: Record<string, number> = {};
      for (const bl of blList ?? []) {
        // capacity_kw는 라인 전체 kW (EA당 아님)
        const mw = (lineMap[bl.bl_id] ?? []).reduce((s, l) => s + (l.capacity_kw ?? 0), 0) / 1000;
        blMwMap[bl.bl_id] = mw;
        if (shipStatuses.has(bl.status)) shippingMw += mw;
        if (compStatuses.has(bl.status)) inboundMw += mw;
      }
      setBlDetail(prev => ({ ...prev, [poId]: { loading: false, bls: blList ?? [], shippingMw, inboundMw, blMwMap } }));
    } catch {
      setBlDetail(prev => ({ ...prev, [poId]: { loading: false, bls: [], shippingMw: 0, inboundMw: 0, blMwMap: {} } }));
    }
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); loadBL(id); }
      return s;
    });
  }

  const { sorted, headerProps } = useSort<PurchaseOrder>(items, (po, f) => {
    const a = agg[po.po_id];
    switch (f) {
      case 'po_number': return po.po_number ?? '';
      case 'totalMw': return a?.totalMw ?? 0;
      case 'contract_type': return po.contract_type ?? '';
      case 'totalUsd': return a?.totalUsd ?? 0;
      case 'lcUsd': return a?.lcUsd ?? 0;
      case 'status': return po.status;
      default: return null;
    }
  });

  if (items.length === 0) return <EmptyState message="등록된 PO가 없습니다" />;

  const totals = sorted.reduce((acc, po) => {
    const a = agg[po.po_id];
    return {
      totalMw: acc.totalMw + (a?.totalMw ?? 0),
      totalUsd: acc.totalUsd + (a?.totalUsd ?? 0),
      lcUsd: acc.lcUsd + (a?.lcUsd ?? 0),
      lcMw: acc.lcMw + (a?.lcMw ?? 0),
    };
  }, { totalMw: 0, totalUsd: 0, lcUsd: 0, lcMw: 0 });

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full min-w-[900px] text-xs">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="p-3 w-6" />
            <SortableTH {...headerProps('po_number')} className="p-3 font-medium text-muted-foreground">발주 정보</SortableTH>
            <SortableTH {...headerProps('totalMw')} className="p-3 font-medium text-muted-foreground">품목 / MW</SortableTH>
            <SortableTH {...headerProps('contract_type')} className="p-3 font-medium text-muted-foreground">계약 조건</SortableTH>
            <SortableTH {...headerProps('totalUsd')} align="right" className="p-3 font-medium">계약금액 / 결제</SortableTH>
            <SortableTH {...headerProps('lcUsd')} align="right" className="p-3 font-medium text-muted-foreground">L/C 현황</SortableTH>
            <SortableTH {...headerProps('status')} align="center" className="p-3 font-medium text-muted-foreground w-[80px]">상태</SortableTH>
            <th className="p-3 w-[88px]" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(po => {
            const a      = agg[po.po_id];
            const pt     = parsePaymentTerms(po.payment_terms);
            const isExp  = expanded.has(po.po_id);
            const bl     = blDetail[po.po_id];

            // T/T 계약금
            const ttBudget = a && pt.depositPct ? a.totalUsd * pt.depositPct / 100 : null;
            const ttPaid   = a?.ttUsd ?? 0;
            const ttDone   = ttBudget !== null && ttPaid >= ttBudget - 0.01;
            const ttPct    = ttBudget ? Math.min(100, (ttPaid / ttBudget) * 100) : 0;

            // L/C
            const lcMwRemain = a ? Math.max(0, a.totalMw - a.lcMw) : 0;
            const lcUsdPct   = a && a.totalUsd > 0 ? Math.min(100, (a.lcUsd / a.totalUsd) * 100) : 0;

            return (
              <Fragment key={po.po_id}>
                {/* ── 메인 행 ── */}
                <tr
                  className="border-t hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => toggle(po.po_id)}
                >
                  <td className="p-3 text-muted-foreground">
                    {isExp ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </td>

                  {/* 발주 정보 */}
                  <td className="p-3 align-top">
                    {companyMap[po.company_id] && (
                      <div className="text-[10px] text-muted-foreground mb-0.5">{companyMap[po.company_id]}</div>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-semibold">{po.po_number || '—'}</span>
                      {po.parent_po_id && (
                        <StatusPill label="변경계약" colorClassName="bg-amber-100 text-amber-700" className="text-[9px]" />
                      )}
                    </div>
                    {po.contract_date && (
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{formatDate(po.contract_date)}</div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{shortMfgName(po.manufacturer_name)}</div>
                    {po.parent_po_id && (() => {
                      const p = items.find(x => x.po_id === po.parent_po_id);
                      return p ? <div className="text-[10px] text-muted-foreground">원계약: {p.po_number ?? p.po_id.slice(0, 8)}</div> : null;
                    })()}
                  </td>

                  {/* 품목 / MW */}
                  <td className="p-3 align-top min-w-[160px]">
                    {a?.firstLine ? (
                      <>
                        {/* 제조사 약칭 + 사양: "진코 635W" */}
                        <div className="font-semibold text-[11px]">
                          {moduleLabel(po.manufacturer_name, a.firstLine.specWp)}
                          {a.extraCount > 0 && <span className="font-normal text-muted-foreground ml-1">외 {a.extraCount}건</span>}
                        </div>
                        {/* 품명 (보조) */}
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[200px]">
                          {a.firstLine.name}
                        </div>
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                    <div className="mt-1 flex items-center gap-2">
                      {a && a.totalMw > 0 && (
                        <span className="text-[10px] font-semibold tabular-nums font-mono">{a.totalMw.toFixed(2)} MW</span>
                      )}
                      {a && a.avgCentsPerWp > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums font-mono">{a.avgCentsPerWp.toFixed(2)} ¢/Wp</span>
                      )}
                    </div>
                  </td>

                  {/* 계약 조건 */}
                  <td className="p-3 align-top min-w-[130px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusPill label={CONTRACT_TYPE_LABEL[po.contract_type]} colorClassName="bg-slate-100 text-slate-700" className="px-2" />
                      {po.incoterms && (
                        <StatusPill label={po.incoterms} colorClassName="bg-slate-100 text-slate-600" className="px-2 font-mono" />
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {pt.depositPct && (
                        <div className="text-[10px] text-muted-foreground">
                          계약금 <span className="text-blue-600 font-medium">{pt.depositPct}%</span> T/T
                        </div>
                      )}
                      {pt.lcUsance && (
                        <div className="text-[10px] text-muted-foreground">L/C Usance <span className="font-medium">{pt.lcUsance}일</span></div>
                      )}
                    </div>
                  </td>

                  {/* 계약금액 / 결제 */}
                  <td className="p-3 text-right align-top min-w-[160px]">
                    <div className="font-semibold tabular-nums font-mono">{a ? formatUSD(a.totalUsd) : '—'}</div>
                    {ttBudget !== null && (
                      <div className="mt-1 space-y-0.5">
                        <div className="text-[10px] text-muted-foreground">
                          계약금 {pt.depositPct}%: <span className="font-mono">{formatUSD(ttBudget)}</span>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          {/* T/T 미니 바 */}
                          <ProgressMiniBar
                            percent={ttPct}
                            colorClassName={ttDone ? 'bg-green-500' : 'bg-blue-500'}
                            trackClassName="bg-gray-200"
                            className="h-1 w-12"
                          />
                          <span className={`text-[10px] tabular-nums font-mono ${ttDone ? 'text-green-600' : 'text-orange-500'}`}>
                            {formatUSD(ttPaid)}{ttDone ? ' ✓' : ''}
                          </span>
                        </div>
                      </div>
                    )}
                  </td>

                  {/* L/C 현황 */}
                  <td className="p-3 text-right align-top min-w-[150px]">
                    {a && (a.lcUsd > 0 || a.totalUsd > 0) ? (
                      <>
                        <div className="font-semibold tabular-nums font-mono text-blue-700">{formatUSD(a.lcUsd)}</div>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <ProgressMiniBar percent={lcUsdPct} colorClassName="bg-blue-500" trackClassName="bg-gray-200" className="h-1 w-12" />
                          <span className="text-[10px] text-muted-foreground tabular-nums">{lcUsdPct.toFixed(0)}%</span>
                        </div>
                        {a.totalMw > 0 && (
                          <div className="mt-1 space-y-0.5 text-[10px]">
                            <div className="text-muted-foreground">
                              개설 <span className="font-mono font-medium text-blue-600">{a.lcMw.toFixed(2)} MW</span>
                            </div>
                            {lcMwRemain > 0.01 && (
                              <div className="text-amber-600 font-medium">
                                미개설 <span className="font-mono">{lcMwRemain.toFixed(2)} MW</span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : <span className="text-muted-foreground text-[10px]">—</span>}
                  </td>

                  {/* 상태 */}
                  <td className="p-3 text-center align-top">
                    <StatusPill label={PO_STATUS_LABEL[po.status]} colorClassName={PO_STATUS_COLOR[po.status]} className="px-2" />
                  </td>

                  {/* 상세 버튼 */}
                  <td className="p-3 text-center align-top" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="상세 보기" onClick={() => onDetail(po)}>
                      <FilePenLine className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>

                {/* ── 펼침 상세 행 ── */}
                {isExp && (
                  <tr key={`${po.po_id}-exp`} className="bg-slate-50/50 border-t">
                    <td colSpan={8} className="px-8 py-4">
                      <div className="space-y-4">

                        {/* ① MW 3단계 진행률 바 */}
                        {a && a.totalMw > 0 && (
                          <div className="rounded-md border bg-white px-4 py-3 space-y-2">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              MW 진행 현황
                            </p>
                            <ProgressRow
                              label="계약" mw={a.totalMw} totalMw={a.totalMw}
                              color="bg-slate-400"
                              subLabel={`${a.avgCentsPerWp.toFixed(2)} ¢/Wp`}
                            />
                            <ProgressRow
                              label="L/C" mw={a.lcMw} totalMw={a.totalMw}
                              color="bg-blue-500"
                              subLabel={lcMwRemain > 0.01 ? `미개설 ${lcMwRemain.toFixed(2)} MW` : '✓ 전량 개설'}
                            />
                            <ProgressRow
                              label="입고" mw={bl?.inboundMw ?? 0} totalMw={a.totalMw}
                              color="bg-green-500"
                              subLabel={bl?.loading ? '…' :
                                bl && bl.shippingMw > (bl.inboundMw ?? 0) + 0.01
                                  ? `선적중 ${bl.shippingMw.toFixed(2)} MW 포함`
                                  : undefined}
                            />
                          </div>
                        )}

                        {/* ② L/C · 입고 현황 통합 테이블 */}
                        <div className="rounded-md border bg-white overflow-x-auto">
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                            <span className="text-[11px] font-semibold">
                              L/C · 입고 현황
                              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                                LC {a?.lcs.length ?? 0}건 · 개설 {a ? formatUSD(a.lcUsd) : '—'}
                                {bl && !bl.loading && bl.bls.length > 0 && (
                                  <span className="ml-2 text-green-600">
                                    B/L {bl.bls.length}건 · 입고완료 {bl.inboundMw.toFixed(2)} MW
                                    {bl.shippingMw > bl.inboundMw + 0.01 && (
                                      <span className="ml-1.5 text-blue-600">선적중 {bl.shippingMw.toFixed(2)} MW</span>
                                    )}
                                  </span>
                                )}
                                {bl?.loading && <span className="ml-2">로딩 중…</span>}
                              </span>
                            </span>
                          </div>
                          {a && a.lcs.length > 0 ? (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b bg-muted/20">
                                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">#&nbsp;LC번호</th>
                                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">은행</th>
                                  <th className="px-3 py-1.5 text-right font-medium">금액(USD)</th>
                                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">모듈 / 규격(W)</th>
                                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">만기일</th>
                                  <th className="px-3 py-1.5 text-center font-medium text-muted-foreground">상태</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  let blSeq = 0;
                                  return a.lcs.map((lc, lcIdx) => {
                                  const lcBls = (bl?.bls ?? []).filter(b => b.lc_id === lc.lc_id);
                                  const mLabel = moduleLabel(po.manufacturer_name, a.firstLine?.specWp);
                                  return (
                                    <Fragment key={lc.lc_id}>
                                      {/* LC 행 */}
                                      <tr className="border-t hover:bg-muted/10 group">
                                        <td className="px-3 py-2 font-mono font-medium">
                                          <span className="text-[10px] font-normal text-muted-foreground mr-1.5">LC {lcIdx + 1}</span>
                                          {lc.lc_number || '—'}
                                          {lcBls.length > 0 && (
                                            <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">B/L {lcBls.length}건</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">{lc.bank_name ?? '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatUSD(lc.amount_usd)}</td>
                                        <td className="px-3 py-2">
                                          <div className="font-medium text-[11px]">{mLabel}</div>
                                          {lc.target_mw ? (
                                            <div className="text-[10px] text-muted-foreground font-mono">{lc.target_mw.toFixed(2)} MW</div>
                                          ) : null}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">{formatDate(lc.maturity_date ?? '')}</td>
                                        <td className="px-3 py-2 text-center">
                                          <StatusPill label={LC_STATUS_LABEL[lc.status]} colorClassName={LC_STATUS_COLOR[lc.status]} />
                                        </td>
                                      </tr>
                                      {/* BL 행 — 항상 표시 */}
                                      {lcBls.length > 0 ? (
                                        lcBls.map(b => {
                                          blSeq++;
                                          const seq = blSeq;
                                          const blMw = bl?.blMwMap?.[b.bl_id];
                                          return (
                                            <tr
                                              key={b.bl_id}
                                              className="border-t bg-sky-50/50 hover:bg-sky-100/60 cursor-pointer"
                                              onClick={e => { e.stopPropagation(); onSelectBL?.(b.bl_id); }}
                                              title="클릭하면 B/L 상세 보기"
                                            >
                                              <td className="pl-5 pr-3 py-1.5 font-mono font-medium text-blue-700">
                                                <span className="text-muted-foreground/60 mr-1">└</span>
                                                <span className="text-[10px] font-normal text-muted-foreground mr-1.5">B/L {seq}</span>
                                                <span className="underline underline-offset-2">{b.bl_number || '—'}</span>
                                                <span className="ml-1.5 text-[10px] text-muted-foreground font-normal font-sans">
                                                  {formatDate(b.etd ?? '')} → {formatDate(b.eta ?? '')}
                                                </span>
                                              </td>
                                              <td className="px-3 py-1.5" />
                                              <td className="px-3 py-1.5" />
                                              <td className="px-3 py-1.5">
                                                <div className="text-[10px] font-medium">{mLabel}</div>
                                                <div className="text-[10px] text-muted-foreground font-mono">
                                                  {blMw != null ? `${blMw.toFixed(2)} MW` : (bl?.loading ? '…' : '—')}
                                                </div>
                                              </td>
                                              <td className="px-3 py-1.5" />
                                              <td className="px-3 py-1.5 text-center">
                                                <StatusPill
                                                  label={BL_STATUS_LABEL[b.status] ?? b.status}
                                                  colorClassName={BL_STATUS_COLOR[b.status] ?? 'bg-gray-100 text-gray-600'}
                                                />
                                              </td>
                                            </tr>
                                          );
                                        })
                                      ) : (
                                        <tr className="border-t bg-muted/5">
                                          <td colSpan={6} className="pl-8 pr-3 py-1.5 text-[10px] text-muted-foreground italic">
                                            입고 미등록
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                  });
                                })()}
                              </tbody>
                              {a.lcs.length > 1 && (
                                <tfoot>
                                  <tr className="border-t bg-muted/20">
                                    <td colSpan={2} className="px-3 py-1.5 text-[10px] text-muted-foreground">합계</td>
                                    <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">{formatUSD(a.lcUsd)}</td>
                                    <td className="px-3 py-1.5 text-[10px] font-mono font-semibold text-muted-foreground">
                                      {a.lcMw > 0 ? `${a.lcMw.toFixed(2)} MW` : '—'}
                                    </td>
                                    <td colSpan={2} />
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          ) : (
                            <div className="px-4 py-3 text-[11px] text-muted-foreground">
                              등록된 L/C가 없습니다
                            </div>
                          )}
                        </div>

                        {/* 하단 액션 */}
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5"
                            onClick={() => onDetail(po)}>
                            <FilePenLine className="h-3 w-3" />전체 상세 / 편집
                          </Button>
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
          <tr className="border-t bg-muted/50">
            <td />
            <td className="p-3">
              <div className="font-semibold">합계</div>
              <div className="text-[11px] text-muted-foreground">{sorted.length.toLocaleString('ko-KR')}건</div>
            </td>
            <td className="p-3 font-mono font-semibold tabular-nums">{totals.totalMw > 0 ? `${totals.totalMw.toFixed(2)} MW` : '—'}</td>
            <td />
            <td className="p-3 text-right font-mono font-semibold tabular-nums">{formatUSD(totals.totalUsd)}</td>
            <td className="p-3 text-right font-mono font-semibold tabular-nums">
              <div>{formatUSD(totals.lcUsd)}</div>
              <div className="text-[10px] text-muted-foreground">{totals.lcMw > 0 ? `${totals.lcMw.toFixed(2)} MW` : '—'}</div>
            </td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default memo(POListTable);
