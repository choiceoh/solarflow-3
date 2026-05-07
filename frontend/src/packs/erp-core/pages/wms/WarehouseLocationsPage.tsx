import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';

// WarehouseLocationsPage — D-139 WMS Phase 1 창고 위치(Bin) 마스터.
//
// 비유: "창고 안 우편번호 발급/관리". Zone > Aisle > Rack > Bin 4단계.
// 모든 테넌트 공유 (master.warehouse_location). admin/operator 권한 필요.
//
// 사용 시나리오:
//   - 창고 신규 도입 시 admin 이 위치를 일괄 등록 (예: A-01-R03-B12)
//   - 위치 type (storage/staging/receiving/shipping/damaged/reserved) 분류
//   - 사용 안 하는 위치는 is_active=false 로 비활성 (FK 제약으로 hard delete 어려움)

interface Warehouse {
  warehouse_id: string;
  name: string;
}

interface WarehouseLocation {
  location_id: string;
  warehouse_id: string;
  location_code: string;
  zone?: string | null;
  aisle?: string | null;
  rack?: string | null;
  bin?: string | null;
  capacity_qty?: number | null;
  weight_capacity_kg?: number | null;
  location_type: string;
  notes?: string | null;
  is_active: boolean;
}

const LOCATION_TYPES = [
  { value: 'storage', label: '보관' },
  { value: 'staging', label: '대기' },
  { value: 'receiving', label: '입고' },
  { value: 'shipping', label: '출고' },
  { value: 'damaged', label: '파손' },
  { value: 'reserved', label: '예약' },
] as const;

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  LOCATION_TYPES.map((t) => [t.value, t.label]),
);

type FormState = {
  warehouse_id: string;
  location_code: string;
  zone: string;
  aisle: string;
  rack: string;
  bin: string;
  location_type: string;
  capacity_qty: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  warehouse_id: '',
  location_code: '',
  zone: '',
  aisle: '',
  rack: '',
  bin: '',
  location_type: 'storage',
  capacity_qty: '',
  notes: '',
};

export default function WarehouseLocationsPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [rows, setRows] = useState<WarehouseLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const loadWarehouses = useCallback(async () => {
    try {
      const list = await fetchWithAuth<Warehouse[]>('/api/v1/warehouses');
      setWarehouses(list ?? []);
      if (list?.length && !warehouseId) {
        setWarehouseId(list[0].warehouse_id);
      }
    } catch (e) {
      console.error('[창고 로드 실패]', e);
    }
  }, [warehouseId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (warehouseId) params.set('warehouse_id', warehouseId);
      if (activeOnly) params.set('active_only', 'true');
      const list = await fetchWithAuth<WarehouseLocation[]>(
        `/api/v1/warehouse-locations/${params.toString() ? `?${params.toString()}` : ''}`,
      );
      setRows(list ?? []);
    } catch (e) {
      console.error('[위치 로드 실패]', e);
      setError(e instanceof Error ? e.message : '로드 실패');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, activeOnly]);

  useEffect(() => { void loadWarehouses(); }, [loadWarehouses]);
  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, WarehouseLocation[]>();
    for (const loc of rows) {
      const zone = loc.zone ?? '(미분류)';
      const arr = map.get(zone) ?? [];
      arr.push(loc);
      map.set(zone, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const handleSave = async () => {
    if (!form.warehouse_id) {
      setSaveMsg('창고를 선택하세요');
      return;
    }
    if (!form.location_code.trim()) {
      setSaveMsg('location_code 가 필요합니다');
      return;
    }
    setSaving(true);
    setSaveMsg('');
    try {
      const body: Record<string, unknown> = {
        warehouse_id: form.warehouse_id,
        location_code: form.location_code.trim(),
        location_type: form.location_type,
      };
      if (form.zone.trim()) body.zone = form.zone.trim();
      if (form.aisle.trim()) body.aisle = form.aisle.trim();
      if (form.rack.trim()) body.rack = form.rack.trim();
      if (form.bin.trim()) body.bin = form.bin.trim();
      if (form.capacity_qty) {
        const n = Number(form.capacity_qty);
        if (Number.isFinite(n)) body.capacity_qty = n;
      }
      if (form.notes.trim()) body.notes = form.notes.trim();

      await fetchWithAuth('/api/v1/warehouse-locations/', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSaveMsg('등록 완료');
      setForm(EMPTY_FORM);
      setShowForm(false);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '등록 실패';
      setSaveMsg(msg);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 4000);
    }
  };

  const handleToggleActive = async (loc: WarehouseLocation) => {
    try {
      await fetchWithAuth(`/api/v1/warehouse-locations/${loc.location_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !loc.is_active }),
      });
      void load();
    } catch (e) {
      console.error('[활성 토글 실패]', e);
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">창고 위치 (Bin) 마스터</h1>
          <span className="truncate text-xs text-muted-foreground">
            Zone &gt; Aisle &gt; Rack &gt; Bin 4단계 — D-139
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <span>{warehouses.find((w) => w.warehouse_id === warehouseId)?.name ?? '창고 선택'}</span>
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.warehouse_id} value={w.warehouse_id} className="text-xs">
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setActiveOnly((v) => !v)}
            data-active={activeOnly}
            className="rounded border px-2 py-0.5 text-[11px] data-[active=true]:border-primary data-[active=true]:bg-primary/10"
          >
            활성만
          </button>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            새로 고침
          </Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            위치 추가
          </Button>
        </div>
      </div>

      {saveMsg && (
        <div className="rounded border bg-card px-3 py-1 text-xs text-muted-foreground">
          {saveMsg}
        </div>
      )}

      {/* 등록 폼 */}
      {showForm && (
        <section className="rounded-md border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">신규 위치</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground">창고</label>
              <Select
                value={form.warehouse_id || warehouseId}
                onValueChange={(v) => setForm((f) => ({ ...f, warehouse_id: v ?? '' }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <span>
                    {warehouses.find((w) => w.warehouse_id === (form.warehouse_id || warehouseId))?.name ?? '선택'}
                  </span>
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
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground">location_code (예: A-01-R03-B12)</label>
              <Input
                className="h-8 text-xs"
                value={form.location_code}
                onChange={(e) => setForm((f) => ({ ...f, location_code: e.target.value }))}
                placeholder="A-01-R03-B12"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Zone</label>
              <Input className="h-8 text-xs" value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Aisle</label>
              <Input className="h-8 text-xs" value={form.aisle} onChange={(e) => setForm((f) => ({ ...f, aisle: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Rack</label>
              <Input className="h-8 text-xs" value={form.rack} onChange={(e) => setForm((f) => ({ ...f, rack: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Bin</label>
              <Input className="h-8 text-xs" value={form.bin} onChange={(e) => setForm((f) => ({ ...f, bin: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">유형</label>
              <Select
                value={form.location_type}
                onValueChange={(v) => setForm((f) => ({ ...f, location_type: v ?? 'storage' }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <span>{TYPE_LABEL[form.location_type] ?? form.location_type}</span>
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">capacity_qty</label>
              <Input
                className="h-8 text-xs"
                type="number"
                value={form.capacity_qty}
                onChange={(e) => setForm((f) => ({ ...f, capacity_qty: e.target.value }))}
              />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className="text-[10px] text-muted-foreground">메모</label>
              <Input className="h-8 text-xs" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              취소
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </section>
      )}

      {/* 목록 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            불러오는 중...
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>{error}</span>
            <span>마이그 085(warehouse_locations) 미적용일 수 있습니다.</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            위치가 없습니다 — 「위치 추가」 버튼으로 등록하세요.
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([zone, locs]) => (
              <section key={zone} className="rounded-md border bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Zone {zone}</h2>
                  <Badge variant="outline" className="text-[10px]">
                    {locs.length}개
                  </Badge>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-1 text-left font-normal">코드</th>
                      <th className="py-1 text-left font-normal">계층</th>
                      <th className="py-1 text-left font-normal">유형</th>
                      <th className="py-1 text-right font-normal">용량</th>
                      <th className="py-1 text-left font-normal">메모</th>
                      <th className="py-1 text-right font-normal">상태</th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {locs.map((loc) => (
                      <tr key={loc.location_id} className="border-t">
                        <td className="py-1 font-medium">{loc.location_code}</td>
                        <td className="py-1 text-muted-foreground">
                          {[loc.aisle, loc.rack, loc.bin].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="py-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {TYPE_LABEL[loc.location_type] ?? loc.location_type}
                          </Badge>
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {loc.capacity_qty != null ? loc.capacity_qty.toLocaleString('ko-KR') : '—'}
                        </td>
                        <td className="py-1 text-muted-foreground truncate max-w-[180px]">{loc.notes ?? '—'}</td>
                        <td className="py-1 text-right">
                          <Badge variant={loc.is_active ? 'default' : 'outline'} className="text-[10px]">
                            {loc.is_active ? '활성' : '비활성'}
                          </Badge>
                        </td>
                        <td className="py-1 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => void handleToggleActive(loc)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            {loc.is_active ? '비활성' : '재활성'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
