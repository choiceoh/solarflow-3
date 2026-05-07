import { useCallback, useEffect, useState } from 'react';
import { Boxes, CheckCircle2, ChevronRight, ListChecks, Play, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchWithAuth } from '@/lib/api';

// PickingWorkPage — D-140 WMS Phase 2 피킹 작업 (모바일 친화 작업자 큐).
//
// 비유: "창고 작업 지시서". 출고 1건당 위치별 수량 명세를 작업자가 폰/태블릿에서
// 1줄씩 picked 토글 → picked_at 자동 기록 → 차이(quantity_picked) + 사유 기록.
//
// 사용 시나리오:
//   - 작업자: 본인 큐 (mineOnly=true) 진입 → in_progress 토글 → 라인 picked 체크
//   - 차이 발생 시 quantity_picked + variance_note 입력
//   - 모든 라인 picked 후 status='completed' 토글로 종료
//
// 큰 버튼 / 한 줄 한 라인 / 굵은 location_code 표시 — 작업자 모바일 UX.

interface PickingList {
  picking_list_id: string;
  outbound_id?: string | null;
  warehouse_id: string;
  partner_name_snapshot?: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  picker_user_id?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
}

interface PickingItem {
  item_id: string;
  picking_list_id: string;
  line_no: number;
  product_code_snapshot?: string | null;
  product_name_snapshot?: string | null;
  spec_wp_snapshot?: number | null;
  location_code_snapshot?: string | null;
  quantity_planned: number;
  quantity_picked: number;
  is_picked: boolean;
  picked_at?: string | null;
  variance_note?: string | null;
}

interface PickingDetail extends PickingList {
  items: PickingItem[];
}

const STATUS_LABEL: Record<PickingList['status'], string> = {
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
  cancelled: '취소',
};

const STATUS_TONE: Record<PickingList['status'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  in_progress: 'default',
  completed: 'outline',
  cancelled: 'destructive',
};

export default function PickingWorkPage() {
  const [list, setList] = useState<PickingList[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PickingDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PickingList['status'] | ''>('');
  const [mineOnly, setMineOnly] = useState(true);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (mineOnly) params.set('mine', 'true');
      const rows = await fetchWithAuth<PickingList[]>(
        `/api/v1/picking-lists/${params.toString() ? `?${params.toString()}` : ''}`,
      );
      setList(rows ?? []);
    } catch (e) {
      console.error('[picking 목록 실패]', e);
      setError(e instanceof Error ? e.message : '로드 실패');
      setList([]);
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter, mineOnly]);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const d = await fetchWithAuth<PickingDetail>(`/api/v1/picking-lists/${id}`);
      setDetail(d);
    } catch (e) {
      console.error('[picking 상세 실패]', e);
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const handleStatusToggle = async (id: string, next: PickingList['status']) => {
    try {
      await fetchWithAuth(`/api/v1/picking-lists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      void loadDetail(id);
      void loadList();
    } catch (e) {
      console.error('[상태 변경 실패]', e);
    }
  };

  const handleItemToggle = async (item: PickingItem, picked: boolean) => {
    try {
      await fetchWithAuth(`/api/v1/picking-lists/${item.picking_list_id}/items/${item.item_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_picked: picked,
          quantity_picked: picked ? item.quantity_planned : 0,
        }),
      });
      if (selectedId) void loadDetail(selectedId);
    } catch (e) {
      console.error('[picked 토글 실패]', e);
    }
  };

  const handleVarianceUpdate = async (item: PickingItem, qty: number, note: string) => {
    try {
      await fetchWithAuth(`/api/v1/picking-lists/${item.picking_list_id}/items/${item.item_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantity_picked: qty,
          is_picked: true,
          variance_note: note || null,
        }),
      });
      if (selectedId) void loadDetail(selectedId);
    } catch (e) {
      console.error('[차이 입력 실패]', e);
    }
  };

  // 상세 화면
  if (selectedId && detail) {
    const pickedCount = detail.items.filter((i) => i.is_picked).length;
    const totalCount = detail.items.length;
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
            <h1 className="text-base font-semibold">{detail.partner_name_snapshot ?? '피킹 명세'}</h1>
            <Badge variant={STATUS_TONE[detail.status]} className="text-[10px]">
              {STATUS_LABEL[detail.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {pickedCount}/{totalCount} 라인 완료
            </span>
          </div>
          <div className="flex gap-2">
            {detail.status === 'pending' && (
              <Button size="sm" onClick={() => void handleStatusToggle(detail.picking_list_id, 'in_progress')}>
                <Play className="mr-1 h-3.5 w-3.5" />
                작업 시작
              </Button>
            )}
            {detail.status === 'in_progress' && pickedCount === totalCount && totalCount > 0 && (
              <Button size="sm" onClick={() => void handleStatusToggle(detail.picking_list_id, 'completed')}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                작업 완료
              </Button>
            )}
          </div>
        </div>

        {detail.notes && (
          <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {detail.notes}
          </div>
        )}

        {/* 라인 — 모바일 친화 카드 */}
        <div className="flex-1 space-y-2 overflow-auto">
          {detail.items.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              라인이 없습니다
            </div>
          ) : (
            detail.items.map((it) => (
              <PickingLineCard
                key={it.item_id}
                item={it}
                disabled={detail.status !== 'in_progress'}
                onToggle={(picked) => void handleItemToggle(it, picked)}
                onVariance={(qty, note) => void handleVarianceUpdate(it, qty, note)}
              />
            ))
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
          <ListChecks className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">피킹 작업</h1>
          <span className="truncate text-xs text-muted-foreground">D-140 — 위치별 수량 명세 + picked 토글</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            data-active={mineOnly}
            className="rounded border px-2 py-0.5 text-[11px] data-[active=true]:border-primary data-[active=true]:bg-primary/10"
          >
            내 큐만
          </button>
          {(['', 'pending', 'in_progress', 'completed'] as const).map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => setStatusFilter(s as PickingList['status'] | '')}
              data-active={statusFilter === s}
              className="rounded border px-2 py-0.5 text-[11px] data-[active=true]:border-primary data-[active=true]:bg-primary/10"
            >
              {s ? STATUS_LABEL[s] : '전체'}
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={() => void loadList()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            새로 고침
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loadingList ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">불러오는 중...</div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>{error}</span>
            <span>마이그 086(picking_lists) 미적용일 수 있습니다.</span>
          </div>
        ) : list.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {mineOnly ? '본인 큐가 비어있습니다.' : '피킹 명세가 없습니다.'}
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((row) => (
              <button
                key={row.picking_list_id}
                type="button"
                onClick={() => setSelectedId(row.picking_list_id)}
                className="flex w-full items-center justify-between rounded-md border bg-card p-3 text-left hover:border-primary"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Boxes className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-semibold">
                      {row.partner_name_snapshot ?? '거래처 미지정'}
                    </span>
                    <Badge variant={STATUS_TONE[row.status]} className="text-[10px]">
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {row.outbound_id ? `출고 #${row.outbound_id.slice(0, 8)}` : '수동'} ·{' '}
                    {row.created_at ? new Date(row.created_at).toLocaleString('ko-KR') : ''}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
        {loadingDetail && (
          <div className="mt-2 text-xs text-muted-foreground">상세 불러오는 중...</div>
        )}
      </div>
    </div>
  );
}

interface LineCardProps {
  item: PickingItem;
  disabled: boolean;
  onToggle: (picked: boolean) => void;
  onVariance: (qty: number, note: string) => void;
}

function PickingLineCard({ item, disabled, onToggle, onVariance }: LineCardProps) {
  const [showVariance, setShowVariance] = useState(false);
  const [qty, setQty] = useState(String(item.quantity_picked || item.quantity_planned));
  const [note, setNote] = useState(item.variance_note ?? '');

  return (
    <div
      className="rounded-md border bg-card p-3"
      data-picked={item.is_picked}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase text-muted-foreground">위치</span>
          <span className="text-lg font-bold tabular-nums">
            {item.location_code_snapshot ?? '미지정'}
          </span>
        </div>
        <div className="flex flex-1 flex-col text-xs">
          <span className="font-medium">
            {item.product_name_snapshot ?? item.product_code_snapshot ?? '품번 미지정'}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {item.product_code_snapshot}
            {item.spec_wp_snapshot ? ` · ${item.spec_wp_snapshot}W` : ''}
          </span>
          <span className="mt-1 text-base font-semibold">
            {item.quantity_planned.toLocaleString('ko-KR')}장
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            size="sm"
            variant={item.is_picked ? 'default' : 'outline'}
            disabled={disabled}
            className="h-9 w-20"
            onClick={() => onToggle(!item.is_picked)}
          >
            {item.is_picked ? '✓ 완료' : '미완료'}
          </Button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowVariance((v) => !v)}
            className="text-[10px] text-muted-foreground underline disabled:opacity-50"
          >
            차이 입력
          </button>
        </div>
      </div>
      {showVariance && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border bg-muted/30 p-2">
          <span className="text-[10px] text-muted-foreground">실제 수량</span>
          <Input
            type="number"
            className="h-7 w-20 text-xs"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <Input
            className="h-7 flex-1 text-xs"
            placeholder="사유 (예: 위치 오류, 파손)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            className="h-7"
            onClick={() => {
              const n = Number(qty);
              if (Number.isFinite(n)) onVariance(n, note);
              setShowVariance(false);
            }}
          >
            저장
          </Button>
        </div>
      )}
      {item.variance_note && !showVariance && (
        <div className="mt-2 text-[10px] text-amber-600">⚠ {item.variance_note} (실제 {item.quantity_picked}장)</div>
      )}
    </div>
  );
}
