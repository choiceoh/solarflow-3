/**
 * AI 어시스턴트가 제안한 메타 config 변경의 *변경 후 모습* 을 사용자에게
 * 요약 형태로 보여주는 카드. 사용자는 코드를 못 읽으므로 JSON 대신 의미 단위
 * (컬럼 목록 / 섹션·필드 목록) 로 정리한다.
 *
 * 1차 PR 범위: 변경 후만. 변경 전과의 diff 는 후속.
 */

interface MetaConfigPreviewProps {
  payload: unknown;
}

interface PayloadShape {
  scope?: string;
  config_id?: string;
  config?: Record<string, unknown>;
  summary?: string;
}

interface ColumnLite {
  key?: string;
  label?: string;
  hideable?: boolean;
  hiddenByDefault?: boolean;
  sortable?: boolean;
}

interface SectionLite {
  title?: string;
  fields?: FieldLite[];
}

interface FieldLite {
  key?: string;
  label?: string;
  type?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const MetaConfigPreview = ({ payload }: MetaConfigPreviewProps) => {
  if (!isObj(payload)) return null;
  const p = payload as PayloadShape;
  if (!p.scope || !p.config_id || !p.config) return null;

  return (
    <section className="mt-3 rounded border border-amber-300/40 bg-white/70 p-3 text-xs dark:border-amber-700/30 dark:bg-amber-900/10">
      <header className="mb-2 flex items-center justify-between text-[11px] text-amber-900/80 dark:text-amber-200/80">
        <span className="font-medium">변경 후 미리보기</span>
        <code className="font-mono text-amber-800/60 dark:text-amber-200/50">
          {p.scope}/{p.config_id}
        </code>
      </header>
      {p.scope === 'screen' && <ScreenPreview config={p.config} />}
      {p.scope === 'form' && <FormPreview config={p.config} />}
      {p.scope === 'detail' && <DetailPreview config={p.config} />}
    </section>
  );
};

const Header = ({ title, eyebrow }: { title?: string; eyebrow?: string }) => {
  if (!title && !eyebrow) return null;
  return (
    <div className="mb-2 border-b border-slate-200 pb-1.5 dark:border-slate-700">
      {eyebrow && (
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {eyebrow}
        </div>
      )}
      {title && <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</div>}
    </div>
  );
};

const ScreenPreview = ({ config }: { config: Record<string, unknown> }) => {
  const page = isObj(config.page) ? (config.page as { title?: string; eyebrow?: string }) : undefined;
  const columnsRaw = Array.isArray(config.columns) ? (config.columns as unknown[]) : [];
  const columns: ColumnLite[] = columnsRaw.filter(isObj) as ColumnLite[];

  return (
    <>
      <Header title={page?.title} eyebrow={page?.eyebrow} />
      <div className="mb-1 text-[10px] font-medium text-slate-500">
        컬럼 ({columns.length})
      </div>
      <ol className="space-y-0.5">
        {columns.map((c, i) => (
          <li
            key={`${c.key ?? 'col'}-${i}`}
            className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <span className="w-5 font-mono text-[10px] text-slate-400">{i + 1}</span>
            <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
              {c.label ?? c.key ?? '(라벨 없음)'}
            </span>
            {c.hiddenByDefault && (
              <span className="rounded bg-slate-200 px-1 text-[9px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                숨김
              </span>
            )}
            {c.sortable && (
              <span className="rounded bg-blue-100 px-1 text-[9px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                정렬
              </span>
            )}
            <code className="font-mono text-[9px] text-slate-400">{c.key}</code>
          </li>
        ))}
      </ol>
    </>
  );
};

const FormPreview = ({ config }: { config: Record<string, unknown> }) => {
  const title = isObj(config.title) ? (config.title as { create?: string; edit?: string }) : undefined;
  const sections: SectionLite[] = (Array.isArray(config.sections) ? (config.sections as unknown[]) : [])
    .filter(isObj) as SectionLite[];

  return (
    <>
      <Header title={title?.create ?? title?.edit} />
      <div className="space-y-2">
        {sections.map((s, i) => (
          <div key={`sec-${i}`} className="rounded border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="mb-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
              {s.title ?? `섹션 ${i + 1}`}
            </div>
            <ul className="space-y-0.5">
              {(s.fields ?? []).filter(isObj).map((f, j) => {
                const ff = f as FieldLite;
                return (
                  <li
                    key={`fld-${i}-${j}`}
                    className="flex items-center gap-2 rounded bg-white px-1.5 py-0.5 dark:bg-slate-800/60"
                  >
                    <span className="flex-1 truncate text-[11px] text-slate-700 dark:text-slate-300">
                      {ff.label ?? ff.key ?? '(라벨 없음)'}
                    </span>
                    {ff.type && (
                      <span className="rounded bg-slate-200 px-1 text-[9px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {ff.type}
                      </span>
                    )}
                    <code className="font-mono text-[9px] text-slate-400">{ff.key}</code>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
};

const DetailPreview = ({ config }: { config: Record<string, unknown> }) => {
  const header = isObj(config.header) ? (config.header as { title?: string }) : undefined;
  const sections: SectionLite[] = (Array.isArray(config.sections) ? (config.sections as unknown[]) : [])
    .filter(isObj) as SectionLite[];

  return (
    <>
      <Header title={header?.title} />
      <div className="mb-1 text-[10px] font-medium text-slate-500">섹션 ({sections.length})</div>
      <ul className="space-y-0.5">
        {sections.map((s, i) => (
          <li
            key={`det-${i}`}
            className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <span className="w-5 font-mono text-[10px] text-slate-400">{i + 1}</span>
            <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
              {s.title ?? '(제목 없음)'}
            </span>
            <span className="text-[10px] text-slate-400">필드 {s.fields?.length ?? 0}개</span>
          </li>
        ))}
      </ul>
    </>
  );
};
