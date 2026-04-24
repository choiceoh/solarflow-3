/**
 * ManufacturerMatrix — 제조사 × 출력(Wp) 재고 매트릭스
 *
 * 비유: "제조사-출력 격자 도표" — 어느 조합이 무겁고 어느 조합이 빠른가
 *
 * 기본 뷰: 제조사(행) × 출력Wp(열) 매트릭스, 셀에 재고 MW + 90일 회전율
 * 토글: 모듈크기(width × height)로 그룹화 — 호환 제품군 탐색용
 *   - 도메인: Trina만 730W (2026 Q4 TOPCon 3.0 전까지 모듈크기 상이),
 *     나머지 제조사는 600W대. 크기가 같으면 공사에서 호환 가능.
 *
 * 권한:
 *   - MW·회전율만 노출 (금액 없음) → 모든 strategic 역할에서 표시 가능
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { InventoryItem } from '@/types/inventory';
import type { TurnoverMatrixCell } from '@/types/turnover';

interface Props {
  inventory: InventoryItem[];
  matrix: TurnoverMatrixCell[];
}

type ViewMode = 'manufacturer' | 'moduleSize';

/** 회전율 셀 색상: 건강도 기반 */
function ratioColor(ratio: number): string {
  if (ratio === 0) return 'bg-slate-100 text-slate-500';
  if (ratio < 1.5) return 'bg-rose-50 text-rose-700';       // 재고일수 > 240일
  if (ratio < 3) return 'bg-amber-50 text-amber-700';       // 120~240일
  if (ratio < 6) return 'bg-green-50 text-green-700';       // 60~120일
  return 'bg-emerald-50 text-emerald-700';                  // 60일 미만
}

export default function ManufacturerMatrix({ inventory, matrix }: Props) {
  const [mode, setMode] = useState<ViewMode>('manufacturer');

  // 제조사 뷰: matrix 데이터로 직접 렌더
  const mfrView = useMemo(() => {
    // 출력(Wp) 헤더 — 오름차순
    const wps = Array.from(new Set(matrix.map((m) => m.spec_wp))).sort((a, b) => a - b);
    // 제조사 행 — 총 재고 내림차순
    const mfrAgg = new Map<string, { name: string; total: number; byWp: Map<number, TurnoverMatrixCell> }>();
    for (const c of matrix) {
      const prev = mfrAgg.get(c.manufacturer_id);
      if (prev) {
        prev.total += c.inventory_kw;
        prev.byWp.set(c.spec_wp, c);
      } else {
        const byWp = new Map<number, TurnoverMatrixCell>();
        byWp.set(c.spec_wp, c);
        mfrAgg.set(c.manufacturer_id, { name: c.manufacturer_name, total: c.inventory_kw, byWp });
      }
    }
    const rows = Array.from(mfrAgg.entries())
      .sort((a, b) => b[1].total - a[1].total);
    return { wps, rows };
  }, [matrix]);

  // 모듈크기 뷰: inventory에서 width × height로 집계
  const sizeView = useMemo(() => {
    // 출력(Wp) 헤더
    const wps = Array.from(new Set(inventory.map((i) => i.spec_wp))).sort((a, b) => a - b);
    // size key = "1762×1134"
    const sizeMap = new Map<string, { label: string; total: number; byWp: Map<number, number> }>();
    for (const item of inventory) {
      const key = `${item.module_width_mm}×${item.module_height_mm}`;
      const prev = sizeMap.get(key);
      if (prev) {
        prev.total += item.physical_kw;
        prev.byWp.set(item.spec_wp, (prev.byWp.get(item.spec_wp) || 0) + item.physical_kw);
      } else {
        const byWp = new Map<number, number>();
        byWp.set(item.spec_wp, item.physical_kw);
        sizeMap.set(key, { label: key, total: item.physical_kw, byWp });
      }
    }
    const rows = Array.from(sizeMap.entries())
      .filter(([, v]) => v.total > 0)
      .sort((a, b) => b[1].total - a[1].total);
    return { wps, rows };
  }, [inventory]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">재고 매트릭스</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={mode === 'manufacturer' ? 'default' : 'outline'}
            onClick={() => setMode('manufacturer')}
            className="h-7 px-3 text-xs"
          >
            제조사 × 출력
          </Button>
          <Button
            size="sm"
            variant={mode === 'moduleSize' ? 'default' : 'outline'}
            onClick={() => setMode('moduleSize')}
            className="h-7 px-3 text-xs"
          >
            모듈크기 × 출력
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {mode === 'manufacturer' ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">제조사</th>
                  {mfrView.wps.map((wp) => (
                    <th key={wp} className="py-2 px-2 text-center font-medium">{wp}W</th>
                  ))}
                  <th className="py-2 pl-3 text-right font-medium">합계</th>
                </tr>
              </thead>
              <tbody>
                {mfrView.rows.length === 0 ? (
                  <tr><td colSpan={mfrView.wps.length + 2} className="py-6 text-center text-muted-foreground">데이터 없음</td></tr>
                ) : mfrView.rows.map(([mid, row]) => (
                  <tr key={mid} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="py-2 pr-3 font-medium">{row.name}</td>
                    {mfrView.wps.map((wp) => {
                      const cell = row.byWp.get(wp);
                      if (!cell || cell.inventory_kw === 0) {
                        return <td key={wp} className="py-2 px-2 text-center text-muted-foreground">—</td>;
                      }
                      return (
                        <td key={wp} className="py-2 px-2 text-center">
                          <div className="font-medium">{(cell.inventory_kw / 1000).toFixed(1)}MW</div>
                          <div className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] ${ratioColor(cell.turnover_ratio)}`}>
                            {cell.turnover_ratio < 999 ? `${cell.turnover_ratio.toFixed(1)}회/년` : '신규'}
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right font-semibold">
                      {(row.total / 1000).toFixed(1)}MW
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">모듈크기 (mm)</th>
                  {sizeView.wps.map((wp) => (
                    <th key={wp} className="py-2 px-2 text-center font-medium">{wp}W</th>
                  ))}
                  <th className="py-2 pl-3 text-right font-medium">합계</th>
                </tr>
              </thead>
              <tbody>
                {sizeView.rows.length === 0 ? (
                  <tr><td colSpan={sizeView.wps.length + 2} className="py-6 text-center text-muted-foreground">데이터 없음</td></tr>
                ) : sizeView.rows.map(([key, row]) => (
                  <tr key={key} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="py-2 pr-3 font-medium">{row.label}</td>
                    {sizeView.wps.map((wp) => {
                      const kw = row.byWp.get(wp) || 0;
                      if (kw === 0) {
                        return <td key={wp} className="py-2 px-2 text-center text-muted-foreground">—</td>;
                      }
                      return (
                        <td key={wp} className="py-2 px-2 text-center font-medium">
                          {(kw / 1000).toFixed(1)}MW
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right font-semibold">
                      {(row.total / 1000).toFixed(1)}MW
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {mode === 'moduleSize' && (
          <p className="text-[11px] text-muted-foreground mt-3">
            ※ 모듈크기가 같으면 공사에서 호환 가능한 제품군입니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
