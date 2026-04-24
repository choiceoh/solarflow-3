/**
 * useTurnover — 재고 회전율 조회 훅
 *
 * 비유: "재고 건강검진 예약 데스크"
 * - 단일 법인: 한 번 호출
 * - 전체(all): 법인별 호출 후 kW 합산 → 회전율·DIO 재계산
 */
import { useEffect, useState, useCallback } from 'react';
import { fetchCalc } from '@/lib/companyUtils';
import type {
  TurnoverResponse, TurnoverByManufacturer, TurnoverBySpecWp,
  TurnoverMatrixCell, TurnoverByProduct, TurnoverTotal,
} from '@/types/turnover';

/** kW 합산 후 회전율 재계산 헬퍼 */
function recalc(inv: number, out: number, days: number): { ratio: number; dio: number } {
  const annualize = 365 / days;
  const ratio = inv > 0 ? (out * annualize) / inv : (out > 0 ? 999 : 0);
  const dio = ratio > 0 ? 365 / ratio : 999;
  return { ratio, dio };
}

/** 다중 법인 응답 병합 */
function mergeTurnover(rs: TurnoverResponse[]): TurnoverResponse {
  if (rs.length === 0) {
    return {
      window_days: 90,
      total: { inventory_kw: 0, outbound_kw: 0, turnover_ratio: 0, dio_days: 0 },
      by_manufacturer: [], by_spec_wp: [], matrix: [],
      top_movers: [], slow_movers: [],
      calculated_at: new Date().toISOString(),
    };
  }
  const days = rs[0].window_days;

  // total
  const inv = rs.reduce((s, r) => s + r.total.inventory_kw, 0);
  const out = rs.reduce((s, r) => s + r.total.outbound_kw, 0);
  const totalRecalc = recalc(inv, out, days);
  const total: TurnoverTotal = {
    inventory_kw: inv,
    outbound_kw: out,
    turnover_ratio: totalRecalc.ratio,
    dio_days: totalRecalc.dio,
  };

  // by_manufacturer
  const mfrMap = new Map<string, TurnoverByManufacturer>();
  for (const r of rs) {
    for (const m of r.by_manufacturer) {
      const prev = mfrMap.get(m.manufacturer_id);
      if (prev) {
        prev.inventory_kw += m.inventory_kw;
        prev.outbound_kw += m.outbound_kw;
      } else {
        mfrMap.set(m.manufacturer_id, { ...m });
      }
    }
  }
  const by_manufacturer = Array.from(mfrMap.values()).map((m) => {
    const c = recalc(m.inventory_kw, m.outbound_kw, days);
    return { ...m, turnover_ratio: c.ratio, dio_days: c.dio };
  }).sort((a, b) => a.manufacturer_name.localeCompare(b.manufacturer_name));

  // by_spec_wp
  const wpMap = new Map<number, TurnoverBySpecWp>();
  for (const r of rs) {
    for (const w of r.by_spec_wp) {
      const prev = wpMap.get(w.spec_wp);
      if (prev) {
        prev.inventory_kw += w.inventory_kw;
        prev.outbound_kw += w.outbound_kw;
      } else {
        wpMap.set(w.spec_wp, { ...w });
      }
    }
  }
  const by_spec_wp = Array.from(wpMap.values()).map((w) => {
    const c = recalc(w.inventory_kw, w.outbound_kw, days);
    return { ...w, turnover_ratio: c.ratio, dio_days: c.dio };
  }).sort((a, b) => a.spec_wp - b.spec_wp);

  // matrix (mfr × wp)
  const matMap = new Map<string, TurnoverMatrixCell>();
  for (const r of rs) {
    for (const c of r.matrix) {
      const key = `${c.manufacturer_id}|${c.spec_wp}`;
      const prev = matMap.get(key);
      if (prev) {
        prev.inventory_kw += c.inventory_kw;
        prev.outbound_kw += c.outbound_kw;
      } else {
        matMap.set(key, { ...c });
      }
    }
  }
  const matrix = Array.from(matMap.values()).map((c) => {
    const r = recalc(c.inventory_kw, c.outbound_kw, days);
    return { ...c, turnover_ratio: r.ratio };
  });

  // top_movers / slow_movers — 법인 간 같은 product_id 합산 후 재선정
  const prodMap = new Map<string, TurnoverByProduct>();
  for (const r of rs) {
    for (const p of [...r.top_movers, ...r.slow_movers]) {
      const prev = prodMap.get(p.product_id);
      if (prev) {
        prev.inventory_kw += p.inventory_kw;
        prev.inventory_ea += p.inventory_ea;
        prev.outbound_kw += p.outbound_kw;
        prev.outbound_ea += p.outbound_ea;
      } else {
        prodMap.set(p.product_id, { ...p });
      }
    }
  }
  const products = Array.from(prodMap.values()).map((p) => {
    const c = recalc(p.inventory_kw, p.outbound_kw, days);
    return { ...p, turnover_ratio: c.ratio, dio_days: c.dio };
  });
  const top_movers = products
    .filter((p) => p.inventory_kw > 0 && p.outbound_kw > 0 && p.turnover_ratio < 999)
    .sort((a, b) => b.turnover_ratio - a.turnover_ratio).slice(0, 10);
  const slow_movers = products
    .filter((p) => p.inventory_kw > 0)
    .sort((a, b) => a.turnover_ratio - b.turnover_ratio).slice(0, 10);

  return {
    window_days: days,
    total, by_manufacturer, by_spec_wp, matrix,
    top_movers, slow_movers,
    calculated_at: rs[0]?.calculated_at ?? new Date().toISOString(),
  };
}

export function useTurnover(companyId: string | null, days: number = 90) {
  const [data, setData] = useState<TurnoverResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetchCalc<TurnoverResponse>(
        companyId,
        '/api/v1/calc/inventory-turnover',
        { days },
        mergeTurnover,
      );
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '재고 회전율 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [companyId, days]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
