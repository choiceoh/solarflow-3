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

export default function TenantOverrideEditorPage() {
  const { role } = usePermission();
  const [tenantId, setTenantId] = useState<TenantId>(useTenantStore.getState().tenantId);
  const [selectedKey, setSelectedKey] = useState<string>(`${KNOWN_CONFIGS[0].kind}:${KNOWN_CONFIGS[0].id}`);
  const [draft, setDraft] = useState<string>('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null);
  const [activeKeys, setActiveKeys] = useState<{ tenantId: TenantId; kind: ConfigKind; configId: string }[]>([]);

  const selected = useMemo(
    () => KNOWN_CONFIGS.find((c) => `${c.kind}:${c.id}` === selectedKey) ?? KNOWN_CONFIGS[0],
    [selectedKey],
  );

  const refreshActive = () => setActiveKeys(listRuntimeOverrides());

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
    setStatus({ kind: 'ok', msg: '적용됨 — 이 tenant 의 화면/폼이 즉시 재렌더링' });
    // tenant store 의 runtimeVersion 도 직접 bump (이벤트는 발행되지만 안전하게)
    useTenantStore.getState().bumpRuntimeVersion();
  };

  const onReset = () => {
    if (!confirm(`${TENANT_LABELS[tenantId]} / ${selected.label} 의 runtime override 를 제거할까요?`)) return;
    clearRuntimeOverride(tenantId, selected.kind, selected.id);
    refreshActive();
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

  const isActive = (k: KnownConfig) => activeKeys.some(
    (a) => a.tenantId === tenantId && a.kind === k.kind && a.configId === k.id
  );

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
        <aside className="col-span-3 rounded-md border bg-card p-3 space-y-1 text-sm">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Config 선택</p>
          {KNOWN_CONFIGS.map((c) => {
            const k = `${c.kind}:${c.id}`;
            const isSel = k === selectedKey;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedKey(k)}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors ${isSel ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
              >
                <span>
                  <span className="font-mono text-[10px] text-muted-foreground">{c.kind}</span>{' · '}{c.label}
                </span>
                {isActive(c) ? (
                  <span className="rounded px-1 py-0.5 text-[9px] bg-amber-100 text-amber-800">활성</span>
                ) : null}
              </button>
            );
          })}
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

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={26}
            className="font-mono text-xs"
            spellCheck={false}
          />
          <p className="text-[11px] text-muted-foreground">
            <strong>적용 흐름:</strong> defaultConfig → 코드 overlay → <strong>runtime overlay</strong> → DB override → 화면.
            objects (page/title) 은 deep merge, arrays (columns/sections/metrics) 은 통째로 교체.
          </p>
        </main>
      </div>
    </div>
  );
}
