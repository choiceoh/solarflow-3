import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { BLShipment, InboundType } from '@/types/inbound';
import type { Manufacturer, Warehouse } from '@/types/masters';

const schema = z.object({
  bl_number: z.string().min(1, 'B/L 번호는 필수입니다'),
  inbound_type: z.string().min(1, '입고유형은 필수입니다'),
  manufacturer_id: z.string().min(1, '제조사는 필수입니다'),
  exchange_rate: z.coerce.number().positive('양수').optional().or(z.literal('')),
  etd: z.string().optional(),
  eta: z.string().optional(),
  actual_arrival: z.string().optional(),
  port: z.string().optional(),
  forwarder: z.string().optional(),
  warehouse_id: z.string().optional(),
  invoice_number: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: BLShipment | null;
}

export default function BLForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  const inboundType = watch('inbound_type') as InboundType;
  const isImport = inboundType === 'import';

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active))).catch(() => {});
    fetchWithAuth<Warehouse[]>('/api/v1/warehouses')
      .then((list) => setWarehouses(list.filter((w) => w.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      if (editData) {
        reset({
          bl_number: editData.bl_number,
          inbound_type: editData.inbound_type,
          manufacturer_id: editData.manufacturer_id,
          exchange_rate: editData.exchange_rate ?? '',
          etd: editData.etd?.slice(0, 10) ?? '',
          eta: editData.eta?.slice(0, 10) ?? '',
          actual_arrival: editData.actual_arrival?.slice(0, 10) ?? '',
          port: editData.port ?? '',
          forwarder: editData.forwarder ?? '',
          warehouse_id: editData.warehouse_id ?? '',
          invoice_number: editData.invoice_number ?? '',
          memo: editData.memo ?? '',
        });
      } else {
        reset({
          bl_number: '', inbound_type: '', manufacturer_id: '',
          exchange_rate: '', etd: '', eta: '', actual_arrival: '',
          port: '', forwarder: '', warehouse_id: '', invoice_number: '', memo: '',
        });
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    const payload: Record<string, unknown> = {
      ...data,
      company_id: selectedCompanyId,
      currency: data.inbound_type === 'import' ? 'USD' : 'KRW',
      status: editData?.status ?? 'scheduled',
    };
    if (data.exchange_rate === '' || data.exchange_rate === undefined) delete payload.exchange_rate;
    if (!data.etd) delete payload.etd;
    if (!data.eta) delete payload.eta;
    if (!data.actual_arrival) delete payload.actual_arrival;
    if (!data.warehouse_id) delete payload.warehouse_id;
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? 'B/L 수정' : 'B/L 등록'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>B/L 번호 *</Label>
              <Input {...register('bl_number')} />
              {errors.bl_number && <p className="text-xs text-destructive">{errors.bl_number.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>입고유형 *</Label>
              <Select value={watch('inbound_type') ?? ''} onValueChange={(v) => setValue('inbound_type', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="import">해외 직수입</SelectItem>
                  <SelectItem value="domestic">국내 제조사</SelectItem>
                  <SelectItem value="domestic_foreign">국내 유통사</SelectItem>
                  <SelectItem value="group">그룹 내</SelectItem>
                </SelectContent>
              </Select>
              {errors.inbound_type && <p className="text-xs text-destructive">{errors.inbound_type.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>제조사 *</Label>
            <Select value={watch('manufacturer_id') ?? ''} onValueChange={(v) => setValue('manufacturer_id', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {manufacturers.map((m) => (
                  <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.manufacturer_id && <p className="text-xs text-destructive">{errors.manufacturer_id.message}</p>}
          </div>

          {isImport && (
            <>
              <div className="space-y-1.5">
                <Label>환율 (USD→KRW)</Label>
                <Input type="number" step="0.01" {...register('exchange_rate')} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>ETD</Label><Input type="date" {...register('etd')} /></div>
                <div className="space-y-1.5"><Label>ETA</Label><Input type="date" {...register('eta')} /></div>
                <div className="space-y-1.5"><Label>실제입항</Label><Input type="date" {...register('actual_arrival')} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>항구</Label><Input {...register('port')} placeholder="광양항" /></div>
                <div className="space-y-1.5"><Label>포워더</Label><Input {...register('forwarder')} /></div>
              </div>
              <div className="space-y-1.5"><Label>Invoice No.</Label><Input {...register('invoice_number')} /></div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>입고 창고</Label>
            <Select value={watch('warehouse_id') ?? ''} onValueChange={(v) => setValue('warehouse_id', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name} ({w.location_name})</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
