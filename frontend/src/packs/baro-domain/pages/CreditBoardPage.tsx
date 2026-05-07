import { useEffect, useMemo, useState, useCallback } from 'react';
import { ShieldAlert, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import DataTable, { type Column } from '@/components/common/DataTable';
import { fetchWithAuth } from '@/lib/api';
import type { CreditBoardRow } from '@/types/baro-credit';
import type { Partner } from '@/types/masters';

function formatKrw(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('ko-KR');
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

// BARO Phase 3 — 거래처별 미수금/한도 보드
// 비유: "외상 장부 대시보드" — 거래처마다 매출 - 입금, 한도 사용률, 최장 미수일을 한 표에서
export default function CreditBoardPage() {
  const [rows, setRows] = useState<CreditBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<CreditBoardRow | null>(null);
  const [editDraft, setEditDraft] = useState<{ credit_limit_krw: string; credit_payment_days: string }>({
    credit_limit_krw: '',
    credit_payment_days: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchWithAuth<CreditBoardRow[]>('/api/v1/baro/credit-board');
      setRows(list);
    } catch (e) {
      console.error('[미수금/한도 보드 로드 실패]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const total = rows.reduce((acc, r) => acc + (r.outstanding_krw || 0), 0);
    const overLimit = rows.filter((r) => r.utilization_pct != null && r.utilization_pct >= 100).length;
    const aging60 = rows.filter((r) => r.oldest_unpaid_days != null && r.oldest_unpaid_days >= 60).length;
    return { total, overLimit, aging60 };
  }, [rows]);

  const openEdit = (row: CreditBoardRow) => {
    setEditTarget(row);
    setEditDraft({
      credit_limit_krw: row.credit_limit_krw != null ? String(row.credit_limit_krw) : '',
      credit_payment_days: row.credit_payment_days != null ? String(row.credit_payment_days) : '',
    });
    setSubmitError('');
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const body: Partial<Partner> & { credit_limit_krw?: number | null; credit_payment_days?: number | null } = {};
      body.credit_limit_krw = editDraft.credit_limit_krw === '' ? null : Number(editDraft.credit_limit_krw);
      body.credit_payment_days = editDraft.credit_payment_days === '' ? null : Number(editDraft.credit_payment_days);
      if (body.credit_limit_krw != null && Number.isNaN(body.credit_limit_krw)) {
        setSubmitError('한도는 숫자여야 합니다');
        setSubmitting(false);
        return;
      }
      if (body.credit_payment_days != null && Number.isNaN(body.credit_payment_days)) {
        setSubmitError('결제일수는 정수여야 합니다');
        setSubmitting(false);
        return;
      }
      await fetchWithAuth<Partner>(`/api/v1/partners/${editTarget.partner_id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setEditTarget(null);
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const utilizationVariant = (pct: number | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (pct == null) return 'outline';
    if (pct >= 100) return 'destructive';
    if (pct >= 80) return 'default';
    return 'secondary';
  };

  const agingVariant = (days: number | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (days == null) return 'outline';
    if (days >= 90) return 'destructive';
    if (days >= 60) return 'default';
    return 'secondary';
  };

  const columns: Column<CreditBoardRow>[] = [
    { key: 'partner_name', label: '거래처', sortable: true, render: (r) => <span className="font-medium">{r.partner_name}</span> },
    {
      key: 'outstanding_krw',
      label: '미수금(원)',
      sortable: true,
      render: (r) => <span className="tabular-nums">{formatKrw(r.outstanding_krw)}</span>,
    },
    {
      key: 'credit_limit_krw',
      label: '한도(원)',
      render: (r) => <span className="tabular-nums">{formatKrw(r.credit_limit_krw)}</span>,
    },
    {
      key: 'remaining_krw',
      label: '잔여(원)',
      render: (r) => <span className="tabular-nums">{formatKrw(r.remaining_krw)}</span>,
    },
    {
      key: 'utilization_pct',
      label: '사용률',
      sortable: true,
      render: (r) => (
        <Badge variant={utilizationVariant(r.utilization_pct)} className="text-[11px] tabular-nums">
          {formatPct(r.utilization_pct)}
        </Badge>
      ),
    },
    {
      key: 'oldest_unpaid_days',
      label: '최장 미수일',
      sortable: true,
      render: (r) => (
        <Badge variant={agingVariant(r.oldest_unpaid_days)} className="text-[11px] tabular-nums">
          {r.oldest_unpaid_days != null ? `${r.oldest_unpaid_days}일` : '—'}
        </Badge>
      ),
    },
    {
      key: 'last_sale_date',
      label: '최근 매출',
      render: (r) => <span className="text-xs text-muted-foreground">{r.last_sale_date ?? '—'}</span>,
    },
    {
      key: 'last_receipt_date',
      label: '최근 입금',
      render: (r) => <span className="text-xs text-muted-foreground">{r.last_receipt_date ?? '—'}</span>,
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">미수금 / 한도 보드</h1>
          <span className="text-xs text-muted-foreground">
            BARO 전용 — 거래처별 매출 누적, 입금 누적, 한도 사용률, 가장 오래된 미수일을 집계합니다.
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> 새로 고침
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">총 미수금</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatKrw(summary.total)}원</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">한도 초과 거래처</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{summary.overLimit}곳</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">60일 이상 미수</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{summary.aging60}곳</div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border bg-card">
        <DataTable
          data={rows}
          columns={columns}
          loading={loading}
          actions={(row) => (
            <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> 한도
            </Button>
          )}
          defaultSort={{ key: 'outstanding_krw', direction: 'desc' }}
          emptyMessage="활성 고객 거래처가 없습니다."
        />
      </div>

      <Dialog open={!!editTarget} onOpenChange={(v) => { if (!v) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>한도 / 결제일수 설정</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="grid gap-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <div>거래처: <strong>{editTarget.partner_name}</strong></div>
                <div>현재 미수금: <strong className="tabular-nums">{formatKrw(editTarget.outstanding_krw)}원</strong></div>
              </div>
              <div>
                <Label className="text-xs">신용 한도 (원, 비우면 미설정)</Label>
                <Input
                  type="number"
                  min="0"
                  value={editDraft.credit_limit_krw}
                  onChange={(e) => setEditDraft((d) => ({ ...d, credit_limit_krw: e.target.value }))}
                  placeholder="예: 500000000"
                />
              </div>
              <div>
                <Label className="text-xs">결제일수 (매출일 기준, 비우면 미설정)</Label>
                <Input
                  type="number"
                  min="0"
                  value={editDraft.credit_payment_days}
                  onChange={(e) => setEditDraft((d) => ({ ...d, credit_payment_days: e.target.value }))}
                  placeholder="예: 60"
                />
              </div>
              {submitError && <p className="text-xs text-destructive">{submitError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>취소</Button>
            <Button onClick={submitEdit} disabled={submitting}>
              {submitting ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
