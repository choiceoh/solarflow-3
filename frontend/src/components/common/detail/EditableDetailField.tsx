import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import DetailField from './DetailField';
import { notify } from '@/lib/notify';

export type EditableInputType = 'text' | 'number' | 'date' | 'select' | 'textarea';

interface Props {
  label: string;
  /** 편집 모드 input의 초기값 — null/undefined 는 빈 문자열. */
  value: string | number | null | undefined;
  /** 표시 모드에서 보여줄 포맷 결과 (포맷터 거친 문자열 또는 노드). 미지정 시 value 그대로. */
  display?: ReactNode;
  /** 저장 시 onSave 에 전달되는 키 — 보통 백엔드 컬럼명. */
  fieldKey: string;
  /** 비동기 저장 — onSave(fieldKey, nextValue). */
  onSave: (key: string, value: unknown) => Promise<void>;
  editType?: EditableInputType;
  /** select 옵션 — editType='select' 에서만 사용. */
  options?: Array<{ value: string; label: string }>;
  /** 편집 비활성화 (취소/마감 등) */
  disabled?: boolean;
  span?: 1 | 2 | 3 | 4;
  placeholder?: string;
}

export default function EditableDetailField({
  label, value, display, fieldKey, onSave,
  editType = 'text', options, disabled, span, placeholder,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(stringify(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  useEffect(() => { setDraft(stringify(value)); }, [value]);

  const startEdit = () => {
    if (disabled || saving) return;
    setEditing(true);
  };

  const cancel = () => {
    setDraft(stringify(value));
    setEditing(false);
  };

  const commit = async () => {
    if (saving) return;
    const next = parseDraft(draft, editType);
    // number/date/select 빈 입력 — 백엔드 `*T` 포인터 + jsonb `?` 키 검사 패턴이라
    // null 을 보내면 "변경 없음" 으로 무시된다. 빈 입력은 저장 스킵으로 처리.
    if (next === undefined) {
      setEditing(false);
      return;
    }
    if (sameValue(next, value)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(fieldKey, next);
      setEditing(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const displayNode: ReactNode = display !== undefined
      ? (display === null || display === '' ? '—' : display)
      : (value === null || value === undefined || value === '' ? '—' : String(value));
    if (disabled) {
      return (
        <DetailField label={label} span={span}>
          <span className="text-sm break-words text-muted-foreground">{displayNode}</span>
        </DetailField>
      );
    }
    return (
      <DetailField label={label} span={span}>
        <button
          type="button"
          onClick={startEdit}
          className="group flex w-full items-center justify-between gap-1.5 rounded border border-dashed border-input/60 bg-background/40 px-1.5 py-1 -mx-1.5 -my-1 text-left transition-colors hover:border-input hover:bg-muted/40 focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:outline-none"
          title="클릭하여 편집"
        >
          <span className="text-sm break-words min-w-0 flex-1">{displayNode}</span>
          <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
        </button>
      </DetailField>
    );
  }

  const commonInputClass =
    'flex-1 min-w-0 rounded border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/45';

  return (
    <DetailField label={label} span={span}>
      <div className="flex items-start gap-1.5">
        {editType === 'select' ? (
          <select
            ref={(el) => { inputRef.current = el; }}
            autoFocus
            className={`h-7 ${commonInputClass}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
            disabled={saving}
          >
            <option value="">— 선택 —</option>
            {(options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : editType === 'textarea' ? (
          <textarea
            ref={(el) => { inputRef.current = el; }}
            autoFocus
            rows={3}
            className={`min-h-16 py-1 ${commonInputClass}`}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); cancel(); }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
            }}
            disabled={saving}
          />
        ) : (
          <input
            ref={(el) => { inputRef.current = el; }}
            autoFocus
            type={editType}
            className={`h-7 ${commonInputClass}`}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            disabled={saving}
          />
        )}
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-input bg-background text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
          title="저장 (Enter)"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-input bg-background text-muted-foreground hover:bg-muted disabled:opacity-50"
          title="취소 (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {saving && <p className="mt-1 text-[11px] text-muted-foreground">저장 중...</p>}
    </DetailField>
  );
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function parseDraft(draft: string, type: EditableInputType): unknown {
  if (type === 'number') {
    const trimmed = draft.trim();
    if (trimmed === '') return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'date' || type === 'select') {
    const trimmed = draft.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  // text / textarea — 빈 문자열도 그대로 전송 (Go *string -> "" 으로 clear).
  return draft;
}

function sameValue(next: unknown, current: unknown): boolean {
  const a = next === null || next === undefined ? '' : String(next);
  const b = current === null || current === undefined ? '' : String(current);
  return a === b;
}
