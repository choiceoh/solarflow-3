import { useEffect, useState } from 'react';
import { Truck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchWithAuth } from '@/lib/api';
import { confirmDialog } from '@/lib/dialogs';
import { formatNumber } from '@/lib/utils';
import type { Expense } from '@/types/customs';
import type { Outbound } from '@/types/outbound';

interface Props {
  outbound: Outbound;
}

interface FormState {
  expense_id?: string;
  amount: string;
  vat: string;
  vendor: string;
  vehicle_type: string;
  destination: string;
  memo: string;
}

const emptyState: FormState = {
  amount: '',
  vat: '',
  vendor: '',
  vehicle_type: '',
  destination: '',
  memo: '',
};

export default function OutboundTransportCostPanel({ outbound }: Props) {
  const [form, setForm] = useState<FormState>(emptyState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const expenses = await fetchWithAuth<Expense[]>(
        `/api/v1/expenses?outbound_id=${outbound.outbound_id}&expense_type=transport`,
      );
      const found = expenses[0];
      setForm(found ? {
        expense_id: found.expense_id,
        amount: String(found.amount ?? ''),
        vat: found.vat != null ? String(found.vat) : '',
        vendor: found.vendor ?? '',
        vehicle_type: found.vehicle_type ?? '',
        destination: found.destination ?? '',
        memo: found.memo ?? '',
      } : emptyState);
    } catch (err) {
      setError(err instanceof Error ? err.message : '운임 정보를 불러오지 못했습니다');
      setForm(emptyState);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbound.outbound_id]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const amount = parseFloat(form.amount) || 0;
  const vat = parseFloat(form.vat) || 0;
  const total = amount + vat;

  const save = async () => {
    if (amount <= 0) {
      setError('운임 금액을 입력하세요');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        company_id: outbound.company_id,
        outbound_id: outbound.outbound_id,
        expense_type: 'transport',
        amount,
        vat,
        total,
        vendor: form.vendor || undefined,
        vehicle_type: form.vehicle_type || undefined,
        destination: form.destination || undefined,
        memo: form.memo || undefined,
      };
      if (form.expense_id) {
        await fetchWithAuth(`/api/v1/expenses/${form.expense_id}`, {
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
      setError(err instanceof Error ? err.message : '운임 저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form.expense_id) {
      setForm(emptyState);
      return;
    }
    const ok = await confirmDialog({
      description: '이 출고 운임을 삭제할까요?',
      variant: 'destructive',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    setSaving(true);
    setError('');
    try {
      await fetchWithAuth(`/api/v1/expenses/${form.expense_id}`, { method: 'DELETE' });
      setForm(emptyState);
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Truck className="h-4 w-4" />
          출고 운임
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">불러오는 중...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <div className="space-y-1">
                <Label className="text-xs">운송사</Label>
                <Input className="h-8 text-xs" value={form.vendor} onChange={(e) => setField('vendor', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">차량</Label>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={form.vehicle_type}
                  onChange={(e) => setField('vehicle_type', e.target.value)}
                >
                  <option value="">선택</option>
                  <option value="5톤">5톤</option>
                  <option value="25톤">25톤</option>
                  <option value="트레일러">트레일러</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs">배송지</Label>
                <Input className="h-8 text-xs" value={form.destination} onChange={(e) => setField('destination', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">공급가</Label>
                <Input className="h-8 text-xs" type="number" min={0} value={form.amount} onChange={(e) => setField('amount', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">VAT</Label>
                <Input className="h-8 text-xs" type="number" min={0} value={form.vat} onChange={(e) => setField('vat', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
              <Input
                className="h-8 text-xs"
                value={form.memo}
                onChange={(e) => setField('memo', e.target.value)}
                placeholder="메모"
              />
              <div className="flex items-center justify-between gap-2 lg:justify-end">
                <span className="text-xs text-muted-foreground">합계 {total > 0 ? `${formatNumber(total)}원` : '—'}</span>
                {form.expense_id && (
                  <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={remove} disabled={saving}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />삭제
                  </Button>
                )}
                <Button size="sm" className="h-8" onClick={save} disabled={saving}>
                  {saving ? '저장 중' : form.expense_id ? '수정' : '저장'}
                </Button>
              </div>
            </div>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
