import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { BLShipment } from '@/types/inbound';
import type { Manufacturer, Product, Warehouse } from '@/types/masters';

/* ── 입고유형 라벨 ── */
const INBOUND_TYPES = [
  { value: 'import', label: '해외직수입' },
  { value: 'domestic', label: '국내구매' },
  { value: 'group', label: '그룹내구매' },
] as const;
const inboundLabel = (v: string) => INBOUND_TYPES.find((t) => t.value === v)?.label ?? '';

/* ── 인코텀즈 옵션 ── */
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'DAP', 'DDP', 'CIP'];

/* ── Zod 스키마 ── */
const schema = z.object({
  bl_number: z.string().min(1, 'B/L 번호는 필수입니다'),
  inbound_type: z.string().min(1, '입고유형은 필수입니다'),
  manufacturer_id: z.string().min(1, '제조사는 필수입니다'),
  exchange_rate: z.string().optional(),
  etd: z.string().optional(),
  eta: z.string().optional(),
  actual_arrival: z.string().optional(),
  port: z.string().optional(),
  forwarder: z.string().optional(),
  warehouse_id: z.string().optional(),
  invoice_number: z.string().optional(),
  incoterms: z.string().optional(),
  payment_terms: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

/* ── 라인아이템 ── */
interface LineItem {
  product_id: string;
  quantity: string;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  invoice_amount_usd: string;
  unit_price_usd_wp: string;
}
const emptyLine = (): LineItem => ({
  product_id: '', quantity: '', item_type: 'main', payment_type: 'paid',
  invoice_amount_usd: '', unit_price_usd_wp: '',
});

/* ── 트리거 표시 헬퍼 ── */
function TriggerText({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  if (text) return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
  return <span className="flex flex-1 text-left truncate text-muted-foreground" data-slot="select-value">{placeholder}</span>;
}

/* ── Props ── */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: BLShipment | null;
}

export default function BLForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [submitError, setSubmitError] = useState('');

  /* 제조사 선택을 별도 state로 관리 — watch() 타이밍 이슈 방지 */
  const [selectedMfgId, setSelectedMfgId] = useState('');
  const [selectedWhId, setSelectedWhId] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  /* 마스터 데이터 로드 */
  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active))).catch(() => {});
    fetchWithAuth<Warehouse[]>('/api/v1/warehouses')
      .then((list) => setWarehouses(list.filter((w) => w.is_active))).catch(() => {});
  }, []);

  /* 제조사 변경 → 해당 제조사 품번만 로드 */
  useEffect(() => {
    if (!selectedMfgId) { setProducts([]); return; }
    fetchWithAuth<Product[]>(`/api/v1/products?manufacturer_id=${selectedMfgId}`)
      .then((list) => setProducts(list.filter((p) => p.is_active)))
      .catch(() => setProducts([]));
  }, [selectedMfgId]);

  const handleManufacturerChange = useCallback((v: string | null) => {
    const id = v ?? '';
    setSelectedMfgId(id);
    setValue('manufacturer_id', id);
    setLines((prev) => prev.map((l) => ({ ...l, product_id: '' })));
  }, [setValue]);

  const handleTypeChange = useCallback((v: string | null) => {
    const val = v ?? '';
    setSelectedType(val);
    setValue('inbound_type', val);
  }, [setValue]);

  const handleWarehouseChange = useCallback((v: string | null) => {
    const val = v ?? '';
    setSelectedWhId(val);
    setValue('warehouse_id', val);
  }, [setValue]);

  /* 폼 초기화 */
  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
        const d = editData;
        setSelectedMfgId(d.manufacturer_id);
        setSelectedType(d.inbound_type);
        setSelectedWhId(d.warehouse_id ?? '');
        reset({
          bl_number: d.bl_number,
          inbound_type: d.inbound_type,
          manufacturer_id: d.manufacturer_id,
          exchange_rate: d.exchange_rate != null ? String(d.exchange_rate) : '',
          etd: d.etd?.slice(0, 10) ?? '',
          eta: d.eta?.slice(0, 10) ?? '',
          actual_arrival: d.actual_arrival?.slice(0, 10) ?? '',
          port: d.port ?? '',
          forwarder: d.forwarder ?? '',
          warehouse_id: d.warehouse_id ?? '',
          invoice_number: d.invoice_number ?? '',
          incoterms: (d as any).incoterms ?? '',
          payment_terms: (d as any).payment_terms ?? '',
          memo: d.memo ?? '',
        });
      } else {
        setSelectedMfgId('');
        setSelectedType('');
        setSelectedWhId('');
        reset({
          bl_number: '', inbound_type: '', manufacturer_id: '',
          exchange_rate: '', etd: '', eta: '', actual_arrival: '',
          port: '', forwarder: '', warehouse_id: '', invoice_number: '',
          incoterms: '', payment_terms: '', memo: '',
        });
        setLines([emptyLine()]);
      }
    }
  }, [open, editData, reset]);

  /* 라인아이템 헬퍼 */
  const updateLine = (idx: number, field: keyof LineItem, value: string) => {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLines((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));

  const calcCapacityKw = (line: LineItem): string => {
    const qty = Number(line.quantity);
    if (!line.product_id || !qty) return '-';
    const product = products.find((p) => p.product_id === line.product_id);
    if (!product) return '-';
    return ((qty * product.spec_wp) / 1000).toFixed(2);
  };

  const productLabel = (pid: string) => {
    const p = products.find((x) => x.product_id === pid);
    return p ? `${p.product_code} | ${p.product_name} | ${p.spec_wp}Wp` : '';
  };

  /* 제출 — 실패 시 에러 표시, 성공 시에만 닫기 */
  const handle = async (data: FormData) => {
    setSubmitError('');
    const exchangeRate = data.exchange_rate ? parseFloat(data.exchange_rate) : undefined;
    const payload: Record<string, unknown> = {
      ...data,
      company_id: selectedCompanyId,
      currency: data.inbound_type === 'import' ? 'USD' : 'KRW',
      exchange_rate: exchangeRate && !isNaN(exchangeRate) ? exchangeRate : undefined,
      status: editData?.status ?? 'scheduled',
      lines: lines
        .filter((l) => l.product_id && Number(l.quantity) > 0)
        .map((l) => {
          const product = products.find((p) => p.product_id === l.product_id);
          const qty = Number(l.quantity);
          const invAmt = l.invoice_amount_usd ? parseFloat(l.invoice_amount_usd) : undefined;
          const unitPx = l.unit_price_usd_wp ? parseFloat(l.unit_price_usd_wp) : undefined;
          return {
            product_id: l.product_id,
            quantity: qty,
            capacity_kw: product ? (qty * product.spec_wp) / 1000 : 0,
            item_type: l.item_type,
            payment_type: l.payment_type,
            invoice_amount_usd: invAmt && !isNaN(invAmt) ? invAmt : undefined,
            unit_price_usd_wp: unitPx && !isNaN(unitPx) ? unitPx : undefined,
          };
        }),
    };
    if (!payload.exchange_rate) delete payload.exchange_rate;
    if (!data.etd) delete payload.etd;
    if (!data.eta) delete payload.eta;
    if (!data.actual_arrival) delete payload.actual_arrival;
    if (!data.warehouse_id) delete payload.warehouse_id;
    if (!data.incoterms) delete payload.incoterms;
    if (!data.payment_terms) delete payload.payment_terms;

    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  /* ── 렌더 ── */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] sm:max-w-[80vw] h-[80vh] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? 'B/L 수정' : 'B/L 등록'}</DialogTitle>
        </DialogHeader>

        {/* 에러 메시지 */}
        {submitError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit(handle)} className="space-y-5">

          {/* ── 1행: B/L번호, 입고유형, 제조사 ── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>B/L 번호 *</Label>
              <Input {...register('bl_number')} placeholder="예: SOLARBL-2026-001" />
              {errors.bl_number && <p className="text-xs text-destructive">{errors.bl_number.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>입고유형 *</Label>
              <Select value={selectedType} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-full">
                  <TriggerText text={inboundLabel(selectedType)} />
                </SelectTrigger>
                <SelectContent>
                  {INBOUND_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.inbound_type && <p className="text-xs text-destructive">{errors.inbound_type.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>제조사 *</Label>
              <Select value={selectedMfgId} onValueChange={handleManufacturerChange}>
                <SelectTrigger className="w-full">
                  <TriggerText text={manufacturers.find((m) => m.manufacturer_id === selectedMfgId)?.name_kr ?? ''} />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.manufacturer_id && <p className="text-xs text-destructive">{errors.manufacturer_id.message}</p>}
            </div>
          </div>

          {/* ── 2행: 날짜 + 환율 ── */}
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5"><Label>ETD</Label><Input type="date" {...register('etd')} /></div>
            <div className="space-y-1.5"><Label>ETA</Label><Input type="date" {...register('eta')} /></div>
            <div className="space-y-1.5"><Label>실제입항</Label><Input type="date" {...register('actual_arrival')} /></div>
            <div className="space-y-1.5">
              <Label>환율 (USD→KRW)</Label>
              <Input {...register('exchange_rate')} inputMode="decimal" placeholder="1450.30" />
            </div>
          </div>

          {/* ── 3행: 항구, 포워더, Invoice, 인코텀즈 ── */}
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5"><Label>항구</Label><Input {...register('port')} placeholder="광양항" /></div>
            <div className="space-y-1.5"><Label>포워더</Label><Input {...register('forwarder')} /></div>
            <div className="space-y-1.5"><Label>Invoice No.</Label><Input {...register('invoice_number')} /></div>
            <div className="space-y-1.5">
              <Label>선적조건 (인코텀즈)</Label>
              <Input {...register('incoterms')} list="incoterms-list" placeholder="FOB, CIF 등" />
              <datalist id="incoterms-list">
                {INCOTERMS.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
          </div>

          {/* ── 4행: 창고, 결제조건, 메모 ── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>입고 창고</Label>
              <Select value={selectedWhId} onValueChange={handleWarehouseChange}>
                <SelectTrigger className="w-full">
                  <TriggerText text={warehouses.find((w) => w.warehouse_id === selectedWhId)?.warehouse_name ?? ''} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name} ({w.location_name})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>결제조건</Label>
              <Input {...register('payment_terms')} placeholder="예: 계약금 5% T/T, L/C 90days" />
            </div>
            <div className="space-y-1.5"><Label>메모</Label><Textarea {...register('memo')} rows={1} /></div>
          </div>

          {/* ── 라인아이템 ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">라인아이템</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={!selectedMfgId}>
                <Plus className="mr-1 h-3.5 w-3.5" />추가
              </Button>
            </div>

            {!selectedMfgId && (
              <p className="text-xs text-muted-foreground">제조사를 먼저 선택하면 품번을 추가할 수 있습니다.</p>
            )}

            {selectedMfgId && (
              <>
                {/* 헤더 */}
                <div className="grid grid-cols-[minmax(280px,3fr)_100px_110px_110px_140px_140px_100px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
                  <span>품번 *</span><span>수량EA *</span><span>구분 *</span><span>유무상 *</span>
                  <span>인보이스USD</span><span>USD/Wp단가</span><span>용량kW</span><span />
                </div>

                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-[minmax(280px,3fr)_100px_110px_110px_140px_140px_100px_40px] gap-2 items-center">
                    {/* 품번 */}
                    <Select value={line.product_id} onValueChange={(v) => updateLine(idx, 'product_id', v ?? '')}>
                      <SelectTrigger className="w-full h-9 text-xs">
                        <TriggerText text={productLabel(line.product_id)} placeholder="품번 선택" />
                      </SelectTrigger>
                      <SelectContent className="min-w-[500px]">
                        {products.map((p) => (
                          <SelectItem key={p.product_id} value={p.product_id}>
                            {p.product_code} | {p.product_name} | {p.spec_wp}Wp
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* 수량 */}
                    <Input
                      className="h-9 text-xs" inputMode="numeric"
                      value={line.quantity} placeholder="0"
                      onChange={(e) => updateLine(idx, 'quantity', e.target.value.replace(/[^0-9]/g, ''))}
                    />

                    {/* 구분 */}
                    <Select value={line.item_type} onValueChange={(v) => updateLine(idx, 'item_type', v ?? 'main')}>
                      <SelectTrigger className="w-full h-9 text-xs">
                        <TriggerText text={line.item_type === 'main' ? '본품' : '스페어'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="main">본품</SelectItem>
                        <SelectItem value="spare">스페어</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* 유무상 */}
                    <Select value={line.payment_type} onValueChange={(v) => updateLine(idx, 'payment_type', v ?? 'paid')}>
                      <SelectTrigger className="w-full h-9 text-xs">
                        <TriggerText text={line.payment_type === 'paid' ? '유상' : '무상'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">유상</SelectItem>
                        <SelectItem value="free">무상</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* 인보이스 USD */}
                    <Input
                      className="h-9 text-xs" inputMode="decimal"
                      value={line.invoice_amount_usd} placeholder="0.00"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) updateLine(idx, 'invoice_amount_usd', v);
                      }}
                    />

                    {/* USD/Wp 단가 */}
                    <Input
                      className="h-9 text-xs" inputMode="decimal"
                      value={line.unit_price_usd_wp} placeholder="0.119500"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) updateLine(idx, 'unit_price_usd_wp', v);
                      }}
                    />

                    {/* 용량 kW (자동 계산) */}
                    <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2">
                      {calcCapacityKw(line)}
                    </div>

                    {/* 삭제 */}
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-9 w-9" onClick={() => removeLine(idx)}
                      disabled={lines.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
