import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Plus, RefreshCw, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';

// CycleCountPage — D-142 WMS Phase 4 정기 재고실사 (Cycle Counting).
//
// 비유: "분기 재고실사 일지". 위치 단위 실측 → 시스템 재고 vs 실재고 차이 추적
// → 정확도 자동 집계.
//
// 사용 시나리오:
//   - admin: 분기/월 시작 시 세션 생성 (warehouse_id, scheduled_date)
//   - 시스템: PR8.7b 가 inventory_allocations 스냅샷 → cycle_count_items 자동 생성
//   - 작업자: 라인별 counted_qty 입력 → 차이 발생 시 사유 + 사진
//   - 종료: POST /complete 로 정확도 % 자동 집계 → 영업/회계 보고

interface Warehouse {
  warehouse_id: string;
  name: string;
}

interface CycleCount {
  cycle_count_id: string;
  warehouse_id: string;
  scheduled_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  started_at?: string | null;
  completed_at?: string | null;
  total_locations?: number | null;
  matched_locations?: number | null;
  variance_locations?: number | null;
  accuracy_pct?: number | null;
  notes?: string | null;
}

interface CycleCountItem {
  item_id: string;
  cycle_count_id: string;
  location_code_snapshot?: string | null;
  product_code_snapshot?: string | null;
  product_name_snapshot?: string | null;
  expected_qty: number;
  counted_qty?: number | null;
  variance_qty: number;
  variance_reason?: string | null;
  variance_note?: string | null;
}

interface CycleCountDetail {
  cycle_count: CycleCount;
  items: CycleCountItem[];
}

const STATUS_LABEL: Record<CycleCount['status'], string> = {
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
  cancelled: '취소',
};

const STATUS_TONE: Record<CycleCount['status'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  in_progress: 'default',
  completed: 'outline',
  cancelled: 'destructive',
};

const REASONS = [
  { value: 'shrinkage', label: '도난/유실' },
  { value: 'damage', label: '파손' },
  { value: 'wrong_location', label: '위치 오류' },
  { value: 'system_error', label: '시스템 오류' },
  { value: 'other', label: '기타' },
] as const;

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  REASONS.map((r) => [r.value, r.label]),
);

export default function CycleCountPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [list, setList] = useState<CycleCount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CycleCountDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState<CycleCount['status'] | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const loadWarehouses = useCallback(async () => {
    try {
      const ws = await fetchWithAuth<Warehouse[]>('/api/v1/warehouses');
      setWarehouses(ws ?? []);
    } catch (e) {
      console.error('[창고 로드 실패]', e);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const rows = await fetchWithAuth<CycleCount[]>(
        `/api/v1/cycle-counts/${params.toString() ? `?${params.toString()}` : ''}`,
      );
      setList(rows ?? []);
    } catch (e) {
      console.error('[cycle count 목록 실패]', e);
      setError(e instanceof Error ? e.message : '로드 실패');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await fetchWithAuth<CycleCountDetail>(`/api/v1/cycle-counts/${id}`);
      setDetail(d);
    } catch (e) {
      console.error('[cycle count 상세 실패]', e);
      setDetail(null);
    }
  }, []);

  useEffect(() => { void loadWarehouses(); }, [loadWarehouses]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const handleCreate = async () => {
    if (!newWarehouse) { setSaveMsg('창고를 선택하세요'); return; }
    if (!newDate) { setSaveMsg('실사 예정일이 필요합니다'); return; }
    setSaving(true);
    setSaveMsg('');
    try {
      const body: Record<string, unknown> = {
        warehouse_id: newWarehouse,
        scheduled_date: newDate,
      };
      if (newNotes.trim()) body.notes = newNotes.trim();
      await fetchWithAuth('/api/v1/cycle-counts/', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSaveMsg('세션 생성 완료 — PR8.7b 미배포 환경은 라인을 수동으로 채워야 합니다.');
      setShowForm(false);
      setNewWarehouse('');
      setNewNotes('');
      void load();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 5000);
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await fetchWithAuth(`/api/v1/cycle-counts/${id}/complete`, { method: 'POST' });
      void loadDetail(id);
      void load();
    } catch (e) {
      console.error('[종료 실패]', e);
    }
  };

  const handleItemUpdate = async (
    itemId: string,
    cycleCountId: string,
    countedQty: number,
    reason: string,
    note: string,
  ) => {
    try {
      const body: Record<string, unknown> = { counted_qty: countedQty };
      if (reason) body.variance_reason = reason;
      if (note) body.variance_note = note;
      await fetchWithAuth(`/api/v1/cycle-counts/${cycleCountId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      void loadDetail(cycleCountId);
    } catch (e) {
      console.error('[라인 수정 실패]', e);
    }
  };

  // 상세 화면
  if (selectedId && detail) {
    const session = detail.cycle_count;
    const counted = detail.items.filter((i) => i.counted_qty != null).length;
    return (
      <div className="flex h-full w-full flex-col gap-3 p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded border px-2 py-1 text-xs"
            >
              ← 목록
            </button>
            <h1 className="text-base font-semibold">{session.scheduled_date} 실사</h1>
            <Badge variant={STATUS_TONE[session.status]} className="text-[10px]">
              {STATUS_LABEL[session.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {counted}/{detail.items.length} 점검
            </span>
            {session.status === 'completed' && session.accuracy_pct != null && (
              <Badge variant={session.accuracy_pct >= 90 ? 'default' : 'destructive'} className="text-[10px]">
                정확도 {session.accuracy_pct.toFixed(1)}%
              </Badge>
            )}
          </div>
          {session.status === 'in_progress' && (
            <Button size="sm" onClick={() => void handleComplete(session.cycle_count_id)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              실사 종료 (정확도 집계)
            </Button>
          )}
          {session.status === 'pending' && (
            <Button size="sm" onClick={() => void fetchWithAuth(
              `/api/v1/cycle-counts/${session.cycle_count_id}`,
              { method: 'PATCH', body: JSON.stringify({ status: 'in_progress' }) },
            ).then(() => loadDetail(session.cycle_count_id))}>
              실사 시작
            </Button>
          )}
        </div>

        {session.notes && (
          <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {session.notes}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {detail.items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
              <span>라인이 없습니다.</span>
              <span>PR8.7b (자동 seed) 미배포 환경에서는 수동으로 라인을 추가해야 합니다.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {detail.items.map((it) => (
                <CycleLineCard
                  key={it.item_id}
                  item={it}
                  disabled={session.status !== 'in_progress'}
                  onSave={(qty, reason, note) => void handleItemUpdate(it.item_id, session.cycle_count_id, qty, reason, note)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 목록 화면
  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">정기 재고실사</h1>
          <span className="truncate text-xs text-muted-foreground">D-142 — 분기/월 cycle counting</span>
        </div>
        <div className="flex items-center gap-2">
          {(['', 'pending', 'in_progress', 'completed'] as const).map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => setStatusFilter(s as CycleCount['status'] | '')}
              data-active={statusFilter === s}
              className="rounded border px-2 py-0.5 text-[11px] data-[active=true]:border-primary data-[active=true]:bg-primary/10"
            >
              {s ? STATUS_LABEL[s] : '전체'}
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            새로 고침
          </Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            세션 생성
          </Button>
        </div>
      </div>

      {saveMsg && (
        <div className="rounded border bg-card px-3 py-1 text-xs text-muted-foreground">{saveMsg}</div>
      )}

      {showForm && (
        <section className="rounded-md border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">신규 실사 세션</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="text-[10px] text-muted-foreground">창고</label>
              <Select value={newWarehouse} onValueChange={setNewWarehouse}>
                <SelectTrigger className="h-8 text-xs">
                  <span>{warehouses.find((w) => w.warehouse_id === newWarehouse)?.name ?? '선택'}</span>
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.warehouse_id} value={w.warehouse_id} className="text-xs">
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">실사 예정일</label>
              <Input type="date" className="h-8 text-xs" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">메모</label>
              <Input className="h-8 text-xs" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} disabled={saving}>취소</Button>
            <Button size="sm" onClick={() => void handleCreate()} disabled={saving}>
              {saving ? '생성 중...' : '생성'}
            </Button>
          </div>
        </section>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">불러오는 중...</div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>{error}</span>
            <span>마이그 088(cycle_counts) 미적용일 수 있습니다.</span>
          </div>
        ) : list.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            실사 세션이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((row) => (
              <button
                key={row.cycle_count_id}
                type="button"
                onClick={() => setSelectedId(row.cycle_count_id)}
                className="flex w-full items-center justify-between rounded-md border bg-card p-3 text-left hover:border-primary"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-semibold">{row.scheduled_date}</span>
                    <Badge variant={STATUS_TONE[row.status]} className="text-[10px]">
                      {STATUS_LABEL[row.status]}
                    </Badge>
                    {row.accuracy_pct != null && (
                      <Badge variant={row.accuracy_pct >= 90 ? 'default' : 'destructive'} className="text-[10px]">
                        {row.accuracy_pct.toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {warehouses.find((w) => w.warehouse_id === row.warehouse_id)?.name ?? row.warehouse_id.slice(0, 8)}
                    {row.total_locations != null ? ` · 라인 ${row.total_locations}건` : ''}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface LineCardProps {
  item: CycleCountItem;
  disabled: boolean;
  onSave: (qty: number, reason: string, note: string) => void;
}

function CycleLineCard({ item, disabled, onSave }: LineCardProps) {
  const [qty, setQty] = useState(item.counted_qty != null ? String(item.counted_qty) : '');
  const [reason, setReason] = useState(item.variance_reason ?? '');
  const [note, setNote] = useState(item.variance_note ?? '');

  const variance = item.counted_qty != null ? item.counted_qty - item.expected_qty : null;
  const counted = item.counted_qty != null;

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase text-muted-foreground">위치</span>
          <span className="text-base font-bold tabular-nums">
            {item.location_code_snapshot ?? '미지정'}
          </span>
        </div>
        <div className="flex flex-1 flex-col text-xs">
          <span className="font-medium">
            {item.product_name_snapshot ?? item.product_code_snapshot ?? '품번 미지정'}
          </span>
          <span className="text-[10px] text-muted-foreground">{item.product_code_snapshot}</span>
          <div className="mt-1 flex items-center gap-3 text-xs">
            <span>예상 <strong className="tabular-nums">{item.expected_qty.toLocaleString('ko-KR')}</strong>장</span>
            {counted && (
              <span>
                실측 <strong className="tabular-nums">{item.counted_qty?.toLocaleString('ko-KR')}</strong>장
              </span>
            )}
            {variance != null && variance !== 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {variance > 0 ? `+${variance}` : variance}
              </Badge>
            )}
          </div>
        </div>
      </div>
      {!disabled && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border bg-muted/30 p-2">
          <Input
            type="number"
            placeholder="실측"
            className="h-7 w-20 text-xs"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <span>{REASON_LABEL[reason] ?? '사유 선택'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="text-xs">사유 없음</SelectItem>
              {REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-7 flex-1 text-xs"
            placeholder="메모"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            className="h-7"
            onClick={() => {
              const n = Number(qty);
              if (Number.isFinite(n)) onSave(n, reason, note);
            }}
          >
            저장
          </Button>
        </div>
      )}
      {item.variance_reason && (
        <div className="mt-1 text-[10px] text-amber-600">
          ⚠ {REASON_LABEL[item.variance_reason] ?? item.variance_reason}
          {item.variance_note ? ` · ${item.variance_note}` : ''}
        </div>
      )}
    </div>
  );
}
