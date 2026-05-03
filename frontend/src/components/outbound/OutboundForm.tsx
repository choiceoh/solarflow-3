import { useEffect, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { FormShell } from '@/components/common/detail';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ProductCombobox } from '@/components/common/ProductCombobox';
import { OrderCombobox } from '@/components/common/OrderCombobox';
import { BLCombobox } from '@/components/common/BLCombobox';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { companyParams } from '@/lib/companyUtils';
import { moduleLabel, shortMfgName } from '@/lib/utils';
import { USAGE_CATEGORY_LABEL, type Outbound, type UsageCategory } from '@/types/outbound';
import type { Order } from '@/types/orders';
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
  site_name: z.string().optional(),
  site_address: z.string().optional(),
  spare_qty: z.coerce.number().optional().or(z.literal('')),
  group_trade: z.boolean().optional(),
  target_company_id: z.string().optional(),
  erp_outbound_no: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface BLEntry { bl_id: string; quantity: string }

interface Props {
  // dialog 모드에서만 의미. inline 모드에서는 무시되며 부모가 마운트로 가시성을 제어.
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Outbound | null;
  order?: Order | null;
  variant?: 'dialog' | 'inline';
}

function fmtInt(v: number | string | undefined): string {
  if (v === '' || v === undefined || v === null) return '';
  const n = typeof v === 'string' ? parseInt(v.replace(/[^0-9]/g, ''), 10) : Math.round(Number(v));
  return isNaN(n) ? '' : n.toLocaleString('ko-KR');
}

function numOrZero(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function orderRemainingQty(order?: Order | null): number {
  if (!order) return 0;
  const quantity = numOrZero(order.quantity);
  const shipped = numOrZero(order.shipped_qty);
  return Math.max(quantity - shipped, 0);
}

function orderCapacityKw(order?: Order | null, quantity = 0): number {
  if (!order || quantity <= 0) return 0;
  const orderQty = numOrZero(order.quantity);
  const orderCapacity = numOrZero(order.capacity_kw);
  if (orderQty > 0 && orderCapacity > 0) return (orderCapacity / orderQty) * quantity;
  return numOrZero(order.wattage_kw) * quantity;
}

function productManufacturerLabel(product?: Product | null, order?: Order | null): string {
  const label = moduleLabel(product?.manufacturers ?? product?.manufacturer_name ?? order?.manufacturer_name, undefined);
  return label === '—' ? '—' : shortMfgName(label);
}

function productModuleLabel(product?: Product | null, order?: Order | null): string {
  return moduleLabel(product?.manufacturers ?? product?.manufacturer_name ?? order?.manufacturer_name, product?.spec_wp ?? order?.spec_wp);
}

function blModuleLabel(bl?: BLShipment | null, product?: Product | null, order?: Order | null): string {
  return moduleLabel(bl?.manufacturer_name ?? product?.manufacturers ?? product?.manufacturer_name ?? order?.manufacturer_name, product?.spec_wp ?? order?.spec_wp);
}

function orderCategoryToOutboundUsage(category?: string): UsageCategory {
  switch (category) {
    case 'sale':
      return 'sale';
    case 'spare':
      return 'sale_spare';
    case 'repowering':
      return 'repowering';
    case 'maintenance':
      return 'maintenance';
    case 'construction':
      return 'construction';
    default:
      return 'other';
  }
}

export default function OutboundForm({ open = true, onOpenChange, onSubmit, editData, order, variant = 'dialog' }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const effectiveCompanyId = order?.company_id || selectedCompanyId;
  const companies = useAppStore((s) => s.companies);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bls, setBls] = useState<BLShipment[]>([]);
  const [blEntries, setBlEntries] = useState<BLEntry[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [qtyDisplay, setQtyDisplay] = useState('');
  const [spareQtyDisplay, setSpareQtyDisplay] = useState('');
  const productTriggerRef = useRef<HTMLButtonElement | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가
  const selectedProductId = watch('product_id');
  const selectedProduct = products.find((p) => p.product_id === selectedProductId);
  const quantity = watch('quantity') || 0;
  const capacityKw = selectedProduct ? quantity * selectedProduct.wattage_kw : orderCapacityKw(order, Number(quantity));
  const groupTrade = watch('group_trade') ?? false;
  const selectedOrderId = watch('order_id');
  const selectedOrder = order ?? orders.find((o) => o.order_id === selectedOrderId);
  const usageCat = watch('usage_category') ?? '';
  const warehouseId = watch('warehouse_id') ?? '';
  const blSumQty = blEntries.reduce((sum, e) => {
    const n = parseInt(e.quantity.replace(/[^0-9]/g, ''), 10);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const outboundQty = Number(quantity) || 0;
  const blSumMatches = blSumQty === outboundQty;
  const targetCompanyId = watch('target_company_id') ?? '';

  useEffect(() => {
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
    fetchWithAuth<Warehouse[]>('/api/v1/warehouses')
      .then((list) => setWarehouses(list.filter((w) => w.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!effectiveCompanyId) return;
    const params = companyParams(effectiveCompanyId);
    fetchWithAuth<Order[]>(`/api/v1/orders?${params}`)
      .then((list) => setOrders(list.filter((o) => o.status !== 'completed' && o.status !== 'cancelled')))
      .catch(() => {});
  }, [effectiveCompanyId]);

  // 품번 선택 시 해당 제조사의 B/L 목록 로드 (완료/ERP등록 상태만)
  useEffect(() => {
    if (!selectedProduct?.manufacturer_id) { setBls([]); return; }
    fetchWithAuth<BLShipment[]>(
      `/api/v1/bls?manufacturer_id=${selectedProduct.manufacturer_id}`
    )
      .then((list) => {
        const done = (list ?? []).filter((b) =>
          ['completed', 'erp_done'].includes(b.status)
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
        // 기존 BL 연결 복원
        if (editData.bl_items && editData.bl_items.length > 0) {
          setBlEntries(editData.bl_items.map(i => ({ bl_id: i.bl_id, quantity: String(i.quantity) })));
        } else if (editData.bl_id) {
          setBlEntries([{ bl_id: editData.bl_id, quantity: String(editData.quantity) }]);
        } else {
          setBlEntries([]);
        }
      } else if (order) {
        const today = new Date().toISOString().slice(0, 10);
        const remaining = orderRemainingQty(order);
        reset({
          outbound_date: today,
          product_id: order.product_id,
          quantity: remaining as unknown as number,
          warehouse_id: '',
          usage_category: orderCategoryToOutboundUsage(order.management_category),
          order_id: order.order_id,
          site_name: order.site_name ?? '',
          site_address: order.site_address ?? '',
          spare_qty: order.spare_qty ?? '',
          group_trade: false,
          target_company_id: '',
          erp_outbound_no: '',
          memo: '',
        });
        setQtyDisplay(fmtInt(remaining));
        setSpareQtyDisplay(fmtInt(order.spare_qty));
        setBlEntries(order.bl_id ? [{ bl_id: order.bl_id, quantity: String(remaining) }] : []);
      } else {
        const today = new Date().toISOString().slice(0, 10);
        reset({
          outbound_date: today, product_id: '', quantity: '' as unknown as number,
          warehouse_id: '', usage_category: '', order_id: '', site_name: '',
          site_address: '', spare_qty: '', group_trade: false,
          target_company_id: '', erp_outbound_no: '', memo: '',
        });
        setQtyDisplay('');
        setSpareQtyDisplay('');
        setBlEntries([]);
      }
    }
  }, [open, editData, order, reset]);

  useEffect(() => {
    if (!open || editData || !selectedOrder) return;
    const remaining = orderRemainingQty(selectedOrder);
    setValue('product_id', selectedOrder.product_id, { shouldDirty: true, shouldValidate: true });
    setValue('quantity', remaining as unknown as number, { shouldDirty: true, shouldValidate: true });
    setQtyDisplay(fmtInt(remaining));
    setValue('usage_category', orderCategoryToOutboundUsage(selectedOrder.management_category), { shouldDirty: true });
    setValue('site_name', selectedOrder.site_name ?? '', { shouldDirty: true });
    setValue('site_address', selectedOrder.site_address ?? '', { shouldDirty: true });
  }, [open, editData, selectedOrder, setValue]);

  useEffect(() => {
    if (!open || editData || warehouseId) return;
    const orderBlId = order?.bl_id;
    if (orderBlId) {
      const orderBl = bls.find((b) => b.bl_id === orderBlId);
      if (orderBl?.warehouse_id) {
        setValue('warehouse_id', orderBl.warehouse_id, { shouldDirty: true, shouldValidate: true });
        return;
      }
    }
    if (warehouses.length === 1) {
      setValue('warehouse_id', warehouses[0].warehouse_id, { shouldDirty: true, shouldValidate: true });
    }
  }, [open, editData, order?.bl_id, bls, warehouseId, warehouses, setValue]);

  const addBlEntry = () => setBlEntries(prev => [...prev, { bl_id: '', quantity: '' }]);
  const removeBlEntry = (i: number) => setBlEntries(prev => prev.filter((_, idx) => idx !== i));
  const updateBlEntry = (i: number, field: keyof BLEntry, val: string) =>
    setBlEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  // 연속 입력 모드: editData(수정)/order(수주에서 진입) 컨텍스트에서는 의미가 없으므로 비활성
  const allowContinue = !editData && !order;

  const doSubmit = async (data: FormData): Promise<boolean> => {
    setSubmitError('');
    const validBLItems = blEntries
      .filter(e => e.bl_id && e.quantity && parseInt(e.quantity) > 0)
      .map(e => ({ bl_id: e.bl_id, quantity: parseInt(e.quantity.replace(/[^0-9]/g, ''), 10) }));
    const outboundQty = Number(data.quantity) || 0;
    const selectedRemaining = selectedOrder ? orderRemainingQty(selectedOrder) : null;
    if (selectedRemaining != null && outboundQty > selectedRemaining) {
      setSubmitError(`출고 수량이 수주 잔량 ${selectedRemaining.toLocaleString('ko-KR')}EA를 초과합니다`);
      return false;
    }
    const blQty = validBLItems.reduce((sum, item) => sum + item.quantity, 0);
    if (validBLItems.length > 0 && blQty !== outboundQty) {
      setSubmitError(`B/L 연결 수량 합계(${blQty.toLocaleString('ko-KR')}EA)가 출고 수량과 같아야 합니다`);
      return false;
    }

    const payload: Record<string, unknown> = {
      ...data,
      company_id: effectiveCompanyId,
      capacity_kw: capacityKw,
      bl_items: validBLItems.length > 0 ? validBLItems : undefined,
    };
    if (data.spare_qty === '' || data.spare_qty === undefined) delete payload.spare_qty;
    if (!data.order_id) delete payload.order_id;
    if (!data.target_company_id) delete payload.target_company_id;
    if (!data.group_trade) {
      delete payload.target_company_id;
      payload.group_trade = false;
    }
    try {
      await onSubmit(payload);
      return true;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
      return false;
    }
  };

  const onSaveClose = handleSubmit(async (data) => {
    if (await doSubmit(data)) onOpenChange(false);
  });

  // 저장 후 컨텍스트성 필드 유지, 나머지 비움 + 품번 콤보로 포커스
  const onSaveContinue = handleSubmit(async (data) => {
    if (!(await doSubmit(data))) return;
    reset({
      outbound_date: data.outbound_date,
      usage_category: data.usage_category,
      warehouse_id: data.warehouse_id,
      group_trade: data.group_trade,
      target_company_id: data.target_company_id,
      product_id: '',
      quantity: '' as unknown as number,
      order_id: '',
      site_name: '',
      site_address: '',
      spare_qty: '',
      erp_outbound_no: '',
      memo: '',
    });
    setQtyDisplay('');
    setSpareQtyDisplay('');
    setBlEntries([]);
    setSubmitError('');
    setTimeout(() => productTriggerRef.current?.focus(), 0);
  });

  const otherCompanies = companies.filter((c) => c.company_id !== effectiveCompanyId);
  const productLabel = selectedProduct
    ? `${productModuleLabel(selectedProduct, order)} | ${selectedProduct.product_code} | ${selectedProduct.product_name}`
    : order
      ? `${productModuleLabel(null, order)} | ${order.product_code ?? order.product_id} | ${order.product_name ?? ''}`
      : '';
  const warehouseLabel = warehouses.find(w => w.warehouse_id === warehouseId)?.warehouse_name ?? '';
  const usageCatLabel = (USAGE_CATEGORY_LABEL as Record<string, string>)[usageCat] ?? '';
  const orderLabel = selectedOrder
    ? `${selectedOrder.order_number ?? selectedOrder.order_id?.slice(0, 8) ?? '—'} · 잔량 ${orderRemainingQty(selectedOrder).toLocaleString('ko-KR')}EA`
    : (selectedOrderId ? '' : '');
  const targetLabel = companies.find(c => c.company_id === targetCompanyId)?.company_name ?? '';

  const body = (
    <>
        {submitError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        {order && !editData && (
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <div className="font-medium">수주에서 출고 등록</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-600">
              <span>수주 <b>{order.order_number ?? order.order_id?.slice(0, 8) ?? '—'}</b></span>
              <span>거래처 <b>{order.customer_name ?? '—'}</b></span>
              <span>잔량 <b>{fmtInt(orderRemainingQty(order))} EA</b></span>
            </div>
          </div>
        )}

        <form onSubmit={onSaveClose} className="space-y-3">
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
            {order && !editData ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm">
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span className="flex-1 truncate">{productLabel || order.product_name || order.product_id}</span>
              </div>
            ) : (
              <ProductCombobox
                products={products}
                value={selectedProductId ?? ''}
                onChange={(v) => setValue('product_id', v, { shouldValidate: true, shouldDirty: true })}
                error={!!errors.product_id}
                triggerRef={productTriggerRef}
              />
            )}
            {errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
            {selectedProduct && (
              <div className="rounded-md border p-2 bg-muted/30 text-xs grid grid-cols-3 gap-2">
                <div><div className="text-muted-foreground">제조사</div><div className="font-medium">{productManufacturerLabel(selectedProduct, order)}</div></div>
                <div><div className="text-muted-foreground">품명</div><div className="font-medium truncate">{selectedProduct.product_name}</div></div>
                <div><div className="text-muted-foreground">규격</div><div className="font-medium">{selectedProduct.spec_wp}Wp / {selectedProduct.wattage_kw}kW</div></div>
              </div>
            )}
            {!selectedProduct && order && (
              <div className="rounded-md border p-2 bg-muted/30 text-xs grid grid-cols-3 gap-2">
                <div><div className="text-muted-foreground">제조사</div><div className="font-medium">{productManufacturerLabel(null, order)}</div></div>
                <div><div className="text-muted-foreground">품명</div><div className="font-medium truncate">{order.product_name ?? '—'}</div></div>
                <div><div className="text-muted-foreground">규격</div><div className="font-medium">{order.spec_wp ? `${order.spec_wp}Wp` : '—'} / {order.wattage_kw ? `${order.wattage_kw}kW` : '—'}</div></div>
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

          {/* B/L 연결 — 분할선적 지원 (다중 BL + 수량) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>B/L 연결 <span className="text-[10px] text-muted-foreground ml-1">(출고 원가 추적용, 분할선적 지원)</span></Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addBlEntry}>
                <Plus className="h-3.5 w-3.5 mr-1" />B/L 추가
              </Button>
            </div>
            {!selectedProduct && (
              <p className="text-[10px] text-muted-foreground">품번 선택 후 해당 제조사의 B/L 목록이 표시됩니다</p>
            )}
            {blEntries.length === 0 && selectedProduct && (
              <p className="text-[10px] text-muted-foreground">B/L 연결 없음 — 위 버튼으로 추가</p>
            )}
            <div className="space-y-2">
              {blEntries.map((entry, i) => {
                const selectedBl = bls.find(b => b.bl_id === entry.bl_id);
                return (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <BLCombobox
                        bls={bls}
                        value={entry.bl_id}
                        onChange={(v) => updateBlEntry(i, 'bl_id', v)}
                        formatModule={(b) => blModuleLabel(b, selectedProduct, order)}
                      />
                      {selectedBl && (
                        <div className="rounded border bg-blue-50 px-2 py-1 text-[10px] text-blue-700 flex gap-3">
                          <span>항구: {selectedBl.port ?? '—'}</span>
                          <span>포워더: {selectedBl.forwarder ?? '—'}</span>
                        </div>
                      )}
                    </div>
                    <div className="w-28 space-y-1">
                      <Input
                        className="h-8 text-xs text-right"
                        placeholder="수량"
                        value={entry.quantity}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateBlEntry(i, 'quantity', raw ? parseInt(raw, 10).toLocaleString('ko-KR') : '');
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeBlEntry(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
            {blEntries.length > 0 && (
              <p className={`text-[10px] ${blSumMatches ? 'text-muted-foreground' : 'text-destructive font-medium'}`}>
                BL 합계 {blSumQty.toLocaleString('ko-KR')}장 / 출고 수량 {outboundQty.toLocaleString('ko-KR')}장
                {!blSumMatches && outboundQty > 0 && ` · 차이 ${Math.abs(outboundQty - blSumQty).toLocaleString('ko-KR')}장`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>수주 연결</Label>
            {order && !editData ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm">
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span className="flex-1 truncate">{orderLabel || order.order_number || order.order_id?.slice(0, 8) || '—'}</span>
              </div>
            ) : (
              <OrderCombobox
                orders={orders}
                value={selectedOrderId ?? ''}
                onChange={(v) => setValue('order_id', v, { shouldDirty: true })}
                placeholder="연결 안함"
                includeNoneOption
              />
            )}
            {selectedOrder && (
              <p className="text-[10px] text-blue-600">수주잔량: {orderRemainingQty(selectedOrder).toLocaleString('ko-KR')}장</p>
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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
            {allowContinue && (
              <Button type="button" disabled={isSubmitting} onClick={onSaveContinue}>
                {isSubmitting ? '저장 중...' : '저장하고 새로 입력'}
              </Button>
            )}
          </div>
        </form>
    </>
  );

  return (
    <FormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={editData ? '출고 수정' : '출고 등록'}
      dialogContentClassName="sm:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden"
    >
      {body}
    </FormShell>
  );
}
