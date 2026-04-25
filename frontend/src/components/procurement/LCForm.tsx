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
import type { LCRecord, PurchaseOrder, POLineItem, TTRemittance } from '@/types/procurement';
import type { Bank, Company, Product } from '@/types/masters';

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

// 소수점 포함 천단위 포맷
function fmtDecimal(v: string): string {
  const parts = v.replace(/[^0-9.]/g, '').split('.');
  const intPart = parts[0] ? parseInt(parts[0], 10).toLocaleString('ko-KR') : '';
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
}

export default function LCForm({ open, onOpenChange, onSubmit, editData, defaultPoId, embedded = false }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allLcs, setAllLcs] = useState<LCRecord[]>([]);
  const [poLines, setPoLines] = useState<POLineItem[]>([]);
  const [poTts, setPoTts] = useState<TTRemittance[]>([]);
  const [poLcs, setPoLcs] = useState<LCRecord[]>([]);
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
    if (!watchedPoId) { setPoLines([]); setPoTts([]); setPoLcs([]); return; }
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

  // F11: target_qty → target_mw(용량) + amount_usd 자동 계산
  // 다중 라인 PO 대응: 가중평균 단가(USD/module), 가중평균 spec_wp 사용
  const watchedQty = watch('target_qty');
  useEffect(() => {
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
  }, [watchedQty, poLines, products, setValue]);

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
    if (data.target_qty === '' || data.target_qty === undefined) delete payload.target_qty;
    if (data.target_mw === '' || data.target_mw === undefined) delete payload.target_mw;
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
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
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
                onChange={(e) => {
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
                onChange={(e) => {
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
              onChange={(e) => {
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
            <Select value={watch('status') ?? ''} onValueChange={(v) => setValue('status', v ?? '')}><SelectTrigger className="w-full"><Txt text={{ pending: '대기', opened: '개설', docs_received: '서류접수', settled: '결제완료' }[watch('status') ?? ''] || ''} /></SelectTrigger>
              <SelectContent><SelectItem value="pending">대기</SelectItem><SelectItem value="opened">개설</SelectItem><SelectItem value="docs_received">서류접수</SelectItem><SelectItem value="settled">결제완료</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>메모</Label><Textarea {...register('memo')} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button></DialogFooter>
        </form>
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
