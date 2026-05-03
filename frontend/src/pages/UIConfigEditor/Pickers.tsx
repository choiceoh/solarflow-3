// Phase 4 GUI 메타 편집기 — 단순 picker widgets
//
// 4 편집기 (Form/Screen/Detail/TabbedList) 가 공유하는 입력 위젯.
// FieldInput / FieldSelect (ArrayEditor.tsx) 와 같은 grammar — 작은 라벨 + h-7 input + text-xs.
// 새로 추가된 메타 인프라 항목들을 GUI 로 picker 화 (RULES.md #0 — discoverable by GUI alone).

import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ROLE_LABELS, type Role } from '@/config/permissions';

// ─── BooleanPicker — 작은 토글 (h-6 한 줄) ─────────────────────────────────
// inlineEditable / collapsible / savedViews.enabled 등 단순 boolean 메타에 사용.
export function BooleanPicker({
  label, value, onChange, hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint && <p className="text-xs text-muted-foreground pl-5.5">{hint}</p>}
    </div>
  );
}

// ─── RolePicker — Role chip multi-select ───────────────────────────────────
// maskByRoles / visibleByRoles / editableByRoles 에 사용.
// 5개 role 을 chip 으로 나열, 클릭하면 toggle.
const ALL_ROLES: Role[] = ['admin', 'operator', 'executive', 'manager', 'viewer'];

export function RolePicker({
  label, value, onChange, hint,
}: {
  label: string;
  value: string[] | undefined;
  onChange: (v: string[] | undefined) => void;
  hint?: string;
}) {
  const selected = useMemo(() => new Set(value ?? []), [value]);
  const toggle = (r: Role) => {
    const next = new Set(selected);
    if (next.has(r)) next.delete(r); else next.add(r);
    const arr = [...next];
    onChange(arr.length === 0 ? undefined : arr);
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {ALL_ROLES.map((r) => {
          const on = selected.has(r);
          return (
            <button
              key={r}
              type="button"
              onClick={() => toggle(r)}
              className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                on
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-input hover:border-foreground'
              }`}
            >
              {on && <Check className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />}
              {ROLE_LABELS[r]}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── RegistryIdPicker — 등록된 ID 콤보박스 (라벨 + 설명) ──────────────────
// permissionGuardId / asyncRefine.ruleId 등 registry-key 에 사용.
// 등록 안 된 값이 들어와 있으면 빨간 경고 표시.
export type RegistryEntry = { id: string; label: string; description?: string };

export function RegistryIdPicker({
  label, value, onChange, entries, hint, allowEmpty = true, emptyLabel,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  entries: RegistryEntry[];
  hint?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const isRegistered = !value || entries.some((e) => e.id === value);
  const selected = entries.find((e) => e.id === value);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        className={`w-full h-7 text-xs border rounded px-2 bg-background font-mono ${
          !isRegistered ? 'border-destructive text-destructive' : ''
        }`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        {allowEmpty && <option value="">{emptyLabel ?? '— 없음 —'}</option>}
        {entries.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label} ({e.id})
          </option>
        ))}
        {/* 등록 안 된 값 — option 없으면 select 빈 칸. 명시적 fallback. */}
        {!isRegistered && value && (
          <option value={value}>⚠ {value} (코드에 미등록)</option>
        )}
      </select>
      {!isRegistered && value && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          코드에 등록되지 않은 ID — runtime 에서 무시됨
        </p>
      )}
      {selected?.description && (
        <p className="text-xs text-muted-foreground italic">
          {selected.description}
        </p>
      )}
      {!selected && hint && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// ─── EndpointPicker — :id 자리표시 힌트 포함된 텍스트 입력 ─────────────────
// inlineEdit.endpoint (PATCH URL) 에 사용. /api/v1/<resource>/:id 패턴.
export function EndpointPicker({
  label, value, onChange, hint,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  hint?: string;
}) {
  const hasIdToken = (value ?? '').includes(':id');
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder="/api/v1/<resource>/:id"
        className={`h-7 text-xs font-mono ${
          value && !hasIdToken ? 'border-amber-400' : ''
        }`}
      />
      {value && !hasIdToken && (
        <p className="flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          URL 에 :id 자리표시자 없음
        </p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── IdFieldPicker — 컬럼 키 dropdown ──────────────────────────────────────
// inlineEdit.idField — 행 데이터의 어떤 필드를 :id 로 쓸지.
// columns 옵션은 호출 측에서 주입 (현재 config 의 column keys).
export function IdFieldPicker({
  label, value, onChange, columnKeys, hint,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  columnKeys: string[];
  hint?: string;
}) {
  const isKnown = !value || columnKeys.includes(value);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        className={`w-full h-7 text-xs border rounded px-2 bg-background font-mono ${
          !isKnown ? 'border-destructive text-destructive' : ''
        }`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">— 없음 —</option>
        {columnKeys.map((k) => <option key={k} value={k}>{k}</option>)}
        {!isKnown && value && <option value={value}>⚠ {value} (컬럼에 없음)</option>}
      </select>
      {!isKnown && value && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          컬럼 목록에 없는 키 — 행 데이터에 없을 수 있음
        </p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── InlineEditOptionsPicker — { value, label }[] 편집 ────────────────────
// inlineEditType='select' 일 때 inlineEditOptions 에 사용.
// 행마다 [value | label | ✕]. + 추가 버튼.
export function InlineEditOptionsPicker({
  value, onChange,
}: {
  value: { value: string; label: string }[] | undefined;
  onChange: (v: { value: string; label: string }[] | undefined) => void;
}) {
  const items = value ?? [];
  const update = (next: { value: string; label: string }[]) =>
    onChange(next.length === 0 ? undefined : next);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">inlineEditOptions</Label>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground italic">옵션 없음 — 아래 + 로 추가</p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            value={item.value}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, value: e.target.value };
              update(next);
            }}
            placeholder="value"
            className="h-7 text-xs font-mono flex-1"
          />
          <Input
            value={item.label}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, label: e.target.value };
              update(next);
            }}
            placeholder="label"
            className="h-7 text-xs flex-1"
          />
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive px-1"
            onClick={() => update(items.filter((_, j) => j !== i))}
            aria-label="옵션 삭제"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground"
        onClick={() => update([...items, { value: '', label: '' }])}
      >
        + 옵션 추가
      </button>
    </div>
  );
}

// ─── 작은 picker — InlineEditType ──────────────────────────────────────────
// text | number | select | date — 이건 그냥 FieldSelect 로도 되지만 4번 반복하므로 제공.
const INLINE_EDIT_TYPES = [
  { value: 'text', label: 'text (자유 입력)' },
  { value: 'number', label: 'number (숫자)' },
  { value: 'select', label: 'select (옵션 중)' },
  { value: 'date', label: 'date (날짜)' },
];

export function InlineEditTypePicker({
  value, onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">inlineEditType</Label>
      <select
        className="w-full h-7 text-xs border rounded px-2 bg-background"
        value={value ?? 'text'}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === 'text' ? undefined : v);
        }}
      >
        {INLINE_EDIT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── CollapsiblePicker — boolean | 'collapsed' 3-state ────────────────────
// section.collapsible: undefined (펼침 고정) / true (펼침 가능) / 'collapsed' (기본 접힘)
const COLLAPSIBLE_OPTIONS = [
  { value: '', label: '— 안 접힘 (고정 펼침)' },
  { value: 'true', label: '접힘 가능 (기본 펼침)' },
  { value: 'collapsed', label: '접힘 가능 (기본 접힘)' },
];

export function CollapsiblePicker({
  value, onChange,
}: {
  value: boolean | 'collapsed' | undefined;
  onChange: (v: boolean | 'collapsed' | undefined) => void;
}) {
  const stringValue = value === true ? 'true' : value === 'collapsed' ? 'collapsed' : '';
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">collapsible</Label>
      <select
        className="w-full h-7 text-xs border rounded px-2 bg-background"
        value={stringValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') onChange(undefined);
          else if (v === 'true') onChange(true);
          else if (v === 'collapsed') onChange('collapsed');
        }}
      >
        {COLLAPSIBLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── AllowedSizesPicker — pagination.allowedSizes (number[]) ───────────────
// 콤마로 구분된 페이지 크기 입력.
export function AllowedSizesPicker({
  value, onChange,
}: {
  value: number[] | undefined;
  onChange: (v: number[] | undefined) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">allowedSizes (콤마)</Label>
      <Input
        value={(value ?? []).join(',')}
        onChange={(e) => {
          const parts = e.target.value
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n) && n > 0);
          onChange(parts.length === 0 ? undefined : parts);
        }}
        placeholder="25,50,100"
        className="h-7 text-xs font-mono"
      />
      <p className="text-xs text-muted-foreground">사용자가 선택 가능한 페이지 크기들</p>
    </div>
  );
}

// ─── 공유 wrapper — picker 들에 children prop 으로 description 등 표시할 때 ─
export function PickerRow({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}
