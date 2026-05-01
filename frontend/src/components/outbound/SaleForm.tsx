import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
import { fetchWithAuth } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import type { Outbound, Sale } from '@/types/outbound';
import type { Order } from '@/types/orders';
import type { Partner } from '@/types/masters';

const schema = z.object({
  customer_id: z.string().min(1, '거래처는 필수입니다'),
  quantity: z.coerce.number().positive('양수 필수'),
  unit_price_wp: z.coerce.number().positive('양수 필수'),
  tax_invoice_date: z.string().optional(),
  tax_invoice_email: z.string().email('이메일 형식').optional().or(z.literal('')),
  erp_closed: z.boolean().optional(),
  erp_closed_date: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  outbound?: Outbound;
  order?: Order;
  editData?: Sale | null;
  costPerWp?: number | null;  // BL 원가 (원/Wp) — OutboundDetailView에서 계산해 전달
}

// 비유: Wp단가 하나만 입력하면 EA단가→공급가→부가세→합계가 자동 계산되는 계산기
export default function SaleForm({ open, onOpenChange, onSubmit, outbound, order, editData, costPerWp }: Props) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [submitError, setSubmitError] = useState('');

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
  });

  const source = outbound ?? order;
  const sourceKind = outbound ? 'outbound' : 'order';
  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가
  const unitPriceWp = watch('unit_price_wp') || 0;
  const formQuantity = watch('quantity') || 0;
  const specWp = source?.spec_wp ?? 0;
  const wattageKw = source?.wattage_kw ?? (specWp ? specWp / 1000 : 0);
  const quantity = formQuantity || source?.quantity || 0;
  const capacityKw = quantity * wattageKw;
  const erpClosed = watch('erp_closed') ?? false;
  const sourceUnitPriceWp = outbound?.unit_price_wp ?? order?.unit_price_wp;

  // 자동 계산
  const unitPriceEa = unitPriceWp * specWp;
  const supplyAmount = unitPriceEa * quantity;
  const vatAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;

  useEffect(() => {
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
        reset({
          customer_id: editData.customer_id,
          quantity: editData.quantity ?? source?.quantity ?? ('' as unknown as number),
          unit_price_wp: editData.unit_price_wp,
          tax_invoice_date: editData.tax_invoice_date?.slice(0, 10) ?? '',
          tax_invoice_email: editData.tax_invoice_email ?? '',
          erp_closed: editData.erp_closed ?? false,
          erp_closed_date: editData.erp_closed_date?.slice(0, 10) ?? '',
          memo: editData.memo ?? '',
        });
      } else {
        reset({
          customer_id: source?.customer_id ?? '',
          quantity: source?.quantity ?? ('' as unknown as number),
          unit_price_wp: sourceUnitPriceWp ?? ('' as unknown as number),
          tax_invoice_date: '', tax_invoice_email: '',
          erp_closed: false, erp_closed_date: '', memo: '',
        });
      }
    }
  }, [open, editData, reset, source, sourceUnitPriceWp]);

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = {
      ...data,
      ...(outbound ? { outbound_id: outbound.outbound_id } : {}),
      ...(order ? { order_id: order.order_id } : {}),
      capacity_kw: capacityKw,
      unit_price_ea: unitPriceEa,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
    };
    if (!data.tax_invoice_date) delete payload.tax_invoice_date;
    if (!data.tax_invoice_email) delete payload.tax_invoice_email;
    if (!data.erp_closed) {
      delete payload.erp_closed_date;
    }
    if (!data.erp_closed_date) delete payload.erp_closed_date;
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '매출 수정' : '매출 등록'}</DialogTitle>
        </DialogHeader>
        {submitError && (
          <div className="sf-banner neg">
            <span className="sf-banner-body">{submitError}</span>
          </div>
        )}
        {/* 출고 품목 정보 박스 */}
        <div
          className="grid grid-cols-4 gap-3 rounded-md p-3"
          style={{ background: 'var(--sf-bg-2)', border: '1px solid var(--sf-line)' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="sf-eyebrow">기준</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--sf-ink)' }}>{sourceKind === 'outbound' ? '출고' : '수주'}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="sf-eyebrow">품명</span>
            <span className="truncate text-xs font-semibold" style={{ color: 'var(--sf-ink)' }}>{source?.product_name ?? '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="sf-eyebrow">규격</span>
            <span className="sf-mono text-xs font-semibold" style={{ color: 'var(--sf-ink)' }}>{source?.product_code ?? `${source?.spec_wp ?? '—'}Wp`}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="sf-eyebrow">기준수량</span>
            <span className="sf-mono text-xs font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>
              {(source?.quantity ?? 0).toLocaleString('ko-KR')}장
            </span>
          </div>
        </div>
        <form onSubmit={handleSubmit(handle)} className="sf-form">
          <div className="sf-form-field">
            <Label>거래처 *</Label>
            <PartnerCombobox
              partners={partners}
              value={watch('customer_id') ?? ''}
              onChange={(v) => setValue('customer_id', v, { shouldValidate: true })}
              error={!!errors.customer_id}
            />
            {errors.customer_id && <span className="sf-field-error">{errors.customer_id.message}</span>}
          </div>

          <div className="sf-form-row cols-2">
            <div className="sf-form-field">
              <Label>계산서 수량 *</Label>
              <Input type="number" step="1" className="text-right" {...register('quantity')} />
              {errors.quantity && <span className="sf-field-error">{errors.quantity.message}</span>}
            </div>
            <div className="sf-form-field">
              <Label>계산서 용량</Label>
              <Input readOnly className="bg-muted text-right" value={capacityKw ? capacityKw.toFixed(3) : '—'} />
            </div>
          </div>

          <div className="sf-form-field">
            <Label>Wp 단가 (원/Wp) *</Label>
            <Input type="number" step="0.01" className="text-right" {...register('unit_price_wp')} />
            {errors.unit_price_wp && <span className="sf-field-error">{errors.unit_price_wp.message}</span>}
          </div>

          {unitPriceWp > 0 && specWp > 0 && (() => {
            const profitWp = costPerWp != null ? unitPriceWp - costPerWp : null;
            const profitRate = costPerWp != null && costPerWp > 0
              ? ((unitPriceWp - costPerWp) / costPerWp * 100)
              : null;
            const totalProfit = profitWp != null ? profitWp * specWp * quantity : null;
            return (
              <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span>EA단가</span><span>{formatNumber(unitPriceEa)}원 ({unitPriceWp} x {specWp}Wp)</span></div>
                <div className="flex justify-between"><span>공급가</span><span>{formatNumber(supplyAmount)}원</span></div>
                <div className="flex justify-between"><span>부가세 (10%)</span><span>{formatNumber(vatAmount)}원</span></div>
                <div className="flex justify-between font-semibold border-t pt-1"><span>합계</span><span>{formatNumber(totalAmount)}원</span></div>
                {costPerWp != null && (
                  <div className="border-t pt-2 mt-1 space-y-1">
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">BL 원가 기반 이익</div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">BL 원가</span>
                      <span className="font-mono">{costPerWp.toFixed(2)}원/Wp</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">판매가</span>
                      <span className="font-mono">{unitPriceWp.toFixed(2)}원/Wp</span>
                    </div>
                    <div className={`flex justify-between font-semibold ${(profitWp ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      <span>이익</span>
                      <span className="font-mono">
                        {profitWp != null ? `${profitWp >= 0 ? '+' : ''}${profitWp.toFixed(2)}원/Wp` : '—'}
                        {profitRate != null && (
                          <span className="ml-2 text-[10px]">({profitRate >= 0 ? '+' : ''}{profitRate.toFixed(1)}%)</span>
                        )}
                      </span>
                    </div>
                    {totalProfit != null && (
                      <div className={`flex justify-between text-[10px] border-t pt-1 ${totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        <span>총 이익 (세전)</span>
                        <span className="font-mono font-medium">{totalProfit >= 0 ? '+' : ''}{Math.round(totalProfit).toLocaleString('ko-KR')}원</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="sf-form-field">
            <Label>세금계산서 발행일</Label>
            <DateInput value={watch('tax_invoice_date') ?? ''} onChange={(v) => setValue('tax_invoice_date', v, { shouldDirty: true })} />
            <span className="sf-form-helper">출고일과 다를 수 있습니다 (다음달 발행 가능)</span>
          </div>

          <div className="sf-form-field">
            <Label>세금계산서 이메일</Label>
            <Input type="email" {...register('tax_invoice_email')} placeholder="example@company.com" />
            {errors.tax_invoice_email && <span className="sf-field-error">{errors.tax_invoice_email.message}</span>}
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch checked={erpClosed} onCheckedChange={(v) => setValue('erp_closed', v)} />
            <Label className="cursor-pointer">ERP 마감</Label>
          </div>

          {erpClosed && (
            <div className="sf-form-field">
              <Label>ERP 마감일</Label>
              <DateInput value={watch('erp_closed_date') ?? ''} onChange={(v) => setValue('erp_closed_date', v, { shouldDirty: true })} />
            </div>
          )}

          <div className="sf-form-field"><Label>메모</Label><Textarea {...register('memo')} rows={2} /></div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
