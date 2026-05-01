// Phase 2 PoC: 메타데이터 기반 폼 컴포넌트
// FieldConfig 배열을 받아 react-hook-form + zod로 폼을 그린다.
// 단순 검증/레이아웃/select·visibleIf 까지만 처리. 복잡 검증·계산·외부 컴포넌트는 코드 폼에 남길 것.

import { useEffect, useMemo, useState } from 'react';
import { useForm, type FieldValues } from 'react-hook-form';
import { z, type ZodTypeAny, type ZodObject, type ZodRawShape } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';
import type { FieldConfig, MetaFormConfig } from './types';
import { enumDictionaries, masterSources } from './registry';

type Options = { value: string; label: string }[];

// 한국어 조사 분기 — 마지막 글자에 받침 있으면 첫번째, 없으면 두번째
function ko(label: string, withBatchim: string, noBatchim: string): string {
  const ch = label.charCodeAt(label.length - 1);
  const hasBatchim = ch >= 0xAC00 && ch <= 0xD7A3 && (ch - 0xAC00) % 28 !== 0;
  return hasBatchim ? withBatchim : noBatchim;
}

// ─── 필드 → Zod 스키마 ─────────────────────────────────────────────────────
function buildFieldSchema(field: FieldConfig): ZodTypeAny {
  const subj = `${field.label}${ko(field.label, '은', '는')}`;  // "거래처명은", "유형은", "이메일은"
  if (field.type === 'number') {
    let s: ZodTypeAny = z.coerce.number();
    if (field.minValue != null) s = (s as z.ZodNumber).min(field.minValue, `${subj} ${field.minValue} 이상이어야 합니다`);
    if (field.maxValue != null) s = (s as z.ZodNumber).max(field.maxValue, `${subj} ${field.maxValue} 이하여야 합니다`);
    if (!field.required) s = s.optional();
    return s;
  }
  if (field.type === 'switch') return z.boolean().optional();

  // text / select / textarea / date — 모두 string
  let s = z.string();
  if (field.minLength) s = s.min(field.minLength, `${subj} 최소 ${field.minLength}자 이상이어야 합니다`);
  if (field.maxLength) s = s.max(field.maxLength, `${subj} 최대 ${field.maxLength}자까지 입력 가능합니다`);
  if (field.pattern) s = s.regex(new RegExp(field.pattern.regex), field.pattern.message);
  if (field.required) {
    return s.min(1, `${subj} 필수입니다`);
  }
  return s.optional();
}

export function buildZodSchema(config: MetaFormConfig): ZodObject<ZodRawShape> {
  const shape: Record<string, ZodTypeAny> = {};
  config.sections.forEach((section) => {
    section.fields.forEach((f) => { shape[f.key] = buildFieldSchema(f); });
  });
  return z.object(shape as ZodRawShape);
}

// ─── 옵션 로드 (master 데이터는 비동기) ───────────────────────────────────
function useFieldOptions(fields: FieldConfig[]): Record<string, Options> {
  const [options, setOptions] = useState<Record<string, Options>>({});

  useEffect(() => {
    let cancelled = false;
    const next: Record<string, Options> = {};

    fields.forEach((f) => {
      if (f.type !== 'select') return;
      if (f.optionsFrom === 'enum' && f.enumKey) {
        const dict = enumDictionaries[f.enumKey];
        if (dict) next[f.key] = Object.entries(dict).map(([value, label]) => ({ value, label }));
      } else if (f.optionsFrom === 'static' && f.staticOptions) {
        next[f.key] = f.staticOptions;
      }
    });
    setOptions(next);

    fields.forEach(async (f) => {
      if (f.type === 'select' && f.optionsFrom === 'master' && f.masterKey) {
        const src = masterSources[f.masterKey];
        if (!src) return;
        const opts = await src.load();
        if (!cancelled) setOptions((prev) => ({ ...prev, [f.key]: opts }));
      }
    });

    return () => { cancelled = true; };
  }, [fields]);

  return options;
}

// ─── 기본값 빌드 (편집 시 editData → 폼 값) ───────────────────────────────
function buildDefaults(
  fields: FieldConfig[],
  editData?: Record<string, unknown> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  fields.forEach((f) => {
    const v = editData?.[f.key];
    if (v != null) out[f.key] = v;
    else if (f.defaultValue != null) out[f.key] = f.defaultValue;
    else if (f.type === 'switch') out[f.key] = false;
    else if (f.type === 'number') out[f.key] = undefined;
    else out[f.key] = '';
  });
  return out;
}

// 역할 기반 + 명시적 readOnly 결합
function isReadOnly(field: FieldConfig, role: string | null): boolean {
  if (field.readOnly) return true;
  if (field.editableByRoles && field.editableByRoles.length > 0) {
    return !role || !field.editableByRoles.includes(role);
  }
  return false;
}

// ─── 단일 필드 렌더 ────────────────────────────────────────────────────────
interface FieldRenderProps {
  field: FieldConfig;
  value: unknown;
  error?: { message?: string };
  options?: Options;
  setValue: (key: string, value: unknown) => void;
  register: ReturnType<typeof useForm>['register'];
  watchedValues: Record<string, unknown>;
  role: string | null;
}

function FieldRender({ field, value, error, options, setValue, register, watchedValues, role }: FieldRenderProps) {
  // 조건부 표시
  if (field.visibleIf) {
    const refValue = watchedValues[field.visibleIf.field];
    const expected = Array.isArray(field.visibleIf.value) ? field.visibleIf.value : [field.visibleIf.value];
    if (!expected.includes(refValue as string)) return null;
  }

  const readOnly = isReadOnly(field, role);
  const labelText = `${field.label}${field.required ? ' *' : ''}${readOnly && field.editableByRoles ? ' (읽기전용)' : ''}`;
  const errorMsg = error?.message;

  if (field.type === 'select') {
    const labelMap = Object.fromEntries((options ?? []).map((o) => [o.value, o.label]));
    const v = (value as string) ?? '';
    const display = labelMap[v] ?? '';
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <Select value={v} onValueChange={(next) => setValue(field.key, next ?? '')} disabled={readOnly}>
          <SelectTrigger>
            <span className={`flex flex-1 text-left truncate ${display ? '' : 'text-muted-foreground'}`} data-slot="select-value">
              {display || (field.placeholder ?? '선택')}
            </span>
          </SelectTrigger>
          <SelectContent>
            {(options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <Textarea {...register(field.key)} placeholder={field.placeholder} disabled={readOnly} />
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  if (field.type === 'switch') {
    return (
      <div className="flex items-center gap-2">
        <Switch checked={!!value} onCheckedChange={(c: boolean) => setValue(field.key, c)} disabled={readOnly} />
        <Label>{labelText}</Label>
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  // text / number / date
  return (
    <div className="space-y-1.5">
      <Label>{labelText}</Label>
      <Input
        {...register(field.key)}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        placeholder={field.placeholder}
        readOnly={readOnly}
      />
      {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
    </div>
  );
}

// ─── MetaForm — 다이얼로그 + 폼 ────────────────────────────────────────────
interface MetaFormProps {
  config: MetaFormConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: unknown;
}

export default function MetaForm({ config, open, onOpenChange, onSubmit, editData }: MetaFormProps) {
  const allFields = useMemo(() => config.sections.flatMap((s) => s.fields), [config]);
  const schema = useMemo(() => buildZodSchema(config), [config]);
  const fieldOptions = useFieldOptions(allFields);
  const { role } = usePermission();

  const {
    register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting },
  } = useForm<FieldValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (open) reset(buildDefaults(allFields, editData as Record<string, unknown> | null | undefined));
  }, [open, editData, reset, allFields]);

  const watchedValues = watch();
  const isEdit = !!editData;
  const handle = async (data: FieldValues) => {
    await onSubmit(data as Record<string, unknown>);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? config.title.edit : config.title.create}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          {config.sections.map((sec, idx) => {
            const colsClass = sec.cols === 2 ? 'grid grid-cols-2 gap-3'
                            : sec.cols === 3 ? 'grid grid-cols-3 gap-3'
                            : 'space-y-3';
            return (
              <div key={idx} className={colsClass}>
                {sec.fields.map((f) => (
                  <FieldRender
                    key={f.key}
                    field={f}
                    value={watchedValues[f.key]}
                    error={errors[f.key] as { message?: string } | undefined}
                    options={fieldOptions[f.key]}
                    setValue={(k, v) => setValue(k, v as never)}
                    register={register}
                    watchedValues={watchedValues}
                    role={role}
                  />
                ))}
              </div>
            );
          })}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
