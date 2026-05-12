import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, FileText, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { fetchWithAuth } from '@/lib/api';
import { formatKRW, formatNumber, formatDate } from '@/lib/utils';
import { notify } from '@/lib/notify';
import type { Declaration, DeclarationCost, LandedCostResult } from '@/types/customs';
import type { BLLineItem, BLShipment } from '@/types/inbound';
import BLExpensesTab from './expenses-tab';

interface Props {
  bl: BLShipment;
  lines: BLLineItem[];
}

function fmtWonWp(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/Wp`;
}

function fmtPercent(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`;
}

function shortId(value: string | undefined) {
  return value ? value.slice(0, 8) : '—';
}

function allocatedExpenseText(expenses: Record<string, number> | undefined) {
  const entries = Object.entries(expenses ?? {});
  if (entries.length === 0) return '—';
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
  return formatKRW(total);
}

export default function BLCustomsCostTab({ bl, lines }: Props) {
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [costsByDeclaration, setCostsByDeclaration] = useState<Record<string, DeclarationCost[]>>({});
  const [loading, setLoading] = useState(true);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcResult, setCalcResult] = useState<LandedCostResult | null>(null);
  const [error, setError] = useState('');

  const productNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of lines) {
      map.set(
        line.product_id,
        line.product_name ?? line.products?.product_name ?? line.product_code ?? line.products?.product_code ?? line.product_id,
      );
    }
    return map;
  }, [lines]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ bl_id: bl.bl_id });
      const decls = await fetchWithAuth<Declaration[]>(`/api/v1/declarations?${params}`);
      const pairs = await Promise.all(
        decls.map(async (decl) => {
          const costs = await fetchWithAuth<DeclarationCost[]>(
            `/api/v1/cost-details?declaration_id=${decl.declaration_id}`,
          );
          return [decl.declaration_id, costs] as const;
        }),
      );
      setDeclarations(decls);
      setCostsByDeclaration(Object.fromEntries(pairs));
    } catch (err) {
      setError(err instanceof Error ? err.message : '면장/원가 조회에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [bl.bl_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const costRows = useMemo(
    () => declarations.flatMap((decl) => costsByDeclaration[decl.declaration_id] ?? []),
    [declarations, costsByDeclaration],
  );
  const cifTotal = costRows.reduce((sum, cost) => sum + (cost.cif_total_krw ?? 0), 0);
  const landedSavedRows = costRows.filter((cost) => cost.landed_wp_krw != null).length;
  const totalCapacityKW = costRows.reduce((sum, cost) => sum + (cost.capacity_kw ?? 0), 0);
  const calcItems = calcResult?.items ?? [];
  const calcTotal = calcItems.reduce((sum, item) => sum + (item.landed_total_krw ?? 0), 0);
  const calcExpenseTotal = calcItems.reduce((sum, item) => sum + (item.total_expense_krw ?? 0), 0);

  const runLandedCost = async (save: boolean) => {
    setCalcLoading(true);
    setError('');
    try {
      const result = await fetchWithAuth<LandedCostResult>('/api/v1/calc/landed-cost', {
        method: 'POST',
        body: JSON.stringify({ bl_id: bl.bl_id, company_id: bl.company_id, save }),
      });
      setCalcResult(result);
      if (save) {
        notify.success('Landed Cost를 저장했습니다');
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Landed Cost 계산에 실패했습니다');
    } finally {
      setCalcLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-md border bg-card p-3">
          <p className="text-[10px] text-muted-foreground">면장</p>
          <p className="mt-1 text-sm font-semibold">{declarations.length.toLocaleString('ko-KR')}건</p>
        </div>
        <div className="rounded-md border bg-card p-3">
          <p className="text-[10px] text-muted-foreground">원가라인</p>
          <p className="mt-1 text-sm font-semibold">{costRows.length.toLocaleString('ko-KR')}건</p>
        </div>
        <div className="rounded-md border bg-card p-3">
          <p className="text-[10px] text-muted-foreground">CIF 원화</p>
          <p className="mt-1 text-sm font-semibold">{formatKRW(cifTotal)}</p>
        </div>
        <div className="rounded-md border bg-card p-3">
          <p className="text-[10px] text-muted-foreground">Landed 저장</p>
          <p className="mt-1 text-sm font-semibold">{landedSavedRows}/{costRows.length}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 pt-3">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <FileText className="h-3.5 w-3.5" />면장정보
          </CardTitle>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />새로고침
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground">불러오는 중…</p>
          ) : declarations.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              연결된 면장이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {declarations.map((decl) => (
                <div key={decl.declaration_id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-[13px] font-semibold">{decl.declaration_number}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(decl.declaration_date)} · {decl.customs_office ?? '세관 미지정'}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      <p>B/L <span className="text-[13px]">{decl.bl_number ?? bl.bl_number}</span></p>
                      <p>{decl.port ?? bl.port ?? '항구 미지정'}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                    <div><span className="text-muted-foreground">입항</span><p>{decl.arrival_date ? formatDate(decl.arrival_date) : '—'}</p></div>
                    <div><span className="text-muted-foreground">반출</span><p>{decl.release_date ? formatDate(decl.release_date) : '—'}</p></div>
                    <div><span className="text-muted-foreground">HS</span><p>{decl.hs_code ?? '—'}</p></div>
                    <div><span className="text-muted-foreground">환율</span><p>{decl.exchange_rate ? formatNumber(decl.exchange_rate) : formatNumber(bl.exchange_rate)}</p></div>
                    <div><span className="text-muted-foreground">CIF</span><p>{formatKRW(decl.cif_krw ?? bl.cif_amount_krw)}</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm">원가라인</CardTitle>
        </CardHeader>
        <CardContent>
          {costRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              연결된 원가라인이 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>품목</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-right">용량</TableHead>
                    <TableHead className="text-right">환율</TableHead>
                    <TableHead className="text-right">CIF</TableHead>
                    <TableHead className="text-right">CIF/Wp</TableHead>
                    <TableHead className="text-right">Landed/Wp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costRows.map((cost) => (
                    <TableRow key={cost.cost_id}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{cost.product_name ?? productNames.get(cost.product_id) ?? shortId(cost.product_id)}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{cost.product_code ?? shortId(cost.product_id)}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatNumber(cost.quantity)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatNumber(cost.capacity_kw)} kW</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatNumber(cost.exchange_rate)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatKRW(cost.cif_total_krw)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtWonWp(cost.cif_wp_krw)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtWonWp(cost.landed_wp_krw)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <BLExpensesTab blId={bl.bl_id} lines={lines} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 pt-3">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Calculator className="h-3.5 w-3.5" />Landed Cost
          </CardTitle>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void runLandedCost(false)} disabled={calcLoading || costRows.length === 0}>
              <Calculator className="mr-1 h-3.5 w-3.5" />미리보기
            </Button>
            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => void runLandedCost(true)} disabled={calcLoading || costRows.length === 0}>
              <Save className="mr-1 h-3.5 w-3.5" />저장
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <div><span className="text-muted-foreground">CIF</span><p className="font-semibold">{formatKRW(cifTotal)}</p></div>
            <div><span className="text-muted-foreground">부대비용 배분</span><p className="font-semibold">{formatKRW(calcExpenseTotal)}</p></div>
            <div><span className="text-muted-foreground">용량</span><p className="font-semibold">{formatNumber(totalCapacityKW)} kW</p></div>
            <div><span className="text-muted-foreground">계산총액</span><p className="font-semibold">{formatKRW(calcTotal)}</p></div>
          </div>

          {calcResult && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>품목</TableHead>
                    <TableHead className="text-right">CIF/Wp</TableHead>
                    <TableHead className="text-right">관세</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">배분비용</TableHead>
                    <TableHead className="text-right">Landed/Wp</TableHead>
                    <TableHead className="text-right">차이</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calcItems.map((item) => (
                    <TableRow key={item.cost_id}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{item.product_name ?? productNames.get(item.product_id) ?? shortId(item.product_id)}</div>
                        <div className="font-mono text-[13px] text-muted-foreground">{item.declaration_number}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtWonWp(item.cif_wp_krw)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatKRW(item.tariff_amount)}
                        <div className="text-[10px] text-muted-foreground">{fmtPercent(item.tariff_rate)}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatKRW(item.vat_amount)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{allocatedExpenseText(item.allocated_expenses)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">{fmtWonWp(item.landed_wp_krw)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtWonWp(item.margin_vs_cif_krw)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
