// Phase 3 PoC: 운영자용 UI Config 편집기
// 등록된 모든 메타 config(화면·폼·상세)를 JSON으로 편집하고 localStorage에 저장한다.
// "적용" 시 같은 ID의 화면이 즉시 override로 교체됨 (페이지 새로고침 불필요).
//
// 운영 흐름 (PoC 단계):
//   1. 좌측 목록에서 config 선택
//   2. 우측 JSON 편집기에서 수정
//   3. "포맷" → JSON 정렬 / "검증" → JSON parse 확인 / "적용" → localStorage 저장
//   4. 다른 탭에서 해당 화면(/masters/partners-v2 등) 열어서 즉시 변경 확인
//   5. "기본값 복원" → localStorage 항목 삭제, 코드 default로 폴백
//
// 다음 단계(별도 PR): localStorage → DB 백엔드. configOverride.ts의 인터페이스만 보존.

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';
import {
  loadOverride, saveOverride, clearOverride, listOverrides, type ConfigKind,
} from '@/templates/configOverride';
import partnersScreen from '@/config/screens/partners';
import outboundScreen from '@/config/screens/outbound';
import partnerForm from '@/config/forms/partners';
import outboundFormSimple from '@/config/forms/outbound_simple';
import outboundDetailSimple from '@/config/details/outbound_simple';

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
  { kind: 'form', id: 'partner_form_v2', label: '거래처 폼', routeHint: '/masters/partners-v2 → 새로 등록', default: partnerForm },
  { kind: 'form', id: 'outbound_form_simple', label: '출고 폼 (한계선 데모)', routeHint: '/outbound-form-meta-demo', default: outboundFormSimple },
  { kind: 'detail', id: 'outbound_detail_simple', label: '출고 상세 (한계선 데모)', routeHint: '/outbound-detail-meta-demo', default: outboundDetailSimple },
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

  const refreshOverrides = () => setActiveOverrides(listOverrides());

  // 선택 변경 시 현재 override(있으면) 또는 default를 textarea로
  useEffect(() => {
    const override = loadOverride<typeof selected.default>(selected.kind, selected.id);
    const value = override ?? selected.default;
    setDraft(JSON.stringify(value, null, 2));
    setStatus(override ? { kind: 'info', msg: '현재 localStorage override 표시 중' } : { kind: 'info', msg: '코드 기본값 표시 중' });
  }, [selected.kind, selected.id, selected.default]);

  useEffect(() => { refreshOverrides(); }, []);

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

  const onApply = () => {
    try {
      const parsed = JSON.parse(draft) as { id?: string };
      if (parsed.id !== selected.id) {
        setStatus({ kind: 'err', msg: `id 불일치 — 적용 거부` });
        return;
      }
      saveOverride(selected.kind, selected.id, parsed);
      setStatus({ kind: 'ok', msg: '적용 완료 — 다른 탭에서 즉시 반영됨' });
      refreshOverrides();
    } catch (e) {
      setStatus({ kind: 'err', msg: `적용 실패: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const onReset = () => {
    clearOverride(selected.kind, selected.id);
    setDraft(JSON.stringify(selected.default, null, 2));
    setStatus({ kind: 'ok', msg: '기본값 복원 — localStorage 항목 삭제됨' });
    refreshOverrides();
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

        <div className="flex-1 min-h-0 p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-xs h-full resize-none"
            spellCheck={false}
          />
        </div>
      </main>
    </div>
  );
}
