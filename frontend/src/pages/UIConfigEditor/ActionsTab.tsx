// 액션 탭 — 헤더/툴바/행 액션 인라인 편집. trigger·kind에 따라 보조 필드 동적 노출.

import { useMemo } from 'react';
import type {
  ActionConfig, ActionIcon, ActionKind, ActionTrigger, ActionVariant, ListScreenConfig,
} from '@/templates/types';
import { actionHandlers, formComponents } from '@/templates/registry';
import { ArrayEditor, FieldInput, FieldSelect, moveInArray } from './ArrayEditor';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const TRIGGER_OPTIONS = [
  { value: 'header', label: 'header (페이지 우상단)' },
  { value: 'toolbar', label: 'toolbar (필터 우측)' },
  { value: 'row', label: 'row (행 인라인)' },
];

const KIND_OPTIONS = [
  { value: 'open_form', label: 'open_form (신규 폼 열기)' },
  { value: 'edit_form', label: 'edit_form (행 데이터로 폼 prefill)' },
  { value: 'confirm_call', label: 'confirm_call (확인 다이얼로그 + REST 호출)' },
  { value: 'custom', label: 'custom (등록된 핸들러)' },
];

const ICON_OPTIONS = [
  { value: 'plus', label: 'plus (+)' },
  { value: 'pencil', label: 'pencil (수정)' },
  { value: 'trash', label: 'trash (삭제)' },
];

const VARIANT_OPTIONS = [
  { value: 'primary', label: 'primary' },
  { value: 'outline', label: 'outline' },
  { value: 'ghost', label: 'ghost' },
  { value: 'destructive', label: 'destructive' },
];

const METHOD_OPTIONS = [
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
];

export function ActionsTab({
  value, onChange,
}: {
  value: ListScreenConfig;
  onChange: (next: ListScreenConfig) => void;
}) {
  const actions = value.actions ?? [];

  const formOptions = useMemo(
    () => Object.keys(formComponents).sort().map((id) => ({ value: id, label: id })),
    [],
  );
  const handlerOptions = useMemo(
    () => Object.keys(actionHandlers).sort().map((id) => ({ value: id, label: id })),
    [],
  );

  const update = (idx: number, next: ActionConfig) =>
    onChange({ ...value, actions: actions.map((a, i) => (i === idx ? next : a)) });

  return (
    <ArrayEditor
      items={actions}
      hint="trigger=header(우상단), toolbar(필터 우측), row(행 인라인). kind에 따라 보조 필드가 달라집니다."
      addLabel="액션 추가"
      emptyMsg="액션이 없습니다"
      onAdd={() => onChange({
        ...value,
        actions: [...actions, {
          id: 'new_action', label: '새 액션', trigger: 'header', kind: 'open_form',
        }],
      })}
      onMove={(idx, dir) => onChange({ ...value, actions: moveInArray(actions, idx, dir) })}
      onRemove={(idx) => onChange({ ...value, actions: actions.filter((_, i) => i !== idx) })}
      renderRow={(a, idx) => (
        <div className="grid grid-cols-2 gap-2">
          <FieldInput label="id (고유 식별자)" value={a.id} mono
            onChange={(v) => update(idx, { ...a, id: v })} />
          <FieldInput label="label (버튼/툴팁)" value={a.label}
            onChange={(v) => update(idx, { ...a, label: v })} />

          <FieldSelect label="trigger" value={a.trigger} options={TRIGGER_OPTIONS}
            onChange={(v) => update(idx, { ...a, trigger: v as ActionTrigger })} />
          <FieldSelect label="kind" value={a.kind} options={KIND_OPTIONS}
            onChange={(v) => update(idx, { ...a, kind: v as ActionKind })} />

          <FieldSelect label="iconId" value={a.iconId ?? ''} allowEmpty options={ICON_OPTIONS}
            onChange={(v) => update(idx, { ...a, iconId: (v || undefined) as ActionIcon | undefined })} />
          <FieldSelect label="variant" value={a.variant ?? ''} allowEmpty options={VARIANT_OPTIONS}
            onChange={(v) => update(idx, { ...a, variant: (v || undefined) as ActionVariant | undefined })} />

          {/* kind별 보조 필드 */}
          {(a.kind === 'open_form' || a.kind === 'edit_form') && (
            <FieldSelect label="formId (registry.formComponents)" value={a.formId ?? ''}
              allowEmpty options={formOptions}
              onChange={(v) => update(idx, { ...a, formId: v || undefined })} />
          )}
          {a.kind === 'custom' && (
            <FieldSelect label="handlerId (registry.actionHandlers)" value={a.handlerId ?? ''}
              allowEmpty options={handlerOptions}
              onChange={(v) => update(idx, { ...a, handlerId: v || undefined })} />
          )}
          {a.kind === 'confirm_call' && (
            <>
              <FieldInput label="endpoint (URL, :id 치환됨)" value={a.endpoint ?? ''} mono
                onChange={(v) => update(idx, { ...a, endpoint: v || undefined })} />
              <FieldSelect label="method" value={a.method ?? ''} allowEmpty options={METHOD_OPTIONS}
                onChange={(v) => update(idx, {
                  ...a,
                  method: (v || undefined) as 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined,
                })} />
              <FieldInput label="idField (행에서 :id로 쓸 필드)" value={a.idField ?? ''} mono
                onChange={(v) => update(idx, { ...a, idField: v || undefined })} />
              <div className="col-span-2 space-y-1">
                <Label className="text-xs text-muted-foreground">
                  confirm 다이얼로그 (title / description / 버튼 라벨 / variant)
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <FieldInput label="confirm.title" value={a.confirm?.title ?? ''}
                    onChange={(v) => update(idx, {
                      ...a,
                      confirm: { ...a.confirm, title: v, description: a.confirm?.description ?? '' },
                    })} />
                  <FieldInput label="confirm.confirmLabel (예: '삭제')"
                    value={a.confirm?.confirmLabel ?? ''}
                    onChange={(v) => update(idx, {
                      ...a,
                      confirm: {
                        title: a.confirm?.title ?? '',
                        description: a.confirm?.description ?? '',
                        ...a.confirm,
                        confirmLabel: v || undefined,
                      },
                    })} />
                </div>
                <Textarea
                  className="font-mono text-xs"
                  rows={2}
                  placeholder='confirm.description — "{partner_name} 삭제하시겠습니까?" 형식 치환 가능'
                  value={a.confirm?.description ?? ''}
                  onChange={(e) => update(idx, {
                    ...a,
                    confirm: {
                      title: a.confirm?.title ?? '',
                      ...a.confirm,
                      description: e.target.value,
                    },
                  })}
                />
              </div>
            </>
          )}
        </div>
      )}
    />
  );
}
