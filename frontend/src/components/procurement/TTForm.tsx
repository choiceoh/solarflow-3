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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { formatUSD, shortMfgName, poMfgSpecLabel, poLineSummary } from '@/lib/utils';
import type { TTRemittance, PurchaseOrder, POLineItem } from '@/types/procurement';
import type { Product } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  po_id: z.string().min(1, 'PO는 필수입니다'),
  remit_date: z.string().optional(),
  amount_usd: z.coerce.number().positive('양수만 가능합니다'),
  amount_krw: z.coerce.number().optional().or(z.literal('')),
  exchange_rate: z.coerce.number().optional().or(z.literal('')),
  purpose: z.string().optional(),
  status: z.string().min(1, '상태는 필수입니다'),
  bank_name: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: Record<string, unknown>) => Promise<void>; editData?: TTRemittance | null; defaultPoId?: string; }

// 소수점 포함 천단위 포맷
function fmtDecimal(v: string): string {
  const parts = v.replace(/[^0-9.]/g, '').split('.');
  const intPart = parts[0] ? parseInt(parts[0], 10).toLocaleString('ko-KR') : '';
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
}

export default function TTForm({ open, onOpenChange, onSubmit, editData, defaultPoId }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [poLines, setPoLines] = useState<POLineItem[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [amountUsdDisplay, setAmountUsdDisplay] = useState('');
  const [amountKrwDisplay, setAmountKrwDisplay] = useState('');
  const [exchangeRateDisplay, setExchangeRateDisplay] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  useEffect(() => {
    // completed PO는 T/T 신규 등록 불가 — 변경계약 등록 후 원계약 보호
    if (selectedCompanyId) fetchWithAuth<PurchaseOrder[]>(`/api/v1/pos?company_id=${selectedCompanyId}`).then((list) => setPos(list.filter((p) => p.status !== 'completed'))).catch(() => {});
    fetchWithAuth<Product[]>('/api/v1/products').then(setProducts).catch(() => {});
  }, [selectedCompanyId]);

  // PO 선택 시 라인 정보 로드
  const watchedPoId = watch('po_id');
  useEffect(() => {
    if (!watchedPoId) { setPoLines([]); return; }
    fetchWithAuth<POLineItem[]>(`/api/v1/pos/${watchedPoId}/lines`).then(setPoLines).catch(() => setPoLines([]));
  }, [watchedPoId]);

  // F5: PO 선택 시 계약금 % 파싱 → amount_usd/purpose 자동 프리필 (신규 등록만)
  useEffect(() => {
    if (editData || !watchedPoId || !open) return;
    (async () => {
      try {
        const po = await fetchWithAuth<PurchaseOrder & { payment_terms?: string }>(`/api/v1/pos/${watchedPoId}`);
        const totalUsd = poLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
        // "T/T 5%" 또는 "계약금 10%" 패턴 파싱
        const pt = po.payment_terms ?? '';
        const m = pt.match(/(?:T\/T|계약금)\s*(\d+(?:\.\d+)?)\s*%/);
        if (m && totalUsd > 0) {
          const pct = parseFloat(m[1]);
          const amount = Number((totalUsd * pct / 100).toFixed(2));
          setValue('amount_usd', amount, { shouldDirty: true });
          setAmountUsdDisplay(fmtDecimal(amount.toString()));
          setValue('purpose', `계약금 ${pct}%`, { shouldDirty: true });
        }
      } catch { /* skip */ }
    })();
  }, [watchedPoId, editData, open, poLines, setValue]);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
        reset({ po_id: editData.po_id, remit_date: editData.remit_date?.slice(0, 10) ?? '', amount_usd: editData.amount_usd, amount_krw: editData.amount_krw ?? '', exchange_rate: editData.exchange_rate ?? '', purpose: editData.purpose ?? '', status: editData.status, bank_name: editData.bank_name ?? '', memo: editData.memo ?? '' });
        setAmountUsdDisplay(fmtDecimal(editData.amount_usd?.toString() ?? ''));
        setAmountKrwDisplay(editData.amount_krw ? Math.round(editData.amount_krw).toLocaleString('ko-KR') : '');
        setExchangeRateDisplay(editData.exchange_rate ? Number(editData.exchange_rate).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
      } else {
        reset({ po_id: defaultPoId ?? '', remit_date: '', amount_usd: '' as unknown as number, amount_krw: '', exchange_rate: '', purpose: '', status: 'planned', bank_name: '', memo: '' });
        setAmountUsdDisplay('');
        setAmountKrwDisplay('');
        setExchangeRateDisplay('');
      }
    }
  }, [open, editData, reset, defaultPoId]);

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = { ...data };
    if (data.amount_krw === '' || data.amount_krw === undefined) delete payload.amount_krw;
    if (data.exchange_rate === '' || data.exchange_rate === undefined) delete payload.exchange_rate;
    if (!data.remit_date) delete payload.remit_date;
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
        <DialogHeader><DialogTitle>{editData ? 'TT 수정' : 'TT 등록'}</DialogTitle></DialogHeader>
        {submitError && <div className="sf-banner neg"><span className="sf-banner-body">{submitError}</span></div>}
        <form onSubmit={handleSubmit(handle)} className="sf-form">
          <div className="sf-form-field">
            <Label>PO *</Label>
            {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
            <Select value={watch('po_id') ?? ''} onValueChange={(v) => setValue('po_id', v ?? '')}><SelectTrigger className="w-full"><Txt text={(() => { const p = pos.find((x) => x.po_id === watch('po_id')); if (!p) return ''; const mw = (p.total_mw ?? 0).toFixed(1); const co = p.company_name ? `${p.company_name} | ` : ''; return `${co}${shortMfgName(p.manufacturer_name)} | ${p.po_number || p.po_id.slice(0, 8)} | ${mw}MW`; })()} /></SelectTrigger>
              <SelectContent>{pos.map((p) => { const mw = (p.total_mw ?? 0).toFixed(1); const co = p.company_name ? `${p.company_name} | ` : ''; return <SelectItem key={p.po_id} value={p.po_id}>{`${co}${shortMfgName(p.manufacturer_name)} | ${p.po_number || p.po_id.slice(0, 8)} | ${mw}MW`}</SelectItem>; })}</SelectContent>
            </Select>{errors.po_id && <span className="sf-field-error">{errors.po_id.message}</span>}
          </div>
          {/* PO 선택 시 제조사/품명/품번/총금액 정보 박스 — 공통 라벨 사용 (LCForm과 통일) */}
          {watchedPoId && (() => {
            const po = pos.find((x) => x.po_id === watchedPoId);
            const summary = poLineSummary(poLines, products); // 유상 라인 기준
            const paidLines = poLines.filter((l) => l.payment_type == null || l.payment_type === 'paid');
            const poTotalUsd = paidLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
            return (
              <div className="rounded-md border p-3 bg-muted/30 text-xs grid grid-cols-4 gap-2">
                <div><div className="text-muted-foreground">제조사/규격</div><div className="font-medium">{poMfgSpecLabel(po?.manufacturer_name, poLines, products)}</div></div>
                <div><div className="text-muted-foreground">품명</div><div className="font-medium truncate">{summary.productName}</div></div>
                <div><div className="text-muted-foreground">품번</div><div className="font-medium truncate">{summary.productCodeWithCount}</div></div>
                <div><div className="text-muted-foreground">PO총액</div><div className="font-mono font-semibold">{formatUSD(poTotalUsd)}</div></div>
              </div>
            );
          })()}
          <div className="sf-form-row cols-2">
            <div className="sf-form-field"><Label>송금일</Label><DateInput value={watch('remit_date') ?? ''} onChange={(v) => setValue('remit_date', v, { shouldDirty: true })} /></div>
            <div className="sf-form-field">
              <Label>금액(USD) *</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={amountUsdDisplay}
                className="text-right font-mono"
                placeholder="0.00"
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
                  const parts = raw.split('.');
                  const clamped = parts.length > 1 ? parts[0] + '.' + parts[1].slice(0, 2) : raw;
                  const [intStr, decStr] = clamped.split('.');
                  const intFormatted = intStr ? Number(intStr).toLocaleString('ko-KR') : '';
                  const display = decStr !== undefined ? intFormatted + '.' + decStr : intFormatted;
                  setAmountUsdDisplay(display);
                  const num = parseFloat(clamped);
                  setValue('amount_usd', (isNaN(num) ? '' : num) as unknown as number, { shouldDirty: true });
                  // USD 변경 시 환율 있으면 원화 자동 계산
                  const rateVal = watch('exchange_rate');
                  if (!isNaN(num) && rateVal && !isNaN(Number(rateVal))) {
                    const krw = Math.round(num * Number(rateVal));
                    setAmountKrwDisplay(krw.toLocaleString('ko-KR'));
                    setValue('amount_krw', krw as unknown as number, { shouldDirty: true });
                  }
                }}
                onFocus={() => setAmountUsdDisplay(amountUsdDisplay.replace(/,/g, ''))}
                onBlur={() => {
                  const num = parseFloat(amountUsdDisplay.replace(/,/g, ''));
                  if (!isNaN(num) && num > 0) {
                    setAmountUsdDisplay(num.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                    setValue('amount_usd', num as unknown as number, { shouldDirty: true });
                  }
                }}
              />
              {errors.amount_usd && <span className="sf-field-error">{errors.amount_usd.message}</span>}
            </div>
          </div>
          {/* 환율 + 원화: 환율 입력 → 원화 자동 계산 */}
          <div className="sf-form-row cols-2">
            <div className="sf-form-field">
              <div className="flex items-center justify-between">
                <Label>환율 <span className="text-[10px] text-muted-foreground font-normal">(원/USD)</span></Label>
                {/* 최근 환율 힌트 */}
                <span className="text-[10px] text-muted-foreground">예: 1,380.50</span>
              </div>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={exchangeRateDisplay}
                className="text-right font-mono"
                onChange={(e) => {
                  // 천단위 콤마 + 소수점 2자리까지
                  const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
                  const parts = raw.split('.');
                  const clamped = parts.length > 1 ? parts[0] + '.' + parts[1].slice(0, 2) : raw;
                  const [intStr, decStr] = clamped.split('.');
                  const intFormatted = intStr ? Number(intStr).toLocaleString('ko-KR') : '';
                  const display = decStr !== undefined ? intFormatted + '.' + decStr : intFormatted;
                  setExchangeRateDisplay(display);
                  const rateNum = clamped ? parseFloat(clamped) : undefined;
                  setValue('exchange_rate', (rateNum ?? '') as unknown as number, { shouldDirty: true });
                  // 환율 입력 시 원화 자동 계산
                  const usdVal = watch('amount_usd');
                  if (rateNum && usdVal && !isNaN(Number(usdVal))) {
                    const krw = Math.round(Number(usdVal) * rateNum);
                    setAmountKrwDisplay(krw.toLocaleString('ko-KR'));
                    setValue('amount_krw', krw as unknown as number, { shouldDirty: true });
                  }
                }}
                onFocus={() => setExchangeRateDisplay(exchangeRateDisplay.replace(/,/g, ''))}
                onBlur={() => {
                  const rateNum = parseFloat(exchangeRateDisplay.replace(/,/g, ''));
                  if (!isNaN(rateNum) && rateNum > 0) {
                    setExchangeRateDisplay(rateNum.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                    setValue('exchange_rate', rateNum as unknown as number, { shouldDirty: true });
                  }
                }}
              />
            </div>
            <div className="sf-form-field">
              <div className="flex items-center justify-between">
                <Label>원화(KRW)</Label>
                {watch('exchange_rate') && watch('amount_usd') && (
                  <span className="text-[10px] text-blue-500">환율 자동 계산</span>
                )}
              </div>
              <Input
                type="text"
                inputMode="numeric"
                value={amountKrwDisplay}
                className="text-right font-mono"
                placeholder="자동 계산 또는 직접 입력"
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  const num = raw ? parseInt(raw, 10) : undefined;
                  setAmountKrwDisplay(num !== undefined ? num.toLocaleString('ko-KR') : '');
                  setValue('amount_krw', (num ?? '') as unknown as number, { shouldDirty: true });
                }}
              />
            </div>
          </div>
          <div className="sf-form-field"><Label>목적</Label><Input {...register('purpose')} placeholder="계약금1차" /></div>
          <div className="sf-form-row cols-2">
            <div className="sf-form-field">
              <Label>상태 *</Label>
              <Select value={watch('status') ?? ''} onValueChange={(v) => setValue('status', v ?? '')}><SelectTrigger className="w-full"><Txt text={{ planned: '예정', completed: '완료' }[watch('status') ?? ''] || ''} /></SelectTrigger>
                <SelectContent><SelectItem value="planned">예정</SelectItem><SelectItem value="completed">완료</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="sf-form-field"><Label>은행</Label><Input {...register('bank_name')} /></div>
          </div>
          <div className="sf-form-field"><Label>메모</Label><Textarea {...register('memo')} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
