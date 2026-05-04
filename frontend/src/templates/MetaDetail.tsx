// Phase 2.5 PoC: 메타데이터 기반 상세 화면
// Detail은 입력 없이 데이터 표시라 Form보다 메타 친화적.
// 데이터 섹션(필드 그리드)을 메타로 그리고, 워크플로우·편집·외부 패널은 contentBlock 슬롯에 위임한다.

import { useState, useEffect, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useResolvedConfig } from './configOverride';
import { DetailSection, DetailField, DetailFieldGrid } from '@/components/common/detail';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { fetchWithAuth } from '@/lib/api';
import { formatDate, formatNumber, formatKw } from '@/lib/utils';
import type {
  MetaDetailConfig, DetailSectionConfig, DetailFieldConfig, ContentBlockConfig,
} from './types';
import {
  detailDataHooks, contentBlocks, cellRenderers, enumDictionaries,
  getFieldValue,
} from './registry';

function applyFormatter(field: DetailFieldConfig, raw: unknown): string {
  if (raw == null || raw === '') return field.fallback ?? '—';
  switch (field.formatter) {
    case 'date': return formatDate(raw as string);
    case 'number': return formatNumber(raw as number);
    case 'kw': return formatKw(raw as number);
    case 'currency': return `${formatNumber(raw as number)}원`;
    case 'enum': {
      if (!field.enumKey) return String(raw);
      const dict = enumDictionaries[field.enumKey];
      return dict?.[String(raw)] ?? String(raw);
    }
    default: return String(raw);
  }
}

function evalVisibleIf(
  visibleIf: { field: string; value: string | string[] } | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!visibleIf) return true;
  const ref = getFieldValue(data, visibleIf.field);
  const expected = Array.isArray(visibleIf.value) ? visibleIf.value : [visibleIf.value];
  // 특수 값 '__truthy' — 값이 truthy & non-empty (배열은 length > 0)
  if (expected.includes('__truthy')) {
    if (ref == null || ref === '') return false;
    if (Array.isArray(ref)) return ref.length > 0;
    return Boolean(ref);
  }
  return expected.includes(String(ref));
}

function renderFieldValue(field: DetailFieldConfig, data: Record<string, unknown>): ReactNode {
  const raw = getFieldValue(data, field.key);
  if (field.rendererId) {
    const renderer = cellRenderers[field.rendererId];
    if (renderer) return renderer(raw, data);
  }
  const formatted = applyFormatter(field, raw);
  return field.suffix && formatted !== (field.fallback ?? '—') ? `${formatted}${field.suffix}` : formatted;
}

function renderBlock(
  blockConfig: ContentBlockConfig | undefined,
  data: Record<string, unknown>,
): ReactNode {
  if (!blockConfig) return null;
  const Block = contentBlocks[blockConfig.blockId];
  if (!Block) return null;
  return Block({ items: [data], config: (blockConfig.props ?? {}) as Record<string, unknown> });
}

// 외부 host (예: BLDetailView 가 자체 header/tab 으로 감싸는 경우) 가 직접 섹션만 렌더하도록 export.
// MetaDetail 의 fetch / header 로직 우회.
export function MetaDetailBody({
  config, data, onInlineSave,
}: {
  config: MetaDetailConfig;
  data: Record<string, unknown>;
  onInlineSave?: (key: string, value: unknown) => Promise<void>;
}) {
  return (
    <>
      {config.sections.map((sec, idx) => (
        <MetaDetailSection key={idx} section={sec} data={data} onInlineSave={onInlineSave} />
      ))}
    </>
  );
}

// 메타 인프라 확장: 인라인 편집 셀 — 클릭 시 input → blur/Enter 시 onSave 호출
function InlineEditField({ field, data, onSave }: {
  field: DetailFieldConfig;
  data: Record<string, unknown>;
  onSave: (key: string, value: unknown) => Promise<void>;
}) {
  const initial = data[field.key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(initial ?? ''));
  const [saving, setSaving] = useState(false);
  const editType = field.inlineEditType ?? 'text';

  useEffect(() => { setDraft(String(initial ?? '')); }, [initial]);

  const commit = async () => {
    if (saving) return;
    const next = editType === 'number' ? Number(draft) : draft;
    if (next === initial) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(field.key, next);
      setEditing(false);
    } catch (err) {
      console.error('[MetaDetail] inline save failed', err);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" className="text-left hover:bg-muted/40 rounded px-1 -mx-1 cursor-pointer text-sm" onClick={() => setEditing(true)} title="클릭하여 편집">
        {renderFieldValue(field, data) ?? <span className="text-muted-foreground italic">—</span>}
        <span className="ml-1 text-xs opacity-30">✏️</span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {editType === 'select' ? (
        <select
          autoFocus
          className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        >
          {(field.inlineEditOptions ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          autoFocus
          type={editType}
          className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { setDraft(String(initial ?? '')); setEditing(false); }
          }}
        />
      )}
      {saving && <span className="text-xs text-muted-foreground">저장 중...</span>}
    </div>
  );
}

function MetaDetailSection({
  section, data, onInlineSave,
}: {
  section: DetailSectionConfig;
  data: Record<string, unknown>;
  onInlineSave?: (key: string, value: unknown) => Promise<void>;
}) {
  if (!evalVisibleIf(section.visibleIf, data)) return null;

  return (
    <DetailSection
      title={section.title}
      badges={renderBlock(section.badgesBlock, data)}
      actions={renderBlock(section.actionsBlock, data)}
    >
      {section.contentBlock ? (
        renderBlock(section.contentBlock, data)
      ) : (
        <DetailFieldGrid cols={section.cols ?? 4}>
          {(section.fields ?? []).map((f) => {
            if (!evalVisibleIf(f.visibleIf, data)) return null;
            const isInline = f.inlineEditable && onInlineSave;
            return (
              <DetailField
                key={f.key}
                label={f.label}
                span={f.span}
              >
                {isInline ? (
                  <InlineEditField field={f} data={data} onSave={onInlineSave!} />
                ) : (
                  renderFieldValue(f, data)
                )}
              </DetailField>
            );
          })}
        </DetailFieldGrid>
      )}
    </DetailSection>
  );
}

export interface MetaDetailProps {
  config: MetaDetailConfig;
  id: string;
  onBack: () => void;
}

export default function MetaDetail({ config: defaultConfig, id, onBack }: MetaDetailProps) {
  // Phase 3: localStorage override 우선
  const config = useResolvedConfig(defaultConfig, 'detail');
  const hook = detailDataHooks[config.source.hookId];
  if (!hook) throw new Error(`[MetaDetail] detail hook not registered: ${config.source.hookId}`);
  const { data, loading } = hook(id);

  // 메타 인프라 확장: 탭 활성 상태
  const [activeTab, setActiveTab] = useState<string>(
    config.tabs?.[0]?.key ? (config.defaultTab ?? config.tabs[0].key) : ''
  );

  if (loading || !data) return <LoadingSpinner />;
  const rec = data as Record<string, unknown>;

  // 탭 모드 — visibleIf 통과한 탭만 표시
  const visibleTabs = (config.tabs ?? []).filter((t) => evalVisibleIf(t.visibleIf, rec));
  const currentTab = visibleTabs.find((t) => t.key === activeTab) ?? visibleTabs[0];

  // 메타 인프라 확장: 인라인 편집 핸들러 — endpoint PATCH 호출
  const onInlineSave = config.inlineEdit?.enabled ? async (key: string, value: unknown) => {
    const cfg = config.inlineEdit!;
    if (!cfg.endpoint || !cfg.idField) {
      console.warn('[MetaDetail] inlineEdit.endpoint/idField required');
      return;
    }
    const rowId = (rec as Record<string, unknown>)[cfg.idField];
    const url = cfg.endpoint.replace(':id', String(rowId));
    await fetchWithAuth(url, {
      method: 'PATCH',
      body: JSON.stringify({ [key]: value }),
    });
    // 단순 reload — useDetailQuery 가 자체 캐시 있으면 invalidate 필요할 수 있음
    window.location.reload();
  } : undefined;

  // rail 미지정 시 기존 단일 컬럼 동작 유지. 지정 시 1fr/320px grid로 우측 카드 stack.
  const hasRail = !!(config.rail && config.rail.length > 0);

  const mainColumn = (
    <>
      {/* 탭 네비 (있을 때) */}
      {visibleTabs.length > 0 && (
        <div className="flex gap-1 border-b">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap
                ${currentTab?.key === t.key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 탭 컨텐츠 (탭 모드) 또는 sections (기본 모드) */}
      {currentTab ? (
        <>
          {currentTab.contentBlock ? renderBlock(currentTab.contentBlock, rec) : null}
          {(currentTab.sections ?? []).map((sec, idx) => (
            <MetaDetailSection key={idx} section={sec} data={rec} onInlineSave={onInlineSave} />
          ))}
        </>
      ) : (
        config.sections.map((sec, idx) => (
          <MetaDetailSection key={idx} section={sec} data={rec} onInlineSave={onInlineSave} />
        ))
      )}

      {config.extraBlocks?.map((block, idx) => (
        <div key={idx}>{renderBlock(block, rec)}</div>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="sf-detail-header">
        <button
          type="button"
          className="sf-detail-header-back"
          onClick={onBack}
          aria-label="목록으로"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-base font-semibold" style={{ letterSpacing: '-0.012em' }}>
          {config.header.title}
        </h2>
        {renderBlock(config.header.actionsBlock, rec)}
      </div>

      {hasRail ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-4">{mainColumn}</div>
          <aside className="space-y-3">
            {config.rail!.map((block, idx) => (
              <div key={idx}>{renderBlock(block, rec)}</div>
            ))}
          </aside>
        </div>
      ) : (
        <div className="space-y-4">{mainColumn}</div>
      )}
    </div>
  );
}
