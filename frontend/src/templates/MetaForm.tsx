// Phase 2 PoC: 메타데이터 기반 폼 컴포넌트
// FieldConfig 배열을 받아 react-hook-form + zod로 폼을 그린다.
// 단순 검증/레이아웃/select·visibleIf 까지만 처리. 복잡 검증·계산·외부 컴포넌트는 코드 폼에 남길 것.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useResolvedConfig } from './configOverride';
import { useForm, useFieldArray, type Control, type FieldValues } from 'react-hook-form';
import { z, type ZodTypeAny, type ZodObject, type ZodRawShape } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { usePermission } from '@/hooks/usePermission';
import type { FieldConfig, MasterOptionSource, MetaFormConfig } from './types';
import { GhostInput } from '@/components/forms/GhostInput';
import {
  applyFormatter, computedFormulas, enumDictionaries, formRefinements, formContentBlocks, fieldCascades, masterSources,
} from './registry';
import { useAppStore } from '@/stores/appStore';

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

  if (field.type === 'multiselect') {
    const arr = z.array(z.string());
    return field.required ? arr.min(1, `${subj} 1개 이상 선택해야 합니다`) : arr.optional();
  }

  if (field.type === 'file') {
    // File 객체 또는 File[] (multiple) 또는 null/[].
    // multiple=true 시 required 는 length>=1.
    if (field.multiple) {
      return field.required
        ? z.array(z.any()).refine((v) => Array.isArray(v) && v.length > 0 && v.every((f) => f instanceof File),
            { message: `${subj} 1개 이상 파일을 선택해야 합니다` })
        : z.any().optional();
    }
    return field.required
      ? z.any().refine((v) => v instanceof File, { message: `${subj} 파일을 선택해야 합니다` })
      : z.any().optional();
  }

  // computed — 사용자 입력 없음, validation skip
  if (field.type === 'computed') return z.any().optional();

  // currency_amount — { currency: string; amount: number }
  if (field.type === 'currency_amount') {
    const obj = z.object({ currency: z.string(), amount: z.coerce.number() });
    if (field.required) {
      return obj.refine(
        (v) => v.currency.trim() !== '' && Number.isFinite(v.amount) && v.amount > 0,
        { message: `${subj} 통화/금액을 모두 입력해야 합니다` },
      );
    }
    return obj.optional();
  }

  // address — { postcode: string; road: string; detail: string }
  if (field.type === 'address') {
    const obj = z.object({ postcode: z.string(), road: z.string(), detail: z.string() });
    if (field.required) {
      return obj.refine(
        (v) => v.postcode.trim() !== '' && v.road.trim() !== '',
        { message: `${subj} 우편번호와 도로명을 입력해야 합니다` },
      );
    }
    return obj.optional();
  }

  // rich_text — 단순 string. 향후 서식 검증 추가 가능.
  if (field.type === 'rich_text') {
    let s = z.string();
    if (field.minLength) s = s.min(field.minLength, `${subj} 최소 ${field.minLength}자 이상이어야 합니다`);
    if (field.maxLength) s = s.max(field.maxLength, `${subj} 최대 ${field.maxLength}자까지 입력 가능합니다`);
    return field.required ? s.min(1, `${subj} 필수입니다`) : s.optional();
  }

  // date_range — { start: string; end: string }, 빈 값은 '' 허용. required 시 둘 다 필요 + start <= end.
  if (field.type === 'date_range') {
    const obj = z.object({ start: z.string(), end: z.string() });
    if (field.required) {
      return obj.refine(
        (v) => v.start.trim() !== '' && v.end.trim() !== '',
        { message: `${subj} 시작과 종료 날짜를 모두 입력해야 합니다` },
      ).refine(
        (v) => !v.start || !v.end || v.start <= v.end,
        { message: `${subj} 종료 날짜는 시작 이후여야 합니다`, path: ['end'] },
      );
    }
    return obj.optional().refine(
      (v) => !v || !v.start || !v.end || v.start <= v.end,
      { message: `${subj} 종료 날짜는 시작 이후여야 합니다`, path: ['end'] },
    );
  }

  // child_array — 자식 행 배열, 각 행은 childFields 의 zod object
  if (field.type === 'child_array') {
    const shape: Record<string, ZodTypeAny> = {};
    (field.childFields ?? []).forEach((cf) => { shape[cf.key] = buildFieldSchema(cf); });
    let arr: ZodTypeAny = z.array(z.object(shape as ZodRawShape));
    if (field.minItems != null) arr = (arr as z.ZodArray<ZodTypeAny>).min(field.minItems, `${subj} 최소 ${field.minItems}개 이상이어야 합니다`);
    if (field.maxItems != null) arr = (arr as z.ZodArray<ZodTypeAny>).max(field.maxItems, `${subj} 최대 ${field.maxItems}개까지 가능합니다`);
    if (!field.required) arr = arr.optional();
    return arr;
  }

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

export function buildZodSchema(config: MetaFormConfig): ZodTypeAny {
  const shape: Record<string, ZodTypeAny> = {};
  config.sections.forEach((section) => {
    section.fields.forEach((f) => { shape[f.key] = buildFieldSchema(f); });
  });
  let schema: ZodTypeAny = z.object(shape as ZodRawShape);
  // Phase 4 보강 Tier 3: form-level cross-field refinement
  if (config.refine && config.refine.length > 0) {
    schema = (schema as ZodObject<ZodRawShape>).superRefine((values, ctx) => {
      config.refine!.forEach((rule) => {
        const fn = formRefinements[rule.ruleId];
        if (!fn) return;
        if (!fn(values as Record<string, unknown>)) {
          ctx.addIssue({
            code: 'custom',
            message: rule.message,
            path: rule.path ?? [],
          });
        }
      });
    });
  }
  return schema;
}

// ─── 옵션 로드 (master 데이터는 비동기) ───────────────────────────────────
// watchedValues 를 받아 optionsDependsOn 변경 시 master 소스를 재로드한다.
// 의존성 필드 값들의 직렬화를 effect dep 로 사용 — 동일 값이면 재실행 없음.
function useFieldOptions(fields: FieldConfig[], watchedValues: Record<string, unknown>): Record<string, Options> {
  const [options, setOptions] = useState<Record<string, Options>>({});

  // 정적/enum 옵션 — staticOptionsIf 가 있으면 의존 필드 값에 따라 분기
  // staticDepKey: staticOptionsIf 의 모든 의존 필드 값 직렬화
  const staticDepKey = useMemo(() => {
    const parts: string[] = [];
    fields.forEach((f) => {
      if (!f.staticOptionsIf) return;
      parts.push(`${f.key}:${f.staticOptionsIf.field}=${String(watchedValues[f.staticOptionsIf.field] ?? '')}`);
    });
    return parts.join('|');
  }, [fields, watchedValues]);

  useEffect(() => {
    const next: Record<string, Options> = {};
    fields.forEach((f) => {
      if (f.type !== 'select' && f.type !== 'multiselect') return;
      // 1순위: staticOptionsIf — 의존 필드 값 매칭되는 case 의 options
      if (f.staticOptionsIf) {
        const refValue = String(watchedValues[f.staticOptionsIf.field] ?? '');
        const matched = f.staticOptionsIf.cases.find((c) => {
          const expected = Array.isArray(c.value) ? c.value : [c.value];
          return expected.includes(refValue);
        });
        if (matched) { next[f.key] = matched.options; return; }
        if (f.staticOptionsIf.fallback) { next[f.key] = f.staticOptionsIf.fallback; return; }
        // 매칭 실패 + fallback 없음 → staticOptions 로 폴백 또는 빈 배열
      }
      if (f.optionsFrom === 'enum' && f.enumKey) {
        const dict = enumDictionaries[f.enumKey];
        if (dict) next[f.key] = Object.entries(dict).map(([value, label]) => ({ value, label }));
      } else if (f.optionsFrom === 'static' && f.staticOptions) {
        next[f.key] = f.staticOptions;
      } else if (f.staticOptions) {
        // multiselect 또는 staticOptionsIf 매칭 실패 시 staticOptions 폴백
        next[f.key] = f.staticOptions;
      }
    });
    setOptions((prev) => ({ ...prev, ...next }));
    // staticDepKey 가 staticOptionsIf 의존 필드 값을 포함 — 변경 시 재계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, staticDepKey]);

  // master 옵션 — 의존 필드 값 변경 시 재로드. 의존성이 없으면 mount 시 1회만.
  // depKey: 의존 필드 값들의 직렬화 — useEffect dep 로 안정적으로 비교
  const depKey = useMemo(() => {
    const parts: string[] = [];
    fields.forEach((f) => {
      if (f.type !== 'select' || f.optionsFrom !== 'master' || !f.masterKey) return;
      const ctx = (f.optionsDependsOn ?? []).map((k) => `${k}=${String(watchedValues[k] ?? '')}`).join('|');
      parts.push(`${f.key}:${f.masterKey}@${ctx}`);
    });
    return parts.join(';');
  }, [fields, watchedValues]);

  useEffect(() => {
    let cancelled = false;
    fields.forEach(async (f) => {
      if (f.type !== 'select' || f.optionsFrom !== 'master' || !f.masterKey) return;
      const src = masterSources[f.masterKey];
      if (!src) return;
      const ctx: Record<string, unknown> = {};
      (f.optionsDependsOn ?? []).forEach((k) => { ctx[k] = watchedValues[k]; });
      const opts = await src.load(ctx);
      if (!cancelled) setOptions((prev) => ({ ...prev, [f.key]: opts }));
    });
    return () => { cancelled = true; };
    // depKey 가 의존 필드 값 직렬화를 포함 — eslint-disable 으로 watchedValues 직접 의존 회피
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, depKey]);

  return options;
}

// Phase 4 보강: 특수 기본값 해석 — '@today', '@now' 등을 실제 값으로 치환
// 일반 string/number/boolean 은 그대로. ReceiptForm 의 receipt_date='@today' 같은 패턴.
function resolveSpecialDefault(v: unknown): unknown {
  if (typeof v !== 'string' || !v.startsWith('@')) return v;
  if (v === '@today') return new Date().toISOString().slice(0, 10);
  // @now: datetime-local 입력 호환 형식 'YYYY-MM-DDTHH:MM' (T 포함, 초/타임존 제외)
  if (v === '@now') {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return v;
}

// Phase 4 보강 Tier 3: 초안 자동 저장 (localStorage)
// File 객체는 직렬화 불가 → 저장 시 제외, 복구 시 빈 값 유지.
const DRAFT_PREFIX = 'sf.formdraft.';
function loadDraft(scopeId: string): Record<string, unknown> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + scopeId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveDraft(scopeId: string, values: Record<string, unknown>): void {
  if (typeof localStorage === 'undefined') return;
  // File / File[] 직렬화 불가 — 제외
  const safe: Record<string, unknown> = {};
  Object.entries(values).forEach(([k, v]) => {
    if (v instanceof File) return;
    if (Array.isArray(v) && v.some((x) => x instanceof File)) return;
    safe[k] = v;
  });
  try { localStorage.setItem(DRAFT_PREFIX + scopeId, JSON.stringify(safe)); } catch { /* quota */ }
}
function clearDraft(scopeId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(DRAFT_PREFIX + scopeId);
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
    else if (f.defaultValue != null) out[f.key] = resolveSpecialDefault(f.defaultValue);
    else if (f.type === 'switch') out[f.key] = false;
    else if (f.type === 'multiselect') out[f.key] = [];
    else if (f.type === 'file') out[f.key] = f.multiple ? [] : null;
    else if (f.type === 'computed') out[f.key] = undefined;
    else if (f.type === 'number') out[f.key] = undefined;
    else if (f.type === 'date_range') out[f.key] = { start: '', end: '' };
    else if (f.type === 'currency_amount') out[f.key] = { currency: 'USD', amount: 0 };
    else if (f.type === 'address') out[f.key] = { postcode: '', road: '', detail: '' };
    else if (f.type === 'child_array') out[f.key] = [];
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

// ─── optionsDependsOn 컨텍스트 수집 ───────────────────────────────────────
function collectContext(field: FieldConfig, watchedValues: Record<string, unknown>): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  (field.optionsDependsOn ?? []).forEach((k) => { ctx[k] = watchedValues[k]; });
  return ctx;
}

// ─── 서버 검색 combobox (대용량 옵션) ─────────────────────────────────────
// masterSource.search 가 정의된 select 필드에서 사용. 디바운스(300ms) 후 호출.
// 편집 모드 prefill: resolveLabel(value) 또는 load() 결과에서 label 폴백.
interface MetaComboboxProps {
  labelText: string;
  value: string;
  onChange: (next: string) => void;
  source: MasterOptionSource;
  context: Record<string, unknown>;
  fallbackOptions: Options;
  readOnly: boolean;
  errorMsg?: string;
  placeholder?: string;
}

function MetaCombobox({
  labelText, value, onChange, source, context, fallbackOptions, readOnly, errorMsg, placeholder,
}: MetaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Options>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedLabel, setResolvedLabel] = useState<string>('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 의존성 컨텍스트 직렬화 (재호출 트리거)
  const ctxKey = useMemo(() => JSON.stringify(context), [context]);

  // 편집 모드 prefill — value 가 있는데 라벨 미해석 시 resolveLabel 호출
  useEffect(() => {
    if (!value) { setResolvedLabel(''); return; }
    let cancelled = false;
    (async () => {
      // 1순위: resolveLabel
      if (source.resolveLabel) {
        const l = await source.resolveLabel(value, context);
        if (!cancelled && l) { setResolvedLabel(l); return; }
      }
      // 2순위: fallback (이미 가진 옵션 매핑)
      const inFallback = fallbackOptions.find((o) => o.value === value);
      if (!cancelled && inFallback) { setResolvedLabel(inFallback.label); return; }
      // 3순위: load() 호출 후 매칭
      try {
        const all = await source.load(context);
        if (cancelled) return;
        const found = all.find((o) => o.value === value);
        setResolvedLabel(found?.label ?? value);
      } catch { if (!cancelled) setResolvedLabel(value); }
    })();
    return () => { cancelled = true; };
    // value 와 ctxKey 변경 시만 재실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ctxKey]);

  // 검색 — 디바운스 300ms
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const list = await source.search!(query, context);
        if (!cancelled) setResults(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, ctxKey]);

  // 외부 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const display = resolvedLabel || (value ? value : '');

  return (
    <div className="space-y-1.5" ref={wrapperRef}>
      <Label>{labelText}</Label>
      <div className="relative">
        <button
          type="button"
          onClick={() => !readOnly && setOpen((o) => !o)}
          disabled={readOnly}
          data-slot="select-trigger"
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={`flex-1 text-left truncate ${display ? '' : 'text-muted-foreground'}`} data-slot="select-value">
            {display || (placeholder ?? '검색하여 선택')}
          </span>
          <span className="text-xs text-muted-foreground ml-2">▼</span>
        </button>
        {open && !readOnly && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md">
            <div className="p-2 border-b border-input">
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="검색어 입력…"
                className="h-8 text-sm"
              />
            </div>
            <div className="max-h-64 overflow-auto py-1">
              {loading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">검색 중…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{query ? '결과 없음' : '검색어를 입력하세요'}</p>
              ) : (
                results.map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => { onChange(o.value); setResolvedLabel(o.label); setOpen(false); setQuery(''); }}
                    className={`flex w-full items-center px-3 py-1.5 text-sm text-left hover:bg-accent ${o.value === value ? 'bg-accent/50 font-medium' : ''}`}
                  >
                    {o.label}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
    </div>
  );
}

// ─── Phase 4 보강: 천단위 콤마 등 숫자 포맷 입력 ────────────────────────────
// 표시값은 콤마 포함 ("1,000,000"), form 값은 number. KRW/USD 접두/접미사 지원.
function formatNumberWithFormat(value: unknown, format: string | undefined): string {
  if (value == null || value === '') return '';
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '';
  const commas = num.toLocaleString('ko-KR');
  if (format === 'krw') return `${commas}원`;
  if (format === 'usd') return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return commas; // 'thousands'
}

interface MetaNumberFmtInputProps {
  field: FieldConfig;
  value: unknown;
  onChange: (n: number | undefined) => void;
  readOnly: boolean;
}

function MetaNumberFmtInput({ field, value, onChange, readOnly }: MetaNumberFmtInputProps) {
  const [display, setDisplay] = useState<string>(() => formatNumberWithFormat(value, field.numberFormat));

  // 외부 value 가 바뀌면 (예: defaultValue, computed reset) display 도 동기화
  useEffect(() => {
    setDisplay(formatNumberWithFormat(value, field.numberFormat));
  }, [value, field.numberFormat]);

  const handleChange = (raw: string) => {
    // 숫자/소수점만 추출 (USD 면 소수점 허용)
    const allowDecimal = field.numberFormat === 'usd';
    const stripped = raw.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
    if (stripped === '') {
      setDisplay('');
      onChange(undefined);
      return;
    }
    const n = allowDecimal ? parseFloat(stripped) : parseInt(stripped, 10);
    if (!Number.isFinite(n)) return;
    setDisplay(formatNumberWithFormat(n, field.numberFormat));
    onChange(n);
  };

  return (
    <Input
      type="text"
      inputMode={field.numberFormat === 'usd' ? 'decimal' : 'numeric'}
      value={display}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={field.placeholder}
      readOnly={readOnly}
    />
  );
}

// Phase 4 보강: visibleIf / readOnlyIf 공통 평가 — source 'field' (default) | 'context'
function evalCondition(
  cond: { field: string; value: string | string[]; source?: 'field' | 'context' } | undefined,
  watchedValues: Record<string, unknown>,
  extraContext: Record<string, unknown> | undefined,
): boolean {
  if (!cond) return false;
  const ref = cond.source === 'context'
    ? (extraContext?.[cond.field])
    : watchedValues[cond.field];
  const expected = Array.isArray(cond.value) ? cond.value : [cond.value];
  return expected.includes(String(ref));
}

// ─── 자식 배열 필드 (child_array) ─────────────────────────────────────────
// useFieldArray 사용 — 행 별 fields 가 리얼타임 register/validate.
// MVP: text/number/select/date/textarea/switch 만 지원. computed/file 은 Step 3 follow-up.
function ChildArrayField({
  field, control, register, watchedValues,
}: {
  field: FieldConfig;
  control: Control<FieldValues>;
  register: ReturnType<typeof useForm>['register'];
  watchedValues: Record<string, unknown>;
}) {
  const arrayName = field.key;
  const { fields: rows, append, remove } = useFieldArray({ control, name: arrayName });
  const childFields = field.childFields ?? [];
  const cols = field.childCols ?? Math.min(childFields.length, 4);
  const colsClass = cols === 2 ? 'grid grid-cols-2 gap-2'
                  : cols === 3 ? 'grid grid-cols-3 gap-2'
                  : cols === 4 ? 'grid grid-cols-4 gap-2'
                  : 'space-y-2';

  const addRow = () => {
    const initial: Record<string, unknown> = {};
    childFields.forEach((cf) => {
      initial[cf.key] = cf.defaultValue ?? (cf.type === 'switch' ? false
        : cf.type === 'multiselect' ? []
        : cf.type === 'number' ? 0
        : '');
    });
    append(initial);
  };

  return (
    <div className="space-y-2 rounded border border-input bg-background/50 p-2">
      {rows.length === 0 && (
        <p className="text-center text-[11px] text-muted-foreground py-2">행이 없습니다 — "{field.addLabel ?? '+ 추가'}" 클릭해서 추가하세요</p>
      )}
      {rows.map((row, idx) => (
        <div key={row.id} className="flex items-start gap-2 rounded border bg-card p-2">
          <span className="text-[10px] text-muted-foreground font-mono pt-1.5 shrink-0">#{idx + 1}</span>
          <div className={`flex-1 ${colsClass}`}>
            {childFields.map((cf) => {
              // 조건부 visible — 같은 행 내 다른 필드 값 기반
              if (cf.visibleIf) {
                // FIXME: 행별 visibleIf 평가 — watchedValues 의 array 인덱스 접근 필요
                // 우선 글로벌 visibleIf 만 (행 인덱스 무시). 향후 행 컨텍스트 분리.
                if (!evalCondition(cf.visibleIf, watchedValues)) return null;
              }
              return (
                <ChildFieldInput
                  key={cf.key}
                  field={cf}
                  fullName={`${arrayName}.${idx}.${cf.key}`}
                  register={register}
                />
              );
            })}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => remove(idx)}
            title="삭제"
          >
            ×
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
        {field.addLabel ?? '+ 추가'}
      </Button>
    </div>
  );
}

function ChildFieldInput({
  field, fullName, register,
}: {
  field: FieldConfig;
  fullName: string;
  register: ReturnType<typeof useForm>['register'];
}) {
  const placeholder = field.placeholder;
  if (field.type === 'select') {
    // 정적 옵션만 MVP — enum/master 는 follow-up (registry 호출 + watchedValues 종속)
    const opts = field.staticOptions ?? [];
    return (
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
        <select
          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
          {...register(fullName)}
        >
          <option value="">— 선택 —</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  if (field.type === 'number') {
    return (
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
        <Input type="number" placeholder={placeholder}
          className="h-8 text-xs text-right tabular-nums"
          {...register(fullName, { valueAsNumber: true })} />
      </div>
    );
  }
  if (field.type === 'textarea') {
    return (
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
        <textarea placeholder={placeholder}
          className="min-h-[40px] w-full rounded border border-input bg-background px-2 py-1 text-xs"
          {...register(fullName)} />
      </div>
    );
  }
  if (field.type === 'switch') {
    return (
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
        <input type="checkbox" className="h-4 w-4" {...register(fullName)} />
      </div>
    );
  }
  if (field.type === 'date') {
    return (
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
        <Input type="date" className="h-8 text-xs" {...register(fullName)} />
      </div>
    );
  }
  // text 기본 (다른 타입은 MVP 에서 미지원 — child 행에서 file/computed 등은 드뭄)
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
      <Input placeholder={placeholder} className="h-8 text-xs" {...register(fullName)} />
    </div>
  );
}

// ─── 단일 필드 렌더 ────────────────────────────────────────────────────────
interface FieldRenderProps {
  field: FieldConfig;
  value: unknown;
  error?: { message?: string };
  options?: Options;
  setValue: (key: string, value: unknown) => void;
  register: ReturnType<typeof useForm>['register'];
  watch: ReturnType<typeof useForm>['watch']; // GhostInput 자동완성 — fetch 시점 최신값 조회
  watchedValues: Record<string, unknown>;
  role: string | null;
  extraContext?: Record<string, unknown>;
  formId?: string; // GhostInput backend prompt 에 form 식별자 첨부
  control?: Control<FieldValues>; // child_array 가 useFieldArray 호출 시 사용
}

function FieldRender({ field, value, error, options, setValue, register, watch, watchedValues, role, extraContext, formId, control }: FieldRenderProps) {
  // 조건부 표시 — visibleIf 평가 (source='field' 기본 / 'context' 옵션)
  if (field.visibleIf) {
    if (!evalCondition(field.visibleIf, watchedValues, extraContext)) return null;
  }

  // Phase 4 보강: readOnlyIf — 조건부 readonly (editableByRoles 와 합산)
  const conditionalReadOnly = field.readOnlyIf
    ? evalCondition(field.readOnlyIf, watchedValues, extraContext)
    : false;
  const readOnly = isReadOnly(field, role) || conditionalReadOnly;
  const labelText = `${field.label}${field.required ? ' *' : ''}${readOnly && (field.editableByRoles || field.readOnlyIf) ? ' (읽기전용)' : ''}`;
  const errorMsg = error?.message;

  if (field.type === 'select') {
    // Phase 4 보강: master 소스에 search() 가 있으면 combobox 모드 (서버 검색 + 디바운스)
    const masterSrc = field.optionsFrom === 'master' && field.masterKey ? masterSources[field.masterKey] : null;
    if (masterSrc?.search) {
      return (
        <MetaCombobox
          labelText={labelText}
          value={(value as string) ?? ''}
          onChange={(next) => setValue(field.key, next ?? '')}
          source={masterSrc}
          context={collectContext(field, watchedValues)}
          fallbackOptions={options ?? []}
          readOnly={readOnly}
          errorMsg={errorMsg}
          placeholder={field.placeholder}
        />
      );
    }
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
        {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <GhostInput
          fieldKey={field.key}
          fieldLabel={field.label}
          multiline
          placeholder={field.placeholder}
          disabled={readOnly}
          formId={formId}
          maxLength={field.maxLength}
          register={register}
          watch={watch}
          setValue={setValue as never}
        />
        {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
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

  if (field.type === 'multiselect') {
    // 체크박스 리스트 — 단순·접근성 우선. 값은 string[].
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (optValue: string) => {
      if (readOnly) return;
      const next = arr.includes(optValue) ? arr.filter((x) => x !== optValue) : [...arr, optValue];
      setValue(field.key, next);
    };
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <div className="rounded-md border border-input p-2 space-y-1.5">
          {(options ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">{field.placeholder ?? '선택지가 없습니다'}</p>
          ) : (
            (options ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={arr.includes(o.value)}
                  onChange={() => toggle(o.value)}
                  disabled={readOnly}
                  className="h-3.5 w-3.5"
                />
                <span>{o.label}</span>
              </label>
            ))
          )}
        </div>
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  if (field.type === 'file') {
    // Phase 4 보강 Tier 3: multiple=true 시 File[] 처리
    const multiple = !!field.multiple;
    const files: File[] = multiple
      ? (Array.isArray(value) ? (value as File[]) : [])
      : (value instanceof File ? [value as File] : []);
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <input
          type="file"
          multiple={multiple}
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            setValue(field.key, multiple ? list : (list[0] ?? null));
          }}
          disabled={readOnly}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
        />
        {files.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>{f.name} · {(f.size / 1024).toFixed(1)} KB</li>
            ))}
          </ul>
        )}
        {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  if (field.type === 'computed') {
    // Phase 4 보강: 계산 필드 — 다른 필드 값에서 자동 계산. readonly 표시.
    const display = value == null || value === ''
      ? ''
      : (field.formatter ? applyFormatter(field.formatter, value) : String(value));
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <Input value={display} readOnly className="bg-muted" placeholder="자동 계산" />
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  // currency_amount — { currency, amount } 통화 select + 금액 input
  if (field.type === 'currency_amount') {
    const v = (value ?? { currency: 'USD', amount: 0 }) as { currency?: string; amount?: number };
    const opts = field.currencyOptions ?? [
      { value: 'USD', label: 'USD' },
      { value: 'KRW', label: 'KRW' },
    ];
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <div className="flex items-center gap-2">
          <select disabled={readOnly} value={v.currency ?? 'USD'}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
            onChange={(e) => setValue(field.key, { currency: e.target.value, amount: v.amount ?? 0 })}>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="number" disabled={readOnly} value={v.amount ?? ''}
            className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs text-right tabular-nums"
            placeholder="0"
            onChange={(e) => setValue(field.key, { currency: v.currency ?? 'USD', amount: e.target.value ? Number(e.target.value) : 0 })} />
        </div>
        {field.description ? <p className="text-[10px] text-muted-foreground">{field.description}</p> : null}
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  // address — { postcode, road, detail }, Daum/Kakao postcode 연동은 외부 컴포넌트 (Phase 5)
  if (field.type === 'address') {
    const v = (value ?? { postcode: '', road: '', detail: '' }) as { postcode?: string; road?: string; detail?: string };
    const update = (next: Partial<{ postcode: string; road: string; detail: string }>) => {
      setValue(field.key, {
        postcode: next.postcode ?? v.postcode ?? '',
        road: next.road ?? v.road ?? '',
        detail: next.detail ?? v.detail ?? '',
      });
    };
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <div className="flex items-center gap-2">
          <input type="text" disabled={readOnly} value={v.postcode ?? ''}
            className="h-8 w-24 rounded border border-input bg-background px-2 text-xs font-mono"
            placeholder="우편번호"
            onChange={(e) => update({ postcode: e.target.value })} />
          <input type="text" disabled={readOnly} value={v.road ?? ''}
            className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs"
            placeholder="도로명 주소"
            onChange={(e) => update({ road: e.target.value })} />
        </div>
        <input type="text" disabled={readOnly} value={v.detail ?? ''}
          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
          placeholder="상세 주소 (동/호수)"
          onChange={(e) => update({ detail: e.target.value })} />
        {field.description ? <p className="text-[10px] text-muted-foreground">{field.description}</p> : null}
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  // rich_text — 간단 textarea + 미리보기 토글 (마크다운 렌더는 Phase 5 follow-up)
  if (field.type === 'rich_text') {
    const txt = (value ?? '') as string;
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <textarea disabled={readOnly} value={txt}
          className="min-h-[100px] w-full rounded border border-input bg-background px-2 py-1 text-xs"
          placeholder={field.placeholder ?? '내용 입력 (마크다운 가능)'}
          onChange={(e) => setValue(field.key, e.target.value)} />
        {field.description ? <p className="text-[10px] text-muted-foreground">{field.description}</p> : null}
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  // date_range — { start, end } 객체 값. 두 input 나란히.
  if (field.type === 'date_range') {
    const v = (value ?? { start: '', end: '' }) as { start?: string; end?: string };
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <div className="flex items-center gap-2">
          <input type="date" value={v.start ?? ''} disabled={readOnly}
            className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs"
            onChange={(e) => setValue(field.key, { start: e.target.value, end: v.end ?? '' })} />
          <span className="text-xs text-muted-foreground">~</span>
          <input type="date" value={v.end ?? ''} disabled={readOnly}
            className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs"
            onChange={(e) => setValue(field.key, { start: v.start ?? '', end: e.target.value })} />
        </div>
        {field.description ? <p className="text-[10px] text-muted-foreground">{field.description}</p> : null}
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  // child_array — 자식 행 배열 (useFieldArray 사용)
  if (field.type === 'child_array') {
    if (!control) {
      console.warn(`[MetaForm] child_array '${field.key}': control prop required`);
      return null;
    }
    return (
      <div className="col-span-full space-y-1.5">
        <Label>{labelText}</Label>
        <ChildArrayField
          field={field}
          control={control}
          register={register}
          watchedValues={watchedValues}
        />
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  // text / number / date
  // Phase 4 보강: number 타입에 numberFormat 이 지정되면 콤마 입력 사용
  // text 필드는 GhostInput 으로 분기 (자동완성). number/date/datetime/time 은 기존 Input.
  if (field.type === 'text') {
    return (
      <div className="space-y-1.5">
        <Label>{labelText}</Label>
        <GhostInput
          fieldKey={field.key}
          fieldLabel={field.label}
          placeholder={field.placeholder}
          disabled={readOnly}
          formId={formId}
          maxLength={field.maxLength}
          register={register}
          watch={watch}
          setValue={setValue as never}
        />
        {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
        {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : null}
      </div>
    );
  }

  const useFmtNumber = field.type === 'number' && field.numberFormat && field.numberFormat !== 'plain';
  return (
    <div className="space-y-1.5">
      <Label>{labelText}</Label>
      {useFmtNumber ? (
        <MetaNumberFmtInput
          field={field}
          value={value}
          onChange={(n) => setValue(field.key, n as never)}
          readOnly={readOnly}
        />
      ) : (
        <Input
          {...register(field.key)}
          type={
            field.type === 'number' ? 'number'
            : field.type === 'date' ? 'date'
            : field.type === 'datetime' ? 'datetime-local'
            : field.type === 'time' ? 'time'
            : 'text'
          }
          placeholder={field.placeholder}
          readOnly={readOnly}
        />
      )}
      {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
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
  // Phase 4 보강: 외부 컨텍스트 — extraPayload.fromContext 매핑에 사용
  extraContext?: Record<string, unknown>;
}

// dialogSize → max-w-* 매핑 (sm: 접두사 — 기본 Dialog 의 sm:max-w-sm 을 덮어씀)
const DIALOG_SIZE_CLASS: Record<string, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
};

// Phase 4 보강: 섹션 제목 색상 (Tone → tailwind text-* 매핑)
const TONE_TEXT_CLASS: Record<string, string> = {
  solar: 'text-orange-600',
  ink: 'text-slate-700',
  info: 'text-blue-600',
  warn: 'text-amber-600',
  pos: 'text-green-600',
};

// extraPayload + computedFields 적용 후 최종 payload 생성
function buildPayload(
  data: FieldValues,
  config: MetaFormConfig,
  allFields: FieldConfig[],
  extraContext?: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...data };

  // 1. computed 필드 — formula 실행해 payload 에 포함
  allFields.forEach((f) => {
    if (f.type !== 'computed' || !f.formula) return;
    const fn = computedFormulas[f.formula.computerId];
    if (!fn) return;
    payload[f.key] = fn(payload, extraContext);
  });

  // 2. extraPayload — static / fromContext / fromStore 병합
  const ep = config.extraPayload;
  if (ep?.static) Object.assign(payload, ep.static);
  if (ep?.fromContext && extraContext) {
    ep.fromContext.forEach((k) => {
      if (extraContext[k] !== undefined) payload[k] = extraContext[k];
    });
  }
  if (ep?.fromStore) {
    const state = useAppStore.getState() as unknown as Record<string, unknown>;
    Object.entries(ep.fromStore).forEach(([dst, src]) => {
      if (state[src] !== undefined) payload[dst] = state[src];
    });
  }

  return payload;
}

export default function MetaForm({ config: defaultConfig, open, onOpenChange, onSubmit, editData, extraContext }: MetaFormProps) {
  // Phase 3: localStorage override 우선, 없으면 defaultConfig
  const config = useResolvedConfig(defaultConfig, 'form');
  const allFields = useMemo(() => config.sections.flatMap((s) => s.fields), [config]);
  const schema = useMemo(() => buildZodSchema(config), [config]);
  const { role } = usePermission();

  const {
    register, handleSubmit, reset, setValue, watch, trigger, control, formState: { errors, isSubmitting },
  } = useForm<FieldValues>({
    // schema 는 ZodObject 또는 ZodEffects (superRefine 적용 시) — 둘 다 zodResolver 호환
    resolver: zodResolver(schema as never),
  });

  // Phase 4 보강 Tier 3: draftAutoSave 복구 — 신규 모드에만 (editData 없을 때)
  // 마운트 시 한 번 — open + 신규 + draft 가 있으면 draft 우선
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (!open) { setDraftRestored(false); return; }
    const useDraft = config.draftAutoSave && !editData;
    const draft = useDraft ? loadDraft(config.id) : null;
    if (draft) {
      reset({ ...buildDefaults(allFields, null), ...draft });
      setDraftRestored(true);
    } else {
      reset(buildDefaults(allFields, editData as Record<string, unknown> | null | undefined));
      setDraftRestored(false);
    }
  }, [open, editData, reset, allFields, config.id, config.draftAutoSave]);

  const watchedValues = watch();

  // Phase 4 보강 Tier 3: draftAutoSave — 변경 500ms 후 localStorage 저장
  useEffect(() => {
    if (!config.draftAutoSave || !open || editData) return;
    const t = setTimeout(() => saveDraft(config.id, watchedValues), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedValues), config.draftAutoSave, open, !!editData, config.id]);
  // optionsDependsOn 지원 — watchedValues 가 master 소스 호출 context 로 전달됨
  const fieldOptions = useFieldOptions(allFields, watchedValues);

  // Phase 4 보강: computed 필드 라이브 재계산 — dependsOn 값 변화 시 setValue 로 갱신
  // (입력 시점마다 자동 계산되어 화면에 즉시 반영)
  useEffect(() => {
    allFields.forEach((f) => {
      if (f.type !== 'computed' || !f.formula) return;
      const fn = computedFormulas[f.formula.computerId];
      if (!fn) return;
      const next = fn(watchedValues, extraContext);
      if (watchedValues[f.key] !== next) setValue(f.key, next as never, { shouldDirty: false });
    });
    // watchedValues 가 변하면 재계산 — setValue 가 추가 watchedValues 변경 유발하므로 referential equality 로 무한 루프 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedValues), allFields]);

  // Phase 4 — Step 3 prep: 필드 cascade — source 필드 값 변경 시 다른 필드 자동 채우기.
  // 마지막 source 값을 ref 로 추적 — 변경 시에만 cascade 호출 (idempotent + 루프 방지).
  const lastCascadeValueRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    allFields.forEach((f) => {
      if (!f.cascadeId) return;
      const cascade = fieldCascades[f.cascadeId];
      if (!cascade) return;
      const cur = watchedValues[f.key];
      if (lastCascadeValueRef.current[f.key] === cur) return;
      lastCascadeValueRef.current[f.key] = cur;
      cascade(cur, watchedValues, (k, v) => setValue(k, v as never), extraContext);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedValues), allFields]);

  const isEdit = !!editData;
  const handle = async (data: FieldValues) => {
    const payload = buildPayload(data, config, allFields, extraContext);
    await onSubmit(payload);
    // Phase 4 보강 Tier 3: 저장 성공 시 draft 제거
    if (config.draftAutoSave && !editData) clearDraft(config.id);
    onOpenChange(false);
  };

  const handleClearDraft = () => {
    clearDraft(config.id);
    reset(buildDefaults(allFields, null));
    setDraftRestored(false);
  };

  // Phase 4 보강: 다단계 wizard 모드 — 한 step 씩 노출 + 진행률 표시
  const wizardEnabled = !!config.wizard && config.sections.length > 1;
  const [currentStep, setCurrentStep] = useState(0);
  // 다이얼로그 재오픈 시 첫 step 으로 복귀
  useEffect(() => { if (open) setCurrentStep(0); }, [open]);

  const visibleSections = wizardEnabled
    ? config.sections.slice(currentStep, currentStep + 1)
    : config.sections;
  const isLastStep = !wizardEnabled || currentStep >= config.sections.length - 1;
  const isFirstStep = !wizardEnabled || currentStep === 0;

  // 다음 step 으로 이동 — 현재 step 의 필드만 검증
  const goNextStep = async () => {
    if (!wizardEnabled) return;
    const stepFieldKeys = config.sections[currentStep].fields.map((f) => f.key);
    const ok = await trigger(stepFieldKeys as never);
    if (ok) setCurrentStep((s) => Math.min(s + 1, config.sections.length - 1));
  };
  const goPrevStep = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const sizeClass = DIALOG_SIZE_CLASS[config.dialogSize ?? 'md'] ?? 'max-w-md';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={sizeClass}>
        <DialogHeader>
          <DialogTitle>{isEdit ? config.title.edit : config.title.create}</DialogTitle>
        </DialogHeader>
        {draftRestored ? (
          <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            <span>이전에 입력하던 초안을 복구했습니다.</span>
            <button type="button" onClick={handleClearDraft} className="text-amber-700 hover:text-amber-900 underline">
              초기화
            </button>
          </div>
        ) : null}
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          {wizardEnabled ? (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-medium">단계 {currentStep + 1} / {config.sections.length}</span>
                <span className="text-muted-foreground">{config.sections[currentStep]?.title ?? ''}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${((currentStep + 1) / config.sections.length) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
          {visibleSections.map((sec, idx) => {
            const colsClass = sec.cols === 2 ? 'grid grid-cols-2 gap-3'
                            : sec.cols === 3 ? 'grid grid-cols-3 gap-3'
                            : 'space-y-3';
            return (
              <div key={`${currentStep}-${idx}`} className="space-y-2">
                {sec.title && !wizardEnabled ? (
                  <p className={`text-xs font-semibold ${TONE_TEXT_CLASS[sec.tone ?? 'ink']}`}>{sec.title}</p>
                ) : null}
                {sec.contentBlock ? (() => {
                  // Phase 4 — Step 3 prep: 임의 위젯 임베드 (OCR / 결제조건 파서 등)
                  const Block = formContentBlocks[sec.contentBlock.blockId];
                  if (!Block) {
                    console.warn(`[MetaForm] formContentBlock not registered: ${sec.contentBlock.blockId}`);
                    return null;
                  }
                  return Block({
                    watch,
                    setValue: (k, v) => setValue(k, v as never),
                    getValues: () => watchedValues,
                    extraContext,
                    config: (sec.contentBlock.props ?? {}) as Record<string, unknown>,
                  });
                })() : (
                  <div className={colsClass}>
                    {sec.fields.map((f) => (
                      <FieldRender
                        key={f.key}
                        field={f}
                        value={watchedValues[f.key]}
                        error={errors[f.key] as { message?: string } | undefined}
                        options={fieldOptions[f.key]}
                        setValue={(k, v) => setValue(k, v as never)}
                        register={register}
                        watch={watch}
                        watchedValues={watchedValues}
                        role={role}
                        extraContext={extraContext}
                        formId={config.id}
                        control={control}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            {wizardEnabled && !isFirstStep ? (
              <Button type="button" variant="outline" onClick={goPrevStep}>이전</Button>
            ) : null}
            {wizardEnabled && !isLastStep ? (
              <Button type="button" onClick={goNextStep}>다음</Button>
            ) : (
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
