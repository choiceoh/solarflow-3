import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import { confirmDialog } from '@/lib/dialogs';
import { useAppStore } from '@/stores/appStore';
import { EXPENSE_TYPES_ACTIVE, type Expense, type ExpenseType } from '@/types/customs';
import type { BLLineItem } from '@/types/inbound';

/**
 * F20: BL 상세 안의 부대비용 등록 탭
 * - 주요 비용유형을 한 화면에 줄로 펼침
 * - 각 줄: 금액 / VAT / 거래처 / 메모 + 저장 버튼
 * - 합계와 Wp당 단가를 자동 계산
 */
interface Props {
  blId: string;
  lines: BLLineItem[];
}

interface RowState {
  expense_id?: string;
  amount: string;
  vat: string;
  vendor: string;
  memo: string;
  saving?: boolean;
  error?: string;
}

const emptyRow = (): RowState => ({ amount: '', vat: '', vendor: '', memo: '' });

export default function BLExpensesTab({ blId, lines }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [rows, setRows] = useState<Record<ExpenseType, RowState>>(() => {
    const init = {} as Record<ExpenseType, RowState>;
    EXPENSE_TYPES_ACTIVE.forEach((t) => { init[t.value] = emptyRow(); });
    return init;
  });
  const [loading, setLoading] = useState(true);

  // 총 Wp = sum(capacity_kw * 1000)
  const totalWp = useMemo(
    () => lines.reduce((s, l) => s + (l.capacity_kw || 0) * 1000, 0),
    [lines],
  );

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchWithAuth<Expense[]>(`/api/v1/expenses?bl_id=${blId}`);
      setRows((prev) => {
        const next = { ...prev };
        EXPENSE_TYPES_ACTIVE.forEach((t) => {
          const found = list.find((e) => e.expense_type === t.value);
          next[t.value] = found
            ? {
                expense_id: found.expense_id,
                amount: String(found.amount ?? ''),
                vat: found.vat != null ? String(found.vat) : '',
                vendor: found.vendor ?? '',
                memo: found.memo ?? '',
              }
            : emptyRow();
        });
        return next;
      });
    } catch {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [blId]);

  const totalAmount = useMemo(() => {
    return EXPENSE_TYPES_ACTIVE.reduce((s, t) => {
      const r = rows[t.value];
      const a = parseFloat(r.amount) || 0;
      const v = parseFloat(r.vat) || 0;
      return s + a + v;
    }, 0);
  }, [rows]);

  const wpUnit = totalWp > 0 ? totalAmount / totalWp : 0;

  const setField = (type: ExpenseType, field: keyof RowState, value: string) => {
    setRows((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value, error: undefined } }));
  };

  const saveRow = async (type: ExpenseType) => {
    const r = rows[type];
    const amt = parseFloat(r.amount) || 0;
    const vat = parseFloat(r.vat) || 0;
    if (amt <= 0) {
      setRows((prev) => ({ ...prev, [type]: { ...prev[type], error: '금액을 입력하세요' } }));
      return;
    }
    setRows((prev) => ({ ...prev, [type]: { ...prev[type], saving: true, error: undefined } }));
    try {
      const payload: Record<string, unknown> = {
        company_id: selectedCompanyId,
        bl_id: blId,
        expense_type: type,
        amount: amt,
        vat,
        total: amt + vat,
        vendor: r.vendor || undefined,
        memo: r.memo || undefined,
      };
      if (r.expense_id) {
        await fetchWithAuth(`/api/v1/expenses/${r.expense_id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchWithAuth('/api/v1/expenses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await load();
    } catch (err) {
      setRows((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          saving: false,
          error: err instanceof Error ? err.message : '저장 실패',
        },
      }));
    }
  };

  const deleteRow = async (type: ExpenseType) => {
    const r = rows[type];
    if (!r.expense_id) {
      setRows((prev) => ({ ...prev, [type]: emptyRow() }));
      return;
    }
    const ok = await confirmDialog({
      description: `${EXPENSE_TYPES_ACTIVE.find(t => t.value === type)?.label} 항목을 삭제하시겠습니까?`,
      variant: 'destructive',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    try {
      await fetchWithAuth(`/api/v1/expenses/${r.expense_id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm">부대비용 등록 (이 BL에 귀속)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">불러오는 중…</p>
          ) : (
            <div className="space-y-2">
              {/* 헤더 */}
              <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground px-1">
                <div className="col-span-2">비용유형</div>
                <div className="col-span-2">금액</div>
                <div className="col-span-1">VAT</div>
                <div className="col-span-2">합계</div>
                <div className="col-span-2">거래처</div>
                <div className="col-span-2">메모</div>
                <div className="col-span-1 text-right">저장</div>
              </div>
              {EXPENSE_TYPES_ACTIVE.map((t) => {
                const r = rows[t.value];
                const amt = parseFloat(r.amount) || 0;
                const vat = parseFloat(r.vat) || 0;
                const sum = amt + vat;
                return (
                  <div key={t.value} className="grid grid-cols-12 gap-2 items-center">
                    <Label className="col-span-2 text-xs">{t.label}</Label>
                    <Input
                      className="col-span-2 h-8 text-xs"
                      type="number"
                      min={0}
                      value={r.amount}
                      onChange={(e) => setField(t.value, 'amount', e.target.value)}
                      placeholder="0"
                    />
                    <Input
                      className="col-span-1 h-8 text-xs"
                      type="number"
                      min={0}
                      value={r.vat}
                      onChange={(e) => setField(t.value, 'vat', e.target.value)}
                      placeholder="0"
                    />
                    <div className="col-span-2 text-xs">
                      {sum > 0 ? `${sum.toLocaleString('ko-KR')}원` : '—'}
                    </div>
                    <Input
                      className="col-span-2 h-8 text-xs"
                      value={r.vendor}
                      onChange={(e) => setField(t.value, 'vendor', e.target.value)}
                      placeholder="거래처"
                    />
                    <Input
                      className="col-span-2 h-8 text-xs"
                      value={r.memo}
                      onChange={(e) => setField(t.value, 'memo', e.target.value)}
                      placeholder="메모"
                    />
                    <div className="col-span-1 flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={r.saving}
                        onClick={() => saveRow(t.value)}
                      >
                        {r.saving ? '...' : r.expense_id ? '수정' : '저장'}
                      </Button>
                      {r.expense_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive"
                          onClick={() => deleteRow(t.value)}
                        >
                          삭제
                        </Button>
                      )}
                    </div>
                    {r.error && (
                      <div className="col-span-12 text-[11px] text-destructive pl-1">{r.error}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm">자동 계산</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground">총 부대비용 (VAT 포함)</p>
              <p className="font-semibold">{totalAmount.toLocaleString('ko-KR')} 원</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">이 BL 총 용량</p>
              <p className="font-semibold">
                {totalWp > 0 ? `${totalWp.toLocaleString('ko-KR')} Wp` : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Wp당 부대비용</p>
              <p className="font-semibold text-primary">
                {wpUnit > 0 ? `${wpUnit.toFixed(2)} 원/Wp` : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
