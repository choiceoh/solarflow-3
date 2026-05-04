// 관리자 로그 — 운영 데이터(P/O·L/C·B/L·수주·출고 등) 변경 감사 기록 (admin 전용)
import { useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { usePermission } from '@/hooks/usePermission';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface AuditLog {
  audit_id: string;
  entity_type: string;
  entity_id: string;
  action: 'create' | 'update' | 'delete' | string;
  user_id?: string;
  user_email?: string;
  request_method?: string;
  request_path?: string;
  old_data?: unknown;
  new_data?: unknown;
  note?: string;
  created_at: string;
}

interface EntityOption {
  value: string;
  label: string;
}

// backend/internal/handler/sys_audit_log.go의 allowedAuditEntityTypes와 정합 유지
const ENTITY_OPTIONS: EntityOption[] = [
  { value: 'all', label: '전체 대상' },
  { value: 'purchase_orders', label: 'P/O 발주' },
  { value: 'lcs', label: 'L/C' },
  { value: 'bls', label: 'B/L' },
  { value: 'tts', label: 'T/T' },
  { value: 'price_histories', label: '단가 이력' },
  { value: 'orders', label: '수주' },
  { value: 'outbounds', label: '출고' },
  { value: 'sales', label: '판매' },
  { value: 'receipts', label: '수금' },
  { value: 'receipt_matches', label: '수금 매칭' },
  { value: 'declarations', label: '면장' },
  { value: 'cost_details', label: '원가 상세' },
  { value: 'expenses', label: '비용' },
  { value: 'partners', label: '거래처' },
  { value: 'banks', label: '은행' },
  { value: 'warehouses', label: '창고' },
  { value: 'manufacturers', label: '제조사' },
  { value: 'products', label: '제품' },
  { value: 'companies', label: '법인' },
  { value: 'intercompany_requests', label: '그룹 요청' },
];

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '전체 구분' },
  { value: 'create', label: '생성' },
  { value: 'update', label: '수정' },
  { value: 'delete', label: '삭제' },
];

const ACTION_BADGE: Record<string, { label: string; cls: string }> = {
  create: { label: '생성', cls: 'bg-emerald-100 text-emerald-700' },
  update: { label: '수정', cls: 'bg-blue-100 text-blue-700' },
  delete: { label: '삭제', cls: 'bg-red-100 text-red-700' },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function entityLabel(type: string): string {
  return ENTITY_OPTIONS.find((opt) => opt.value === type)?.label ?? type;
}

export default function AuditLogsPage() {
  const { manageUsers } = usePermission();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [entityType, setEntityType] = useState('all');
  const [action, setAction] = useState('all');
  const [from, setFrom] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (entityType !== 'all') params.set('entity_type', entityType);
    if (action !== 'all') params.set('action', action);
    if (from) params.set('from', from);
    params.set('limit', '500');
    return params.toString();
  }, [entityType, action, from]);

  useEffect(() => {
    if (!manageUsers) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchWithAuth<AuditLog[]>(`/api/v1/audit-logs?${queryString}`)
      .then((data) => {
        if (cancelled) return;
        setLogs(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '감사 로그 조회에 실패했습니다');
        setLogs([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manageUsers, queryString]);

  if (!manageUsers) {
    return (
      <div className="sf-page">
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          시스템관리자만 이 페이지에 접근할 수 있습니다.
        </div>
      </div>
    );
  }

  function resetFilters() {
    setEntityType('all');
    setAction('all');
    setFrom('');
  }

  const isFiltered = entityType !== 'all' || action !== 'all' || from !== '';

  return (
    <div className="sf-page">
      <div className="sf-page-header">
        <div>
          <div className="sf-eyebrow">ADMIN AUDIT LOG</div>
          <h1 className="sf-page-title">관리자 로그</h1>
          <p className="sf-page-description">
            운영 데이터(P/O·L/C·B/L·수주·출고 등)에 대한 생성·수정·삭제 기록을 조회합니다.
            최근 500건까지 표시되며, 필터로 범위를 좁힐 수 있습니다.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-screen-2xl space-y-5">
        <div className="rounded-lg border bg-card p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>대상</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger>
                  <span className="truncate text-left text-sm" data-slot="select-value">
                    {entityLabel(entityType)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>구분</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <span className="truncate text-left text-sm" data-slot="select-value">
                    {ACTION_OPTIONS.find((opt) => opt.value === action)?.label ?? '전체 구분'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-from">시작일</Label>
              <Input
                id="audit-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={resetFilters}
                disabled={!isFiltered}
              >
                초기화
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-7 py-5 border-b bg-muted/30">
            <p className="text-xl font-semibold">감사 로그 ({logs.length.toLocaleString()}건)</p>
            {loading ? <span className="text-sm text-muted-foreground">불러오는 중…</span> : null}
          </div>
          {error ? (
            <div className="p-8 text-center text-sm text-destructive">{error}</div>
          ) : !loading && logs.length === 0 ? (
            <div className="p-8 text-center text-lg text-muted-foreground">조회 결과가 없습니다</div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => {
                const meta = ACTION_BADGE[log.action] ?? { label: log.action, cls: 'bg-gray-100 text-gray-600' };
                const isExpanded = expandedId === log.audit_id;
                const hasDetail = Boolean(log.old_data) || Boolean(log.new_data);
                return (
                  <div key={log.audit_id} className="px-7 py-5">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : log.audit_id)}
                      className="flex w-full items-start gap-4 text-left"
                      disabled={!hasDetail}
                      aria-expanded={isExpanded}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`shrink-0 rounded px-2.5 py-0.5 text-sm font-medium ${meta.cls}`}>
                            {meta.label}
                          </span>
                          <span className="text-base font-medium">{entityLabel(log.entity_type)}</span>
                          <span className="font-mono text-sm text-muted-foreground">{log.entity_id}</span>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          <span>{formatDateTime(log.created_at)}</span>
                          {log.user_email ? <span> · {log.user_email}</span> : null}
                          {log.request_method && log.request_path ? (
                            <span className="font-mono"> · {log.request_method} {log.request_path}</span>
                          ) : null}
                        </p>
                        {log.note ? <p className="mt-1 text-sm">{log.note}</p> : null}
                      </div>
                      {hasDetail ? (
                        <span className="shrink-0 text-sm text-muted-foreground">{isExpanded ? '닫기' : '상세'}</span>
                      ) : null}
                    </button>
                    {isExpanded && hasDetail ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {log.old_data ? (
                          <div className="rounded border bg-muted/30 p-4">
                            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">이전</p>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs font-mono">
                              {JSON.stringify(log.old_data, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                        {log.new_data ? (
                          <div className="rounded border bg-muted/30 p-4">
                            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">변경 후</p>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs font-mono">
                              {JSON.stringify(log.new_data, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
