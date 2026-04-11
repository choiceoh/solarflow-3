import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { USAGE_CATEGORY_LABEL, type Outbound, type UsageCategory } from '@/types/outbound';
import type { Product, Warehouse } from '@/types/masters';
import type { BLShipment } from '@/types/inbound';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  outbound_date: z.string().min(1, '출고일은 필수입니다'),
  product_id: z.string().min(1, '품번은 필수입니다'),
  quantity: z.coerce.number().positive('양수 필수'),
  warehouse_id: z.string().min(1, '창고는 필수입니다'),
  usage_category: z.string().min(1, '용도는 필수입니다'),
  order_id: z.string().optional(),
  bl_id: z.string().optional(),
  site_name: z.string().optional(),
  site_address: z.string().optional(),
  spare_qty: z.coerce.number().optional().or(z.literal('')),
  group_trade: z.boolean().optional(),
  target_company_id: z.string().optional(),
  erp_outbound_no: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Outbound | null;
}

function fmtInt(v: number | string | undefined): string {
  if (v === '' || v === undefined || v === null) return '';
  const n = typeof v === 'string' ? parseInt(v.replace(/[^0-9]/g, ''), 10) : Math.round(Number(v));
  return isNaN(n) ? '' : n.toLocaleString('ko-KR');
}

export default function OutboundForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const companies = useAppStore((s) => s.companies);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [orders, setOrders] = useState<{ order_id: string; order_number: string; remaining_qty?: number }[]>([]);
  const [bls, setBls] = useState<BLShipment[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [qtyDisplay, setQtyDisplay] = useState('');
  const [spareQtyDisplay, setSpareQtyDisplay] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  const selectedProductId = watch('product_id');
  const selectedProduct = products.find((p) => p.product_id === selectedProductId);
  const quantity = watch('quantity') || 0;
  const capacityKw = selectedProduct ? quantity * selectedProduct.wattage_kw : 0;
  const groupTrade = watch('group_trade') ?? false;
  const selectedOrderId = watch('order_id');
  const selectedOrder = orders.find((o) => o.order_id === selectedOrderId);
  const selectedBlId = watch('bl_id') ?? '';
  const selectedBl = bls.find((b) => b.bl_id === selectedBlId);
  const usageCat = watch('usage_category') ?? '';
  const warehouseId = watch('warehouse_id') ?? '';
  const targetCompanyId = watch('target_company_id') ?? '';

  useEffect(() => {
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
    fetchWithAuth<Warehouse[]>('/api/v1/warehouses')
      .then((list) => setWarehouses(list.filter((w) => w.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    fetchWithAuth<{ order_id: string; order_number: string; remaining_qty?: number }[]>(
      `/api/v1/orders?company_id=${selectedCompanyId}`
    ).then(setOrders).catch(() => {});
  }, [selectedCompanyId]);

  // 품번 선택 시 해당 제조사의 B/L 목록 로드 (완료/ERP등록 상태만)
  useEffect(() => {
    if (!selectedProduct?.manufacturer_id) { setBls([]); return; }
    fetchWithAuth<BLShipment[]>(
      `/api/v1/bls?manufacturer_id=${selectedProduct.manufacturer_id}`
    )
      .then((list) => {
        const done = (list ?? []).filter((b) =>
          ['completed', 'erp_done', 'arrived', 'customs'].includes(b.status)
        );
        setBls(done);
      })
      .catch(() => setBls([]));
  }, [selectedProduct?.manufacturer_id]);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
        reset({
          outbound_date: editData.outbound_date?.slice(0, 10) ?? '',
          product_id: editData.product_id,
          quantity: editData.quantity,
          warehouse_id: editData.warehouse_id,
          usage_category: editData.usage_category,
          order_id: editData.order_id ?? '',
          bl_id: editData.bl_id ?? '',
          site_name: editData.site_name ?? '',
          site_address: editData.site_address ?? '',
          spare_qty: editData.spare_qty ?? '',
          group_trade: editData.group_trade ?? false,
          target_company_id: editData.target_company_id ?? '',
          erp_outbound_no: editData.erp_outbound_no ?? '',
          memo: editData.memo ?? '',
        });
        setQtyDisplay(fmtInt(editData.quantity));
        setSpareQtyDisplay(fmtInt(editData.spare_qty));
      } else {
        const today = new Date().toISOString().slice(0, 10);
        reset({
          outbound_date: today, product_id: '', quantity: '' as unknown as number,
          warehouse_id: '', usage_category: '', order_id: '', bl_id: '', site_name: '',
          site_address: '', spare_qty: '', group_trade: false,
          target_company_id: '', erp_outbound_no: '', memo: '',
        });
        setQtyDisplay('');
        setSpareQtyDisplay('');
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = {
      ...data,
      company_id: selectedCompanyId,
      capacity_kw: capacityKw,
    };
    if (data.spare_qty === '' || data.spare_qty === undefined) delete payload.spare_qty;
    if (!data.order_id) delete payload.order_id;
    if (!data.bl_id) delete payload.bl_id;
    if (!data.target_company_id) delete payload.target_company_id;
    if (!data.group_trade) {
      delete payload.target_company_id;
      payload.group_trade = false;
    }
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  const otherCompanies = companies.filter((c) => c.company_id !== selectedCompanyId);
  const productLabel = selectedProduct ? `${selectedProduct.product_code} — ${selectedProduct.product_name}` : '';
  const warehouseLabel = warehouses.find(w => w.warehouse_id === warehouseId)?.warehouse_name ?? '';
  const usageCatLabel = (USAGE_CATEGORY_LABEL as Record<string, string>)[usageCat] ?? '';
  const orderLabel = selectedOrder?.order_number ?? (selectedOrderId ? '' : '');
  const targetLabel = companies.find(c => c.company_id === targetCompanyId)?.company_name ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{editData ? '출고 수정' : '출고 등록'}</DialogTitle>
        </DialogHeader>

        {submitError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>출고일 *</Label>
              <DateInput value={watch('outbound_date') ?? ''} onChange={(v) => setValue('outbound_date', v, { shouldDirty: true })} />
              {errors.outbound_date && <p className="text-xs text-destructive">{errors.outbound_date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>용도 *</Label>
              <Select value={usageCat} onValueChange={(v) => setValue('usage_category', v ?? '')}>
                <SelectTrigger className="w-full"><Txt text={usageCatLabel} /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(USAGE_CATEGORY_LABEL) as [UsageCategory, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.usage_category && <p className="text-xs text-destructive">{errors.usage_category.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>품번 *</Label>
            <Select value={selectedProductId ?? ''} onValueChange={(v) => setValue('product_id', v ?? '')}>
              <SelectTrigger className="w-full"><Txt text={productLabel} /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.product_id} value={p.product_id}>
                    {p.product_code} — {p.product_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
            {selectedProduct && (
              <div className="rounded-md border p-2 bg-muted/30 text-xs grid grid-cols-3 gap-2">
                <div><div className="text-muted-foreground">제조사</div><div className="font-medium">{selectedProduct.manufacturer_name ?? '—'}</div></div>
                <div><div className="text-muted-foreground">품명</div><div className="font-medium truncate">{selectedProduct.product_name}</div></div>
                <div><div className="text-muted-foreground">규격</div><div className="font-medium">{selectedProduct.spec_wp}Wp / {selectedProduct.wattage_kw}kW</div></div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>수량 *</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={qtyDisplay}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  const num = raw ? parseInt(raw, 10) : undefined;
                  setQtyDisplay(num !== undefined ? num.toLocaleString('ko-KR') : '');
                  setValue('quantity', (num ?? '') as unknown as number, { shouldDirty: true });
                }}
                placeholder="0"
              />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>용량 (kW)</Label>
              <Input value={capacityKw ? capacityKw.toFixed(1) : '—'} readOnly className="bg-muted" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>창고 *</Label>
            <Select value={warehouseId} onValueChange={(v) => setValue('warehouse_id', v ?? '')}>
              <SelectTrigger className="w-full"><Txt text={warehouseLabel} /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name} ({w.location_name})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.warehouse_id && <p className="text-xs text-destructive">{errors.warehouse_id.message}</p>}
          </div>

          {/* B/L 연결 — 출고 원가 추적의 핵심 고리 */}
          <div className="space-y-1.5">
            <Label>B/L 연결 <span className="text-[10px] text-muted-foreground ml-1">(출고 원가 추적용)</span></Label>
            <Select value={selectedBlId} onValueChange={(v) => setValue('bl_id', v === '_none' ? '' : (v ?? ''))}>
              <SelectTrigger className="w-full">
                <Txt text={selectedBl ? `${selectedBl.bl_number} | ${selectedBl.eta?.slice(0,10) ?? '—'} 입항 | ${selectedBl.status}` : ''} placeholder="B/L 선택 안함" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">선택 안함</SelectItem>
                {bls.map((b) => (
                  <SelectItem key={b.bl_id} value={b.bl_id}>
                    {b.bl_number} | {b.eta?.slice(0,10) ?? '—'} | {b.port ?? '—'} | {b.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBl && (
              <div className="rounded-md border bg-blue-50 px-3 py-2 text-xs text-blue-800 grid grid-cols-4 gap-2">
                <div><div className="text-blue-500 mb-0.5">B/L번호</div><div className="font-mono font-medium truncate">{selectedBl.bl_number}</div></div>
                <div><div className="text-blue-500 mb-0.5">ETA</div><div className="font-medium">{selectedBl.eta?.slice(0,10) ?? '—'}</div></div>
                <div><div className="text-blue-500 mb-0.5">항구</div><div className="font-medium">{selectedBl.port ?? '—'}</div></div>
                <div><div className="text-blue-500 mb-0.5">포워더</div><div className="font-medium">{selectedBl.forwarder ?? '—'}</div></div>
              </div>
            )}
            {!selectedProduct && <p className="text-[10px] text-muted-foreground">품번 선택 후 해당 제조사의 B/L 목록이 표시됩니다</p>}
          </div>

          <div className="space-y-1.5">
            <Label>수주 연결</Label>
            <Select value={selectedOrderId ?? ''} onValueChange={(v) => setValue('order_id', v === '_none' ? '' : (v ?? ''))}>
              <SelectTrigger className="w-full"><Txt text={orderLabel || '연결 안함'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">연결 안함</SelectItem>
                {orders.map((o) => (
                  <SelectItem key={o.order_id} value={o.order_id}>{o.order_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOrder?.remaining_qty !== undefined && (
              <p className="text-[10px] text-blue-600">수주잔량: {selectedOrder.remaining_qty.toLocaleString('ko-KR')}장</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>현장명</Label><Input {...register('site_name')} /></div>
            <div className="space-y-1.5"><Label>현장 주소</Label><Input {...register('site_address')} /></div>
          </div>

          <div className="space-y-1.5">
            <Label>스페어 수량</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={spareQtyDisplay}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                const num = raw ? parseInt(raw, 10) : undefined;
                setSpareQtyDisplay(num !== undefined ? num.toLocaleString('ko-KR') : '');
                setValue('spare_qty', (num ?? '') as unknown as number, { shouldDirty: true });
              }}
              placeholder="0"
            />
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch checked={groupTrade} onCheckedChange={(v) => setValue('group_trade', v)} />
            <Label className="cursor-pointer">그룹내 거래</Label>
          </div>

          {groupTrade && (
            <div className="space-y-1.5">
              <Label>상대법인 *</Label>
              <Select value={targetCompanyId} onValueChange={(v) => setValue('target_company_id', v ?? '')}>
                <SelectTrigger className="w-full"><Txt text={targetLabel} /></SelectTrigger>
                <SelectContent>
                  {otherCompanies.map((c) => (
                    <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5"><Label>ERP 출고번호</Label><Input {...register('erp_outbound_no')} /></div>
          <div className="space-y-1.5"><Label>메모</Label><Textarea {...register('memo')} rows={2} /></div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
