import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Plus, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';

// ReceivingLogPage — D-141 WMS Phase 3 입고 검수 로그 (모든 테넌트 공유).
//
// 비유: "입고 검수 일지" — 트럭 도착 → 검수자가 수량/규격 확인 → 차이 사유 + 사진.
// source_type 으로 BL 라인(module) / intercompany(BARO) / manual 분기.
//
// 사용 시나리오:
//   - 검수자: 입고 시 등록 폼으로 source 선택 → 실수량 입력
//   - 차이 발생 시 variance_reason 6종 + variance_note 강제
//   - "차이만" 필터로 회계·영업이 분기 점검

interface Warehouse {
  warehouse_id: string;
  name: string;
}

interface WarehouseLocation {
  location_id: string;
  location_code: string;
  location_type: string;
  is_active: boolean;
}

interface ReceivingLog {
  receiving_id: string;
  source_type: 'bl_line' | 'intercompany' | 'manual';
  bl_line_id?: string | null;
  intercompany_request_id?: string | null;
  warehouse_id: string;
  product_code_snapshot?: string | null;
  product_name_snapshot?: string | null;
  quantity_expected: number;
  quantity_received: number;
  quantity_variance: number;
  location_code_snapshot?: string | null;
  received_at?: string | null;
  variance_reason?: string | null;
  variance_note?: string | null;
  notes?: string | null;
}

const SOURCE_LABEL: Record<ReceivingLog['source_type'], string> = {
  bl_line: 'B/L',
  intercompany: '그룹내',
  manual: '수동',
};

const VARIANCE_REASONS = [
  { value: 'shortage', label: '부족' },
  { value: 'overage', label: '초과' },
  { value: 'damaged', label: '파손' },
  { value: 'wrong_product', label: '품번 오류' },
  { value: 'wrong_spec', label: '규격 오류' },
  { value: 'other', label: '기타' },
] as const;

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  VARIANCE_REASONS.map((r) => [r.value, r.label]),
);

interface FormState {
  source_type: ReceivingLog['source_type'];
  bl_line_id: string;
  intercompany_request_id: string;
  warehouse_id: string;
  product_code_snapshot: string;
  product_name_snapshot: string;
  quantity_expected: string;
  quantity_received: string;
  location_id: string;
  location_code_snapshot: string;
  variance_reason: string;
  variance_note: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  source_type: 'manual',
  bl_line_id: '',
  intercompany_request_id: '',
  warehouse_id: '',
  product_code_snapshot: '',
  product_name_snapshot: '',
  quantity_expected: '',
  quantity_received: '',
  location_id: '',
  location_code_snapshot: '',
  variance_reason: '',
  variance_note: '',
  notes: '',
};

export default function ReceivingLogPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [rows, setRows] = useState<ReceivingLog[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [varianceOnly, setVarianceOnly] = useState(false);
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
    } catch (e) {
      console.error('[창고 로드 실패]', e);
    }
  }, []);

  const loadLocations = useCallback(async (warehouseID: string) => {
    if (!warehouseID) {
      setLocations([]);
      return;
    }
    try {
      const list = await fetchWithAuth<WarehouseLocation[]>(
        `/api/v1/warehouse-locations/?warehouse_id=${warehouseID}&active_only=true`,
      );
      setLocations(list ?? []);
    } catch (e) {
      console.error('[창고 위치 로드 실패]', e);
      setLocations([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (warehouseId) params.set('warehouse_id', warehouseId);
      if (varianceOnly) params.set('variance_only', 'true');
      const list = await fetchWithAuth<ReceivingLog[]>(
        `/api/v1/receiving-logs/${params.toString() ? `?${params.toString()}` : ''}`,
      );
      setRows(list ?? []);
    } catch (e) {
      console.error('[검수 로그 로드 실패]', e);
      setError(e instanceof Error ? e.message : '로드 실패');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, varianceOnly]);

  useEffect(() => { void loadWarehouses(); }, [loadWarehouses]);
  useEffect(() => { void loadLocations(form.warehouse_id); }, [form.warehouse_id, loadLocations]);
  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.warehouse_id) { setSaveMsg('창고를 선택하세요'); return; }
    if (form.source_type === 'bl_line' && !form.bl_line_id.trim()) {
      setSaveMsg('B/L 라인 ID를 입력하세요');
      return;
    }
    if (form.source_type === 'intercompany' && !form.intercompany_request_id.trim()) {
      setSaveMsg('그룹내 요청 ID를 입력하세요');
      return;
    }
    const expected = Number(form.quantity_expected);
    const received = Number(form.quantity_received);
    if (!Number.isFinite(expected) || !Number.isFinite(received)) {
      setSaveMsg('수량은 숫자여야 합니다');
      return;
    }
    if (expected !== received && !form.variance_reason) {
      setSaveMsg('차이가 있을 때는 사유 선택이 필수입니다');
      return;
    }
    setSaving(true);
    setSaveMsg('');
    try {
      const body: Record<string, unknown> = {
        source_type: form.source_type,
        warehouse_id: form.warehouse_id,
        quantity_expected: expected,
        quantity_received: received,
      };
      if (form.source_type === 'bl_line' && form.bl_line_id.trim()) body.bl_line_id = form.bl_line_id.trim();
      if (form.source_type === 'intercompany' && form.intercompany_request_id.trim()) {
        body.intercompany_request_id = form.intercompany_request_id.trim();
      }
      if (form.product_code_snapshot.trim()) body.product_code_snapshot = form.product_code_snapshot.trim();
      if (form.product_name_snapshot.trim()) body.product_name_snapshot = form.product_name_snapshot.trim();
      if (form.location_id) body.location_id = form.location_id;
      if (form.location_code_snapshot.trim()) body.location_code_snapshot = form.location_code_snapshot.trim();
      if (form.variance_reason) body.variance_reason = form.variance_reason;
      if (form.variance_note.trim()) body.variance_note = form.variance_note.trim();
      if (form.notes.trim()) body.notes = form.notes.trim();

      await fetchWithAuth('/api/v1/receiving-logs/', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSaveMsg('등록 완료');
      setForm(EMPTY_FORM);
      setShowForm(false);
      void load();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 4000);
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">입고 검수 로그</h1>
          <span className="truncate text-xs text-muted-foreground">D-141 — BL/그룹내/수동 통합</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <span>{warehouses.find((w) => w.warehouse_id === warehouseId)?.name ?? '전체 창고'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="text-xs">전체 창고</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.warehouse_id} value={w.warehouse_id} className="text-xs">
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setVarianceOnly((v) => !v)}
            data-active={varianceOnly}
            className="rounded border px-2 py-0.5 text-[11px] data-[active=true]:border-amber-500 data-[active=true]:bg-amber-500/10"
          >
            차이만
          </button>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            새로 고침
          </Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            검수 등록
          </Button>
        </div>
      </div>

      {saveMsg && (
        <div className="rounded border bg-card px-3 py-1 text-xs text-muted-foreground">{saveMsg}</div>
      )}

      {showForm && (
        <section className="rounded-md border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">검수 등록</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className="text-[10px] text-muted-foreground">유형</label>
              <Select value={form.source_type} onValueChange={(v) => setForm((f) => ({ ...f, source_type: (v ?? 'manual') as ReceivingLog['source_type'] }))}>
                <SelectTrigger className="h-8 text-xs">
                  <span>{SOURCE_LABEL[form.source_type]}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bl_line" className="text-xs">B/L 라인</SelectItem>
                  <SelectItem value="intercompany" className="text-xs">그룹내</SelectItem>
                  <SelectItem value="manual" className="text-xs">수동</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.source_type !== 'manual' && (
              <div className="col-span-2">
                <label className="text-[10px] text-muted-foreground">
                  {form.source_type === 'bl_line' ? 'B/L 라인 ID' : '그룹내 요청 ID'}
                </label>
                <Input
                  className="h-8 text-xs"
                  value={form.source_type === 'bl_line' ? form.bl_line_id : form.intercompany_request_id}
                  onChange={(e) => setForm((f) => f.source_type === 'bl_line'
                    ? { ...f, bl_line_id: e.target.value }
                    : { ...f, intercompany_request_id: e.target.value })}
                />
              </div>
            )}
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground">창고</label>
              <Select value={form.warehouse_id} onValueChange={(v) => setForm((f) => ({
                ...f,
                warehouse_id: v ?? '',
                location_id: '',
                location_code_snapshot: '',
              }))}>
                <SelectTrigger className="h-8 text-xs">
                  <span>{warehouses.find((w) => w.warehouse_id === form.warehouse_id)?.name ?? '선택'}</span>
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
              <label className="text-[10px] text-muted-foreground">위치 코드</label>
              <Select value={form.location_id} onValueChange={(v) => {
                const loc = locations.find((item) => item.location_id === v);
                setForm((f) => ({
                  ...f,
                  location_id: v ?? '',
                  location_code_snapshot: loc?.location_code ?? '',
                }));
              }}>
                <SelectTrigger className="h-8 text-xs">
                  <span>{form.location_code_snapshot || '미지정'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="" className="text-xs">미지정</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.location_id} value={loc.location_id} className="text-xs">
                      {loc.location_code} · {loc.location_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">품번</label>
              <Input className="h-8 text-xs" value={form.product_code_snapshot} onChange={(e) => setForm((f) => ({ ...f, product_code_snapshot: e.target.value }))} />
            </div>
            <div className="col-span-3">
              <label className="text-[10px] text-muted-foreground">품명</label>
              <Input className="h-8 text-xs" value={form.product_name_snapshot} onChange={(e) => setForm((f) => ({ ...f, product_name_snapshot: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">예상 수량</label>
              <Input className="h-8 text-xs" type="number" value={form.quantity_expected} onChange={(e) => setForm((f) => ({ ...f, quantity_expected: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">실제 수량</label>
              <Input className="h-8 text-xs" type="number" value={form.quantity_received} onChange={(e) => setForm((f) => ({ ...f, quantity_received: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">차이 사유</label>
              <Select value={form.variance_reason} onValueChange={(v) => setForm((f) => ({ ...f, variance_reason: v ?? '' }))}>
                <SelectTrigger className="h-8 text-xs">
                  <span>{REASON_LABEL[form.variance_reason] ?? '선택 안함'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="" className="text-xs">선택 안함</SelectItem>
                  {VARIANCE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="text-xs">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className="text-[10px] text-muted-foreground">차이 메모</label>
              <Input className="h-8 text-xs" value={form.variance_note} onChange={(e) => setForm((f) => ({ ...f, variance_note: e.target.value }))} />
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} disabled={saving}>취소</Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
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
            <span>마이그 087(receiving_logs) 미적용일 수 있습니다.</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            검수 로그가 없습니다.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-normal">일시</th>
                <th className="py-1 text-left font-normal">유형</th>
                <th className="py-1 text-left font-normal">품번/품명</th>
                <th className="py-1 text-right font-normal">예상</th>
                <th className="py-1 text-right font-normal">실제</th>
                <th className="py-1 text-right font-normal">차이</th>
                <th className="py-1 text-left font-normal">사유</th>
                <th className="py-1 text-left font-normal">위치</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const variance = r.quantity_variance;
                return (
                  <tr key={r.receiving_id} className="border-t" data-variance={variance !== 0}>
                    <td className="py-1 text-muted-foreground">
                      {r.received_at ? new Date(r.received_at).toLocaleString('ko-KR') : '—'}
                    </td>
                    <td className="py-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {SOURCE_LABEL[r.source_type]}
                      </Badge>
                    </td>
                    <td className="py-1">
                      <div className="flex flex-col">
                        <span className="font-medium">{r.product_name_snapshot ?? '—'}</span>
                        <span className="text-[10px] text-muted-foreground">{r.product_code_snapshot ?? ''}</span>
                      </div>
                    </td>
                    <td className="py-1 text-right tabular-nums">{r.quantity_expected.toLocaleString('ko-KR')}</td>
                    <td className="py-1 text-right tabular-nums">{r.quantity_received.toLocaleString('ko-KR')}</td>
                    <td className="py-1 text-right tabular-nums">
                      {variance === 0 ? (
                        <span className="text-muted-foreground">0</span>
                      ) : (
                        <Badge variant={variance < 0 ? 'destructive' : 'default'} className="text-[10px]">
                          {variance > 0 ? `+${variance}` : variance}
                        </Badge>
                      )}
                    </td>
                    <td className="py-1">
                      {r.variance_reason ? (
                        <span className="text-amber-600">
                          {REASON_LABEL[r.variance_reason] ?? r.variance_reason}
                          {r.variance_note ? ` · ${r.variance_note}` : ''}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1 text-muted-foreground">{r.location_code_snapshot ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
