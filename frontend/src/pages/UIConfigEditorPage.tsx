// Phase 3: 운영자용 UI Config 편집기 — DB(`ui_configs`) 영구 저장
// 등록된 모든 메타 config(화면·폼·상세)를 JSON으로 편집하고 PUT API로 저장한다.
// "적용" 시 모든 사용자의 같은 화면이 즉시 override로 교체 (백엔드 API + localStorage 캐시).
//
// 운영 흐름:
//   1. 좌측 목록에서 config 선택 (활성 override는 회색 배지)
//   2. 우측 JSON 편집기에서 수정
//   3. "포맷" → JSON 정렬 / "검증" → parse + id 일치 / "적용" → PUT /api/v1/ui-configs
//   4. 다른 탭에서 해당 화면 열거나 새로고침 → 즉시 반영 (모든 사용자 영향)
//   5. "기본값 복원" → DELETE → DB 행 제거, 코드 default로 폴백

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';
import {
  loadOverride, saveOverride, clearOverride, listOverrides, type ConfigKind,
} from '@/templates/configOverride';
import type {
  ListScreenConfig, MetaDetailConfig, MetaFormConfig, TabbedListConfig,
} from '@/templates/types';
import partnersScreen from '@/config/screens/partners';
import outboundScreen from '@/config/screens/outbound';
import companiesScreen from '@/config/screens/companies';
import banksScreen from '@/config/screens/banks';
import warehousesScreen from '@/config/screens/warehouses';
import manufacturersScreen from '@/config/screens/manufacturers';
import productsScreen from '@/config/screens/products';
import partnerForm from '@/config/forms/partners';
import companyForm from '@/config/forms/companies';
import bankForm from '@/config/forms/banks';
import warehouseForm from '@/config/forms/warehouses';
import manufacturerForm from '@/config/forms/manufacturers';
import productForm from '@/config/forms/products';
import depsDemoForm from '@/config/forms/deps_demo';
import outboundFormSimple from '@/config/forms/outbound_simple';
import outboundDetailSimple from '@/config/details/outbound_simple';
import declarationDetailSimple from '@/config/details/declaration_simple';
import VisualScreenEditor from './UIConfigEditor/VisualScreenEditor';
import VisualTabbedListEditor from './UIConfigEditor/VisualTabbedListEditor';
import VisualFormEditor from './UIConfigEditor/VisualFormEditor';
import VisualDetailEditor from './UIConfigEditor/VisualDetailEditor';

interface KnownConfig {
  kind: ConfigKind;
  id: string;
  label: string;
  routeHint?: string;
  default: { id: string };
}

const KNOWN_CONFIGS: KnownConfig[] = [
  { kind: 'screen', id: 'partners', label: '거래처 목록', routeHint: '/masters/partners-v2', default: partnersScreen },
  { kind: 'screen', id: 'outbound_page', label: '출고/판매 (탭)', routeHint: '/outbound-v2', default: outboundScreen },
  { kind: 'screen', id: 'companies', label: '법인 마스터', routeHint: '/masters/companies-v2', default: companiesScreen },
  { kind: 'screen', id: 'banks', label: '은행 마스터', routeHint: '/masters/banks-v2', default: banksScreen },
  { kind: 'screen', id: 'warehouses', label: '창고 마스터', routeHint: '/masters/warehouses-v2', default: warehousesScreen },
  { kind: 'screen', id: 'manufacturers', label: '제조사 마스터', routeHint: '/masters/manufacturers-v2', default: manufacturersScreen },
  { kind: 'screen', id: 'products', label: '품번 마스터', routeHint: '/masters/products-v2', default: productsScreen },
  { kind: 'form', id: 'partner_form_v2', label: '거래처 폼', routeHint: '/masters/partners-v2 → 새로 등록', default: partnerForm },
  { kind: 'form', id: 'company_form_v2', label: '법인 폼', routeHint: '/masters/companies-v2 → 새로 등록', default: companyForm },
  { kind: 'form', id: 'bank_form_v2', label: '은행 폼', routeHint: '/masters/banks-v2 → 새로 등록', default: bankForm },
  { kind: 'form', id: 'warehouse_form_v2', label: '창고 폼', routeHint: '/masters/warehouses-v2 → 새로 등록', default: warehouseForm },
  { kind: 'form', id: 'manufacturer_form_v2', label: '제조사 폼', routeHint: '/masters/manufacturers-v2 → 새로 등록', default: manufacturerForm },
  { kind: 'form', id: 'product_form_v2', label: '품번 폼 (13 필드)', routeHint: '/masters/products-v2 → 새로 등록', default: productForm },
  { kind: 'form', id: 'deps_demo', label: '의존성·동적옵션 데모', routeHint: '/meta-form-deps-demo', default: depsDemoForm },
  { kind: 'form', id: 'outbound_form_simple', label: '출고 폼 (한계선 데모)', routeHint: '/outbound-form-meta-demo', default: outboundFormSimple },
  { kind: 'detail', id: 'outbound_detail_simple', label: '출고 상세 (한계선 데모)', routeHint: '/outbound-detail-meta-demo', default: outboundDetailSimple },
  { kind: 'detail', id: 'declaration_detail_simple', label: '면장 상세 (한계선 데모)', routeHint: '/declaration-detail-meta-demo', default: declarationDetailSimple },
];

export default function UIConfigEditorPage() {
  const { role } = usePermission();
  const [selectedKey, setSelectedKey] = useState<string>(`${KNOWN_CONFIGS[0].kind}:${KNOWN_CONFIGS[0].id}`);
  const [draft, setDraft] = useState<string>('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null);
  const [activeOverrides, setActiveOverrides] = useState<{ kind: ConfigKind; id: string }[]>([]);

  const selected = useMemo(
    () => KNOWN_CONFIGS.find((c) => `${c.kind}:${c.id}` === selectedKey) ?? KNOWN_CONFIGS[0],
    [selectedKey],
  );

  const refreshOverrides = async () => {
    setActiveOverrides(await listOverrides());
  };

  // 선택 변경 시 현재 override(있으면) 또는 default를 textarea로
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const override = await loadOverride<typeof selected.default>(selected.kind, selected.id);
      if (cancelled) return;
      const value = override ?? selected.default;
      setDraft(JSON.stringify(value, null, 2));
      setStatus(override ? { kind: 'info', msg: '현재 DB override 표시 중' } : { kind: 'info', msg: '코드 기본값 표시 중' });
    })();
    return () => { cancelled = true; };
  }, [selected.kind, selected.id, selected.default]);

  useEffect(() => { void refreshOverrides(); }, []);

  if (role !== 'admin') {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          관리자만 접근 가능합니다.
        </div>
      </div>
    );
  }

  const onFormat = () => {
    try {
      const parsed = JSON.parse(draft);
      setDraft(JSON.stringify(parsed, null, 2));
      setStatus({ kind: 'ok', msg: '포맷 완료' });
    } catch (e) {
      setStatus({ kind: 'err', msg: `JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const onValidate = () => {
    try {
      const parsed = JSON.parse(draft) as { id?: string };
      if (!parsed.id) {
        setStatus({ kind: 'err', msg: 'id 필드가 없습니다' });
        return;
      }
      if (parsed.id !== selected.id) {
        setStatus({ kind: 'err', msg: `id 불일치: 기대 "${selected.id}", 실제 "${parsed.id}"` });
        return;
      }
      setStatus({ kind: 'ok', msg: '유효한 JSON · id 일치' });
    } catch (e) {
      setStatus({ kind: 'err', msg: `JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const onApply = async () => {
    try {
      const parsed = JSON.parse(draft) as { id?: string };
      if (parsed.id !== selected.id) {
        setStatus({ kind: 'err', msg: `id 불일치 — 적용 거부` });
        return;
      }
      await saveOverride(selected.kind, selected.id, parsed);
      setStatus({ kind: 'ok', msg: '적용 완료 — DB 저장 + 모든 사용자 영향' });
      await refreshOverrides();
    } catch (e) {
      setStatus({ kind: 'err', msg: `적용 실패: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const onReset = async () => {
    try {
      await clearOverride(selected.kind, selected.id);
      setDraft(JSON.stringify(selected.default, null, 2));
      setStatus({ kind: 'ok', msg: '기본값 복원 — DB 행 삭제됨' });
      await refreshOverrides();
    } catch (e) {
      setStatus({ kind: 'err', msg: `복원 실패: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const isOverridden = activeOverrides.some((o) => o.kind === selected.kind && o.id === selected.id);

  return (
    <div className="flex h-[calc(100vh-80px)]">
      {/* 좌측: config 목록 */}
      <aside className="w-72 shrink-0 border-r overflow-y-auto p-3 bg-muted/20">
        <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">메타 Config</div>
        <ul className="space-y-1">
          {KNOWN_CONFIGS.map((c) => {
            const key = `${c.kind}:${c.id}`;
            const overridden = activeOverrides.some((o) => o.kind === c.kind && o.id === c.id);
            const active = selectedKey === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={`w-full text-left px-3 py-2 rounded text-xs transition-colors
                    ${active ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.label}</span>
                    {overridden && <span className="text-[9px] uppercase font-semibold opacity-70">override</span>}
                  </div>
                  <div className={`mono mt-0.5 text-[10px] ${active ? 'opacity-60' : 'text-muted-foreground'}`}>
                    {c.kind} · {c.id}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* 우측: JSON 편집기 */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="border-b px-4 py-3 space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold">{selected.label}</h1>
            <span className="text-xs text-muted-foreground mono">{selected.kind} · {selected.id}</span>
            {isOverridden && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase font-semibold">
                Override 활성
              </span>
            )}
          </div>
          {selected.routeHint && (
            <div className="text-[11px] text-muted-foreground">
              미리보기 라우트: <a href={selected.routeHint} target="_blank" rel="noreferrer" className="underline">
                {selected.routeHint}
              </a>
              <span className="ml-2 opacity-60">— 새 탭에서 열어두고 적용 후 새로고침해보세요</span>
            </div>
          )}
        </div>

        <div className="px-4 py-2 flex items-center gap-2 border-b">
          <Button size="sm" variant="outline" onClick={onFormat}>포맷</Button>
          <Button size="sm" variant="outline" onClick={onValidate}>검증</Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={onReset} disabled={!isOverridden}>
            기본값 복원
          </Button>
          <Button size="sm" onClick={onApply}>적용</Button>
        </div>

        {status && (
          <div className={`px-4 py-2 text-xs border-b
            ${status.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' :
              status.kind === 'err' ? 'bg-destructive/10 text-destructive' :
              'bg-muted/30 text-muted-foreground'}`}>
            {status.msg}
          </div>
        )}

        <div className="flex-1 min-h-0">
          <EditorWrapper kind={selected.kind} draft={draft} setDraft={setDraft} />
        </div>
      </main>
    </div>
  );
}

// 시각 편집기와 JSON 편집기 양방향 동기화 wrapper.
// kind + 구조 감지로 적절한 시각 편집기 선택. JSON parse 실패 시 텍스트 폴백.
function EditorWrapper({
  kind, draft, setDraft,
}: {
  kind: ConfigKind;
  draft: string;
  setDraft: (v: string) => void;
}) {
  const parsed = useMemo<unknown>(() => {
    try { return JSON.parse(draft); }
    catch { return null; }
  }, [draft]);

  if (parsed == null) {
    return (
      <div className="p-3 h-full flex flex-col gap-2">
        <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          JSON 파싱 실패 — 시각 편집기 비활성. 아래 텍스트로 교정 후 "포맷" 버튼.
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="font-mono text-xs flex-1 min-h-0 resize-none"
          spellCheck={false}
        />
      </div>
    );
  }

  const setFromObj = (next: unknown) => setDraft(JSON.stringify(next, null, 2));

  if (kind === 'screen') {
    // TabbedListConfig는 'tabs' 배열을 가진다 — 구조로 감지
    if (Array.isArray((parsed as { tabs?: unknown }).tabs)) {
      return (
        <VisualTabbedListEditor
          value={parsed as TabbedListConfig}
          onChange={setFromObj}
          jsonDraft={draft}
          onJsonDraftChange={setDraft}
        />
      );
    }
    return (
      <VisualScreenEditor
        value={parsed as ListScreenConfig}
        onChange={setFromObj}
        jsonDraft={draft}
        onJsonDraftChange={setDraft}
      />
    );
  }

  if (kind === 'form') {
    return (
      <VisualFormEditor
        value={parsed as MetaFormConfig}
        onChange={setFromObj}
        jsonDraft={draft}
        onJsonDraftChange={setDraft}
      />
    );
  }

  if (kind === 'detail') {
    return (
      <VisualDetailEditor
        value={parsed as MetaDetailConfig}
        onChange={setFromObj}
        jsonDraft={draft}
        onJsonDraftChange={setDraft}
      />
    );
  }

  return (
    <div className="p-3 h-full">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="font-mono text-xs h-full resize-none"
        spellCheck={false}
      />
    </div>
  );
}
