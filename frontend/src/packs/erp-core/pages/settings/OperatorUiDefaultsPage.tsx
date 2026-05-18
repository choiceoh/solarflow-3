// 운영자 UI 기본값 설정 — 테이블 컬럼 순서/폭 + KPI 카드 default.
//
// 두 가지 편집 방식이 공존:
//   1. 테이블: 운영자가 대상 페이지로 가서 컬럼을 드래그·리사이즈한 뒤 여기 와서
//      "현재 내 설정으로 캡처" 를 누른다 (사용자 localStorage 값을 사이트 default 로
//      끌어올린다). 운영자 본인 화면 = 사이트 default 가 되는 자연스러운 흐름.
//
//   2. KPI: 카드 라벨 목록을 캐시에서 읽어 체크박스로 직접 편집 (운영자 본인의
//      kpi_hidden 은 건드리지 않는다). 캐시는 KpiStrip 이 페이지 렌더 시 채워주므로
//      운영자가 해당 페이지를 한 번이라도 방문했어야 metric 라벨이 보인다.
//
// 권한: admin + operator. RoleGuard 가 manifest 에서 보장. 본인 테넌트만 쓸 수 있고,
// admin 만 cross-tenant 가능 (서버에서 강제). 이 페이지는 본인 호스트 테넌트만 다룬다.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { notify } from '@/lib/notify';
import { useUiDefaultsStore, type UiDefaults } from '@/stores/uiDefaultsStore';
import { useAuth } from '@/hooks/useAuth';
import { detectTenantScope } from '@/lib/tenantScope';
import { loadKpiOptions } from '@/lib/kpiOptionsCache';
import type { KpiVisibilityOption } from '@/hooks/useKpiVisibility';
import { COLPIN_PREFIX } from '@/lib/columnPinning';
import { COLSORT_PREFIX, type SortingState } from '@/lib/columnSort';
import {
  COLORDER_PREFIX,
  COLWIDTH_PREFIX,
  MANAGED_KPI_SCOPES,
  MANAGED_TABLES,
} from '@/lib/uiDefaultsRegistry';
import type { ColumnPinningState } from '@/lib/columnPinning';

function readLocalArray(key: string): string[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : null;
  } catch {
    return null;
  }
}

function readLocalRecord(key: string): Record<string, number> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function readLocalSort(key: string): SortingState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const filtered: SortingState = arr
      .filter((s) => s && typeof s.id === 'string' && typeof s.desc === 'boolean')
      .map((s) => ({ id: String(s.id), desc: !!s.desc }));
    return filtered.length > 0 ? filtered : null;
  } catch {
    return null;
  }
}

function readLocalPinning(key: string): ColumnPinningState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    const left = Array.isArray(obj.left) ? obj.left.filter((s: unknown) => typeof s === 'string') : [];
    const right = Array.isArray(obj.right) ? obj.right.filter((s: unknown) => typeof s === 'string') : [];
    if (left.length === 0 && right.length === 0) return null;
    return { left, right };
  } catch {
    return null;
  }
}

interface DeleteIntent {
  kind: 'table' | 'kpi';
  id: string;
  label: string;
}

export default function OperatorUiDefaultsPage() {
  const { role } = useAuth();
  const canWrite = role === 'admin' || role === 'operator';

  const tenant = useMemo(() => detectTenantScope(), []);
  const defaults = useUiDefaultsStore((s) => s.defaults);
  const loaded = useUiDefaultsStore((s) => s.loaded);
  const loadDefaults = useUiDefaultsStore((s) => s.load);
  const saveDefaults = useUiDefaultsStore((s) => s.save);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent | null>(null);

  // 캐시된 KPI metric 라벨 — scope id → option[]. KpiStrip 이 페이지 렌더 시 채워준다.
  // 페이지 진입 시 1회 읽음. 운영자가 라벨을 새로 보려면 새 탭에서 대상 페이지를
  // 방문 후 이 페이지를 새로고침해야 한다 (cross-window 캐시 동기화는 후속 작업).
  const kpiOptions = useMemo<Record<string, KpiVisibilityOption[] | null>>(() => {
    const out: Record<string, KpiVisibilityOption[] | null> = {};
    for (const s of MANAGED_KPI_SCOPES) {
      out[s.id] = loadKpiOptions(s.id);
    }
    return out;
  }, []);

  useEffect(() => {
    if (!loaded) void loadDefaults(tenant);
  }, [loaded, tenant, loadDefaults]);

  if (!canWrite) {
    return (
      <div className="sf-page">
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          운영팀 또는 시스템관리자만 이 페이지에 접근할 수 있습니다.
        </div>
      </div>
    );
  }

  async function persist(next: UiDefaults, busyId: string) {
    setSavingId(busyId);
    try {
      await saveDefaults(tenant, next);
      notify.success('운영자 기본값이 저장됐습니다');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSavingId(null);
    }
  }

  function captureTable(tableId: string) {
    const order = readLocalArray(COLORDER_PREFIX + tableId);
    const widths = readLocalRecord(COLWIDTH_PREFIX + tableId);
    const sort = readLocalSort(COLSORT_PREFIX + tableId);
    const pinning = readLocalPinning(COLPIN_PREFIX + tableId);
    if (!order && !widths && !sort && !pinning) {
      notify.warning('먼저 해당 페이지에서 컬럼을 한 번 조정해 주세요 (순서·폭·정렬·고정 중 하나)');
      return;
    }
    const next: UiDefaults = {
      ...defaults,
      tables: {
        ...defaults.tables,
        [tableId]: {
          ...(order ? { order } : {}),
          ...(widths ? { widths } : {}),
          ...(sort ? { sort } : {}),
          ...(pinning ? { pinning } : {}),
        },
      },
    };
    void persist(next, `table:${tableId}`);
  }

  function deleteTable(tableId: string) {
    if (!defaults.tables[tableId]) return;
    const nextTables = { ...defaults.tables };
    delete nextTables[tableId];
    void persist({ ...defaults, tables: nextTables }, `table:${tableId}`);
  }

  function toggleKpiMetric(scopeId: string, metricId: string, hidden: boolean) {
    const current = defaults.kpi[scopeId]?.hidden ?? [];
    const set = new Set(current);
    if (hidden) set.add(metricId);
    else set.delete(metricId);
    const next: UiDefaults = {
      ...defaults,
      kpi: { ...defaults.kpi, [scopeId]: { hidden: [...set] } },
    };
    void persist(next, `kpi:${scopeId}`);
  }

  function deleteKpi(scopeId: string) {
    if (!defaults.kpi[scopeId]) return;
    const nextKpi = { ...defaults.kpi };
    delete nextKpi[scopeId];
    void persist({ ...defaults, kpi: nextKpi }, `kpi:${scopeId}`);
  }

  function confirmDelete() {
    if (!deleteIntent) return;
    if (deleteIntent.kind === 'table') deleteTable(deleteIntent.id);
    else deleteKpi(deleteIntent.id);
    setDeleteIntent(null);
  }

  return (
    <div className="sf-page space-y-6 p-6">
      <header>
        <div className="sf-eyebrow">OPERATOR DEFAULTS</div>
        <h1 className="sf-page-title">UI 기본값 설정</h1>
        <p className="sf-page-description">
          테이블 컬럼 순서·폭·정렬·고정과 KPI 카드 기본값을 정합니다. 사용자가 한 번도
          직접 조정하지 않은 항목에만 적용됩니다(개인 설정 우선). 사용자는 컬럼
          헤더 우클릭 메뉴에서 "운영자 기본값으로 되돌리기" 로 운영자 default 로 복귀할 수
          있습니다. 현재 테넌트:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tenant}</code>
        </p>
      </header>

      {/* 테이블 default */}
      <section className="rounded-lg border bg-card">
        <header className="border-b px-6 py-4">
          <h2 className="text-base font-semibold">테이블 컬럼 기본값</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            대상 페이지로 가서 컬럼을 정리(드래그·리사이즈·정렬·고정) 한 뒤 "현재 내
            설정으로 캡처" 를 누르세요. 4가지 (순서·폭·정렬·고정) 가 한 번에 저장됩니다.
          </p>
        </header>
        <div className="divide-y">
          {MANAGED_TABLES.map((t) => {
            const current = defaults.tables[t.id];
            const orderCount = current?.order?.length ?? 0;
            const widthCount = current?.widths ? Object.keys(current.widths).length : 0;
            const sortCount = current?.sort?.length ?? 0;
            const pinCount =
              (current?.pinning?.left?.length ?? 0) + (current?.pinning?.right?.length ?? 0);
            const isBusy = savingId === `table:${t.id}`;
            const isSet = orderCount > 0 || widthCount > 0 || sortCount > 0 || pinCount > 0;
            const summary = [
              orderCount > 0 ? `순서 ${orderCount}` : null,
              widthCount > 0 ? `폭 ${widthCount}` : null,
              sortCount > 0 ? `정렬 ${sortCount}` : null,
              pinCount > 0 ? `고정 ${pinCount}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{t.label}</p>
                    {isSet ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                        <Check className="h-3 w-3" /> 설정됨
                      </span>
                    ) : (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                        미설정
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSet ? summary : '아직 운영자 기본값이 설정되지 않았습니다'}
                  </p>
                </div>
                <Link
                  to={t.pagePath}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  {t.pagePath} <ArrowRight className="h-3 w-3" />
                </Link>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => captureTable(t.id)}
                    disabled={isBusy}
                    className="gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isBusy ? '저장 중…' : '현재 내 설정으로 캡처'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDeleteIntent({ kind: 'table', id: t.id, label: t.label })
                    }
                    disabled={isBusy || !isSet}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    운영자 기본값 삭제
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* KPI default */}
      <section className="rounded-lg border bg-card">
        <header className="border-b px-6 py-4">
          <h2 className="text-base font-semibold">KPI 카드 기본값</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            각 섹션의 카드 목록은 해당 페이지를 한 번이라도 방문한 뒤 표시됩니다. 체크
            해제한 카드가 미설정 사용자에게 default 로 숨겨집니다. 운영자 본인 화면은
            영향 받지 않습니다(개인 KPI 토글과 분리).
          </p>
        </header>
        <div className="divide-y">
          {MANAGED_KPI_SCOPES.map((s) => {
            const options = kpiOptions[s.id];
            const current = defaults.kpi[s.id];
            const hiddenSet = new Set(current?.hidden ?? []);
            const isBusy = savingId === `kpi:${s.id}`;
            const isSet = current != null;

            return (
              <div key={s.id} className="space-y-3 px-6 py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{s.label}</p>
                      {isSet ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                          <Check className="h-3 w-3" /> 설정됨
                        </span>
                      ) : (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                          미설정
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      scope: <code className="font-mono">{s.id}</code>
                    </p>
                  </div>
                  <Link
                    to={s.pagePath}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    {s.pagePath} <ArrowRight className="h-3 w-3" />
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDeleteIntent({ kind: 'kpi', id: s.id, label: s.label })
                    }
                    disabled={isBusy || !isSet}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    운영자 기본값 삭제
                  </Button>
                </div>

                {!options || options.length === 0 ? (
                  <div className="rounded-md border border-dashed bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                    카드 라벨을 가져오지 못했습니다.{' '}
                    <Link to={s.pagePath} className="text-blue-600 hover:underline">
                      해당 페이지를 한 번 방문
                    </Link>{' '}
                    한 뒤 이 페이지를 새로고침하세요.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {options.map((opt) => {
                      const hidden = hiddenSet.has(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs"
                        >
                          <Checkbox
                            checked={!hidden}
                            onCheckedChange={(v) => toggleKpiMetric(s.id, opt.id, !v)}
                            disabled={isBusy}
                          />
                          <span className={hidden ? 'text-muted-foreground line-through' : ''}>
                            {opt.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <ConfirmDialog
        open={!!deleteIntent}
        onOpenChange={(open) => {
          if (!open) setDeleteIntent(null);
        }}
        title="운영자 기본값 삭제"
        description={
          deleteIntent
            ? `"${deleteIntent.label}" 의 운영자 기본값을 삭제하시겠습니까? 미설정 사용자는 다시 시스템 기본 동작으로 돌아갑니다. 이미 본인 설정이 있는 사용자에게는 영향이 없습니다.`
            : ''
        }
        onConfirm={confirmDelete}
        confirmLabel="삭제"
        variant="destructive"
      />
    </div>
  );
}
