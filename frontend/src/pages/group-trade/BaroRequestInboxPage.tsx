import { useEffect, useMemo, useState, useCallback } from 'react';
import { Inbox, X, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import DataTable, { type Column } from '@/components/common/DataTable';
import { fetchWithAuth } from '@/lib/api';
import { confirmDialog } from '@/lib/dialogs';
import { useAppStore } from '@/stores/appStore';
import type { IntercompanyRequest, IntercompanyStatus } from '@/types/intercompany';
import { INTERCOMPANY_STATUS_LABEL } from '@/types/intercompany';
import type { Outbound } from '@/types/outbound';

const statusVariant: Record<IntercompanyStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  shipped: 'default',
  received: 'outline',
  rejected: 'destructive',
  cancelled: 'destructive',
};

// 탑솔라 측 — 바로(주)가 보낸 그룹내 매입 요청을 받아 처리
// 비유: "바로 발주 메모함" — 들어온 요청을 거부 또는 group_trade 출고와 연결
export default function BaroRequestInboxPage() {
  const companies = useAppStore((s) => s.companies);
  const loadCompanies = useAppStore((s) => s.loadCompanies);
  const topsolarCompany = useMemo(() => companies.find((c) => c.company_code === 'TS'), [companies]);

  const [rows, setRows] = useState<IntercompanyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<IntercompanyStatus | ''>('pending');
  const [fulfillTarget, setFulfillTarget] = useState<IntercompanyRequest | null>(null);
  const [outbounds, setOutbounds] = useState<Outbound[]>([]);
  const [selectedOutboundId, setSelectedOutboundId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const load = useCallback(async () => {
    if (!topsolarCompany) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ target_company_id: topsolarCompany.company_id });
      if (statusFilter) params.set('status', statusFilter);
      const list = await fetchWithAuth<IntercompanyRequest[]>(
        `/api/v1/intercompany-requests/inbox?${params.toString()}`,
      );
      setRows(list);
    } catch (e) {
      console.error('[BARO 요청 inbox 로드 실패]', e);
    } finally {
      setLoading(false);
    }
  }, [topsolarCompany, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const reject = async (row: IntercompanyRequest) => {
    const ok = await confirmDialog({
      description: `이 매입 요청을 거부하시겠습니까?\n\n품번: ${row.product_code ?? row.product_id.slice(0, 8)}\n수량: ${row.quantity}장`,
      variant: 'destructive',
      confirmLabel: '거부',
    });
    if (!ok) return;
    try {
      await fetchWithAuth(`/api/v1/intercompany-requests/${row.request_id}/reject`, { method: 'PATCH' });
      await load();
    } catch (e) {
      console.error('[거부 실패]', e);
    }
  };

  const openFulfill = async (row: IntercompanyRequest) => {
    setFulfillTarget(row);
    setSelectedOutboundId('');
    setSubmitError('');
    if (!topsolarCompany) return;
    try {
      const params = new URLSearchParams({ company_id: topsolarCompany.company_id });
      const list = await fetchWithAuth<Outbound[]>(`/api/v1/outbounds?${params.toString()}`);
      // group_trade 출고만, 같은 product_id, target_company_id=requester(BARO)
      const candidates = list.filter((o) =>
        o.group_trade === true &&
        o.product_id === row.product_id &&
        o.target_company_id === row.requester_company_id,
      );
      setOutbounds(candidates);
    } catch (e) {
      console.error('[출고 후보 조회 실패]', e);
    }
  };

  const submitFulfill = async () => {
    if (!fulfillTarget) return;
    if (!selectedOutboundId) { setSubmitError('연결할 출고를 선택해주세요'); return; }
    setSubmitting(true);
    try {
      await fetchWithAuth(`/api/v1/intercompany-requests/${fulfillTarget.request_id}/fulfill`, {
        method: 'PATCH',
        body: JSON.stringify({ outbound_id: selectedOutboundId }),
      });
      setFulfillTarget(null);
      setSelectedOutboundId('');
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setSubmitting(false);
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
      key: 'requester_company_name',
      label: '요청 법인',
      render: (row) => <span>{row.requester_company_name ?? row.requester_company_id.slice(0, 8)}</span>,
    },
    {
      key: 'product_id',
      label: '품번',
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.product_code ?? row.product_id.slice(0, 8)}</span>
          {row.product_name && <span className="text-xs text-muted-foreground">{row.product_name}</span>}
        </span>
      ),
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
          <Inbox className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">그룹 요청</h1>
          <span className="text-xs text-muted-foreground">
            바로(주)가 보낸 매입 요청을 group_trade 출고와 연결하거나 거부합니다.
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
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => openFulfill(row)} title="출고 연결">
                    <Truck className="mr-1 h-3.5 w-3.5" /> 출고연결
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => reject(row)} title="거부">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            }
            return null;
          }}
          emptyMessage="처리 대기 중인 요청이 없습니다."
        />
      </div>

      <Dialog open={!!fulfillTarget} onOpenChange={(v) => { if (!v) setFulfillTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>출고와 연결</DialogTitle>
          </DialogHeader>
          {fulfillTarget && (
            <div className="grid gap-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <div>요청: <strong>{fulfillTarget.requester_company_name}</strong></div>
                <div>품번: <strong>{fulfillTarget.product_code ?? fulfillTarget.product_id.slice(0, 8)}</strong></div>
                <div>수량: <strong>{fulfillTarget.quantity.toLocaleString()}장</strong></div>
              </div>
              <div>
                <Label className="text-xs">연결할 group_trade 출고</Label>
                {outbounds.length === 0 ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-50/40 p-3 text-xs">
                    매칭되는 group_trade 출고가 없습니다.
                    <br />출고 화면에서 같은 품번 / 대상=바로(주)의 그룹내거래 출고를 먼저 만들어주세요.
                  </div>
                ) : (
                  <Select
                    value={selectedOutboundId || '__none__'}
                    onValueChange={(v) => setSelectedOutboundId(((v ?? '__none__') === '__none__' ? '' : (v as string)))}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <span className="flex-1 text-left truncate">
                        {selectedOutboundId
                          ? outbounds.find((o) => o.outbound_id === selectedOutboundId)?.outbound_date
                          : '출고 선택'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">선택 안 함</SelectItem>
                      {outbounds.map((o) => (
                        <SelectItem key={o.outbound_id} value={o.outbound_id}>
                          {o.outbound_date} · {o.quantity.toLocaleString()}장
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Input type="hidden" />
              {submitError && <p className="text-xs text-destructive">{submitError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFulfillTarget(null)}>취소</Button>
            <Button onClick={submitFulfill} disabled={submitting || outbounds.length === 0 || !selectedOutboundId}>
              {submitting ? '연결 중...' : '연결'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
