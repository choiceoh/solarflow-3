import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { USAGE_CATEGORY_LABEL, type Outbound, type UsageCategory } from '@/types/outbound';
import type { Product, Warehouse, Company } from '@/types/masters';

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Outbound | null;
}

export default function OutboundForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orders, setOrders] = useState<{ order_id: string; order_number: string; remaining_qty?: number }[]>([]);

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

  useEffect(() => {
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
    fetchWithAuth<Warehouse[]>('/api/v1/warehouses')
      .then((list) => setWarehouses(list.filter((w) => w.is_active))).catch(() => {});
    fetchWithAuth<Company[]>('/api/v1/companies')
      .then((list) => setCompanies(list.filter((c) => c.is_active))).catch(() => {});
  }, []);

  // 수주 목록 로드 (법인 기준)
  useEffect(() => {
    if (!selectedCompanyId) return;
    fetchWithAuth<{ order_id: string; order_number: string; remaining_qty?: number }[]>(
      `/api/v1/orders?company_id=${selectedCompanyId}`
    ).then(setOrders).catch(() => {});
  }, [selectedCompanyId]);

  useEffect(() => {
    if (open) {
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
      } else {
        const today = new Date().toISOString().slice(0, 10);
        reset({
          outbound_date: today, product_id: '', quantity: '' as unknown as number,
          warehouse_id: '', usage_category: '', order_id: '', site_name: '',
          site_address: '', spare_qty: '', group_trade: false,
          target_company_id: '', erp_outbound_no: '', memo: '',
        });
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    const payload: Record<string, unknown> = {
      ...data,
      company_id: selectedCompanyId,
      capacity_kw: capacityKw,
    };
    if (data.spare_qty === '' || data.spare_qty === undefined) delete payload.spare_qty;
    if (!data.order_id) delete payload.order_id;
    if (!data.target_company_id) delete payload.target_company_id;
    if (!data.group_trade) {
      delete payload.target_company_id;
      payload.group_trade = false;
    }
    await onSubmit(payload);
    onOpenChange(false);
  };

  // 자기 법인 제외한 법인 목록
  const otherCompanies = companies.filter((c) => c.company_id !== selectedCompanyId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '출고 수정' : '출고 등록'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>출고일 *</Label>
              <Input type="date" {...register('outbound_date')} />
              {errors.outbound_date && <p className="text-xs text-destructive">{errors.outbound_date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>용도 *</Label>
              <Select value={watch('usage_category') ?? ''} onValueChange={(v) => setValue('usage_category', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
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
            <Select value={watch('product_id') ?? ''} onValueChange={(v) => setValue('product_id', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
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
              <p className="text-[10px] text-muted-foreground">
                {selectedProduct.product_name} / {selectedProduct.spec_wp}Wp / {selectedProduct.wattage_kw}kW
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>수량 *</Label>
              <Input type="number" {...register('quantity')} />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>용량 (kW)</Label>
              <Input value={capacityKw ? capacityKw.toFixed(1) : '—'} readOnly className="bg-muted" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>창고 *</Label>
            <Select value={watch('warehouse_id') ?? ''} onValueChange={(v) => setValue('warehouse_id', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name} ({w.location_name})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.warehouse_id && <p className="text-xs text-destructive">{errors.warehouse_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>수주 연결</Label>
            <Select value={watch('order_id') ?? ''} onValueChange={(v) => setValue('order_id', v === '_none' ? '' : (v ?? ''))}>
              <SelectTrigger><SelectValue placeholder="선택 (선택사항)" /></SelectTrigger>
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
            <Input type="number" {...register('spare_qty')} />
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch checked={groupTrade} onCheckedChange={(v) => setValue('group_trade', v)} />
            <Label className="cursor-pointer">그룹내 거래</Label>
          </div>

          {groupTrade && (
            <div className="space-y-1.5">
              <Label>상대법인 *</Label>
              <Select value={watch('target_company_id') ?? ''} onValueChange={(v) => setValue('target_company_id', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {otherCompanies.map((c) => (
                    <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-blue-600">
                그룹내 거래: 상대법인에 자동 입고가 생성됩니다. 세금계산서는 각각 수동 등록합니다.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>ERP 출고번호</Label>
            <Input {...register('erp_outbound_no')} />
          </div>

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
