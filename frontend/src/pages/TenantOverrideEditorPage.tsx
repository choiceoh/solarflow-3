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

import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { ListScreenConfig, MetaFormConfig } from '@/templates/types';
import VisualScreenEditor from './UIConfigEditor/VisualScreenEditor';
import VisualFormEditor from './UIConfigEditor/VisualFormEditor';
import { ScreenSchemaPreview, FormSchemaPreview } from './UIConfigEditor/SchemaPreview';
// 마스터 화면/폼 default config — Visual 모드에서 base 로 사용
import companiesScreen from '@/config/screens/companies';
import banksScreen from '@/config/screens/banks';
import warehousesScreen from '@/config/screens/warehouses';
import manufacturersScreen from '@/config/screens/manufacturers';
import productsScreen from '@/config/screens/products';
import constructionSitesScreen from '@/config/screens/construction_sites';
import partnersScreen from '@/config/screens/partners';
import companyForm from '@/config/forms/companies';
import bankForm from '@/config/forms/banks';
import warehouseForm from '@/config/forms/warehouses';
import manufacturerForm from '@/config/forms/manufacturers';
import productForm from '@/config/forms/products';
import constructionSiteForm from '@/config/forms/construction_sites';
import partnerForm from '@/config/forms/partners';

const SCREEN_DEFAULTS: Record<string, ListScreenConfig> = {
  companies: companiesScreen,
  banks: banksScreen,
  warehouses: warehousesScreen,
  manufacturers: manufacturersScreen,
  products: productsScreen,
  construction_sites: constructionSitesScreen,
  partners: partnersScreen,
};
const FORM_DEFAULTS: Record<string, MetaFormConfig> = {
  company_form_v2: companyForm,
  bank_form_v2: bankForm,
  warehouse_form_v2: warehouseForm,
  manufacturer_form_v2: manufacturerForm,
  product_form_v2: productForm,
  construction_site_form_v2: constructionSiteForm,
  partner_form_v2: partnerForm,
};

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
  const [editMode, setEditMode] = useState<'json' | 'visual'>('json');
  const [showSidePreview, setShowSidePreview] = useState(false);

  // 안전망 (PR #248): saved 스냅샷 + undo/redo + auto-save draft + dirty 감지
  const savedDraftRef = useRef<string>('');     // 마지막으로 적용/로드된 draft (이것과 다르면 dirty)
  const undoStackRef = useRef<string[]>([]);    // 최대 20단계
  const redoStackRef = useRef<string[]>([]);
  const undoSnapTimerRef = useRef<number | null>(null);
  const lastSnapDraftRef = useRef<string>('');   // 마지막 snapshot 시점 draft
  const [, forceTick] = useState(0);              // undo/redo 버튼 활성 표시용 re-render

  const draftKey = (tid: TenantId, kind: ConfigKind, id: string) =>
    `sf.editor.draft.${tid}.${kind}.${id}`;

  const selected = useMemo(
    () => KNOWN_CONFIGS.find((c) => `${c.kind}:${c.id}` === selectedKey) ?? KNOWN_CONFIGS[0],
    [selectedKey],
  );

  const refreshActive = () => setActiveKeys(listRuntimeOverrides());
  const refreshHistory = () => setHistory(loadHistory(tenantId, selected.kind, selected.id));

  // 선택 변경 시 현재 runtime override 또는 코드 overlay (참고용) 표시
  // + auto-saved draft 가 있으면 우선 복원
  useEffect(() => {
    // saved (적용된) 값 먼저 계산
    const runtime = loadRuntimeOverride(tenantId, selected.kind, selected.id);
    let savedJson: string;
    let savedMsg: { kind: 'ok' | 'err' | 'info'; msg: string };
    if (runtime) {
      savedJson = JSON.stringify(runtime, null, 2);
      savedMsg = { kind: 'info', msg: '저장된 변경사항을 표시 중입니다' };
    } else {
      const codeOverlay = tenantId === 'topworks'
        ? null
        : (selected.kind === 'screen'
          ? tenantOverrides[tenantId]?.screens?.[selected.id]
          : tenantOverrides[tenantId]?.forms?.[selected.id]);
      if (codeOverlay) {
        savedJson = JSON.stringify(codeOverlay, null, 2);
        savedMsg = { kind: 'info', msg: '계열사 기본 설정을 참고용으로 표시 중입니다 — 편집 후 [적용]' };
      } else {
        savedJson = '{\n  \n}';
        savedMsg = { kind: 'info', msg: '아직 변경사항 없음 — 편집 후 [적용] 으로 저장' };
      }
    }
    savedDraftRef.current = savedJson;

    // auto-saved draft 가 있으면 복원
    let initialDraft = savedJson;
    let initialStatus = savedMsg;
    try {
      const savedDraft = localStorage.getItem(draftKey(tenantId, selected.kind, selected.id));
      if (savedDraft && savedDraft !== savedJson) {
        initialDraft = savedDraft;
        initialStatus = { kind: 'info', msg: '미저장 작업 복원됨 — [적용] 으로 저장하거나 [초기화] 로 폐기' };
      }
    } catch { /* localStorage 비활성 — 무시 */ }

    setDraft(initialDraft);
    setStatus(initialStatus);
    // undo/redo 스택 초기화 (config 바뀌면 새 시작)
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastSnapDraftRef.current = initialDraft;
  }, [tenantId, selected.kind, selected.id]);

  useEffect(() => { refreshActive(); }, []);

  // dirty 감지 + auto-save draft + undo 스냅샷 — debounced 500ms
  const isDirty = draft !== savedDraftRef.current;
  useEffect(() => {
    const t = window.setTimeout(() => {
      // auto-save (saved 값과 같으면 굳이 저장 안 함 — 빈 키 방지)
      try {
        if (draft !== savedDraftRef.current) {
          localStorage.setItem(draftKey(tenantId, selected.kind, selected.id), draft);
        } else {
          localStorage.removeItem(draftKey(tenantId, selected.kind, selected.id));
        }
      } catch { /* noop */ }
      // undo snapshot — 직전 snapshot 과 다를 때만
      if (lastSnapDraftRef.current && lastSnapDraftRef.current !== draft) {
        undoStackRef.current = [...undoStackRef.current, lastSnapDraftRef.current].slice(-20);
        redoStackRef.current = [];
        forceTick((n) => n + 1);
      }
      lastSnapDraftRef.current = draft;
    }, 500);
    return () => window.clearTimeout(t);
  }, [draft, tenantId, selected.kind, selected.id]);

  // dirty leave warning — 변경 후 [적용] 안 했으면 떠날 때 알림
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // 선택/tenant 변경 시 이력 새로고침 + Visual 모드 자동 진입 (지원하면)
  // 지원 안 하는 config 일 때는 JSON 모드로 폴백.
  useEffect(() => {
    setHistory(loadHistory(tenantId, selected.kind, selected.id));
    setShowHistory(false);
    const supportsVisual = selected.kind === 'screen'
      ? selected.id in SCREEN_DEFAULTS
      : selected.id in FORM_DEFAULTS;
    setEditMode(supportsVisual ? 'visual' : 'json');
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
    // saved 스냅샷 갱신 + auto-save draft 키 제거 (이제 draft == saved)
    savedDraftRef.current = draft;
    try { localStorage.removeItem(draftKey(tenantId, selected.kind, selected.id)); } catch { /* noop */ }
    setStatus({ kind: 'ok', msg: '적용됨 — 이 계열사의 화면/폼이 즉시 재렌더링' });
    // tenant store 의 runtimeVersion 도 직접 bump
    useTenantStore.getState().bumpRuntimeVersion();
  };

  const onUndo = () => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, draft];
    lastSnapDraftRef.current = prev; // snapshot effect 가 다시 push 안 하도록
    setDraft(prev);
    forceTick((n) => n + 1);
  };

  const onRedo = () => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, draft];
    lastSnapDraftRef.current = next;
    setDraft(next);
    forceTick((n) => n + 1);
  };

  const onReset = () => {
    if (!confirm(`${TENANT_LABELS[tenantId]} / ${selected.label} 의 변경사항과 미저장 작업을 모두 제거할까요?`)) return;
    clearRuntimeOverride(tenantId, selected.kind, selected.id);
    try { localStorage.removeItem(draftKey(tenantId, selected.kind, selected.id)); } catch { /* noop */ }
    refreshActive();
    refreshHistory();
    useTenantStore.getState().bumpRuntimeVersion();
    setStatus({ kind: 'ok', msg: '초기화 완료 — 계열사 기본 설정으로 복귀' });
    // 다시 로드해서 표시 갱신
    setTimeout(() => {
      const codeOverlay = tenantId === 'topworks'
        ? null
        : (selected.kind === 'screen'
          ? tenantOverrides[tenantId]?.screens?.[selected.id]
          : tenantOverrides[tenantId]?.forms?.[selected.id]);
      const restored = codeOverlay ? JSON.stringify(codeOverlay, null, 2) : '{\n  \n}';
      setDraft(restored);
      savedDraftRef.current = restored;
      lastSnapDraftRef.current = restored;
      undoStackRef.current = [];
      redoStackRef.current = [];
      if (codeOverlay) setStatus({ kind: 'info', msg: '계열사 기본 설정 표시 중' });
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

  // 키보드 단축키 — Cmd+S 적용, Cmd+Z 되돌리기, Cmd+Shift+Z 다시
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        onApply();
      } else if (key === 'z' && e.shiftKey) {
        // input/textarea 안에서 Cmd+Shift+Z 도 우리가 처리 (input 자체는 단순 type 이므로 별도 redo 없음)
        e.preventDefault();
        onRedo();
      } else if (key === 'z') {
        // input/textarea 안에서는 native undo 가 type 한 char 단위로 동작 — 그것이 우선
        // 단, JSON 모드의 큰 textarea 에서도 native 가 우선이라 OK
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          // 빈 input 이거나 native undo 가 더 할 게 없으면 우리꺼 — 단순화 위해 항상 native 우선
          return;
        }
        e.preventDefault();
        onUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onApply, onUndo, onRedo]);

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

  // Visual 모드용: base default 가 등록된 config 인지 (등록 안 됨 = visual 비활성)
  const baseDefault = useMemo(() => {
    if (selected.kind === 'screen') return SCREEN_DEFAULTS[selected.id] ?? null;
    return FORM_DEFAULTS[selected.id] ?? null;
  }, [selected.kind, selected.id]);

  // Visual 모드 진입 시: base + code overlay + 현재 draft 를 merge 해서 시각 편집기에 전달
  const visualValue = useMemo(() => {
    if (!baseDefault) return null;
    let parsedDraft: Record<string, unknown> = {};
    try {
      const p = JSON.parse(draft);
      if (p && typeof p === 'object') parsedDraft = p as Record<string, unknown>;
    } catch { /* invalid — base+code 만 사용 */ }

    // applyTenantToScreen / Form 은 loadRuntimeOverride 를 호출하므로 사용 못 함 (편집중 draft 가 아니라 저장된 값)
    // 직접 merge: base → code → draft (page/title 만 deep merge, 나머지는 교체)
    const code = (selected.kind === 'screen'
      ? tenantOverrides[tenantId]?.screens?.[selected.id]
      : tenantOverrides[tenantId]?.forms?.[selected.id]) ?? {};
    const nestedKey = selected.kind === 'screen' ? 'page' : 'title';

    const merged: Record<string, unknown> = { ...(baseDefault as unknown as Record<string, unknown>) };
    for (const layer of [code as Record<string, unknown>, parsedDraft]) {
      for (const [k, v] of Object.entries(layer)) {
        if (v === undefined) continue;
        if (k === nestedKey && v !== null && typeof v === 'object' && !Array.isArray(v)) {
          const baseVal = merged[k];
          const baseObj = (baseVal && typeof baseVal === 'object' ? baseVal : {}) as Record<string, unknown>;
          merged[k] = { ...baseObj, ...(v as Record<string, unknown>) };
        } else {
          merged[k] = v;
        }
      }
    }
    return merged;
  }, [baseDefault, tenantId, selected.kind, selected.id, draft]);

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
        <h1 className="text-base font-semibold">계열사별 화면 조정</h1>
        <p className="text-xs text-muted-foreground mt-1">
          각 계열사 (탑웍스 / 탑에너지) 의 화면이나 폼을 다르게 보이도록 조정. 변경하면 본인 브라우저에서 즉시 반영, [적용] 후 다른 사용자도 접속 시 적용 (DB 저장은 별도).
          <br />
          <strong>흐름:</strong> 좌측에서 화면·폼 선택 → 라벨/컬럼/필드 변경 → [적용]. 잘못되면 [초기화] 또는 [이력] 으로 복원.
        </p>
      </div>

      <div className="rounded-md border bg-card p-4 flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">대상 계열사:</span>
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
          이 계열사의 변경된 화면·폼: {activeKeys.filter(a => a.tenantId === tenantId).length}개
        </span>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <aside className="col-span-3 rounded-md border bg-card p-3 space-y-2 text-sm">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">화면·폼 선택</p>
          <input
            ref={(el) => { if (el && filter === '') el.focus(); }}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="검색 (예: 은행, 거래처)"
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
              <Button
                size="sm"
                variant="outline"
                onClick={onUndo}
                disabled={undoStackRef.current.length === 0}
                title="되돌리기 (⌘Z)"
              >
                ↶
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onRedo}
                disabled={redoStackRef.current.length === 0}
                title="다시 (⌘⇧Z)"
              >
                ↷
              </Button>
              <Button size="sm" variant="outline" onClick={onFormat}>포맷</Button>
              <Button size="sm" variant="outline" onClick={onValidate}>검증</Button>
              <Button
                size="sm"
                variant={editMode === 'visual' ? 'default' : 'outline'}
                onClick={() => setEditMode((m) => m === 'visual' ? 'json' : 'visual')}
                disabled={!baseDefault}
                title={baseDefault
                  ? (editMode === 'visual' ? 'JSON 직접 편집으로 전환' : '시각 편집기로 전환')
                  : '이 항목은 시각 편집기 미지원'}
              >
                {editMode === 'visual' ? '시각 편집' : 'JSON 편집'}
              </Button>
              <Button
                size="sm"
                variant={showDiff ? 'default' : 'outline'}
                onClick={() => setShowDiff((v) => !v)}
                disabled={editMode === 'visual'}
                title="코드 overlay 와 runtime override 비교 (JSON 모드에서만)"
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
              <Button
                size="sm"
                variant={showSidePreview ? 'default' : 'outline'}
                onClick={() => setShowSidePreview((v) => !v)}
                title="옆에 즉시 미리보기 (구조만)"
              >
                옆 미리보기
              </Button>
              <Button size="sm" variant="outline" onClick={onOpenPreview} title="실제 화면을 새 탭으로 열기 — [적용] 후 새로고침해야 반영">새 탭</Button>
              <Button size="sm" variant="outline" onClick={onExportCode} title="현재 tenant 의 모든 runtime override 를 코드로 export (clipboard)">코드 export</Button>
              <Button size="sm" variant="ghost" onClick={onReset} title="이 화면·폼의 변경사항을 모두 제거하고 원래대로 돌립니다">초기화</Button>
              <Button size="sm" onClick={onApply} title="적용 (⌘S)">
                {isDirty && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="미저장" />}
                적용
              </Button>
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

          {editMode === 'visual' && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              <strong>Visual 모드</strong> — base default + 코드 overlay + 현재 runtime 을 합쳐 전체 config 편집 중.
              [적용] 시 runtime override 가 <strong>전체 config 로 교체</strong>됩니다 (partial 효과 잃음 — 이후 base/code 변경이 자동 반영되지 않음).
              partial 으로 돌아가려면 [기본값 복원] 후 JSON 모드에서 다시 작성하세요.
            </div>
          )}

          {editMode === 'json' && showDiff && (keyDiff.added.length + keyDiff.removed.length + keyDiff.changed.length > 0) && (
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

          <div className={showSidePreview ? 'grid grid-cols-2 gap-4' : ''}>
            <div className="min-w-0">
              {editMode === 'visual' && visualValue ? (
                <div className="rounded-md border bg-card min-h-[600px] flex flex-col">
                  {selected.kind === 'screen' ? (
                    <VisualScreenEditor
                      value={visualValue as ListScreenConfig}
                      onChange={(next) => setDraft(JSON.stringify(next, null, 2))}
                      jsonDraft={draft}
                      onJsonDraftChange={setDraft}
                    />
                  ) : (
                    <VisualFormEditor
                      value={visualValue as MetaFormConfig}
                      onChange={(next) => setDraft(JSON.stringify(next, null, 2))}
                      jsonDraft={draft}
                      onJsonDraftChange={setDraft}
                    />
                  )}
                </div>
              ) : showDiff ? (
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
            </div>
            {showSidePreview && (
              <div className="min-w-0 rounded-md border bg-muted/10 p-3 max-h-[700px] overflow-auto">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  옆 미리보기 (구조만)
                </p>
                <SidePreview kind={selected.kind} value={visualValue} />
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            <strong>적용 흐름:</strong> defaultConfig → 코드 overlay → <strong>runtime overlay</strong> → DB override → 화면.
            objects (page/title) 은 deep merge, arrays (columns/sections/metrics) 은 통째로 교체.
          </p>
        </main>
      </div>
    </div>
  );
}

// 옆 미리보기 — 편집 중 draft 의 구조를 즉시 시각화
function SidePreview({ kind, value }: { kind: ConfigKind; value: Record<string, unknown> | null }) {
  if (!value) {
    return <div className="text-[11px] text-muted-foreground italic">기본 설정 없음 — 편집 후 미리보기 가능</div>;
  }
  if (kind === 'screen') {
    return <ScreenSchemaPreview config={value as unknown as ListScreenConfig} />;
  }
  return <FormSchemaPreview config={value as unknown as MetaFormConfig} />;
}
