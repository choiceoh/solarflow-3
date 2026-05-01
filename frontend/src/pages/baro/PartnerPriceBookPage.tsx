import { useEffect, useMemo, useState, useCallback } from 'react';
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
import type { PartnerPrice, CreatePartnerPriceRequest } from '@/types/baro';
import type { Partner, Product, Manufacturer } from '@/types/masters';

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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');

  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<CreatePartnerPriceRequest>({
    partner_id: '',
    product_id: '',
    unit_price_wp: 0,
    discount_pct: 0,
    effective_from: today,
    effective_to: null,
    memo: null,
  });

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

  const resetDraft = () => {
    setDraft({
      partner_id: '',
      product_id: '',
      unit_price_wp: 0,
      discount_pct: 0,
      effective_from: today,
      effective_to: null,
      memo: null,
    });
    setSubmitError('');
  };

  const handleSubmit = async () => {
    setSubmitError('');
    if (!draft.partner_id) { setSubmitError('거래처를 선택해주세요'); return; }
    if (!draft.product_id) { setSubmitError('품번을 선택해주세요'); return; }
    if (!(draft.unit_price_wp > 0)) { setSubmitError('단가는 양수여야 합니다'); return; }
    setSubmitting(true);
    try {
      await fetchWithAuth<PartnerPrice>('/api/v1/partner-prices', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      setFormOpen(false);
      resetDraft();
      await loadAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '등록 실패';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
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
          <Button size="sm" variant="outline" onClick={() => { resetDraft(); setFormOpen(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> 단가 등록
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

      <Dialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) resetDraft(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>거래처 단가 등록</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">거래처</Label>
              <PartnerCombobox
                partners={customerOnlyPartners}
                value={draft.partner_id}
                onChange={(v) => setDraft((d) => ({ ...d, partner_id: v }))}
                placeholder="거래처 선택"
              />
            </div>
            <div>
              <Label className="text-xs">품번</Label>
              <Select
                value={draft.product_id}
                onValueChange={(v) => setDraft((d) => ({ ...d, product_id: (v as string | null) ?? '' }))}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <span className="flex-1 text-left truncate">
                    {draft.product_id
                      ? (productInfoById.get(draft.product_id)?.code ?? '선택')
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">단가 (원/Wp)</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={draft.unit_price_wp || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, unit_price_wp: Number(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">할인율 (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={draft.discount_pct || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, discount_pct: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">시작일</Label>
                <DateInput
                  value={draft.effective_from}
                  onChange={(v) => setDraft((d) => ({ ...d, effective_from: v }))}
                />
              </div>
              <div>
                <Label className="text-xs">종료일 (선택)</Label>
                <DateInput
                  value={draft.effective_to ?? ''}
                  onChange={(v) => setDraft((d) => ({ ...d, effective_to: v || null }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">메모 (선택)</Label>
              <Input
                value={draft.memo ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value || null }))}
                placeholder="예: 분기 특가"
              />
            </div>
            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
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
