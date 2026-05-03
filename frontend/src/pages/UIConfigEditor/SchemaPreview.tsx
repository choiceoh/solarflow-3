// 시각 편집 사이드 패널용 스키마 미리보기 — 실제 데이터 없이 구조만 빠르게
// (실제 동작은 [실제 화면] 새 탭에서 확인. 여기는 "이렇게 보일 것" mockup)

import type { ListScreenConfig, MetaFormConfig, FieldConfig } from '@/templates/types';

const TONE_BG: Record<string, string> = {
  solar: 'bg-orange-50 text-orange-900 border-orange-200',
  ink: 'bg-blue-50 text-blue-900 border-blue-200',
  info: 'bg-cyan-50 text-cyan-900 border-cyan-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-200',
  pos: 'bg-emerald-50 text-emerald-900 border-emerald-200',
};

export function ScreenSchemaPreview({ config }: { config: ListScreenConfig }) {
  return (
    <div className="space-y-3 text-xs">
      {/* 헤더 */}
      <div className="rounded-md border bg-card p-3 space-y-1">
        {config.page?.eyebrow && (
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {config.page.eyebrow}
          </div>
        )}
        <div className="text-base font-semibold">{config.page?.title || '(제목 없음)'}</div>
        {config.page?.description && (
          <div className="text-xs text-muted-foreground">{config.page.description}</div>
        )}
      </div>

      {/* 메트릭 카드 */}
      {config.metrics && config.metrics.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">메트릭</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(config.metrics.length, 4)}, 1fr)` }}>
            {config.metrics.map((m, i) => (
              <div key={i} className="rounded-md border bg-card p-2">
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                <div className="text-sm font-semibold mt-0.5">—</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 필터 */}
      {config.filters && config.filters.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">필터</p>
          <div className="flex flex-wrap gap-1.5">
            {config.filters.map((f, i) => (
              <div key={i} className="rounded border bg-background px-2 py-1 text-xs">
                {f.label} <span className="text-muted-foreground">[{f.type}]</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 컬럼 헤더 미리보기 */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          컬럼 ({config.columns?.length ?? 0})
        </p>
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="bg-muted/30 px-3 py-1.5 grid gap-2 border-b" style={{ gridTemplateColumns: `repeat(${Math.min(config.columns?.length ?? 1, 6)}, minmax(0, 1fr))` }}>
            {(config.columns ?? []).slice(0, 6).map((c, i) => (
              <div key={i} className="text-xs font-medium truncate" title={c.key} style={{ textAlign: c.align }}>
                {c.label}
                {c.formatter && <span className="ml-1 text-muted-foreground font-mono text-[9px]">[{c.formatter}]</span>}
              </div>
            ))}
          </div>
          {/* 빈 행 3개 */}
          {[0, 1, 2].map((row) => (
            <div key={row} className="px-3 py-1.5 grid gap-2 border-b last:border-b-0" style={{ gridTemplateColumns: `repeat(${Math.min(config.columns?.length ?? 1, 6)}, minmax(0, 1fr))` }}>
              {(config.columns ?? []).slice(0, 6).map((c, i) => (
                <div key={i} className="text-xs text-muted-foreground/60" style={{ textAlign: c.align }}>—</div>
              ))}
            </div>
          ))}
        </div>
        {(config.columns?.length ?? 0) > 6 && (
          <p className="text-xs text-muted-foreground italic">+ {(config.columns?.length ?? 0) - 6} 컬럼 더 (좁아서 6개만 표시)</p>
        )}
      </div>

      {/* 액션 */}
      {config.actions && config.actions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">액션</p>
          <div className="flex flex-wrap gap-1.5">
            {config.actions.map((a, i) => (
              <div key={i} className={`rounded border px-2 py-1 text-xs ${a.variant === 'primary' ? 'bg-foreground text-background' : 'bg-background'}`}>
                {a.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground italic pt-2">
        ⓘ 미리보기는 구조만 표시 — 실제 데이터·인터랙션은 [프리뷰] 버튼으로 새 탭 확인
      </p>
    </div>
  );
}

export function FormSchemaPreview({ config }: { config: MetaFormConfig }) {
  return (
    <div className="space-y-3 text-xs">
      {/* Dialog 헤더 */}
      <div className="rounded-md border bg-card p-3 space-y-1">
        <div className="text-base font-semibold">{config.title?.create || '(제목 없음)'}</div>
        <div className="text-xs text-muted-foreground">신규 등록 다이얼로그 미리보기</div>
      </div>

      {/* 섹션 + 필드 */}
      {(config.sections ?? []).map((sec, sIdx) => (
        <div key={sIdx} className={`rounded-md border bg-card p-3 ${sec.tone ? TONE_BG[sec.tone] ?? '' : ''}`}>
          {sec.title && (
            <div className="text-xs font-semibold mb-2 pb-1 border-b border-current/20">{sec.title}</div>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${sec.cols ?? 1}, 1fr)` }}>
            {(sec.fields ?? []).map((f, fIdx) => (
              <FieldPreview key={fIdx} field={f} />
            ))}
          </div>
        </div>
      ))}

      {(config.sections ?? []).length === 0 && (
        <div className="text-center py-8 text-muted-foreground">섹션이 없습니다</div>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2">
        <div className="rounded border bg-background px-3 py-1 text-xs">취소</div>
        <div className="rounded bg-foreground text-background px-3 py-1 text-xs">저장</div>
      </div>

      <p className="text-xs text-muted-foreground italic pt-2">
        ⓘ 미리보기는 구조만 표시 — 실제 검증·동적 옵션은 [프리뷰] 버튼으로 새 탭 확인
      </p>
    </div>
  );
}

function FieldPreview({ field }: { field: FieldConfig }) {
  const required = field.required;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{field.label}</span>
        {required && <span className="text-rose-500">*</span>}
        {field.readOnly && <span className="text-[9px] text-amber-700">readonly</span>}
      </div>
      <FieldInputMockup field={field} />
      {field.description && (
        <div className="text-[9px] text-muted-foreground/80">{field.description}</div>
      )}
    </div>
  );
}

function FieldInputMockup({ field }: { field: FieldConfig }) {
  const baseClass = "h-7 w-full rounded border border-input bg-background/50 px-2 text-xs flex items-center text-muted-foreground/60";
  const ph = field.placeholder ?? '';
  switch (field.type) {
    case 'switch':
      return <div className="flex items-center gap-1.5">
        <div className="h-4 w-7 rounded-full bg-muted-foreground/20" />
        <span className="text-xs text-muted-foreground">on / off</span>
      </div>;
    case 'textarea':
      return <div className={`${baseClass} h-14 items-start py-1.5`}>{ph || 'text...'}</div>;
    case 'select':
      return <div className={baseClass}>
        <span>{ph || '— 선택 —'}</span>
        <span className="ml-auto">▾</span>
      </div>;
    case 'multiselect':
      return <div className={baseClass}>
        <span>{ph || '— 다중 선택 —'}</span>
        <span className="ml-auto">▾</span>
      </div>;
    case 'date':
      return <div className={baseClass}>📅 YYYY-MM-DD</div>;
    case 'datetime':
      return <div className={baseClass}>📅 YYYY-MM-DD HH:MM</div>;
    case 'time':
      return <div className={baseClass}>🕐 HH:MM</div>;
    case 'number': {
      const fmt = field.numberFormat;
      const sample = fmt === 'krw' ? '1,000,000원' : fmt === 'usd' ? '$1,000.00' : fmt === 'thousands' ? '1,000,000' : '0';
      return <div className={baseClass}>{ph || sample}</div>;
    }
    case 'file':
      return <div className={baseClass}>📎 {field.multiple ? '파일 다중 업로드' : '파일 선택'}</div>;
    case 'computed':
      return <div className={`${baseClass} bg-muted/50 italic`}>= {field.formula?.computerId ?? 'formula'} (자동 계산)</div>;
    case 'text':
    default:
      return <div className={baseClass}>{ph || 'text input'}</div>;
  }
}
