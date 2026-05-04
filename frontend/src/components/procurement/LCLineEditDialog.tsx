// LC 라인(분할 인수) 편집 다이얼로그.
// 비유: LC 서류에 "이 PO 품목 중 몇 매를 인수할지" 명세표를 붙이는 작업.
// PO 라인 목록을 보여주고, 사용자가 각 PO 라인에서 인수할 수량을 입력한다.
// 빈 행(모두 0/없음)은 제외하고 PUT /api/v1/lcs/{id}로 line_items 교체.

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import type { LCRecord, POLineItem } from '@/types/procurement';

interface LCLineFromServer {
  lc_line_id: string;
  lc_id: string;
  po_line_id?: string;
  product_id: string;
  quantity: number;
  capacity_kw: number;
  amount_usd?: number;
  unit_price_usd_wp?: number;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  memo?: string;
  products?: { product_code?: string; product_name?: string; spec_wp?: number };
}

interface DraftRow {
  poLine: POLineItem;
  productCode: string;
  productName: string;
  specWp: number;
  itemType: 'main' | 'spare';
  paymentType: 'paid' | 'free';
  poLineQty: number;
  poUnitPriceUsdWp: number; // 원 PO 라인의 USD/Wp (LC도 동일 단가 가정)
  qty: string; // 사용자 입력 (수량)
  memo: string;
}

interface Props {
  open: boolean;
  lc: LCRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function LCLineEditDialog({ open, lc, onClose, onSaved }: Props) {
  const [poLines, setPoLines] = useState<POLineItem[]>([]);
  const [existingLines, setExistingLines] = useState<LCLineFromServer[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !lc) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchWithAuth<POLineItem[]>(`/api/v1/pos/${lc.po_id}/lines`),
      fetchWithAuth<LCLineFromServer[]>(`/api/v1/lcs/${lc.lc_id}/lines`).catch(() => [] as LCLineFromServer[]),
    ]).then(([poL, lcL]) => {
      if (cancelled) return;
      setPoLines(poL);
      setExistingLines(lcL);
      // 기존 LC 라인을 PO 라인 키로 매핑해서 초기 수량을 채운다.
      const taken = new Map<string, number>();
      for (const l of lcL) {
        if (l.po_line_id) taken.set(l.po_line_id, (taken.get(l.po_line_id) ?? 0) + l.quantity);
      }
      const initialMemo = lcL.find((l) => l.memo)?.memo ?? '';
      setMemo(initialMemo);
      const draft: DraftRow[] = poL.map((pl) => {
        // 라인 단가가 PO 헤더에 unit_price_usd만 있고 unit_price_usd_wp가 없는 경우, 역산.
        const specWp = pl.spec_wp ?? pl.products?.spec_wp ?? 0;
        const unitWp = pl.unit_price_usd_wp ?? (pl.unit_price_usd && specWp > 0 ? pl.unit_price_usd / specWp : 0);
        const existingQty = taken.get(pl.po_line_id) ?? 0;
        return {
          poLine: pl,
          productCode: pl.product_code ?? pl.products?.product_code ?? '—',
          productName: pl.product_name ?? pl.products?.product_name ?? '',
          specWp,
          itemType: (pl.item_type ?? 'main') as 'main' | 'spare',
          paymentType: (pl.payment_type ?? 'paid') as 'paid' | 'free',
          poLineQty: pl.quantity,
          poUnitPriceUsdWp: unitWp,
          qty: existingQty > 0 ? String(existingQty) : '',
          memo: '',
        };
      });
      setRows(draft);
    }).catch((e) => {
      if (cancelled) return;
      notify.error(e instanceof Error ? e.message : 'LC 라인 로드 실패');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, lc]);

  // 다른 LC가 이미 인수한 수량을 표시하기 위해 sibling LC들의 라인을 합산하는 건 1차 범위 외.
  // (PO.line.quantity - 현재 LC가 가진 qty) 만 안전 상한으로 사용.
  function updateQty(poLineId: string, qty: string) {
    setRows((prev) => prev.map((r) => (r.poLine.po_line_id === poLineId ? { ...r, qty } : r)));
  }

  const totals = useMemo(() => {
    let qty = 0;
    let amountUsd = 0;
    for (const r of rows) {
      const q = Number(r.qty);
      if (!Number.isFinite(q) || q <= 0) continue;
      qty += q;
      amountUsd += q * r.poUnitPriceUsdWp * r.specWp;
    }
    return { qty, amountUsd };
  }, [rows]);

  const lcAmountWarning = useMemo(() => {
    if (!lc) return null;
    if (totals.amountUsd === 0) return null;
    const diff = totals.amountUsd - lc.amount_usd;
    const pct = lc.amount_usd > 0 ? Math.abs(diff / lc.amount_usd) * 100 : 0;
    if (pct < 1) return null;
    return `LC 헤더 금액 ${lc.amount_usd.toLocaleString()} USD와 라인 합계 ${totals.amountUsd.toLocaleString()} USD가 ${pct.toFixed(1)}% 차이 (라인 단가는 PO 단가 기준 자동계산)`;
  }, [lc, totals]);

  function validate(): string | null {
    if (!lc) return 'LC가 선택되지 않았습니다';
    const filled = rows.filter((r) => Number(r.qty) > 0);
    if (filled.length === 0) return '인수 수량을 1개 이상 입력해주세요';
    for (const r of filled) {
      const q = Number(r.qty);
      if (!Number.isInteger(q) || q <= 0) return `${r.productCode} 라인 수량은 양의 정수여야 합니다`;
      if (q > r.poLineQty) return `${r.productCode} 라인 수량(${q})이 PO 라인 보유분(${r.poLineQty})을 초과합니다`;
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { notify.error(err); return; }
    if (!lc) return;
    setSubmitting(true);
    try {
      const lineItems = rows
        .filter((r) => Number(r.qty) > 0)
        .map((r) => {
          const q = Number(r.qty);
          const capacityKw = (r.specWp * q) / 1000;
          const amountUsd = r.poUnitPriceUsdWp * r.specWp * q;
          return {
            po_line_id: r.poLine.po_line_id,
            product_id: r.poLine.product_id,
            quantity: q,
            capacity_kw: capacityKw,
            amount_usd: amountUsd,
            unit_price_usd_wp: r.poUnitPriceUsdWp,
            item_type: r.itemType,
            payment_type: r.paymentType,
            ...(r.memo.trim() ? { memo: r.memo.trim() } : {}),
          };
        });

      // PUT /api/v1/lcs/{id} with line_items → 서버가 sf_update_lc_with_lines로 라인 일괄 교체.
      // 헤더 다른 필드는 안 보내면 모두 그대로 유지 (UpdateLCRequest 모든 필드 optional).
      await fetchWithAuth(`/api/v1/lcs/${lc.lc_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          line_items: lineItems,
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        }),
      });
      notify.success(`L/C ${lc.lc_number ?? lc.lc_id.slice(0, 8)} 라인 ${lineItems.length}건 저장 완료`);
      onSaved();
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'LC 라인 저장 실패');
    } finally {
      setSubmitting(false);
    }
  }

  if (!lc) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>L/C {lc.lc_number ?? lc.lc_id.slice(0, 8)} 라인 편집</DialogTitle>
          <p className="text-xs text-muted-foreground">
            이 LC가 PO의 어떤 품목을 몇 매 인수할지 입력하세요. 빈 행은 저장에서 제외됩니다. 저장 시 기존 라인은 모두 새 라인으로 대체됩니다.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : poLines.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">이 PO에 라인이 없습니다. PO 상세에서 라인을 먼저 추가하세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">품번</th>
                    <th className="p-2 text-right">PO 수량</th>
                    <th className="p-2 text-right">USD/Wp</th>
                    <th className="p-2 text-center">구분</th>
                    <th className="p-2 text-center">유무상</th>
                    <th className="p-2 text-right" style={{ width: 120 }}>인수 수량</th>
                    <th className="p-2 text-right">금액(USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const q = Number(r.qty);
                    const valid = Number.isFinite(q) && q > 0;
                    const overflow = valid && q > r.poLineQty;
                    const amount = valid ? q * r.poUnitPriceUsdWp * r.specWp : 0;
                    return (
                      <tr key={r.poLine.po_line_id} className="border-t">
                        <td className="p-2">
                          <div className="font-medium">{r.productCode}</div>
                          {r.productName && <div className="text-[11px] text-muted-foreground">{r.productName} · {r.specWp}Wp</div>}
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums">{r.poLineQty.toLocaleString()}</td>
                        <td className="p-2 text-right font-mono tabular-nums">{r.poUnitPriceUsdWp.toFixed(3)}</td>
                        <td className="p-2 text-center text-muted-foreground">{r.itemType === 'main' ? '본품' : '스페어'}</td>
                        <td className="p-2 text-center text-muted-foreground">{r.paymentType === 'paid' ? '유상' : '무상'}</td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            max={r.poLineQty}
                            value={r.qty}
                            onChange={(e) => updateQty(r.poLine.po_line_id, e.target.value)}
                            placeholder="0"
                            className={overflow ? 'border-destructive text-destructive' : ''}
                          />
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums">
                          {valid ? amount.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr className="border-t font-medium">
                    <td className="p-2" colSpan={5}>합계</td>
                    <td className="p-2 text-right font-mono tabular-nums">{totals.qty.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono tabular-nums">
                      {totals.amountUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {lcAmountWarning && (
              <div className="rounded-md border border-amber-500/30 bg-amber-50 p-2 text-[11px] text-amber-700">
                {lcAmountWarning}
              </div>
            )}

            <div>
              <label className="mb-1 block text-[12px] font-medium">메모 (전체)</label>
              <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="LC 메모 (선택)" />
            </div>

            {existingLines.length > 0 && (
              <div className="rounded-md border border-muted bg-muted/20 p-2 text-[11px] text-muted-foreground">
                기존 라인 {existingLines.length}건이 위 입력값으로 모두 대체됩니다.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>취소</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || loading || poLines.length === 0}>
            {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {submitting ? '저장 중...' : '라인 저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
