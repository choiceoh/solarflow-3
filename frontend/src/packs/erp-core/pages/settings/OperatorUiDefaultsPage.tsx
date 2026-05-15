// 운영자 UI 기본값 설정 — 테이블 컬럼 순서/폭 + KPI 카드 default.
//
// 사용 흐름:
//   1. 운영자가 해당 페이지(예: /orders)로 가서 컬럼을 드래그·리사이즈해 본인 화면을 정리.
//   2. 이 페이지로 와서 "현재 내 설정으로 캡처" 클릭 → 사용자 localStorage 값을 사이트
//      default 로 끌어올림(같은 호스트 테넌트 한정).
//   3. 다른 사용자(아직 한 번도 컬럼/KPI 를 만지지 않은 사람)는 다음 로그인 시 이 default
//      로 화면이 구성된다.
//
// 권한: admin + operator. RoleGuard 가 manifest 에서 보장. 본인 테넌트만 쓸 수 있고,
// admin 만 cross-tenant 가능(서버에서 강제). 이 페이지는 본인 호스트 테넌트만 다룬다.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { useUiDefaultsStore, type UiDefaults } from '@/stores/uiDefaultsStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useAuth } from '@/hooks/useAuth';
import { detectTenantScope } from '@/lib/tenantScope';
import {
  COLORDER_PREFIX,
  COLWIDTH_PREFIX,
  MANAGED_KPI_SCOPES,
  MANAGED_TABLES,
} from '@/lib/uiDefaultsRegistry';

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

export default function OperatorUiDefaultsPage() {
  const { role } = useAuth();
  const canWrite = role === 'admin' || role === 'operator';

  const tenant = useMemo(() => detectTenantScope(), []);
  const defaults = useUiDefaultsStore((s) => s.defaults);
  const loaded = useUiDefaultsStore((s) => s.loaded);
  const loadDefaults = useUiDefaultsStore((s) => s.load);
  const saveDefaults = useUiDefaultsStore((s) => s.save);
  const userKpiHidden = usePreferencesStore((s) => s.prefs.kpi_hidden);

  const [savingId, setSavingId] = useState<string | null>(null);

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
    if (!order && !widths) {
      notify.warning('먼저 해당 페이지에서 컬럼 순서·폭을 한 번 조정해 주세요');
      return;
    }
    const next: UiDefaults = {
      ...defaults,
      tables: {
        ...defaults.tables,
        [tableId]: {
          ...(order ? { order } : {}),
          ...(widths ? { widths } : {}),
        },
      },
    };
    void persist(next, `table:${tableId}`);
  }

  function clearTable(tableId: string) {
    if (!defaults.tables[tableId]) return;
    const nextTables = { ...defaults.tables };
    delete nextTables[tableId];
    void persist({ ...defaults, tables: nextTables }, `table:${tableId}`);
  }

  function captureKpi(scopeId: string) {
    // 운영자가 대상 페이지에서 KPI 카드 토글을 조정하면 useKpiVisibility 가
    // /api/v1/users/me/preferences 로 저장한다. 그 결과는 prefs.kpi_hidden[scopeId]
    // 에 들어있다 — 그걸 그대로 사이트 default 로 끌어올리는 흐름.
    const hidden = userKpiHidden?.[scopeId];
    if (!Array.isArray(hidden)) {
      notify.warning(
        '먼저 해당 페이지에서 KPI 카드 토글로 본인 화면을 정리한 뒤 다시 시도해 주세요',
      );
      return;
    }
    const next: UiDefaults = {
      ...defaults,
      kpi: { ...defaults.kpi, [scopeId]: { hidden } },
    };
    void persist(next, `kpi:${scopeId}`);
  }

  function clearKpi(scopeId: string) {
    if (!defaults.kpi[scopeId]) return;
    const nextKpi = { ...defaults.kpi };
    delete nextKpi[scopeId];
    void persist({ ...defaults, kpi: nextKpi }, `kpi:${scopeId}`);
  }

  return (
    <div className="sf-page space-y-6 p-6">
      <header>
        <div className="sf-eyebrow">OPERATOR DEFAULTS</div>
        <h1 className="sf-page-title">UI 기본값 설정</h1>
        <p className="sf-page-description">
          테이블 컬럼 순서·폭과 KPI 카드 기본값을 정합니다. 사용자가 한 번도 직접
          조정하지 않은 항목에만 적용됩니다(개인 설정 우선). 현재 테넌트:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tenant}</code>
        </p>
      </header>

      {/* 테이블 default */}
      <section className="rounded-lg border bg-card">
        <header className="border-b px-6 py-4">
          <h2 className="text-base font-semibold">테이블 컬럼 기본값</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            대상 페이지로 가서 컬럼을 드래그·리사이즈해 본인 화면을 만든 뒤 "현재 내 설정으로 캡처" 를 누르세요.
            컬럼 순서와 폭이 함께 저장됩니다.
          </p>
        </header>
        <div className="divide-y">
          {MANAGED_TABLES.map((t) => {
            const current = defaults.tables[t.id];
            const orderCount = current?.order?.length ?? 0;
            const widthCount = current?.widths ? Object.keys(current.widths).length : 0;
            const isBusy = savingId === `table:${t.id}`;
            const isSet = orderCount > 0 || widthCount > 0;
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
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">미설정</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSet
                      ? `순서: ${orderCount}개 컬럼 · 폭: ${widthCount}개 컬럼 지정`
                      : '아직 운영자 기본값이 설정되지 않았습니다'}
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
                    onClick={() => clearTable(t.id)}
                    disabled={isBusy || !isSet}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    초기화
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
            대상 페이지의 KPI 영역에서 카드를 켜고 꺼 본인 화면을 정리한 뒤 "현재 내 설정으로 캡처" 를 누르세요.
            저장된 숨김 목록이 미설정 사용자에게 default 로 적용됩니다.
          </p>
        </header>
        <div className="divide-y">
          {MANAGED_KPI_SCOPES.map((s) => {
            const current = defaults.kpi[s.id];
            const hiddenCount = current?.hidden?.length ?? 0;
            const isBusy = savingId === `kpi:${s.id}`;
            const isSet = current != null;
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{s.label}</p>
                    {isSet ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                        <Check className="h-3 w-3" /> 설정됨
                      </span>
                    ) : (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">미설정</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSet ? `숨김: ${hiddenCount}개 카드` : '아직 운영자 기본값이 설정되지 않았습니다'}
                  </p>
                </div>
                <Link
                  to={s.pagePath}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  {s.pagePath} <ArrowRight className="h-3 w-3" />
                </Link>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => captureKpi(s.id)}
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
                    onClick={() => clearKpi(s.id)}
                    disabled={isBusy || !isSet}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    초기화
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
