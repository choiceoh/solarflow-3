import { useEffect, useMemo, useState, useCallback } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Truck, Plus, Trash2, RefreshCw, Link as LinkIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DateInput } from '@/components/ui/date-input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import { confirmDialog } from '@/lib/dialogs';
import type {
  DispatchRoute,
  DispatchStatus,
} from '@/types/dispatch';
import { DISPATCH_STATUS_LABEL } from '@/types/dispatch';
import type { Outbound } from '@/types/outbound';

// react-hook-form + zod
const dispatchSchema = z.object({
  route_date: z.string().min(1, '배송일은 필수입니다'),
  vehicle_type: z.string().optional(),
  vehicle_plate: z.string().optional(),
  driver_name: z.string().optional(),
  driver_phone: z.string().optional(),
  memo: z.string().optional(),
});

type DispatchFormData = z.infer<typeof dispatchSchema>;

const statusVariant: Record<DispatchStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  planned: 'secondary',
  dispatched: 'default',
  completed: 'outline',
  cancelled: 'destructive',
};

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(yyyy_mm_dd: string, days: number): string {
  const d = new Date(yyyy_mm_dd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// BARO Phase 4 — 출고 배차/일정 보드
// 비유: "오늘의 배송 일정표" — 일자×차량 단위로 묶고, 그 묶음 아래 출고들을 드래그하듯 붙인다
export default function DispatchBoardPage() {
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [routeOutbounds, setRouteOutbounds] = useState<Record<string, Outbound[]>>({});
  const [unassigned, setUnassigned] = useState<Outbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>(addDays(todayStr(), -3));
  const [to, setTo] = useState<string>(addDays(todayStr(), 7));
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | ''>('');
  const [formOpen, setFormOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const form = useForm<DispatchFormData>({
    resolver: zodResolver(dispatchSchema) as unknown as Resolver<DispatchFormData>,
    defaultValues: {
      route_date: todayStr(),
      vehicle_type: '',
      vehicle_plate: '',
      driver_name: '',
      driver_phone: '',
      memo: '',
    },
  });
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = form;
  const watchedRouteDate = watch('route_date');
  const [assignTarget, setAssignTarget] = useState<DispatchRoute | null>(null);
  const [assignSelection, setAssignSelection] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (statusFilter) params.set('status', statusFilter);
      const list = await fetchWithAuth<DispatchRoute[]>(
        `/api/v1/baro/dispatch-routes${params.toString() ? `?${params.toString()}` : ''}`,
      );
      setRoutes(list);

      // 각 route별 출고 + 미배차 출고 별도로 가져오기
      const obByRoute: Record<string, Outbound[]> = {};
      await Promise.all(
        list.map(async (r) => {
          try {
            const obs = await fetchWithAuth<Outbound[]>(`/api/v1/baro/dispatch-routes/${r.route_id}/outbounds`);
            obByRoute[r.route_id] = obs;
          } catch {
            obByRoute[r.route_id] = [];
          }
        }),
      );
      setRouteOutbounds(obByRoute);

      // 미배차 출고 (전체 outbounds 중 dispatch_route_id IS NULL)
      try {
        const allOb = await fetchWithAuth<Outbound[]>(`/api/v1/outbounds?company_code=BR`);
        setUnassigned(allOb.filter((o) => !o.dispatch_route_id));
      } catch {
        setUnassigned([]);
      }
    } catch (e) {
      console.error('[배차 보드 로드 실패]', e);
    } finally {
      setLoading(false);
    }
  }, [from, to, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const totalAssigned = useMemo(
    () => Object.values(routeOutbounds).reduce((acc, arr) => acc + arr.length, 0),
    [routeOutbounds],
  );

  const onSubmit = async (data: DispatchFormData) => {
    setSubmitError('');
    try {
      await fetchWithAuth<DispatchRoute>('/api/v1/baro/dispatch-routes', {
        method: 'POST',
        body: JSON.stringify({
          route_date: data.route_date,
          vehicle_type: data.vehicle_type || null,
          vehicle_plate: data.vehicle_plate || null,
          driver_name: data.driver_name || null,
          driver_phone: data.driver_phone || null,
          memo: data.memo || null,
        }),
      });
      setFormOpen(false);
      reset({
        route_date: todayStr(),
        vehicle_type: '',
        vehicle_plate: '',
        driver_name: '',
        driver_phone: '',
        memo: '',
      });
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '저장 실패');
    }
  };

  const updateStatus = async (route: DispatchRoute, status: DispatchStatus) => {
    try {
      await fetchWithAuth(`/api/v1/baro/dispatch-routes/${route.route_id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      console.error('[배차 상태 변경 실패]', e);
    }
  };

  const deleteRoute = async (route: DispatchRoute) => {
    const ok = await confirmDialog({
      description: `${route.route_date} 배차를 삭제할까요? (출고는 유지되고 미배차로 돌아갑니다)`,
      variant: 'destructive',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    try {
      await fetchWithAuth(`/api/v1/baro/dispatch-routes/${route.route_id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error('[배차 삭제 실패]', e);
    }
  };

  const assign = async () => {
    if (!assignTarget || !assignSelection) return;
    try {
      await fetchWithAuth(`/api/v1/baro/dispatch-routes/${assignTarget.route_id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ outbound_id: assignSelection }),
      });
      setAssignTarget(null);
      setAssignSelection('');
      await load();
    } catch (e) {
      console.error('[출고 할당 실패]', e);
    }
  };

  const unassign = async (outboundId: string) => {
    try {
      await fetchWithAuth(`/api/v1/baro/dispatch-routes/unassign`, {
        method: 'POST',
        body: JSON.stringify({ outbound_id: outboundId }),
      });
      await load();
    } catch (e) {
      console.error('[출고 해제 실패]', e);
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">배차 / 일정 보드</h1>
          <span className="text-xs text-muted-foreground">
            BARO 전용 — 일자×차량 단위로 출고를 묶어 배송 일정을 관리합니다.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DateInput value={from} onChange={(v) => setFrom(v)} />
          <span className="text-muted-foreground">~</span>
          <DateInput value={to} onChange={(v) => setTo(v)} />
          <Select
            value={statusFilter || '__all__'}
            onValueChange={(v) => setStatusFilter(((v ?? '__all__') === '__all__' ? '' : (v as DispatchStatus)))}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <span className="flex-1 text-left truncate">
                {statusFilter ? DISPATCH_STATUS_LABEL[statusFilter] : '전체 상태'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 상태</SelectItem>
              {(Object.keys(DISPATCH_STATUS_LABEL) as DispatchStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{DISPATCH_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          </Button>
          <Button size="xs" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />배차 추가
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">배차 묶음</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{routes.length}건</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">할당 출고</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{totalAssigned}건</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">미배차 출고</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{unassigned.length}건</div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">불러오는 중...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 overflow-auto">
          {routes.map((route) => {
            const obs = routeOutbounds[route.route_id] ?? [];
            return (
              <div key={route.route_id} className="rounded-md border bg-card flex flex-col">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold tabular-nums">{route.route_date}</span>
                    <Badge variant={statusVariant[route.status]} className="text-[10px]">
                      {DISPATCH_STATUS_LABEL[route.status]}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {[route.vehicle_type, route.vehicle_plate].filter(Boolean).join(' · ') || '차량 미지정'}
                    </span>
                    {route.driver_name && (
                      <span className="text-xs text-muted-foreground">· {route.driver_name}{route.driver_phone ? ` (${route.driver_phone})` : ''}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Select
                      value={route.status}
                      onValueChange={(v) => { if (v) void updateStatus(route, v as DispatchStatus); }}
                    >
                      <SelectTrigger className="h-7 w-24 text-[11px]">
                        <span className="flex-1 text-left truncate">{DISPATCH_STATUS_LABEL[route.status]}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(DISPATCH_STATUS_LABEL) as DispatchStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>{DISPATCH_STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => { setAssignTarget(route); setAssignSelection(''); }}>
                      <LinkIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteRoute(route)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {obs.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">할당된 출고 없음</div>
                ) : (
                  <ul className="divide-y">
                    {obs.map((o) => (
                      <li key={o.outbound_id} className="flex items-center gap-3 px-3 py-2 text-xs">
                        <span className="tabular-nums text-muted-foreground">{o.outbound_date}</span>
                        <span className="truncate flex-1">
                          {o.target_company_name ?? o.customer_name ?? o.warehouse_id?.slice(0, 8) ?? ''}
                          {' · '}
                          {(o.quantity ?? 0).toLocaleString()}장
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => unassign(o.outbound_id)} title="배차에서 제외">
                          <X className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {route.memo && (
                  <div className="border-t px-3 py-2 text-xs text-muted-foreground">{route.memo}</div>
                )}
              </div>
            );
          })}
          {routes.length === 0 && (
            <div className="rounded-md border-2 border-dashed bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
              조회 기간 내 배차가 없습니다. 우상단 "배차 추가"로 시작하세요.
            </div>
          )}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>배차 추가</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">배송일</Label>
                <DateInput
                  value={watchedRouteDate}
                  onChange={(v) => setValue('route_date', v, { shouldValidate: true, shouldDirty: true })}
                />
                {errors.route_date && <p className="text-xs text-destructive">{errors.route_date.message}</p>}
              </div>
              <div>
                <Label className="text-xs">차량 종류</Label>
                <Input {...register('vehicle_type')} placeholder="예: 5톤 카고" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">차량 번호</Label>
                <Input {...register('vehicle_plate')} placeholder="예: 12가3456" />
              </div>
              <div>
                <Label className="text-xs">기사 이름</Label>
                <Input {...register('driver_name')} />
              </div>
            </div>
            <div>
              <Label className="text-xs">기사 연락처</Label>
              <Input {...register('driver_phone')} placeholder="예: 010-1234-5678" />
            </div>
            <div>
              <Label className="text-xs">메모 (선택)</Label>
              <Textarea rows={2} {...register('memo')} placeholder="예: 오전 9시 출발" />
            </div>
            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
            <DialogFooter className="mt-1">
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>취소</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignTarget} onOpenChange={(v) => { if (!v) setAssignTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>출고 할당</DialogTitle></DialogHeader>
          {assignTarget && (
            <div className="grid gap-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <div>배차: <strong>{assignTarget.route_date}</strong> · {assignTarget.vehicle_type ?? '차량 미지정'}</div>
                <div>현재 할당: <strong>{(routeOutbounds[assignTarget.route_id] ?? []).length}건</strong></div>
              </div>
              <div>
                <Label className="text-xs">미배차 출고</Label>
                {unassigned.length === 0 ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-50/40 p-3 text-xs">
                    미배차 상태인 출고가 없습니다.
                  </div>
                ) : (
                  <Select
                    value={assignSelection || '__none__'}
                    onValueChange={(v) => setAssignSelection(((v ?? '__none__') === '__none__' ? '' : (v as string)))}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <span className="flex-1 text-left truncate">
                        {assignSelection
                          ? unassigned.find((o) => o.outbound_id === assignSelection)?.outbound_date
                          : '출고 선택'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">선택 안 함</SelectItem>
                      {unassigned.map((o) => (
                        <SelectItem key={o.outbound_id} value={o.outbound_id}>
                          {o.outbound_date} · {(o.quantity ?? 0).toLocaleString()}장 · {o.customer_name ?? o.target_company_name ?? ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignTarget(null)}>취소</Button>
            <Button onClick={assign} disabled={!assignSelection || unassigned.length === 0}>할당</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
