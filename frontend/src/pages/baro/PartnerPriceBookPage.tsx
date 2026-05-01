import { useEffect, useMemo, useState, useCallback } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import DataTable, { type Column } from '@/components/common/DataTable';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { fetchWithAuth } from '@/lib/api';
import type { PartnerPrice } from '@/types/baro';
import type { Partner, Product, Manufacturer } from '@/types/masters';

// OrderForm과 동일한 패턴 — react-hook-form + zod
const priceSchema = z.object({
  partner_id: z.string().min(1, '거래처는 필수입니다'),
  product_id: z.string().min(1, '품번은 필수입니다'),
  unit_price_wp: z.coerce.number().positive('단가는 양수여야 합니다'),
  discount_pct: z.coerce.number().min(0, '0 이상').max(100, '100 이하').default(0),
  effective_from: z.string().min(1, '시작일은 필수입니다'),
  effective_to: z.string().optional(),
  memo: z.string().optional(),
});

type PriceFormData = z.infer<typeof priceSchema>;

// BARO Phase 1 — 거래처별 단가표 페이지
// 비유: "거래처×품번 → 단가" 한 줄로 잠금 → 수주 입력 시 자동 prefill
export default function PartnerPriceBookPage() {
  const [prices, setPrices] = useState<PartnerPrice[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [filterPartnerId, setFilterPartnerId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PartnerPrice | null>(null);
  const [submitError, setSubmitError] = useState<string>('');

  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<PriceFormData>({
    resolver: zodResolver(priceSchema) as unknown as Resolver<PriceFormData>,
    defaultValues: {
      partner_id: '',
      product_id: '',
      unit_price_wp: 0,
      discount_pct: 0,
      effective_from: today,
      effective_to: '',
      memo: '',
    },
  });
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = form;
  const watchedPartnerId = watch('partner_id');
  const watchedProductId = watch('product_id');
  const watchedFrom = watch('effective_from');
  const watchedTo = watch('effective_to');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, partnerList, productList, manufacturerList] = await Promise.all([
        fetchWithAuth<PartnerPrice[]>(
          `/api/v1/partner-prices${filterPartnerId ? `?partner_id=${filterPartnerId}` : ''}`,
        ),
        fetchWithAuth<Partner[]>('/api/v1/partners'),
        fetchWithAuth<Product[]>('/api/v1/products'),
        fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers'),
      ]);
      setPrices(pr);
      setPartners(partnerList);
      setProducts(productList);
      setManufacturers(manufacturerList);
    } catch (e) {
      console.error('[거래처 단가표 로드 실패]', e);
    } finally {
      setLoading(false);
    }
  }, [filterPartnerId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const partnerNameById = useMemo(() => {
    const m = new Map<string, string>();
    partners.forEach((p) => m.set(p.partner_id, p.partner_name));
    return m;
  }, [partners]);

  const productInfoById = useMemo(() => {
    const mfgById = new Map<string, Manufacturer>();
    manufacturers.forEach((m) => mfgById.set(m.manufacturer_id, m));
    const m = new Map<string, { code: string; name: string; mfg: string }>();
    products.forEach((p) => {
      const mfg = mfgById.get(p.manufacturer_id);
      const mfgLabel = mfg ? (mfg.short_name || mfg.name_kr) : '';
      m.set(p.product_id, { code: p.product_code, name: p.product_name, mfg: mfgLabel });
    });
    return m;
  }, [products, manufacturers]);

  const customerOnlyPartners = useMemo(
    () => partners.filter((p) => p.partner_type === 'customer' || p.partner_type === 'both'),
    [partners],
  );

  const columns: Column<PartnerPrice>[] = [
    {
      key: 'partner_id',
      label: '거래처',
      sortable: true,
      render: (row) => <span>{partnerNameById.get(row.partner_id) ?? row.partner_id.slice(0, 8)}</span>,
    },
    {
      key: 'product_id',
      label: '품번',
      sortable: true,
      render: (row) => {
        const info = productInfoById.get(row.product_id);
        return info ? (
          <span className="flex flex-col">
            <span className="font-medium">{info.code}</span>
            <span className="text-xs text-muted-foreground truncate">{info.mfg} · {info.name}</span>
          </span>
        ) : <span>{row.product_id.slice(0, 8)}</span>;
      },
    },
    {
      key: 'unit_price_wp',
      label: '단가(원/Wp)',
      sortable: true,
      render: (row) => <span className="tabular-nums">{row.unit_price_wp.toFixed(3)}</span>,
    },
    {
      key: 'discount_pct',
      label: '할인율(%)',
      render: (row) => <span className="tabular-nums">{row.discount_pct.toFixed(1)}</span>,
    },
    {
      key: 'effective_from',
      label: '시작일',
      sortable: true,
      render: (row) => <span>{row.effective_from}</span>,
    },
    {
      key: 'effective_to',
      label: '종료일',
      render: (row) => <span className="text-muted-foreground">{row.effective_to ?? '무기한'}</span>,
    },
  ];

  const resetForm = () => {
    reset({
      partner_id: '',
      product_id: '',
      unit_price_wp: 0,
      discount_pct: 0,
      effective_from: today,
      effective_to: '',
      memo: '',
    });
    setSubmitError('');
  };

  const onSubmit = async (data: PriceFormData) => {
    setSubmitError('');
    try {
      await fetchWithAuth<PartnerPrice>('/api/v1/partner-prices', {
        method: 'POST',
        body: JSON.stringify({
          partner_id: data.partner_id,
          product_id: data.product_id,
          unit_price_wp: data.unit_price_wp,
          discount_pct: data.discount_pct,
          effective_from: data.effective_from,
          effective_to: data.effective_to || null,
          memo: data.memo || null,
        }),
      });
      setFormOpen(false);
      resetForm();
      await loadAll();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '등록 실패');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetchWithAuth<{ status: string }>(`/api/v1/partner-prices/${deleteTarget.price_id}`, {
        method: 'DELETE',
      });
      setDeleteTarget(null);
      await loadAll();
    } catch (e) {
      console.error('[단가 삭제 실패]', e);
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">거래처 단가표</h1>
          <span className="text-xs text-muted-foreground">
            BARO 전용 — 거래처×품번 표준단가가 등록되면 수주 입력 시 자동으로 채워집니다.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterPartnerId || '__all__'} onValueChange={(v) => setFilterPartnerId((v ?? '__all__') === '__all__' ? '' : (v as string))}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <span className="flex-1 text-left truncate">
                {filterPartnerId ? (partnerNameById.get(filterPartnerId) ?? '필터') : '전체 거래처'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 거래처</SelectItem>
              {customerOnlyPartners.map((p) => (
                <SelectItem key={p.partner_id} value={p.partner_id}>
                  {p.partner_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="xs" onClick={() => { resetForm(); setFormOpen(true); }}>
            <Plus className="mr-1 h-3 w-3" />단가 등록
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border bg-card">
        <DataTable
          data={prices}
          columns={columns}
          loading={loading}
          actions={(row) => (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteTarget(row)}
              aria-label={`삭제 ${partnerNameById.get(row.partner_id) ?? ''}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          emptyMessage="등록된 거래처 단가가 없습니다. 우상단 등록 버튼으로 추가하세요."
        />
      </div>

      <Dialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>거래처 단가 등록</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3">
            <div>
              <Label className="text-xs">거래처</Label>
              <PartnerCombobox
                partners={customerOnlyPartners}
                value={watchedPartnerId}
                onChange={(v) => setValue('partner_id', v, { shouldValidate: true, shouldDirty: true })}
                placeholder="거래처 선택"
                error={!!errors.partner_id}
              />
              {errors.partner_id && <p className="text-xs text-destructive">{errors.partner_id.message}</p>}
            </div>
            <div>
              <Label className="text-xs">품번</Label>
              <Select
                value={watchedProductId}
                onValueChange={(v) => setValue('product_id', (v as string | null) ?? '', { shouldValidate: true, shouldDirty: true })}
              >
                <SelectTrigger className="h-9 w-full text-sm" aria-invalid={!!errors.product_id}>
                  <span className="flex-1 text-left truncate">
                    {watchedProductId
                      ? (productInfoById.get(watchedProductId)?.code ?? '선택')
                      : '품번 선택'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {products.filter((p) => p.is_active).map((p) => {
                    const info = productInfoById.get(p.product_id);
                    return (
                      <SelectItem key={p.product_id} value={p.product_id}>
                        {info ? `${info.code} (${info.mfg})` : p.product_code}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">단가 (원/Wp)</Label>
                <Input type="number" step="0.001" min="0" {...register('unit_price_wp', { valueAsNumber: true })} aria-invalid={!!errors.unit_price_wp} />
                {errors.unit_price_wp && <p className="text-xs text-destructive">{errors.unit_price_wp.message}</p>}
              </div>
              <div>
                <Label className="text-xs">할인율 (%)</Label>
                <Input type="number" step="0.1" min="0" max="100" {...register('discount_pct', { valueAsNumber: true })} aria-invalid={!!errors.discount_pct} />
                {errors.discount_pct && <p className="text-xs text-destructive">{errors.discount_pct.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">시작일</Label>
                <DateInput
                  value={watchedFrom}
                  onChange={(v) => setValue('effective_from', v, { shouldDirty: true, shouldValidate: true })}
                />
                {errors.effective_from && <p className="text-xs text-destructive">{errors.effective_from.message}</p>}
              </div>
              <div>
                <Label className="text-xs">종료일 (선택)</Label>
                <DateInput
                  value={watchedTo ?? ''}
                  onChange={(v) => setValue('effective_to', v, { shouldDirty: true })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">메모 (선택)</Label>
              <Input {...register('memo')} placeholder="예: 분기 특가" />
            </div>
            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
            <DialogFooter className="mt-1">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>취소</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '저장 중...' : '저장'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="거래처 단가 삭제"
        description={
          deleteTarget
            ? `${partnerNameById.get(deleteTarget.partner_id) ?? ''} / ${productInfoById.get(deleteTarget.product_id)?.code ?? ''} 단가를 삭제할까요?`
            : ''
        }
        confirmLabel="삭제"
        onConfirm={handleDelete}
      />
    </div>
  );
}
