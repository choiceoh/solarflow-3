// Phase 4 PoC: tenant 별 runtime override GUI 편집기 (admin 전용)
// 코드 overlay (config/tenants/<id>.ts) 위에 한 층 더 얹는 runtime override 를
// localStorage 에 저장. 적용 즉시 모든 v2 화면/폼 재렌더.
//
// 운영 흐름:
//   1. tenant 선택 (탑웍스 / 탑에너지)
//   2. 좌측 목록에서 screen/form 선택
//   3. 우측 JSON 편집기에 partial override 입력 (예: { "page": { "title": "..." } })
//   4. "포맷" → 정렬 / "검증" → JSON parse / "적용" → localStorage 저장 + 즉시 반영
//   5. "기본값 복원" → runtime override 제거, 코드 overlay 만 적용

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useTenantStore, TENANT_LABELS, type TenantId } from '@/stores/tenantStore';
import {
  loadRuntimeOverride, saveRuntimeOverride, clearRuntimeOverride, listRuntimeOverrides,
  type ConfigKind,
} from '@/config/tenants/runtimeOverride';
import { loadHistory, clearHistory, type HistoryEntry } from '@/config/tenants/runtimeOverrideHistory';
import { tenantOverrides } from '@/config/tenants';

interface KnownConfig {
  kind: ConfigKind;
  id: string;
  label: string;
}

// screen/form 만 (detail 은 tenant override 미지원)
const KNOWN_CONFIGS: KnownConfig[] = [
  { kind: 'screen', id: 'companies', label: '법인 마스터' },
  { kind: 'screen', id: 'banks', label: '은행 마스터' },
  { kind: 'screen', id: 'warehouses', label: '창고 마스터' },
  { kind: 'screen', id: 'manufacturers', label: '제조사 마스터' },
  { kind: 'screen', id: 'products', label: '품번 마스터' },
  { kind: 'screen', id: 'construction_sites', label: '발전소 마스터' },
  { kind: 'screen', id: 'partners', label: '거래처 목록' },
  { kind: 'form', id: 'company_form_v2', label: '법인 폼' },
  { kind: 'form', id: 'bank_form_v2', label: '은행 폼' },
  { kind: 'form', id: 'warehouse_form_v2', label: '창고 폼' },
  { kind: 'form', id: 'manufacturer_form_v2', label: '제조사 폼' },
  { kind: 'form', id: 'product_form_v2', label: '품번 폼' },
  { kind: 'form', id: 'construction_site_form_v2', label: '발전소 폼' },
  { kind: 'form', id: 'partner_form_v2', label: '거래처 폼' },
];

const TENANT_IDS: TenantId[] = ['topworks', 'topenergy'];

// 프리뷰용 라우트 힌트 (id → 실제 페이지)
// form 은 현재 별도 demo 페이지 또는 마스터 페이지의 "새로 등록" 다이얼로그로 확인.
const ROUTE_HINTS: Record<string, string> = {
  // screens
  partners: '/masters/partners-v2',
  companies: '/masters/companies-v2',
  banks: '/masters/banks-v2',
  warehouses: '/masters/warehouses-v2',
  manufacturers: '/masters/manufacturers-v2',
  products: '/masters/products-v2',
  construction_sites: '/masters/construction-sites-v2',
  // forms — 마스터 페이지에서 "새로 등록" 누르면 노출
  partner_form_v2: '/masters/partners-v2',
  company_form_v2: '/masters/companies-v2',
  bank_form_v2: '/masters/banks-v2',
  warehouse_form_v2: '/masters/warehouses-v2',
  manufacturer_form_v2: '/masters/manufacturers-v2',
  product_form_v2: '/masters/products-v2',
  construction_site_form_v2: '/masters/construction-sites-v2',
};

export default function TenantOverrideEditorPage() {
  const { role } = usePermission();
  const [tenantId, setTenantId] = useState<TenantId>(useTenantStore.getState().tenantId);
  const [selectedKey, setSelectedKey] = useState<string>(`${KNOWN_CONFIGS[0].kind}:${KNOWN_CONFIGS[0].id}`);
  const [draft, setDraft] = useState<string>('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null);
  const [activeKeys, setActiveKeys] = useState<{ tenantId: TenantId; kind: ConfigKind; configId: string }[]>([]);
  const [filter, setFilter] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const selected = useMemo(
    () => KNOWN_CONFIGS.find((c) => `${c.kind}:${c.id}` === selectedKey) ?? KNOWN_CONFIGS[0],
    [selectedKey],
  );

  const refreshActive = () => setActiveKeys(listRuntimeOverrides());
  const refreshHistory = () => setHistory(loadHistory(tenantId, selected.kind, selected.id));

  // 선택 변경 시 현재 runtime override 또는 코드 overlay (참고용) 표시
  useEffect(() => {
    const runtime = loadRuntimeOverride(tenantId, selected.kind, selected.id);
    if (runtime) {
      setDraft(JSON.stringify(runtime, null, 2));
      setStatus({ kind: 'info', msg: '현재 runtime override 표시 중 (localStorage)' });
    } else {
      // 코드 overlay 가 있으면 참고용으로 표시 (편집 시작점)
      const codeOverlay = tenantId === 'topworks'
        ? null
        : (selected.kind === 'screen'
          ? tenantOverrides[tenantId]?.screens?.[selected.id]
          : tenantOverrides[tenantId]?.forms?.[selected.id]);
      if (codeOverlay) {
        setDraft(JSON.stringify(codeOverlay, null, 2));
        setStatus({ kind: 'info', msg: '코드 overlay (config/tenants/...) 참고용 — 편집 후 적용 시 runtime 으로 저장' });
      } else {
        setDraft('{\n  \n}');
        setStatus({ kind: 'info', msg: '오버라이드 없음 — partial JSON 입력 (예: { "page": { "title": "..." } })' });
      }
    }
  }, [tenantId, selected.kind, selected.id]);

  useEffect(() => { refreshActive(); }, []);

  // 선택/tenant 변경 시 이력 새로고침
  useEffect(() => {
    setHistory(loadHistory(tenantId, selected.kind, selected.id));
    setShowHistory(false);
  }, [tenantId, selected.kind, selected.id]);

  if (role !== 'admin') {
    return <div className="p-12 text-center text-sm text-muted-foreground">관리자만 접근 가능합니다.</div>;
  }

  const validate = (): unknown => {
    try {
      const parsed = JSON.parse(draft);
      if (typeof parsed !== 'object' || parsed === null) throw new Error('객체여야 합니다 ({...})');
      return parsed;
    } catch (e) {
      setStatus({ kind: 'err', msg: 'JSON 오류: ' + (e instanceof Error ? e.message : String(e)) });
      return null;
    }
  };

  const onFormat = () => {
    const parsed = validate();
    if (parsed != null) {
      setDraft(JSON.stringify(parsed, null, 2));
      setStatus({ kind: 'ok', msg: '포맷 완료' });
    }
  };

  const onValidate = () => {
    const parsed = validate();
    if (parsed != null) setStatus({ kind: 'ok', msg: '검증 통과 — 유효한 JSON 객체' });
  };

  const onApply = () => {
    const parsed = validate();
    if (parsed == null) return;
    saveRuntimeOverride(tenantId, selected.kind, selected.id, parsed as never);
    refreshActive();
    refreshHistory();
    setStatus({ kind: 'ok', msg: '적용됨 — 이 tenant 의 화면/폼이 즉시 재렌더링' });
    // tenant store 의 runtimeVersion 도 직접 bump (이벤트는 발행되지만 안전하게)
    useTenantStore.getState().bumpRuntimeVersion();
  };

  const onReset = () => {
    if (!confirm(`${TENANT_LABELS[tenantId]} / ${selected.label} 의 runtime override 를 제거할까요?`)) return;
    clearRuntimeOverride(tenantId, selected.kind, selected.id);
    refreshActive();
    refreshHistory();
    useTenantStore.getState().bumpRuntimeVersion();
    setStatus({ kind: 'ok', msg: '복원 완료 — 코드 overlay 만 적용 (또는 base config)' });
    // 다시 로드해서 표시 갱신
    setTimeout(() => {
      const codeOverlay = tenantId === 'topworks'
        ? null
        : (selected.kind === 'screen'
          ? tenantOverrides[tenantId]?.screens?.[selected.id]
          : tenantOverrides[tenantId]?.forms?.[selected.id]);
      if (codeOverlay) {
        setDraft(JSON.stringify(codeOverlay, null, 2));
        setStatus({ kind: 'info', msg: '코드 overlay 표시 중' });
      } else {
        setDraft('{\n  \n}');
      }
    }, 50);
  };

  // Phase 4 보강 (E): 현재 tenant 의 모든 runtime overrides 를 config/tenants/<id>.ts 형식으로 export
  // 운영자가 검증 후 코드로 승격할 때 사용 (clipboard 복사).
  const onExportCode = async () => {
    const tenantOverridesMap: { screens: Record<string, unknown>; forms: Record<string, unknown> } = { screens: {}, forms: {} };
    activeKeys
      .filter((k) => k.tenantId === tenantId)
      .forEach((k) => {
        const v = loadRuntimeOverride(k.tenantId, k.kind, k.configId);
        if (!v) return;
        if (k.kind === 'screen') tenantOverridesMap.screens[k.configId] = v;
        else tenantOverridesMap.forms[k.configId] = v;
      });
    const code = `// 자동 생성 — runtime override 를 코드로 승격 (Tenant Override Editor)
import type { TenantOverrides } from './index';

export const ${tenantId}Overrides: TenantOverrides = ${JSON.stringify(tenantOverridesMap, null, 2)};
`;
    try {
      await navigator.clipboard.writeText(code);
      setStatus({ kind: 'ok', msg: `클립보드 복사 완료 — config/tenants/${tenantId}.ts 에 붙여넣기` });
    } catch {
      // 클립보드 권한 거부 시 alert 로 노출
      alert(code);
    }
  };

  // Phase 4 보강 (A): 프리뷰 — 적용된 override 결과를 새 탭에서 확인
  // (저장 후 실제 라우트 접근 — 화면은 base + 코드 overlay + runtime + DB override 모두 반영)
  const onOpenPreview = () => {
    const route = ROUTE_HINTS[selected.id];
    if (!route) {
      alert(`프리뷰 라우트 없음: ${selected.id}`);
      return;
    }
    const url = tenantId === 'topworks' ? route : `${route}?tenant=${tenantId}`;
    window.open(url, '_blank', 'noopener');
  };

  const isActive = (k: KnownConfig) => activeKeys.some(
    (a) => a.tenantId === tenantId && a.kind === k.kind && a.configId === k.id
  );

  // Phase 4 보강 (이력): 특정 시점 값을 draft 로 복원 (저장은 운영자가 [적용] 클릭 시)
  const onRestoreFromHistory = (entry: HistoryEntry) => {
    if (entry.value == null) {
      setDraft('{\n  \n}');
      setStatus({ kind: 'info', msg: '이력의 "override 없음" 시점 — 빈 객체 로드 (적용 시 빈 override 저장됨; 완전 제거하려면 "기본값 복원")' });
    } else {
      setDraft(JSON.stringify(entry.value, null, 2));
      setStatus({ kind: 'info', msg: `이력 복원 — ${new Date(entry.ts).toLocaleString()} 시점 로드 ([적용] 시 저장)` });
    }
    setShowHistory(false);
  };

  const onClearHistory = () => {
    if (!confirm(`${TENANT_LABELS[tenantId]} / ${selected.label} 의 이력을 모두 삭제할까요?`)) return;
    clearHistory(tenantId, selected.kind, selected.id);
    refreshHistory();
    setStatus({ kind: 'ok', msg: '이력 삭제됨' });
  };

  // Phase 4 보강 (Diff): 현재 선택된 config 의 코드 overlay (참고용 readonly)
  const codeOverlay = useMemo(() => {
    if (tenantId === 'topworks') return null; // 코드 overlay 없음 (base default 만)
    return selected.kind === 'screen'
      ? tenantOverrides[tenantId]?.screens?.[selected.id]
      : tenantOverrides[tenantId]?.forms?.[selected.id];
  }, [tenantId, selected.kind, selected.id]);

  const codeOverlayJson = useMemo(
    () => (codeOverlay ? JSON.stringify(codeOverlay, null, 2) : '(코드 overlay 없음)'),
    [codeOverlay],
  );

  // top-level 키 단위 변경 요약 (added/removed/changed)
  const keyDiff = useMemo(() => {
    let runtime: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(draft);
      if (parsed && typeof parsed === 'object') runtime = parsed as Record<string, unknown>;
    } catch { /* invalid JSON — 무시 */ }
    const code = (codeOverlay as Record<string, unknown> | null) ?? {};
    const r = runtime ?? {};
    const all = Array.from(new Set([...Object.keys(code), ...Object.keys(r)])).sort();
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    for (const k of all) {
      const inC = k in code;
      const inR = k in r;
      if (!inC && inR) added.push(k);
      else if (inC && !inR) removed.push(k);
      else if (JSON.stringify(code[k]) !== JSON.stringify(r[k])) changed.push(k);
    }
    return { added, removed, changed };
  }, [codeOverlay, draft]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-base font-semibold">테넌트 Override 편집기</h1>
        <p className="text-xs text-muted-foreground mt-1">
          tenant 별 runtime override 를 GUI 로 편집. 코드 overlay (<code>config/tenants/&lt;id&gt;.ts</code>) 위에 한 층 더 얹어 적용.
          partial JSON 만 입력 (예: <code>{`{ "page": { "title": "..." } }`}</code>).
        </p>
      </div>

      <div className="rounded-md border bg-card p-4 flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">대상 Tenant:</span>
        <Select value={tenantId} onValueChange={(v) => setTenantId(v as TenantId)}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <span>{TENANT_LABELS[tenantId]}</span>
          </SelectTrigger>
          <SelectContent>
            {TENANT_IDS.map((id) => (
              <SelectItem key={id} value={id}>{TENANT_LABELS[id]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground">
          활성 runtime overrides: {activeKeys.filter(a => a.tenantId === tenantId).length}개
        </span>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <aside className="col-span-3 rounded-md border bg-card p-3 space-y-2 text-sm">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Config 선택</p>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="검색 (라벨/id/kind)"
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="space-y-1">
            {KNOWN_CONFIGS
              .filter((c) => !filter
                || c.label.toLowerCase().includes(filter.toLowerCase())
                || c.id.toLowerCase().includes(filter.toLowerCase())
                || c.kind.toLowerCase().includes(filter.toLowerCase()))
              .map((c) => {
                const k = `${c.kind}:${c.id}`;
                const isSel = k === selectedKey;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedKey(k)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors ${isSel ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
                  >
                    <span className="flex items-center gap-1.5">
                      {isActive(c) ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="변경됨" /> : <span className="h-1.5 w-1.5" />}
                      <span className="font-mono text-[10px] text-muted-foreground">{c.kind}</span>
                      <span>{c.label}</span>
                    </span>
                    {isActive(c) ? (
                      <span className="rounded px-1 py-0.5 text-[9px] bg-amber-100 text-amber-800">활성</span>
                    ) : null}
                  </button>
                );
              })}
          </div>
        </aside>

        <main className="col-span-9 rounded-md border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{selected.label}</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{selected.kind} · {selected.id}</p>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={onFormat}>포맷</Button>
              <Button size="sm" variant="outline" onClick={onValidate}>검증</Button>
              <Button
                size="sm"
                variant={showDiff ? 'default' : 'outline'}
                onClick={() => setShowDiff((v) => !v)}
                title="코드 overlay 와 runtime override 비교"
              >
                Diff
              </Button>
              <Button
                size="sm"
                variant={showHistory ? 'default' : 'outline'}
                onClick={() => setShowHistory((v) => !v)}
                disabled={history.length === 0}
                title={history.length === 0 ? '이력 없음 (아직 [적용] 한 적이 없음)' : `이력 ${history.length}개`}
              >
                이력 {history.length > 0 && <span className="ml-1 rounded bg-foreground/10 px-1 text-[10px]">{history.length}</span>}
              </Button>
              <Button size="sm" variant="outline" onClick={onOpenPreview} title="새 탭에서 프리뷰">프리뷰</Button>
              <Button size="sm" variant="outline" onClick={onExportCode} title="현재 tenant 의 모든 runtime override 를 코드로 export (clipboard)">코드 export</Button>
              <Button size="sm" variant="ghost" onClick={onReset}>기본값 복원</Button>
              <Button size="sm" onClick={onApply}>적용</Button>
            </div>
          </div>

          {status && (
            <div className={`rounded px-3 py-1.5 text-xs ${
              status.kind === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' :
              status.kind === 'err' ? 'bg-red-50 text-red-800 border border-red-200' :
              'bg-blue-50 text-blue-800 border border-blue-200'
            }`}>
              {status.msg}
            </div>
          )}

          {showHistory && history.length > 0 && (
            <div className="rounded-md border bg-muted/20 p-2 space-y-1">
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  변경 이력 (최신순) — 클릭 시 draft 로 복원, [적용] 으로 저장
                </p>
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="text-[10px] text-muted-foreground hover:text-destructive underline-offset-2 hover:underline"
                >
                  이력 삭제
                </button>
              </div>
              <ul className="space-y-0.5">
                {history.map((entry, i) => {
                  const date = new Date(entry.ts);
                  const summary = entry.value == null
                    ? '(override 없음 시점)'
                    : (() => {
                      const keys = Object.keys(entry.value as Record<string, unknown>);
                      return keys.length === 0 ? '{}' : keys.slice(0, 3).join(', ') + (keys.length > 3 ? `, +${keys.length - 3}` : '');
                    })();
                  return (
                    <li key={`${entry.ts}-${i}`}>
                      <button
                        type="button"
                        onClick={() => onRestoreFromHistory(entry)}
                        className="w-full flex items-center justify-between gap-3 rounded px-2 py-1 text-left text-xs hover:bg-accent"
                      >
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                          {date.toLocaleString()}
                        </span>
                        <span className="flex-1 truncate text-foreground/80">
                          {summary}
                        </span>
                        <span className="text-[10px] text-muted-foreground">복원 →</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {showDiff && (keyDiff.added.length + keyDiff.removed.length + keyDiff.changed.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px]">
              <span className="font-medium text-amber-900">최상위 키 차이:</span>
              {keyDiff.added.map((k) => (
                <span key={`a-${k}`} className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800">+ {k}</span>
              ))}
              {keyDiff.removed.map((k) => (
                <span key={`r-${k}`} className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[10px] text-rose-800">− {k}</span>
              ))}
              {keyDiff.changed.map((k) => (
                <span key={`c-${k}`} className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-900">~ {k}</span>
              ))}
            </div>
          )}

          {showDiff ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  코드 overlay (config/tenants/{tenantId}.ts) — readonly
                </p>
                <Textarea
                  value={codeOverlayJson}
                  readOnly
                  rows={26}
                  className="font-mono text-xs bg-muted/40"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  runtime override (편집 중)
                </p>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={26}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              </div>
            </div>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={26}
              className="font-mono text-xs"
              spellCheck={false}
            />
          )}

          <p className="text-[11px] text-muted-foreground">
            <strong>적용 흐름:</strong> defaultConfig → 코드 overlay → <strong>runtime overlay</strong> → DB override → 화면.
            objects (page/title) 은 deep merge, arrays (columns/sections/metrics) 은 통째로 교체.
          </p>
        </main>
      </div>
    </div>
  );
}
