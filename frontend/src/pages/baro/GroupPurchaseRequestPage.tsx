import { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, PackagePlus, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import DataTable, { type Column } from '@/components/common/DataTable';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import type {
  IntercompanyRequest,
  IntercompanyStatus,
  CreateIntercompanyRequestPayload,
} from '@/types/intercompany';
import { INTERCOMPANY_STATUS_LABEL } from '@/types/intercompany';
import type { Product, Manufacturer } from '@/types/masters';

const statusVariant: Record<IntercompanyStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  shipped: 'default',
  received: 'outline',
  rejected: 'destructive',
  cancelled: 'destructive',
};

// BARO Phase 2 — 그룹내 매입 요청 (BARO 측)
// 비유: 바로(주)가 탑솔라에 "이 모듈 N장 받고 싶다"는 메모를 적어 보내고, 진행 상황을 추적
export default function GroupPurchaseRequestPage() {
  const companies = useAppStore((s) => s.companies);
  const loadCompanies = useAppStore((s) => s.loadCompanies);
  const baroCompany = useMemo(() => companies.find((c) => c.company_code === 'BR'), [companies]);
  const topsolarCompany = useMemo(() => companies.find((c) => c.company_code === 'TS'), [companies]);

  const [rows, setRows] = useState<IntercompanyRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [statusFilter, setStatusFilter] = useState<IntercompanyStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const initialDraft = (): CreateIntercompanyRequestPayload => ({
    requester_company_id: '',
    target_company_id: '',
    product_id: '',
    quantity: 0,
    desired_arrival_date: null,
    note: null,
  });
  const [draft, setDraft] = useState<CreateIntercompanyRequestPayload>(initialDraft);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  // 마스터(products/manufacturers)는 1회만 로드 — 매번 다시 받지 않음
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [productList, manufacturerList] = await Promise.all([
          fetchWithAuth<Product[]>('/api/v1/products'),
          fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers'),
        ]);
        if (!cancelled) {
          setProducts(productList);
          setManufacturers(manufacturerList);
        }
      } catch (e) {
        console.error('[마스터 로드 실패]', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 매입 요청 목록은 baroCompany / statusFilter 변경 시에만 재조회
  const load = useCallback(async () => {
    if (!baroCompany) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ requester_company_id: baroCompany.company_id });
      if (statusFilter) params.set('status', statusFilter);
      const list = await fetchWithAuth<IntercompanyRequest[]>(
        `/api/v1/intercompany-requests/mine?${params.toString()}`,
      );
      setRows(list);
    } catch (e) {
      console.error('[그룹내 매입 요청 로드 실패]', e);
    } finally {
      setLoading(false);
    }
  }, [baroCompany, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const productInfoById = useMemo(() => {
    const mfgMap = new Map<string, Manufacturer>();
    manufacturers.forEach((m) => mfgMap.set(m.manufacturer_id, m));
    const m = new Map<string, { code: string; name: string; mfg: string }>();
    products.forEach((p) => {
      const mfg = mfgMap.get(p.manufacturer_id);
      m.set(p.product_id, {
        code: p.product_code,
        name: p.product_name,
        mfg: mfg ? (mfg.short_name || mfg.name_kr) : '',
      });
    });
    return m;
  }, [products, manufacturers]);

  const openForm = () => {
    setDraft({
      requester_company_id: baroCompany?.company_id ?? '',
      target_company_id: topsolarCompany?.company_id ?? '',
      product_id: '',
      quantity: 0,
      desired_arrival_date: today,
      note: null,
    });
    setSubmitError('');
    setFormOpen(true);
  };

  const submit = async () => {
    setSubmitError('');
    if (!draft.requester_company_id || !draft.target_company_id) {
      setSubmitError('법인 정보를 확인해주세요');
      return;
    }
    if (!draft.product_id) { setSubmitError('품번을 선택해주세요'); return; }
    if (!(draft.quantity > 0)) { setSubmitError('수량은 양수여야 합니다'); return; }
    setSubmitting(true);
    try {
      await fetchWithAuth<IntercompanyRequest>('/api/v1/intercompany-requests', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      setFormOpen(false);
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRow = async (row: IntercompanyRequest) => {
    if (!window.confirm('이 매입 요청을 취소하시겠습니까?')) return;
    try {
      await fetchWithAuth(`/api/v1/intercompany-requests/${row.request_id}/cancel`, { method: 'PATCH' });
      await load();
    } catch (e) {
      console.error('[취소 실패]', e);
    }
  };

  const receiveRow = async (row: IntercompanyRequest) => {
    if (!window.confirm('이 매입 요청의 입고를 확인하시겠습니까?')) return;
    try {
      await fetchWithAuth(`/api/v1/intercompany-requests/${row.request_id}/receive`, { method: 'PATCH' });
      await load();
    } catch (e) {
      console.error('[입고 확인 실패]', e);
    }
  };

  const columns: Column<IntercompanyRequest>[] = [
    {
      key: 'created_at',
      label: '등록',
      sortable: true,
      render: (row) => <span className="tabular-nums text-xs">{(row.created_at ?? '').slice(0, 10)}</span>,
    },
    {
      key: 'product_id',
      label: '품번',
      render: (row) => {
        const info = productInfoById.get(row.product_id);
        return info ? (
          <span className="flex flex-col">
            <span className="font-medium">{info.code}</span>
            <span className="text-xs text-muted-foreground">{info.mfg} · {info.name}</span>
          </span>
        ) : <span>{row.product_id.slice(0, 8)}</span>;
      },
    },
    {
      key: 'quantity',
      label: '수량',
      render: (row) => <span className="tabular-nums">{row.quantity.toLocaleString()}장</span>,
    },
    {
      key: 'desired_arrival_date',
      label: '희망 입고일',
      render: (row) => <span className="text-xs">{row.desired_arrival_date ?? '—'}</span>,
    },
    {
      key: 'status',
      label: '상태',
      sortable: true,
      render: (row) => (
        <Badge variant={statusVariant[row.status]} className="text-[11px]">
          {INTERCOMPANY_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    {
      key: 'note',
      label: '메모',
      render: (row) => <span className="text-xs text-muted-foreground truncate">{row.note ?? '—'}</span>,
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">그룹내 매입 요청</h1>
          <span className="text-xs text-muted-foreground">
            BARO 전용 — 탑솔라(주)로부터 받을 모듈을 등록하면 탑솔라 측이 출고 처리합니다.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter || '__all__'}
            onValueChange={(v) => setStatusFilter(((v ?? '__all__') === '__all__' ? '' : (v as IntercompanyStatus)))}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <span className="flex-1 text-left truncate">
                {statusFilter ? INTERCOMPANY_STATUS_LABEL[statusFilter] : '전체 상태'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 상태</SelectItem>
              {(Object.keys(INTERCOMPANY_STATUS_LABEL) as IntercompanyStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{INTERCOMPANY_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openForm}>
            <Plus className="mr-1 h-3.5 w-3.5" /> 매입 요청
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border bg-card">
        <DataTable
          data={rows}
          columns={columns}
          loading={loading}
          actions={(row) => {
            if (row.status === 'pending') {
              return (
                <Button size="sm" variant="ghost" onClick={() => cancelRow(row)} title="요청 취소">
                  <X className="h-3.5 w-3.5" /> 취소
                </Button>
              );
            }
            if (row.status === 'shipped') {
              return (
                <Button size="sm" variant="outline" onClick={() => receiveRow(row)} title="입고 확인">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> 입고확인
                </Button>
              );
            }
            return null;
          }}
          emptyMessage="등록된 매입 요청이 없습니다. 우상단 등록 버튼으로 시작하세요."
        />
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>그룹내 매입 요청</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <div>요청자: <strong>{baroCompany?.company_name ?? '바로(주)'}</strong></div>
              <div>대상: <strong>{topsolarCompany?.company_name ?? '탑솔라(주)'}</strong></div>
            </div>
            <div>
              <Label className="text-xs">품번</Label>
              <Select
                value={draft.product_id}
                onValueChange={(v) => setDraft((d) => ({ ...d, product_id: (v as string | null) ?? '' }))}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <span className="flex-1 text-left truncate">
                    {draft.product_id ? (productInfoById.get(draft.product_id)?.code ?? '선택') : '품번 선택'}
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
                <Label className="text-xs">수량 (장)</Label>
                <Input
                  type="number"
                  min="1"
                  value={draft.quantity || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, quantity: Number(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">희망 입고일</Label>
                <DateInput
                  value={draft.desired_arrival_date ?? ''}
                  onChange={(v) => setDraft((d) => ({ ...d, desired_arrival_date: v || null }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">메모 (선택)</Label>
              <Textarea
                rows={2}
                value={draft.note ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value || null }))}
                placeholder="예: 분기 마감 전 도착 필요"
              />
            </div>
            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>취소</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? '저장 중...' : '요청 등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
