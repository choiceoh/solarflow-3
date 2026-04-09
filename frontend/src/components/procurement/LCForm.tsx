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
import { formatUSD } from '@/lib/utils';
import type { LCRecord, PurchaseOrder, POLineItem, TTRemittance } from '@/types/procurement';
import type { Bank, Company, Product } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
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
  settlement_date: z.string().optional(),
  repayment_date: z.string().optional(),
  repaid: z.boolean().optional(),
  status: z.string().min(1, '상태는 필수입니다'),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: Record<string, unknown>) => Promise<void>; editData?: LCRecord | null; }

export default function LCForm({ open, onOpenChange, onSubmit, editData }: Props) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  // 모든 법인 + PO 목록(전체) 로드 — D-094 다른 법인 LC 개설 허용
  useEffect(() => {
    fetchWithAuth<Company[]>('/api/v1/companies').then((list) => setCompanies(list.filter((c) => c.is_active))).catch(() => {});
    fetchWithAuth<Product[]>('/api/v1/products').then(setProducts).catch(() => {});
    fetchWithAuth<LCRecord[]>('/api/v1/lcs').then(setAllLcs).catch(() => {});
    fetchWithAuth<PurchaseOrder[]>('/api/v1/pos').then(setPos).catch(() => {});
  }, []);

  // 선택한 개설법인의 은행 목록
  const watchedCompanyId = watch('company_id');
  useEffect(() => {
    const cid = watchedCompanyId || selectedCompanyId;
    if (cid) {
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${cid}`).then((list) => setBanks(list.filter((b) => b.is_active))).catch(() => setBanks([]));
    }
  }, [watchedCompanyId, selectedCompanyId]);

  // PO 선택 시 PO 라인/TT/LC 로드 (4박스 자동표시용)
  const watchedPoId = watch('po_id');
  useEffect(() => {
    if (!watchedPoId) { setPoLines([]); setPoTts([]); setPoLcs([]); return; }
    fetchWithAuth<POLineItem[]>(`/api/v1/pos/${watchedPoId}/lines`).then(setPoLines).catch(() => setPoLines([]));
    fetchWithAuth<TTRemittance[]>(`/api/v1/tts?po_id=${watchedPoId}`).then(setPoTts).catch(() => setPoTts([]));
    fetchWithAuth<LCRecord[]>(`/api/v1/lcs?po_id=${watchedPoId}`).then(setPoLcs).catch(() => setPoLcs([]));
  }, [watchedPoId]);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
        reset({ lc_number: editData.lc_number ?? '', po_id: editData.po_id, company_id: editData.company_id, bank_id: editData.bank_id, open_date: editData.open_date?.slice(0, 10) ?? '', amount_usd: editData.amount_usd, target_qty: editData.target_qty ?? '', target_mw: editData.target_mw ?? '', usance_days: editData.usance_days ?? '', usance_type: editData.usance_type ?? '', maturity_date: editData.maturity_date?.slice(0, 10) ?? '', settlement_date: editData.settlement_date?.slice(0, 10) ?? '', repayment_date: editData.repayment_date?.slice(0, 10) ?? '', repaid: editData.repaid ?? false, status: editData.status, memo: editData.memo ?? '' });
      } else {
        reset({ lc_number: '', po_id: '', company_id: selectedCompanyId ?? '', bank_id: '', open_date: '', amount_usd: '' as unknown as number, target_qty: '', target_mw: '', usance_days: 90, usance_type: 'buyers', maturity_date: '', settlement_date: '', repayment_date: '', repaid: false, status: 'pending', memo: '' });
      }
    }
  }, [open, editData, reset, selectedCompanyId]);

  // F11: target_qty → target_mw(용량) + amount_usd 자동 계산
  const watchedQty = watch('target_qty');
  useEffect(() => {
    if (watchedQty === '' || watchedQty == null) return;
    const qty = Number(watchedQty);
    if (!qty || isNaN(qty) || poLines.length === 0) return;
    const firstLine = poLines[0];
    const product = products.find((p) => p.product_id === firstLine?.product_id);
    // 용량(MW) = qty × spec_wp / 1_000_000
    const specWp = product?.spec_wp ?? firstLine?.spec_wp ?? 0;
    if (specWp) {
      const mw = (qty * specWp) / 1_000_000;
      setValue('target_mw', Number(mw.toFixed(4)), { shouldDirty: true });
    }
    // LC 개설금액 = qty × unit_price_usd
    const unit = firstLine?.unit_price_usd ?? 0;
    if (unit) {
      setValue('amount_usd', Number((qty * unit).toFixed(2)), { shouldDirty: true });
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

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = { ...data };
    if (data.target_qty === '' || data.target_qty === undefined) delete payload.target_qty;
    if (data.target_mw === '' || data.target_mw === undefined) delete payload.target_mw;
    if (data.usance_days === '' || data.usance_days === undefined) delete payload.usance_days;
    if (!data.open_date) delete payload.open_date;
    if (!data.maturity_date) delete payload.maturity_date;
    if (!data.settlement_date) delete payload.settlement_date;
    if (!data.repayment_date) delete payload.repayment_date;
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editData ? 'LC 수정' : 'LC 등록'}</DialogTitle></DialogHeader>
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>LC번호</Label><Input {...register('lc_number')} /></div>
            <div className="space-y-1.5">
              <Label>PO *</Label>
              <div className="flex gap-2">
                <Select value={watch('po_id') ?? ''} onValueChange={(v) => setValue('po_id', v ?? '')}><SelectTrigger className="w-full"><Txt text={(() => { const p = pos.find((x) => x.po_id === watch('po_id')); if (!p) return ''; const mw = (p.total_mw ?? 0).toFixed(1); const m = p.contract_date ? p.contract_date.slice(0, 7) : ''; return `${p.po_number || p.po_id.slice(0, 8)} | ${p.manufacturer_name ?? '—'} | ${mw}MW${m ? ` | ${m}` : ''}`; })()} /></SelectTrigger>
                  <SelectContent>{pos.map((p) => { const mw = (p.total_mw ?? 0).toFixed(1); const m = p.contract_date ? p.contract_date.slice(0, 7) : ''; return <SelectItem key={p.po_id} value={p.po_id}>{`${p.po_number || p.po_id.slice(0, 8)} | ${p.manufacturer_name ?? '—'} | ${mw}MW${m ? ` | ${m}` : ''}`}</SelectItem>; })}</SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={async () => {
                  // F9: 상세 팝업 열 때 라인 정보 프리페치
                  setPoPickerOpen(true);
                  const missing = pos.filter((p) => !poPickerLines[p.po_id]);
                  const results = await Promise.all(missing.map(async (p) => {
                    try { return [p.po_id, await fetchWithAuth<POLineItem[]>(`/api/v1/pos/${p.po_id}/lines`)] as const; }
                    catch { return [p.po_id, []] as const; }
                  }));
                  setPoPickerLines((prev) => ({ ...prev, ...Object.fromEntries(results) }));
                }}>상세</Button>
              </div>
              {errors.po_id && <p className="text-xs text-destructive">{errors.po_id.message}</p>}
            </div>
          </div>
          {/* PO 연결 현황 — 제조사/품명/규격/잔량MW + 결제 요약 (F10) */}
          {watchedPoId && (() => {
            const po = pos.find((x) => x.po_id === watchedPoId);
            const firstLine = poLines[0];
            const firstProd = products.find((p) => p.product_id === firstLine?.product_id);
            const poTotalUsd = poLines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
            const ttPaid = poTts.reduce((s, t) => s + (t.amount_usd ?? 0), 0);
            const lcOpened = poLcs.filter((l) => !editData || l.lc_id !== editData.lc_id).reduce((s, l) => s + (l.amount_usd ?? 0), 0);
            const remain = Math.max(0, poTotalUsd - lcOpened);
            const poTotalMw = po?.total_mw ?? 0;
            const lcOpenedMw = poLcs.filter((l) => !editData || l.lc_id !== editData.lc_id).reduce((s, l) => s + (l.target_mw ?? 0), 0);
            const remainMw = Math.max(0, poTotalMw - lcOpenedMw);
            return (
              <div className="rounded-md border p-3 bg-muted/30 text-xs space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <div><div className="text-muted-foreground">제조사</div><div className="font-medium">{po?.manufacturer_name ?? '—'}</div></div>
                  <div><div className="text-muted-foreground">품명</div><div className="font-medium truncate">{firstProd?.product_name ?? firstLine?.product_name ?? '—'}</div></div>
                  <div><div className="text-muted-foreground">규격</div><div className="font-medium truncate">{firstProd?.product_code ?? firstLine?.product_code ?? '—'}{poLines.length > 1 ? ` 외 ${poLines.length - 1}건` : ''}</div></div>
                  <div><div className="text-muted-foreground">발주 잔량</div><div className="font-mono font-semibold">{remainMw.toFixed(2)} MW</div></div>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-2 border-t">
                  <div><div className="text-muted-foreground">PO 계약총액</div><div className="font-mono">{formatUSD(poTotalUsd)}</div></div>
                  <div><div className="text-muted-foreground">계약금 기납부</div><div className="font-mono">{formatUSD(ttPaid)}</div></div>
                  <div><div className="text-muted-foreground">LC 기개설</div><div className="font-mono">{formatUSD(lcOpened)}</div></div>
                  <div><div className="text-muted-foreground">미개설 잔액</div><div className="font-mono font-semibold">{formatUSD(remain)}</div></div>
                </div>
              </div>
            );
          })()}
          {/* 개설법인 — D-094: PO법인과 다를 수 있음 */}
          <div className="space-y-1.5">
            <Label>개설법인 *</Label>
            <Select value={watch('company_id') ?? ''} onValueChange={(v) => { setValue('company_id', v ?? ''); setValue('bank_id', ''); }}><SelectTrigger className="w-full"><Txt text={(() => {
              const c = companies.find((x) => x.company_id === watch('company_id'));
              return c ? c.company_name : '';
            })()} /></SelectTrigger>
              <SelectContent>{companies.map((c) => {
                // 가용한도 = 해당 법인의 모든 은행 lc_limit 합 - 해당 법인 LC 개설(편집중 제외) 잔액 (TODO: Rust 계산엔진 연동)
                // banks state는 현재 선택한 법인 것이라 모든 법인 한도는 모름 → 표시는 "법인명만"으로 폴백
                const lcSum = allLcs.filter((l) => l.company_id === c.company_id && (!editData || l.lc_id !== editData.lc_id) && l.status !== 'settled' && !l.repaid).reduce((s, l) => s + (l.amount_usd ?? 0), 0);
                return <SelectItem key={c.company_id} value={c.company_id}>{`${c.company_name} (개설잔액 ${formatUSD(lcSum)})`}</SelectItem>;
              })}</SelectContent>
            </Select>{errors.company_id && <p className="text-xs text-destructive">{errors.company_id.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>은행 *</Label>
            <Select value={watch('bank_id') ?? ''} onValueChange={(v) => setValue('bank_id', v ?? '')}><SelectTrigger className="w-full"><Txt text={(() => {
              const b = banks.find((x) => x.bank_id === watch('bank_id'));
              if (!b) return '';
              const usedSameBank = allLcs.filter((l) => l.bank_id === b.bank_id && (!editData || l.lc_id !== editData.lc_id) && l.status !== 'settled' && !l.repaid).reduce((s, l) => s + (l.amount_usd ?? 0), 0);
              const avail = Math.max(0, (b.lc_limit_usd ?? 0) - usedSameBank);
              return `${b.bank_name} (가용 ${formatUSD(avail)})`;
            })()} /></SelectTrigger>
              <SelectContent>{banks.map((b) => {
                const usedSameBank = allLcs.filter((l) => l.bank_id === b.bank_id && (!editData || l.lc_id !== editData.lc_id) && l.status !== 'settled' && !l.repaid).reduce((s, l) => s + (l.amount_usd ?? 0), 0);
                const avail = Math.max(0, (b.lc_limit_usd ?? 0) - usedSameBank);
                return <SelectItem key={b.bank_id} value={b.bank_id}>{`${b.bank_name} (가용 ${formatUSD(avail)})`}</SelectItem>;
              })}</SelectContent>
            </Select>{errors.bank_id && <p className="text-xs text-destructive">{errors.bank_id.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>개설일</Label><DateInput value={watch('open_date') ?? ''} onChange={(v) => setValue('open_date', v, { shouldDirty: true })} /></div>
            <div className="space-y-1.5"><Label>금액(USD) *</Label><Input type="number" step="0.01" {...register('amount_usd')} />{errors.amount_usd && <p className="text-xs text-destructive">{errors.amount_usd.message}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>수량(EA)</Label><Input type="number" {...register('target_qty')} /></div>
            <div className="space-y-1.5"><Label>용량(MW)</Label><Input type="number" step="0.0001" {...register('target_mw')} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
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
            <div className="space-y-1.5"><Label>결제예정일</Label><DateInput value={watch('settlement_date') ?? ''} onChange={(v) => setValue('settlement_date', v, { shouldDirty: true })} /></div>
          </div>
          {/* F13: 상환일 / 상환여부 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>상환일</Label><DateInput value={watch('repayment_date') ?? ''} onChange={(v) => { setValue('repayment_date', v, { shouldDirty: true }); if (v) setValue('repaid', true, { shouldDirty: true }); }} /></div>
            <div className="space-y-1.5 flex items-end">
              <label className="flex items-center gap-2 text-sm pb-2">
                <input type="checkbox" checked={!!watch('repaid')} onChange={(e) => setValue('repaid', e.target.checked, { shouldDirty: true })} />
                상환완료 (한도 계산에서 제외)
              </label>
            </div>
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
      </DialogContent>
      {/* F9: PO 상세 선택 팝업 */}
      <Dialog open={poPickerOpen} onOpenChange={setPoPickerOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>PO 상세 선택</DialogTitle></DialogHeader>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">PO번호</th>
                  <th className="text-left p-2">제조사</th>
                  <th className="text-left p-2">품명</th>
                  <th className="text-left p-2">규격</th>
                  <th className="text-right p-2">단가(¢/Wp)</th>
                  <th className="text-right p-2">총금액(USD)</th>
                  <th className="text-right p-2">MW</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => {
                  const plines = poPickerLines[p.po_id] ?? [];
                  const first = plines[0];
                  const total = plines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
                  return (
                    <tr key={p.po_id} className="border-t hover:bg-accent/30 cursor-pointer" onClick={() => { setValue('po_id', p.po_id, { shouldDirty: true }); setPoPickerOpen(false); }}>
                      <td className="p-2 font-mono">{p.po_number || p.po_id.slice(0, 8)}</td>
                      <td className="p-2">{p.manufacturer_name ?? '—'}</td>
                      <td className="p-2 truncate max-w-[200px]">{first?.products?.product_name ?? first?.product_name ?? '—'}{plines.length > 1 ? ` 외 ${plines.length - 1}건` : ''}</td>
                      <td className="p-2 truncate max-w-[180px]">{first?.products?.product_code ?? first?.product_code ?? '—'}</td>
                      <td className="p-2 text-right font-mono">{first?.unit_price_usd != null ? (first.unit_price_usd * 100).toFixed(2) : '—'}</td>
                      <td className="p-2 text-right font-mono">{formatUSD(total)}</td>
                      <td className="p-2 text-right font-mono">{(p.total_mw ?? 0).toFixed(2)}</td>
                      <td className="p-2"><Button type="button" size="sm" variant="outline">선택</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
