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
import type { Company, Manufacturer, Product, Warehouse } from '@/types/masters';

/* ── 상수 ── */
const INBOUND_TYPES = [
  { value: 'import', label: '해외직수입' },
  { value: 'domestic', label: '국내구매' },
  { value: 'group', label: '그룹내구매' },
] as const;
type InboundTypeValue = typeof INBOUND_TYPES[number]['value'];
const typeLabel = (v: string) => INBOUND_TYPES.find(t => t.value === v)?.label ?? '';
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'DAP', 'DDP', 'CIP'];

/* ── 스키마 (공통, 조건 필수는 핸들러에서 검증) ── */
const schema = z.object({
  inbound_type: z.string().min(1, '입고유형은 필수입니다'),
  bl_number: z.string().optional(),
  manufacturer_id: z.string().optional(),
  exchange_rate: z.string().optional(),
  etd: z.string().optional(),
  eta: z.string().optional(),
  actual_arrival: z.string().optional(),
  port: z.string().optional(),
  forwarder: z.string().optional(),
  warehouse_id: z.string().optional(),
  invoice_number: z.string().optional(),
  incoterms: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

/* ── 라인아이템 ── */
interface LineItem {
  product_id: string;
  quantity: string;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  unit_price: string;
}
const emptyLine = (): LineItem => ({
  product_id: '', quantity: '', item_type: 'main', payment_type: 'paid',
  unit_price: '',
});

/* ── 결제조건 구조체 ── */
interface PaymentTerms {
  hasDeposit: boolean;
  depositMethod: 'tt' | 'lc';
  depositRate: string;
  balanceDays: string;
}
const defaultPT = (): PaymentTerms => ({
  hasDeposit: false, depositMethod: 'tt', depositRate: '', balanceDays: '90',
});
function composePT(pt: PaymentTerms): string {
  const bal = `L/C ${pt.balanceDays || '90'}days`;
  if (pt.hasDeposit && pt.depositRate) {
    const m = pt.depositMethod === 'tt' ? 'T/T' : 'L/C';
    return `계약금 ${pt.depositRate}% ${m}, ${bal}`;
  }
  return bal;
}
function parsePT(text: string): PaymentTerms {
  const dep = text.match(/계약금\s*(\d+)%?\s*(T\/T|L\/C)/i);
  const bal = text.match(/L\/C\s*(\d+)\s*days?/i);
  return {
    hasDeposit: !!dep,
    depositMethod: dep?.[2]?.toUpperCase() === 'L/C' ? 'lc' : 'tt',
    depositRate: dep?.[1] ?? '',
    balanceDays: bal?.[1] ?? '90',
  };
}

/* ── 헬퍼 컴포넌트 ── */
function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return (
    <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">
      {text || placeholder}
    </span>
  );
}
function Req({ children }: { children: React.ReactNode }) {
  return <Label className="text-blue-600 font-medium">{children} *</Label>;
}
function Opt({ children }: { children: React.ReactNode }) {
  return <Label>{children}</Label>;
}

/* ── Props ── */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: BLShipment | null;
}

export default function BLForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const globalCompanyId = useAppStore((s) => s.selectedCompanyId);
  const storeCompanies = useAppStore((s) => s.companies);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  /* Select 상태 (watch 타이밍 이슈 방지) */
  const [selType, setSelType] = useState<InboundTypeValue | ''>('');
  const [selCompanyId, setSelCompanyId] = useState('');
  const [selMfgId, setSelMfgId] = useState('');
  const [selWhId, setSelWhId] = useState('');
  const [counterpartId, setCounterpartId] = useState('');
  const [autoNumber, setAutoNumber] = useState('');

  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [priceMode, setPriceMode] = useState<'cents' | 'dollar'>('cents');
  const [pt, setPt] = useState<PaymentTerms>(defaultPT());
  const [submitError, setSubmitError] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  const isImport = selType === 'import';
  const isDomestic = selType === 'domestic';
  const isGroup = selType === 'group';
  const currencyLabel = isImport ? 'USD' : 'KRW';

  /* ── 마스터 데이터 로드 ── */
  useEffect(() => {
    if (storeCompanies.length) setCompanies(storeCompanies);
    else fetchWithAuth<Company[]>('/api/v1/companies')
      .then(list => setCompanies(list.filter(c => c.is_active))).catch(() => {});
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then(list => setManufacturers(list.filter(m => m.is_active))).catch(() => {});
    fetchWithAuth<Warehouse[]>('/api/v1/warehouses')
      .then(list => setWarehouses(list.filter(w => w.is_active))).catch(() => {});
  }, [storeCompanies]);

  /* 제조사 → 품번 */
  useEffect(() => {
    if (!selMfgId) { setProducts([]); return; }
    fetchWithAuth<Product[]>(`/api/v1/products?manufacturer_id=${selMfgId}`)
      .then(list => setProducts(list.filter(p => p.is_active)))
      .catch(() => setProducts([]));
  }, [selMfgId]);

  /* ── 자동채번 ── */
  const genAutoNumber = useCallback(async (prefix: string) => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const pat = `${prefix}${today}-`;
    try {
      const bls = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?company_id=${selCompanyId}`);
      const maxSeq = bls.reduce((mx, bl) => {
        if (!bl.bl_number?.startsWith(pat)) return mx;
        const s = parseInt(bl.bl_number.split('-').pop() || '0');
        return isNaN(s) ? mx : Math.max(mx, s);
      }, 0);
      setAutoNumber(`${pat}${String(maxSeq + 1).padStart(3, '0')}`);
    } catch { setAutoNumber(`${pat}001`); }
  }, [selCompanyId]);

  // 국내구매: 제조사 변경 시
  useEffect(() => {
    if (selType !== 'domestic' || !selMfgId || !selCompanyId || editData) return;
    const mfg = manufacturers.find(m => m.manufacturer_id === selMfgId);
    if (mfg) genAutoNumber(mfg.name_kr.slice(0, 2));
  }, [selType, selMfgId, selCompanyId, manufacturers, genAutoNumber, editData]);

  // 그룹내구매: 법인 변경 시
  useEffect(() => {
    if (selType !== 'group' || !selCompanyId || editData) return;
    const co = companies.find(c => c.company_id === selCompanyId);
    if (co) genAutoNumber(co.company_code);
  }, [selType, selCompanyId, companies, genAutoNumber, editData]);

  /* ── 핸들러 ── */
  const handleTypeChange = useCallback((v: string | null) => {
    const val = (v ?? '') as InboundTypeValue | '';
    setSelType(val);
    setValue('inbound_type', val);
    setAutoNumber('');
  }, [setValue]);

  const handleCompanyChange = useCallback((v: string | null) => {
    setSelCompanyId(v ?? '');
  }, []);

  const handleMfgChange = useCallback((v: string | null) => {
    const id = v ?? '';
    setSelMfgId(id);
    setValue('manufacturer_id', id);
    setLines(prev => prev.map(l => ({ ...l, product_id: '' })));
  }, [setValue]);

  const handleWhChange = useCallback((v: string | null) => {
    const id = v ?? '';
    setSelWhId(id);
    setValue('warehouse_id', id);
  }, [setValue]);

  /* ── 폼 초기화 ── */
  useEffect(() => {
    if (!open) return;
    setSubmitError('');
    setPriceMode('cents');
    if (editData) {
      const d = editData;
      setSelType(d.inbound_type as InboundTypeValue);
      setSelCompanyId(d.company_id);
      setSelMfgId(d.manufacturer_id);
      setSelWhId(d.warehouse_id ?? '');
      setAutoNumber(d.bl_number);
      setPt(parsePT((d as any).payment_terms ?? ''));
      reset({
        inbound_type: d.inbound_type,
        bl_number: d.bl_number,
        manufacturer_id: d.manufacturer_id,
        exchange_rate: d.exchange_rate != null ? String(d.exchange_rate) : '',
        etd: d.etd?.slice(0, 10) ?? '', eta: d.eta?.slice(0, 10) ?? '',
        actual_arrival: d.actual_arrival?.slice(0, 10) ?? '',
        port: d.port ?? '', forwarder: d.forwarder ?? '',
        warehouse_id: d.warehouse_id ?? '', invoice_number: d.invoice_number ?? '',
        incoterms: (d as any).incoterms ?? '', memo: d.memo ?? '',
      });
    } else {
      const cid = globalCompanyId && globalCompanyId !== 'all' ? globalCompanyId : '';
      setSelType(''); setSelCompanyId(cid); setSelMfgId(''); setSelWhId('');
      setCounterpartId(''); setAutoNumber(''); setPt(defaultPT());
      reset({
        inbound_type: '', bl_number: '', manufacturer_id: '',
        exchange_rate: '', etd: '', eta: '', actual_arrival: '',
        port: '', forwarder: '', warehouse_id: '', invoice_number: '',
        incoterms: '', memo: '',
      });
      setLines([emptyLine()]);
    }
  }, [open, editData, reset, globalCompanyId]);

  /* ── 라인아이템 ── */
  const updateLine = (i: number, f: keyof LineItem, v: string) =>
    setLines(prev => prev.map((l, j) => j === i ? { ...l, [f]: v } : l));
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines(prev => prev.length <= 1 ? prev : prev.filter((_, j) => j !== i));

  const productLabel = (pid: string) => {
    const p = products.find(x => x.product_id === pid);
    return p ? `${p.product_code} | ${p.product_name} | ${p.spec_wp}Wp` : '';
  };
  const calcKw = (l: LineItem) => {
    const q = Number(l.quantity);
    const p = products.find(x => x.product_id === l.product_id);
    return (!q || !p) ? '-' : ((q * p.spec_wp) / 1000).toFixed(2);
  };
  // 인보이스 자동 계산: 수량 × 규격Wp × 단가($/Wp or ₩/Wp)
  const calcInvoice = (l: LineItem): number | null => {
    const q = Number(l.quantity);
    const p = products.find(x => x.product_id === l.product_id);
    const rawPrice = l.unit_price ? parseFloat(l.unit_price) : 0;
    if (!q || !p || !rawPrice) return null;
    const pricePerWp = (isImport && priceMode === 'cents') ? rawPrice / 100 : rawPrice;
    return q * p.spec_wp * pricePerWp;
  };
  const fmtInvoice = (l: LineItem): string => {
    const v = calcInvoice(l);
    if (v == null) return '-';
    return isImport ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` :
      `${v.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;
  };

  /* ¢↔$ 토글 */
  const togglePriceMode = () => {
    setPriceMode(prev => {
      const next = prev === 'cents' ? 'dollar' : 'cents';
      setLines(ls => ls.map(l => {
        if (!l.unit_price) return l;
        const v = parseFloat(l.unit_price);
        if (isNaN(v)) return l;
        const conv = next === 'cents' ? v * 100 : v / 100;
        return { ...l, unit_price: parseFloat(conv.toPrecision(8)).toString() };
      }));
      return next;
    });
  };

  /* ── 제출 ── */
  const handle = async (data: FormData) => {
    setSubmitError('');

    // 조건부 필수 검증
    if (!selCompanyId) { setSubmitError('법인을 선택해주세요'); return; }
    if (isImport && !data.bl_number) { setSubmitError('B/L 번호는 필수입니다'); return; }
    if ((isDomestic || isGroup) && !autoNumber) { setSubmitError('입고번호가 생성되지 않았습니다'); return; }
    if ((isImport || isDomestic) && !selMfgId) { setSubmitError('제조사를 선택해주세요'); return; }
    if (isGroup && !counterpartId) { setSubmitError('상대법인을 선택해주세요'); return; }

    // 라인아이템 최소 1개 필수
    const validLines = lines.filter(l => l.product_id && Number(l.quantity) > 0);
    if (validLines.length === 0) { setSubmitError('라인아이템을 최소 1개 이상 입력해주세요 (품번+수량 필수)'); return; }

    const blNumber = isImport ? data.bl_number! : autoNumber;
    const exRate = data.exchange_rate ? parseFloat(data.exchange_rate) : undefined;

    const payload: Record<string, unknown> = {
      bl_number: blNumber,
      inbound_type: selType,
      company_id: selCompanyId,
      manufacturer_id: selMfgId || undefined,
      counterpart_company_id: isGroup ? counterpartId : undefined,
      currency: isImport ? 'USD' : 'KRW',
      exchange_rate: isImport && exRate && !isNaN(exRate) ? exRate : undefined,
      status: editData?.status ?? 'scheduled',
      payment_terms: (isImport || isDomestic) ? composePT(pt) : undefined,
      etd: isImport ? data.etd || undefined : undefined,
      eta: isImport ? data.eta || undefined : undefined,
      actual_arrival: data.actual_arrival || undefined,
      port: isImport ? data.port || undefined : undefined,
      forwarder: isImport ? data.forwarder || undefined : undefined,
      invoice_number: isImport ? data.invoice_number || undefined : undefined,
      incoterms: isImport ? data.incoterms || undefined : undefined,
      warehouse_id: selWhId || undefined,
      memo: data.memo || undefined,
      lines: lines
        .filter(l => l.product_id && Number(l.quantity) > 0)
        .map(l => {
          const prod = products.find(p => p.product_id === l.product_id);
          const qty = Number(l.quantity);
          let price = l.unit_price ? parseFloat(l.unit_price) : undefined;
          if (isImport && priceMode === 'cents' && price) price = price / 100;
          const inv = calcInvoice(l);
          return {
            product_id: l.product_id, quantity: qty,
            capacity_kw: prod ? (qty * prod.spec_wp) / 1000 : 0,
            item_type: l.item_type, payment_type: l.payment_type,
            invoice_amount_usd: isImport && inv ? inv : undefined,
            invoice_amount_krw: !isImport && inv ? inv : undefined,
            unit_price_usd_wp: isImport ? (price && !isNaN(price) ? price : undefined) : undefined,
            unit_price_krw_wp: !isImport ? (price && !isNaN(price) ? price : undefined) : undefined,
          };
        }),
    };
    // undefined 필드 정리
    Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k]; });

    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  /* ── 렌더 ── */
  const mfgName = manufacturers.find(m => m.manufacturer_id === selMfgId)?.name_kr ?? '';
  const coName = companies.find(c => c.company_id === selCompanyId)?.company_name ?? '';
  const whName = warehouses.find(w => w.warehouse_id === selWhId)?.warehouse_name ?? '';
  const cpName = companies.find(c => c.company_id === counterpartId)?.company_name ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[82vw] sm:max-w-[82vw] h-[85vh] max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{editData ? '입고수정' : '입고등록'}</DialogTitle>
        </DialogHeader>

        {submitError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit(handle)} className="space-y-5">

          {/* ── 입고유형 (항상 첫번째) ── */}
          <div className="max-w-xs">
            <Req>입고유형</Req>
            <Select value={selType} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-full mt-1.5">
                <Txt text={typeLabel(selType)} placeholder="입고유형을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {INBOUND_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.inbound_type && <p className="text-xs text-destructive mt-1">{errors.inbound_type.message}</p>}
          </div>

          {/* ── 유형 선택 후 나머지 폼 ── */}
          {selType && (
            <>
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* B/L번호 (해외직수입만) / 자동채번 표시 (국내/그룹) */}
                {isImport && (
                  <div className="space-y-1.5">
                    <Req>B/L 번호</Req>
                    <Input {...register('bl_number')} placeholder="SOLARBL-2026-001" />
                    {errors.bl_number && <p className="text-xs text-destructive">{errors.bl_number.message}</p>}
                  </div>
                )}
                {(isDomestic || isGroup) && (
                  <div className="space-y-1.5">
                    <Opt>입고번호 (자동)</Opt>
                    <Input value={autoNumber} readOnly className="bg-muted" placeholder="제조사/법인 선택 시 자동생성" />
                  </div>
                )}

                {/* 법인 */}
                <div className="space-y-1.5">
                  <Req>법인</Req>
                  <Select value={selCompanyId} onValueChange={handleCompanyChange}>
                    <SelectTrigger className="w-full"><Txt text={coName} /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 제조사 (해외/국내만) */}
                {(isImport || isDomestic) && (
                  <div className="space-y-1.5">
                    <Req>제조사</Req>
                    <Select value={selMfgId} onValueChange={handleMfgChange}>
                      <SelectTrigger className="w-full"><Txt text={mfgName} /></SelectTrigger>
                      <SelectContent>
                        {manufacturers.map(m => (
                          <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 상대법인 (그룹만) */}
                {isGroup && (
                  <div className="space-y-1.5">
                    <Req>상대법인</Req>
                    <Select value={counterpartId} onValueChange={(v) => setCounterpartId(v ?? '')}>
                      <SelectTrigger className="w-full"><Txt text={cpName} /></SelectTrigger>
                      <SelectContent>
                        {companies.filter(c => c.company_id !== selCompanyId).map(c => (
                          <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* 날짜/물류 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {isImport && (
                  <>
                    <div className="space-y-1.5"><Opt>ETD</Opt><Input type="date" {...register('etd')} /></div>
                    <div className="space-y-1.5"><Opt>ETA</Opt><Input type="date" {...register('eta')} /></div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Opt>{isImport ? '실제입항' : isDomestic ? '납품일' : '입고일'}</Opt>
                  <Input type="date" {...register('actual_arrival')} />
                </div>
                {isImport && (
                  <>
                    <div className="space-y-1.5">
                      <Opt>환율 (USD→KRW)</Opt>
                      <Input {...register('exchange_rate')} inputMode="decimal" placeholder="1450.30" />
                    </div>
                    <div className="space-y-1.5">
                      <Opt>선적조건 (인코텀즈)</Opt>
                      <Input {...register('incoterms')} list="bl-incoterms" placeholder="FOB, CIF 등" />
                      <datalist id="bl-incoterms">{INCOTERMS.map(t => <option key={t} value={t} />)}</datalist>
                    </div>
                    <div className="space-y-1.5"><Opt>항구</Opt><Input {...register('port')} placeholder="광양항" /></div>
                    <div className="space-y-1.5"><Opt>포워더</Opt><Input {...register('forwarder')} /></div>
                    <div className="space-y-1.5"><Opt>Invoice No.</Opt><Input {...register('invoice_number')} /></div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Opt>입고 창고</Opt>
                  <Select value={selWhId} onValueChange={handleWhChange}>
                    <SelectTrigger className="w-full"><Txt text={whName} /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => (
                        <SelectItem key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name} ({w.location_name})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 결제조건 (해외/국내) */}
              {(isImport || isDomestic) && (
                <div className="space-y-2">
                  <Opt>결제조건</Opt>
                  <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
                    <span className="text-muted-foreground">계약금</span>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={pt.hasDeposit} onChange={() => setPt(p => ({ ...p, hasDeposit: true }))} />있음
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={!pt.hasDeposit} onChange={() => setPt(p => ({ ...p, hasDeposit: false }))} />없음
                    </label>
                    {pt.hasDeposit && (
                      <>
                        <select className="h-8 rounded border px-2 text-sm" value={pt.depositMethod}
                          onChange={e => setPt(p => ({ ...p, depositMethod: e.target.value as 'tt' | 'lc' }))}>
                          <option value="tt">T/T</option><option value="lc">L/C</option>
                        </select>
                        <div className="flex items-center gap-1">
                          <Input className="w-16 h-8 text-sm" inputMode="decimal" value={pt.depositRate}
                            onChange={e => setPt(p => ({ ...p, depositRate: e.target.value.replace(/[^0-9.]/g, '') }))} />
                          <span>%</span>
                        </div>
                      </>
                    )}
                    <span className="text-muted-foreground ml-2">잔금 L/C</span>
                    <div className="flex items-center gap-1">
                      <Input className="w-16 h-8 text-sm" inputMode="numeric" value={pt.balanceDays}
                        onChange={e => setPt(p => ({ ...p, balanceDays: e.target.value.replace(/[^0-9]/g, '') }))} />
                      <span>days</span>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground">{composePT(pt)}</span>
                  </div>
                </div>
              )}

              {/* 메모 */}
              <div className="max-w-lg space-y-1.5">
                <Opt>메모</Opt>
                <Textarea {...register('memo')} rows={2} />
              </div>

              {/* ── 라인아이템 ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-semibold">라인아이템</Label>
                  <div className="flex-1" />
                  <Button type="button" variant="outline" size="sm" onClick={addLine}
                    disabled={isImport || isDomestic ? !selMfgId : !selCompanyId}>
                    <Plus className="mr-1 h-3.5 w-3.5" />추가
                  </Button>
                </div>

                {((isImport || isDomestic) && !selMfgId) && (
                  <p className="text-xs text-muted-foreground">제조사를 먼저 선택하세요</p>
                )}
                {(isGroup && !selCompanyId) && (
                  <p className="text-xs text-muted-foreground">법인을 먼저 선택하세요</p>
                )}

                {((isImport || isDomestic) ? selMfgId : selCompanyId) && (
                  <>
                    {/* 헤더: 품번 → 수량 → 구분 → 유무상 → 단가(+토글) → 인보이스(자동) → 용량 */}
                    <div className="grid grid-cols-[minmax(240px,3fr)_90px_90px_90px_170px_150px_90px_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
                      <span>품번 *</span><span>수량EA *</span><span>구분 *</span><span>유무상 *</span>
                      <span>{isImport ? (priceMode === 'cents' ? '단가(¢/Wp)' : '단가($/Wp)') : '단가(원/Wp)'}</span>
                      <span>인보이스{currencyLabel}(자동)</span>
                      <span>용량kW</span><span />
                    </div>
                    {lines.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-[minmax(240px,3fr)_90px_90px_90px_170px_150px_90px_36px] gap-2 items-center">
                        {/* 품번 */}
                        <Select value={line.product_id} onValueChange={v => updateLine(idx, 'product_id', v ?? '')}>
                          <SelectTrigger className="w-full h-9 text-xs">
                            <Txt text={productLabel(line.product_id)} placeholder="품번 선택" />
                          </SelectTrigger>
                          <SelectContent className="min-w-[min(500px,calc(100vw-3rem))]">
                            {products.map(p => (
                              <SelectItem key={p.product_id} value={p.product_id}>
                                {p.product_code} | {p.product_name} | {p.spec_wp}Wp
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* 수량 */}
                        <Input className="h-9 text-xs" inputMode="numeric" value={line.quantity} placeholder="0"
                          onChange={e => updateLine(idx, 'quantity', e.target.value.replace(/[^0-9]/g, ''))} />
                        {/* 구분 */}
                        <Select value={line.item_type} onValueChange={v => updateLine(idx, 'item_type', v ?? 'main')}>
                          <SelectTrigger className="w-full h-9 text-xs">
                            <Txt text={line.item_type === 'main' ? '본품' : '스페어'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="main">본품</SelectItem>
                            <SelectItem value="spare">스페어</SelectItem>
                          </SelectContent>
                        </Select>
                        {/* 유무상 */}
                        <Select value={line.payment_type} onValueChange={v => updateLine(idx, 'payment_type', v ?? 'paid')}>
                          <SelectTrigger className="w-full h-9 text-xs">
                            <Txt text={line.payment_type === 'paid' ? '유상' : '무상'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="paid">유상</SelectItem>
                            <SelectItem value="free">무상</SelectItem>
                          </SelectContent>
                        </Select>
                        {/* 단가 + ¢/$ 토글 (import만) */}
                        <div className="flex gap-1 items-center">
                          <Input className="h-9 text-xs flex-1 min-w-0" inputMode="decimal" value={line.unit_price}
                            placeholder={priceMode === 'cents' && isImport ? '12.30' : '0.1230'}
                            onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) updateLine(idx, 'unit_price', v); }} />
                          {isImport && (
                            <Button type="button" variant="outline" size="sm"
                              className="h-9 px-1.5 text-[10px] shrink-0 w-9" onClick={togglePriceMode}>
                              {priceMode === 'cents' ? '¢' : '$'}
                            </Button>
                          )}
                        </div>
                        {/* 인보이스 (자동 계산, 읽기전용) */}
                        <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2 truncate">
                          {fmtInvoice(line)}
                        </div>
                        {/* 용량 kW (자동 계산) */}
                        <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2">
                          {calcKw(line)}
                        </div>
                        {/* 삭제 */}
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9"
                          onClick={() => removeLine(idx)} disabled={lines.length <= 1}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting || !selType}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
