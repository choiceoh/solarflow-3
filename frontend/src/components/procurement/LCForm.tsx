import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { formatUSD, shortMfgName, poMfgSpecLabel, poLineSummary } from '@/lib/utils';
import type { LCLineItem, LCRecord, PurchaseOrder, POLineItem, TTRemittance } from '@/types/procurement';
import type { Bank, Company, Product } from '@/types/masters';
import { SandboxBanner, useFormReadOnly } from '@/onboarding';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

function InfoCell({ label, children, mono = false, strong = false }: { label: string; children: ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] leading-4 text-muted-foreground">{label}</div>
      <div className={`mt-0.5 min-h-5 truncate leading-5 ${mono ? 'font-mono tabular-nums' : ''} ${strong ? 'font-semibold' : 'font-medium'}`}>
        {children}
      </div>
    </div>
  );
}

const schema = z.object({
  lc_number: z.string().optional(),
  po_id: z.string().min(1, 'PO는 필수입니다'),
  company_id: z.string().min(1, '개설법인은 필수입니다'),
  bank_id: z.string().min(1, '은행은 필수입니다'),
  open_date: z.string().optional(),
  amount_usd: z.coerce.number().positive('양수만 가능합니다'),
  target_qty: z.coerce.number().optional().or(z.literal('')),
  target_mw: z.coerce.number().optional().or(z.literal('')),
  usance_days: z.coerce.number().optional().or(z.literal('')),
  usance_type: z.string().optional(),
  maturity_date: z.string().optional(),
  status: z.string().min(1, '상태는 필수입니다'),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (d: Record<string, unknown>) => Promise<void>;
  editData?: LCRecord | null;
  defaultPoId?: string;
  embedded?: boolean;
}

type LCLineRow = {
  po_line_id?: string;
  product_id: string;
  product_name: string;
  product_code: string;
  spec_wp: number;
  po_quantity: number;
  quantity: string;
  unit_price_usd_wp?: number;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
};

// 소수점 포함 천단위 포맷
function fmtDecimal(v: string): string {
  const parts = v.replace(/[^0-9.]/g, '').split('.');
  const intPart = parts[0] ? parseInt(parts[0], 10).toLocaleString('ko-KR') : '';
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
}

function parseIntText(v: string): number {
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function fmtIntText(v: string): string {
  const n = parseIntText(v);
  return n > 0 ? n.toLocaleString('ko-KR') : '';
}

function lineProduct(line: POLineItem, products: Product[]) {
  return products.find((p) => p.product_id === line.product_id);
}

function poLineSpecWp(line: POLineItem, products: Product[]): number {
  const prod = lineProduct(line, products);
  return prod?.spec_wp ?? line.products?.spec_wp ?? line.spec_wp ?? 0;
}

function poLineUnitUSDWp(line: POLineItem, specWp: number): number | undefined {
  if (line.unit_price_usd_wp != null && line.unit_price_usd_wp > 0) return line.unit_price_usd_wp;
  if (line.unit_price_usd != null && specWp > 0) return line.unit_price_usd / specWp;
  if (line.total_amount_usd != null && line.quantity > 0 && specWp > 0) return line.total_amount_usd / (line.quantity * specWp);
  return undefined;
}

function buildRowsFromPOLines(lines: POLineItem[], products: Product[], quantityLimit?: number): LCLineRow[] {
  const paidLines = lines.filter((l) => l.payment_type == null || l.payment_type === 'paid');
  const sourceLines = paidLines.length > 0 ? paidLines : lines;
  let remaining = quantityLimit && quantityLimit > 0 ? quantityLimit : undefined;
  return sourceLines.map((line) => {
    const specWp = poLineSpecWp(line, products);
    const prod = lineProduct(line, products);
    const qty = remaining == null ? line.quantity : Math.min(line.quantity, Math.max(0, remaining));
    if (remaining != null) remaining -= qty;
    return {
      po_line_id: line.po_line_id,
      product_id: line.product_id,
      product_name: prod?.product_name ?? line.products?.product_name ?? line.product_name ?? '—',
      product_code: prod?.product_code ?? line.products?.product_code ?? line.product_code ?? '—',
      spec_wp: specWp,
      po_quantity: line.quantity,
      quantity: qty > 0 ? String(qty) : '',
      unit_price_usd_wp: poLineUnitUSDWp(line, specWp),
      item_type: line.item_type ?? 'main',
      payment_type: line.payment_type ?? 'paid',
    };
  });
}

function buildRowsFromLCLines(lines: LCLineItem[], poLines: POLineItem[], products: Product[]): LCLineRow[] {
  return lines.map((line) => {
    const poLine = poLines.find((p) => p.po_line_id === line.po_line_id) ?? poLines.find((p) => p.product_id === line.product_id);
    const prod = products.find((p) => p.product_id === line.product_id);
    const specWp = prod?.spec_wp ?? line.products?.spec_wp ?? poLine?.products?.spec_wp ?? poLine?.spec_wp ?? line.spec_wp ?? 0;
    const unit = line.unit_price_usd_wp ?? (line.amount_usd != null && line.quantity > 0 && specWp > 0 ? line.amount_usd / (line.quantity * specWp) : poLine ? poLineUnitUSDWp(poLine, specWp) : undefined);
    return {
      po_line_id: line.po_line_id,
      product_id: line.product_id,
      product_name: prod?.product_name ?? line.products?.product_name ?? poLine?.products?.product_name ?? poLine?.product_name ?? line.product_name ?? '—',
      product_code: prod?.product_code ?? line.products?.product_code ?? poLine?.products?.product_code ?? poLine?.product_code ?? line.product_code ?? '—',
      spec_wp: specWp,
      po_quantity: poLine?.quantity ?? line.quantity,
      quantity: String(line.quantity),
      unit_price_usd_wp: unit,
      item_type: line.item_type ?? poLine?.item_type ?? 'main',
      payment_type: line.payment_type ?? poLine?.payment_type ?? 'paid',
    };
  });
}

function rowAmountUSD(row: LCLineRow, qty: number): number {
  if (row.payment_type === 'free') return 0;
  return qty * row.spec_wp * (row.unit_price_usd_wp ?? 0);
}

export default function LCForm({ open, onOpenChange, onSubmit, editData, defaultPoId, embedded = false }: Props) {
  const readOnly = useFormReadOnly(editData);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allLcs, setAllLcs] = useState<LCRecord[]>([]);
  const [poLines, setPoLines] = useState<POLineItem[]>([]);
  const [poTts, setPoTts] = useState<TTRemittance[]>([]);
  const [poLcs, setPoLcs] = useState<LCRecord[]>([]);
  const [lcLineRows, setLcLineRows] = useState<LCLineRow[]>([]);
  const [savedLcLinesLoaded, setSavedLcLinesLoaded] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [poPickerLines, setPoPickerLines] = useState<Record<string, POLineItem[]>>({});
  const [filterMfg, setFilterMfg] = useState('');
  const [allBanks, setAllBanks] = useState<Bank[]>([]);
  // 천단위 표시용 display state
  const [amountUsdDisplay, setAmountUsdDisplay] = useState('');
  const [targetQtyDisplay, setTargetQtyDisplay] = useState('');
  const [targetMwDisplay, setTargetMwDisplay] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) as any });
  const lastManualField = useRef<'qty' | 'mw' | null>(null);

  // 정적 마스터 — 마운트 시 1회
  useEffect(() => {
    fetchWithAuth<Company[]>('/api/v1/companies').then((list) => setCompanies(list.filter((c) => c.is_active))).catch(() => {});
    fetchWithAuth<Product[]>('/api/v1/products').then(setProducts).catch(() => {});
    fetchWithAuth<Bank[]>('/api/v1/banks').then(setAllBanks).catch(() => {});
  }, []);

  // 폼 열 때마다 동적 데이터 갱신
  // completed PO는 LC 개설 불가이지만 defaultPoId PO는 예외 포함 (PO탭 L/C 추가 시 표시)
  useEffect(() => {
    if (!open) return;
    fetchWithAuth<LCRecord[]>('/api/v1/lcs').then(setAllLcs).catch(() => {});
    fetchWithAuth<PurchaseOrder[]>('/api/v1/pos')
      .then((list) => setPos(list.filter((p) => p.status !== 'completed' || p.po_id === defaultPoId)))
      .catch(() => {});
  }, [open, defaultPoId]);

  // 선택한 개설법인의 은행 목록
  const watchedCompanyId = watch('company_id');
  useEffect(() => {
    const cid = (watchedCompanyId && watchedCompanyId !== 'all')
      ? watchedCompanyId
      : (selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : '');
    if (cid) {
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${cid}`).then((list) => setBanks(list.filter((b) => b.is_active))).catch(() => setBanks([]));
    } else {
      setBanks([]);
    }
  }, [watchedCompanyId, selectedCompanyId]);

  // PO 선택 시 PO 라인/TT/LC 로드 (4박스 자동표시용)
  const watchedPoId = watch('po_id');
  useEffect(() => {
    if (!watchedPoId) { setPoLines([]); setPoTts([]); setPoLcs([]); setLcLineRows([]); return; }
    // 새 LC 등록 시 PO 선택/고정 경로 모두 PO 법인을 기본값으로 맞춘다.
    if (!editData) {
      const po = pos.find((p) => p.po_id === watchedPoId);
      const currentCompanyId = watch('company_id');
      if (po?.company_id && currentCompanyId !== po.company_id) {
        setValue('company_id', po.company_id, { shouldDirty: true });
        setValue('bank_id', ''); // 법인 변경 시 은행 초기화
      }
    }
    fetchWithAuth<POLineItem[]>(`/api/v1/pos/${watchedPoId}/lines`).then(setPoLines).catch(() => setPoLines([]));
    fetchWithAuth<TTRemittance[]>(`/api/v1/tts?po_id=${watchedPoId}`).then(setPoTts).catch(() => setPoTts([]));
    fetchWithAuth<LCRecord[]>(`/api/v1/lcs?po_id=${watchedPoId}`).then(setPoLcs).catch(() => setPoLcs([]));
  }, [watchedPoId, pos, editData, setValue, watch]);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      setFilterMfg('');
      setLcLineRows([]);
      setSavedLcLinesLoaded(!editData);
      if (editData) {
        reset({ lc_number: editData.lc_number ?? '', po_id: editData.po_id, company_id: editData.company_id, bank_id: editData.bank_id, open_date: editData.open_date?.slice(0, 10) ?? '', amount_usd: editData.amount_usd, target_qty: editData.target_qty ?? '', target_mw: editData.target_mw ?? '', usance_days: editData.usance_days ?? '', usance_type: editData.usance_type ?? '', maturity_date: editData.maturity_date?.slice(0, 10) ?? '', status: editData.status, memo: editData.memo ?? '' });
        setAmountUsdDisplay(fmtDecimal(editData.amount_usd?.toString() ?? ''));
        setTargetQtyDisplay(editData.target_qty ? Math.round(editData.target_qty).toLocaleString('ko-KR') : '');
        setTargetMwDisplay(editData.target_mw != null ? editData.target_mw.toString() : '');
      } else {
        const initialCompanyId = selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : '';
        reset({ lc_number: '', po_id: defaultPoId ?? '', company_id: initialCompanyId, bank_id: '', open_date: '', amount_usd: '' as unknown as number, target_qty: '', target_mw: '', usance_days: 90, usance_type: 'buyers', maturity_date: '', status: 'opened', memo: '' });
        setAmountUsdDisplay('');
        setTargetQtyDisplay('');
        setTargetMwDisplay('');
      }
    }
  }, [open, editData, reset, selectedCompanyId, defaultPoId]);

  // 수정 모드: 기존 LC 품목 명세를 먼저 불러온다. 없는 과거 LC는 PO 라인에서 복원한다.
  useEffect(() => {
    if (!open || !editData?.lc_id) return;
    let cancelled = false;
    setSavedLcLinesLoaded(false);
    fetchWithAuth<LCLineItem[]>(`/api/v1/lcs/${editData.lc_id}/lines`)
      .then((lines) => {
        if (cancelled) return;
        if (lines.length > 0) {
          setLcLineRows(buildRowsFromLCLines(lines, poLines, products));
        } else {
          setLcLineRows([]);
        }
        setSavedLcLinesLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSavedLcLinesLoaded(true);
      });
    return () => { cancelled = true; };
  }, [open, editData?.lc_id, poLines, products]);

  // 신규 LC: PO 품목을 LC 품목 명세로 자동 펼친다. 편집 중 과거 LC도 저장된 라인이 없으면 target_qty 기준으로 복원한다.
  useEffect(() => {
    if (!open || !watchedPoId || poLines.length === 0) return;
    if (editData && !savedLcLinesLoaded) return;
    if (editData && lcLineRows.length > 0) return;
    const quantityLimit = editData?.target_qty && editData.target_qty > 0 ? editData.target_qty : undefined;
    setLcLineRows(buildRowsFromPOLines(poLines, products, quantityLimit));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, watchedPoId, poLines, products, editData?.lc_id, editData?.target_qty, savedLcLinesLoaded]);

  const lcLineTotals = useMemo(() => {
    return lcLineRows.reduce((acc, row) => {
      const qty = parseIntText(row.quantity);
      const capacityKW = qty * row.spec_wp / 1000;
      const amountUSD = rowAmountUSD(row, qty);
      acc.quantity += qty;
      acc.capacityKW += capacityKW;
      acc.amountUSD += amountUSD;
      return acc;
    }, { quantity: 0, capacityKW: 0, amountUSD: 0 });
  }, [lcLineRows]);

  useEffect(() => {
    if (!open || lcLineRows.length === 0) return;
    const mw = lcLineTotals.capacityKW / 1000;
    setValue('target_qty', (lcLineTotals.quantity || '') as unknown as number, { shouldDirty: true });
    setTargetQtyDisplay(lcLineTotals.quantity > 0 ? lcLineTotals.quantity.toLocaleString('ko-KR') : '');
    setValue('target_mw', (mw > 0 ? Number(mw.toFixed(4)) : '') as unknown as number, { shouldDirty: true });
    setTargetMwDisplay(mw > 0 ? mw.toFixed(4) : '');
    setValue('amount_usd', (lcLineTotals.amountUSD > 0 ? Number(lcLineTotals.amountUSD.toFixed(2)) : '') as unknown as number, { shouldDirty: true });
    setAmountUsdDisplay(lcLineTotals.amountUSD > 0 ? fmtDecimal(lcLineTotals.amountUSD.toFixed(2)) : '');
  }, [open, lcLineRows.length, lcLineTotals.quantity, lcLineTotals.capacityKW, lcLineTotals.amountUSD, setValue]);

  // F11: target_qty → target_mw(용량) + amount_usd 자동 계산
  // 다중 라인 PO 대응: 가중평균 단가(USD/module), 가중평균 spec_wp 사용
  const watchedQty = watch('target_qty');
  useEffect(() => {
    if (lcLineRows.length > 0) return;
    if (lastManualField.current === 'mw') { lastManualField.current = null; return; }
    if (watchedQty === '' || watchedQty == null) return;
    const qty = Number(watchedQty);
    if (!qty || isNaN(qty) || poLines.length === 0) return;
    const totalQty = poLines.reduce((s, l) => s + (l.quantity ?? 0), 0);
    const totalUsd = poLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
    const totalWp = poLines.reduce((s, l) => {
      const prod = products.find((p) => p.product_id === l.product_id);
      const spec = prod?.spec_wp ?? l.products?.spec_wp ?? l.spec_wp ?? 0;
      return s + (l.quantity ?? 0) * spec;
    }, 0);
    if (totalQty > 0 && totalWp > 0) {
      const avgSpecWp = totalWp / totalQty;
      const avgUnitUsd = totalUsd / totalQty;
      const mw = (qty * avgSpecWp) / 1_000_000;
      setValue('target_mw', Number(mw.toFixed(4)), { shouldDirty: true });
      setTargetMwDisplay(mw.toFixed(4));
      const calcAmt = Number((qty * avgUnitUsd).toFixed(2));
      setValue('amount_usd', calcAmt, { shouldDirty: true });
      setAmountUsdDisplay(fmtDecimal(calcAmt.toString()));
    }
  }, [watchedQty, poLines, products, setValue, lcLineRows.length]);

  // 자동: open_date + usance_days → maturity_date
  const watchedOpenDate = watch('open_date');
  const watchedUsance = watch('usance_days');
  useEffect(() => {
    if (!watchedOpenDate || watchedUsance === '' || watchedUsance == null) return;
    const days = Number(watchedUsance);
    if (!days || isNaN(days)) return;
    const d = new Date(watchedOpenDate);
    if (isNaN(d.getTime())) return;
    d.setDate(d.getDate() + days);
    setValue('maturity_date', d.toISOString().slice(0, 10), { shouldDirty: true });
  }, [watchedOpenDate, watchedUsance, setValue]);

  const mfgOptions = useMemo(() => [...new Set(pos.map((p) => p.manufacturer_name).filter(Boolean) as string[])].sort(), [pos]);
  const filteredPos = useMemo(() => filterMfg ? pos.filter((p) => p.manufacturer_name === filterMfg) : pos, [pos, filterMfg]);
  const unitPriceCpW = useMemo(() => {
    const paidLines = poLines.filter((l) => l.payment_type == null || l.payment_type === 'paid');
    if (!paidLines.length) return null;
    const totalUsd = paidLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
    const totalWp = paidLines.reduce((s, l) => {
      const prod = products.find((p) => p.product_id === l.product_id);
      const spec = prod?.spec_wp ?? l.products?.spec_wp ?? l.spec_wp ?? 0;
      return s + (l.quantity ?? 0) * spec;
    }, 0);
    return totalWp > 0 ? (totalUsd / totalWp * 100).toFixed(4) : null;
  }, [poLines, products]);

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = { ...data };
    if (lcLineRows.length > 0) {
      const overRow = lcLineRows.find((row) => {
        const qty = parseIntText(row.quantity);
        return row.po_quantity > 0 && qty > row.po_quantity;
      });
      if (overRow) {
        setSubmitError(`${overRow.product_name}의 LC 수량이 PO 수량을 초과했습니다`);
        return;
      }
      const lineItems = lcLineRows.map((row) => {
        const qty = parseIntText(row.quantity);
        if (qty <= 0) return null;
        const capacityKW = qty * row.spec_wp / 1000;
        const amountUSD = rowAmountUSD(row, qty);
        return {
          po_line_id: row.po_line_id,
          product_id: row.product_id,
          quantity: qty,
          capacity_kw: Number(capacityKW.toFixed(4)),
          amount_usd: row.payment_type === 'free' ? 0 : Number(amountUSD.toFixed(2)),
          unit_price_usd_wp: row.unit_price_usd_wp,
          item_type: row.item_type,
          payment_type: row.payment_type,
        };
      }).filter(Boolean);
      if (lineItems.length === 0) {
        setSubmitError('LC 품목 수량을 1개 이상 입력해 주세요');
        return;
      }
      payload.line_items = lineItems;
      payload.target_qty = lcLineTotals.quantity;
      payload.target_mw = Number((lcLineTotals.capacityKW / 1000).toFixed(4));
      payload.amount_usd = Number(lcLineTotals.amountUSD.toFixed(2));
    }
    if (lcLineRows.length === 0 && (data.target_qty === '' || data.target_qty === undefined)) delete payload.target_qty;
    if (lcLineRows.length === 0 && (data.target_mw === '' || data.target_mw === undefined)) delete payload.target_mw;
    if (data.usance_days === '' || data.usance_days === undefined) delete payload.usance_days;
    if (!data.open_date) delete payload.open_date;
    if (!data.maturity_date) delete payload.maturity_date;
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  // PO 행 "LC 추가"에서 열었으면 PO 변경 불가 (실수 방지)
  const isPoLocked = !!defaultPoId && !editData;
  const title = editData ? 'LC 수정' : 'LC 등록';

  const formBody = (
    <>
        {embedded ? (
          <div className="flex items-center justify-between gap-3 border-b pb-3">
            <div>
              <p className="text-xs text-muted-foreground">구매 / LC</p>
              <h2 className="text-lg font-semibold">{title}</h2>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>목록으로</Button>
          </div>
        ) : (
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        )}
        {readOnly && <SandboxBanner />}
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <fieldset disabled={readOnly} className="contents">
        <form onSubmit={readOnly ? (e) => e.preventDefault() : handleSubmit(handle)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>LC번호</Label><Input {...register('lc_number')} /></div>
            <div className="space-y-1.5">
              <Label>PO *</Label>
              {/* 제조사 필터 칩 — PO 고정일 때는 숨김 */}
              {!isPoLocked && mfgOptions.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => setFilterMfg('')} className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${!filterMfg ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/60'}`}>전체</button>
                  {mfgOptions.map((mfg) => (
                    <button key={mfg} type="button" onClick={() => setFilterMfg(mfg)} className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${filterMfg === mfg ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/60'}`}>{mfg}</button>
                  ))}
                </div>
              )}
              {/* PO 고정: 읽기 전용 표시 */}
              {isPoLocked ? (
                <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-2.5 h-8 text-sm">
                  <span className="flex-1 truncate text-foreground">
                    {(() => {
                      const p = pos.find((x) => x.po_id === watch('po_id'));
                      if (!p) return '로딩 중…';
                      const mw = (p.total_mw ?? 0).toFixed(1);
                      const spec = poLines[0]?.products?.spec_wp ?? poLines[0]?.spec_wp;
                      const specLabel = spec ? ` ${spec}W` : '';
                      const co = p.company_name ? `${p.company_name} | ` : '';
                      return `${co}${shortMfgName(p.manufacturer_name)}${specLabel} | ${p.po_number || p.po_id.slice(0, 8)} | ${mw}MW`;
                    })()}
                  </span>
                  <span className="shrink-0 text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium">PO 고정</span>
                </div>
              ) : (
                /* PO 드롭다운 — LC 탭 직접 등록 */
                <div className="flex gap-2">
                  <Select value={watch('po_id') ?? ''} onValueChange={(v) => setValue('po_id', v ?? '')}><SelectTrigger className="w-full"><Txt text={(() => { const p = pos.find((x) => x.po_id === watch('po_id')); if (!p) return ''; const mw = (p.total_mw ?? 0).toFixed(1); const spec = p.first_spec_wp ?? poLines[0]?.products?.spec_wp ?? poLines[0]?.spec_wp; const specLabel = spec ? ` ${spec}W` : ''; const co = p.company_name ? `${p.company_name} | ` : ''; return `${co}${shortMfgName(p.manufacturer_name)}${specLabel} | ${p.po_number || p.po_id.slice(0, 8)} | ${mw}MW`; })()} /></SelectTrigger>
                    <SelectContent>{filteredPos.map((p) => { const mw = (p.total_mw ?? 0).toFixed(1); const spec = p.first_spec_wp; const specLabel = spec ? ` ${spec}W` : ''; const co = p.company_name ? `${p.company_name} | ` : ''; return <SelectItem key={p.po_id} value={p.po_id}>{`${co}${shortMfgName(p.manufacturer_name)}${specLabel} | ${p.po_number || p.po_id.slice(0, 8)} | ${mw}MW`}</SelectItem>; })}</SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={async () => {
                    // F9: 상세 팝업 열 때 라인 정보 프리페치
                    setPoPickerOpen(true);
                    const missing = filteredPos.filter((p) => !poPickerLines[p.po_id]);
                    const results = await Promise.all(missing.map(async (p) => {
                      try { return [p.po_id, await fetchWithAuth<POLineItem[]>(`/api/v1/pos/${p.po_id}/lines`)] as const; }
                      catch { return [p.po_id, []] as const; }
                    }));
                    setPoPickerLines((prev) => ({ ...prev, ...Object.fromEntries(results) }));
                  }}>상세</Button>
                </div>
              )}
              {errors.po_id && <p className="text-xs text-destructive">{errors.po_id.message}</p>}
            </div>
          </div>
          {/* PO 연결 현황 — 제조사/품명/규격/잔량MW + 결제 요약 (F10) */}
          {watchedPoId && (() => {
            const po = pos.find((x) => x.po_id === watchedPoId);
            // 유상 라인만 기준 — 무상(스페어)은 LC 개설 대상 아님
            const paidLines = poLines.filter((l) => l.payment_type == null || l.payment_type === 'paid');
            const summary = poLineSummary(poLines, products); // paid 기준
            const poTotalUsd = paidLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
            const paidTotalMw = paidLines.reduce((s, l) => {
              const prod = products.find((p) => p.product_id === l.product_id);
              const spec = prod?.spec_wp ?? l.products?.spec_wp ?? l.spec_wp ?? 0;
              return s + (l.quantity ?? 0) * spec / 1_000_000;
            }, 0);
            const ttPaid = poTts.reduce((s, t) => s + (t.amount_usd ?? 0), 0);
            const lcOpened = poLcs.filter((l) => !editData || l.lc_id !== editData.lc_id).reduce((s, l) => s + (l.amount_usd ?? 0), 0);
            const remain = Math.max(0, poTotalUsd - lcOpened);
            const lcOpenedMw = poLcs.filter((l) => !editData || l.lc_id !== editData.lc_id).reduce((s, l) => s + (l.target_mw ?? 0), 0);
            // 편집 중일 때: 현재 입력한 target_mw도 포함해 잔량 계산 (실시간 반영)
            const thisLcMw = parseFloat(String(watch('target_mw') ?? 0)) || 0;
            const remainMw = Math.max(0, paidTotalMw - lcOpenedMw - thisLcMw);
            return (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="grid grid-cols-5 gap-x-4 gap-y-3">
                  <InfoCell label="제조사/규격">{poMfgSpecLabel(po?.manufacturer_name, poLines, products)}</InfoCell>
                  <InfoCell label="품명">{summary.productName}</InfoCell>
                  <InfoCell label="품번">{summary.productCodeWithCount}</InfoCell>
                  <InfoCell label="단가(¢/Wp)" mono>{unitPriceCpW ?? '—'}</InfoCell>
                  <InfoCell label="발주 잔량" mono strong>{remainMw.toFixed(2)} MW</InfoCell>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-x-4 gap-y-3 border-t pt-3">
                  <InfoCell label="PO 계약총액" mono>{formatUSD(poTotalUsd)}</InfoCell>
                  <InfoCell label="계약금 기납부" mono>{formatUSD(ttPaid)}</InfoCell>
                  <InfoCell label="LC 기개설" mono>{formatUSD(lcOpened)}</InfoCell>
                  <InfoCell label="미개설 잔액" mono strong>{formatUSD(remain)}</InfoCell>
                </div>
              </div>
            );
          })()}
          {watchedPoId && lcLineRows.length > 0 && (
            <div className="rounded-md border bg-card text-xs">
              <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                <div>
                  <div className="font-semibold">LC 품목 명세</div>
                  <div className="text-[11px] text-muted-foreground">PO 품목을 그대로 가져옵니다. 분할 개설이면 품목별 LC 수량만 조정하세요.</div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div>{lcLineTotals.quantity.toLocaleString('ko-KR')} EA · {(lcLineTotals.capacityKW / 1000).toFixed(4)} MW</div>
                  <div className="font-semibold">{formatUSD(lcLineTotals.amountUSD)}</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className="bg-muted/40 text-[11px] text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">품목</th>
                      <th className="p-2 text-left">품번</th>
                      <th className="p-2 text-right">규격</th>
                      <th className="p-2 text-right">PO수량</th>
                      <th className="p-2 text-right">LC수량</th>
                      <th className="p-2 text-right">용량</th>
                      <th className="p-2 text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lcLineRows.map((row, idx) => {
                      const qty = parseIntText(row.quantity);
                      const over = row.po_quantity > 0 && qty > row.po_quantity;
                      const amount = rowAmountUSD(row, qty);
                      const capacityMW = qty * row.spec_wp / 1_000_000;
                      return (
                        <tr key={`${row.po_line_id ?? row.product_id}-${idx}`} className="border-t">
                          <td className="p-2">
                            <div className="font-medium">{row.product_name}</div>
                            <div className="text-[11px] text-muted-foreground">{row.item_type === 'spare' ? '스페어' : '본품'} · {row.payment_type === 'free' ? '무상' : '유상'}</div>
                          </td>
                          <td className="p-2 font-mono">{row.product_code}</td>
                          <td className="p-2 text-right font-mono">{row.spec_wp ? `${row.spec_wp}W` : '—'}</td>
                          <td className="p-2 text-right font-mono">{row.po_quantity.toLocaleString('ko-KR')}</td>
                          <td className="p-2">
                            <Input
                              className={`h-8 text-right font-mono tabular-nums ${over ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                              inputMode="numeric"
                              value={fmtIntText(row.quantity)}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                setLcLineRows((prev) => prev.map((item, i) => i === idx ? { ...item, quantity: raw } : item));
                              }}
                            />
                            {over && <div className="mt-0.5 text-right text-[10px] text-destructive">PO 초과</div>}
                          </td>
                          <td className="p-2 text-right font-mono">{capacityMW > 0 ? `${capacityMW.toFixed(4)} MW` : '—'}</td>
                          <td className="p-2 text-right font-mono">{row.payment_type === 'free' ? '$0.00' : formatUSD(amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* 개설법인 + 은행 — D-094: PO법인과 다를 수 있음 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>개설법인 *</Label>
              <Select value={watch('company_id') ?? ''} onValueChange={(v) => { setValue('company_id', v ?? ''); setValue('bank_id', ''); }}><SelectTrigger className="w-full"><Txt text={(() => {
                const c = companies.find((x) => x.company_id === watch('company_id'));
                return c ? c.company_name : '';
              })()} /></SelectTrigger>
                <SelectContent>{companies.map((c) => {
                  const totalLimit = allBanks.filter((b) => b.company_id === c.company_id).reduce((s, b) => s + (b.lc_limit_usd ?? 0), 0);
                  const lcUsed = allLcs.filter((l) => l.company_id === c.company_id && (!editData || l.lc_id !== editData.lc_id) && l.status !== 'settled' && !l.repaid).reduce((s, l) => s + (l.amount_usd ?? 0), 0);
                  const remaining = Math.max(0, totalLimit - lcUsed);
                  return <SelectItem key={c.company_id} value={c.company_id}>{`${c.company_name} (잔여한도 ${formatUSD(remaining)})`}</SelectItem>;
                })}</SelectContent>
              </Select>{errors.company_id && <p className="text-xs text-destructive">{errors.company_id.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>은행 *</Label>
              <Select value={watch('bank_id') ?? ''} onValueChange={(v) => setValue('bank_id', v ?? '')}><SelectTrigger className="w-full"><Txt text={(() => {
                const b = banks.find((x) => x.bank_id === watch('bank_id'));
                if (!b) return '';
                const usedSameBank = allLcs.filter((l) => l.bank_id === b.bank_id && l.company_id === watchedCompanyId && (!editData || l.lc_id !== editData.lc_id) && l.status !== 'settled' && !l.repaid).reduce((s, l) => s + (l.amount_usd ?? 0), 0);
                const avail = Math.max(0, (b.lc_limit_usd ?? 0) - usedSameBank);
                return `${b.bank_name} (가용 ${formatUSD(avail)})`;
              })()} /></SelectTrigger>
                <SelectContent>{banks.map((b) => {
                  const usedSameBank = allLcs.filter((l) => l.bank_id === b.bank_id && l.company_id === watchedCompanyId && (!editData || l.lc_id !== editData.lc_id) && l.status !== 'settled' && !l.repaid).reduce((s, l) => s + (l.amount_usd ?? 0), 0);
                  const avail = Math.max(0, (b.lc_limit_usd ?? 0) - usedSameBank);
                  return <SelectItem key={b.bank_id} value={b.bank_id}>{`${b.bank_name} (가용 ${formatUSD(avail)})`}</SelectItem>;
                })}</SelectContent>
              </Select>{errors.bank_id && <p className="text-xs text-destructive">{errors.bank_id.message}</p>}
              {/* 은행 선택 시 수수료율/승인기한 인라인 표시 */}
              {(() => {
                const b = banks.find((x) => x.bank_id === watch('bank_id'));
                if (!b) return null;
                const expiryDays = b.limit_expiry_date ? Math.ceil((new Date(b.limit_expiry_date).getTime() - Date.now()) / 86400000) : null;
                const expiryColor = expiryDays == null ? '' : expiryDays < 0 ? 'text-red-600 font-semibold' : expiryDays <= 30 ? 'text-orange-500' : 'text-muted-foreground';
                return (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] mt-1 text-muted-foreground">
                    {b.limit_expiry_date && (
                      <span className={expiryColor}>
                        승인기한: {b.limit_expiry_date.slice(0, 10)}
                        {expiryDays != null && (expiryDays < 0 ? ' (만료!)' : expiryDays <= 90 ? ` (D-${expiryDays})` : '')}
                      </span>
                    )}
                    {b.opening_fee_rate != null && <span>개설: {(b.opening_fee_rate * 100).toFixed(2)}%</span>}
                    {b.acceptance_fee_rate != null && <span>인수: {(b.acceptance_fee_rate * 100).toFixed(2)}%</span>}
                    {b.fee_calc_method && <span className="text-[10px]">({b.fee_calc_method})</span>}
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>개설일</Label><DateInput value={watch('open_date') ?? ''} onChange={(v) => setValue('open_date', v, { shouldDirty: true })} /></div>
            <div className="space-y-1.5">
              <Label>수량(EA)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={targetQtyDisplay}
                readOnly={lcLineRows.length > 0}
                className={lcLineRows.length > 0 ? 'bg-muted/40 text-muted-foreground' : ''}
                onChange={(e) => {
                  if (lcLineRows.length > 0) return;
                  lastManualField.current = 'qty';
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  const num = raw ? parseInt(raw, 10) : undefined;
                  setTargetQtyDisplay(num !== undefined ? num.toLocaleString('ko-KR') : '');
                  setValue('target_qty', (num ?? '') as unknown as number, { shouldDirty: true });
                }}
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>용량(MW)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={targetMwDisplay}
                readOnly={lcLineRows.length > 0}
                className={lcLineRows.length > 0 ? 'bg-muted/40 text-muted-foreground' : ''}
                onChange={(e) => {
                  if (lcLineRows.length > 0) return;
                  const raw = e.target.value.replace(/[^0-9.]/g, '');
                  setTargetMwDisplay(raw);
                  const mw = parseFloat(raw);
                  setValue('target_mw', (isNaN(mw) ? '' : mw) as unknown as number, { shouldDirty: true });
                  if (!isNaN(mw) && mw > 0 && poLines.length > 0) {
                    lastManualField.current = 'mw';
                    const totalQty = poLines.reduce((s, l) => s + (l.quantity ?? 0), 0);
                    const totalUsd = poLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
                    const totalWp = poLines.reduce((s, l) => {
                      const prod = products.find((p) => p.product_id === l.product_id);
                      const spec = prod?.spec_wp ?? l.products?.spec_wp ?? l.spec_wp ?? 0;
                      return s + (l.quantity ?? 0) * spec;
                    }, 0);
                    if (totalQty > 0 && totalWp > 0) {
                      const avgSpecWp = totalWp / totalQty;
                      const avgUnitUsd = totalUsd / totalQty;
                      const qty = Math.round((mw * 1_000_000) / avgSpecWp);
                      setValue('target_qty', qty, { shouldDirty: true });
                      setTargetQtyDisplay(qty.toLocaleString('ko-KR'));
                      const calcAmt = Number((qty * avgUnitUsd).toFixed(2));
                      setValue('amount_usd', calcAmt, { shouldDirty: true });
                      setAmountUsdDisplay(fmtDecimal(calcAmt.toString()));
                    }
                  }
                }}
                placeholder="0.0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>단가(¢/Wp)</Label>
              <Input type="text" readOnly value={unitPriceCpW ?? ''} placeholder="PO 선택 시 자동 계산" className="bg-muted/40 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>금액(USD) *</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={amountUsdDisplay}
              readOnly={lcLineRows.length > 0}
              className={lcLineRows.length > 0 ? 'bg-muted/40 text-muted-foreground' : ''}
              onChange={(e) => {
                if (lcLineRows.length > 0) return;
                const raw = e.target.value.replace(/[^0-9.]/g, '');
                setAmountUsdDisplay(fmtDecimal(raw));
                const num = parseFloat(raw);
                setValue('amount_usd', (isNaN(num) ? '' : num) as unknown as number, { shouldDirty: true });
              }}
              placeholder="0.00"
            />
            {errors.amount_usd && <p className="text-xs text-destructive">{errors.amount_usd.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Usance(일)</Label><Input type="number" {...register('usance_days')} /></div>
            <div className="space-y-1.5">
              <Label>Usance유형</Label>
              <Select value={watch('usance_type') ?? ''} onValueChange={(v) => setValue('usance_type', v ?? '')}><SelectTrigger className="w-full"><Txt text={{ buyers: "Buyer's", shippers: "Shipper's" }[watch('usance_type') ?? ''] || ''} /></SelectTrigger>
                <SelectContent><SelectItem value="buyers">Buyer's</SelectItem><SelectItem value="shippers">Shipper's</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>만기일</Label><DateInput value={watch('maturity_date') ?? ''} onChange={(v) => setValue('maturity_date', v, { shouldDirty: true })} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>상태 *</Label>
            <Select value={watch('status') ?? ''} onValueChange={(v) => setValue('status', v ?? '')}><SelectTrigger className="w-full"><Txt text={{ pending: '대기', opened: '개설', docs_received: '서류접수', settled: '결제완료', cancelled: '취소' }[watch('status') ?? ''] || ''} /></SelectTrigger>
              <SelectContent><SelectItem value="pending">대기</SelectItem><SelectItem value="opened">개설</SelectItem><SelectItem value="docs_received">서류접수</SelectItem><SelectItem value="settled">결제완료</SelectItem><SelectItem value="cancelled">취소</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>메모</Label><Textarea {...register('memo')} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>{!readOnly && <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>}</DialogFooter>
        </form>
        </fieldset>
    </>
  );

  const poPickerDialog = (
    <Dialog open={poPickerOpen} onOpenChange={setPoPickerOpen}>
        <DialogContent className="w-[92vw] max-w-[1400px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>PO 상세 선택</DialogTitle></DialogHeader>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs min-w-[1000px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">PO번호</th>
                  <th className="text-left p-2">제조사</th>
                  <th className="text-left p-2">품명</th>
                  <th className="text-left p-2">품번</th>
                  <th className="text-left p-2">계약일</th>
                  <th className="text-left p-2">상태</th>
                  <th className="text-right p-2">수량(EA)</th>
                  <th className="text-right p-2">Wp</th>
                  <th className="text-right p-2">단가(¢/Wp)</th>
                  <th className="text-right p-2">총금액(USD)</th>
                  <th className="text-right p-2">MW</th>
                </tr>
              </thead>
              <tbody>
                {filteredPos.map((p) => {
                  const plines = poPickerLines[p.po_id] ?? [];
                  const paidPlines = plines.filter((l) => l.payment_type == null || l.payment_type === 'paid');
                  const first = paidPlines[0] ?? plines[0];
                  const total = paidPlines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
                  const totalEa = paidPlines.reduce((s, l) => s + (l.quantity ?? 0), 0);
                  const firstWp = first?.products?.spec_wp ?? first?.spec_wp ?? null;
                  const statusLabel: Record<string, string> = { draft: '초안', confirmed: '확정', completed: '완료', cancelled: '취소' };
                  return (
                    <tr key={p.po_id} className="border-t hover:bg-accent/30 cursor-pointer" onClick={() => { setValue('po_id', p.po_id, { shouldDirty: true }); setPoPickerOpen(false); }}>
                      <td className="p-2 font-mono"><div className="truncate">{p.po_number || p.po_id.slice(0, 8)}</div></td>
                      <td className="p-2"><div className="truncate">{shortMfgName(p.manufacturer_name)}</div></td>
                      <td className="p-2">
                        <div className="truncate">{first?.products?.product_name ?? first?.product_name ?? '—'}{paidPlines.length > 1 ? ` 외 ${paidPlines.length - 1}건` : ''}</div>
                      </td>
                      <td className="p-2"><div className="truncate">{first?.products?.product_code ?? first?.product_code ?? '—'}</div></td>
                      <td className="p-2 font-mono">{p.contract_date ? p.contract_date.slice(0, 10) : '—'}</td>
                      <td className="p-2">{statusLabel[p.status ?? ''] ?? p.status ?? '—'}</td>
                      <td className="p-2 text-right font-mono">{totalEa > 0 ? totalEa.toLocaleString('ko-KR') : '—'}</td>
                      <td className="p-2 text-right font-mono">{firstWp != null ? `${firstWp}W` : '—'}</td>
                      <td className="p-2 text-right font-mono">{(() => {
                        const tw = plines.reduce((s, l) => s + (l.quantity ?? 0) * (l.products?.spec_wp ?? l.spec_wp ?? 0), 0);
                        return tw > 0 ? ((total / tw) * 100).toFixed(2) : '—';
                      })()}</td>
                      <td className="p-2 text-right font-mono">{formatUSD(total)}</td>
                      <td className="p-2 text-right font-mono">{(p.total_mw ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
    </Dialog>
  );

  if (embedded) {
    if (!open) return null;
    return (
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        {formBody}
        {poPickerDialog}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto">
        {formBody}
      </DialogContent>
      {poPickerDialog}
    </Dialog>
  );
}
