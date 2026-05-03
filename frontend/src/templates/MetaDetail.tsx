// Phase 2.5 PoC: 메타데이터 기반 상세 화면
// Detail은 입력 없이 데이터 표시라 Form보다 메타 친화적.
// 데이터 섹션(필드 그리드)을 메타로 그리고, 워크플로우·편집·외부 패널은 contentBlock 슬롯에 위임한다.

import { useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useResolvedConfig } from './configOverride';
import { DetailSection, DetailField, DetailFieldGrid } from '@/components/common/detail';
import LoadingSpinner from '@/components/common/LoadingSpinner';
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
  config, data,
}: {
  config: MetaDetailConfig;
  data: Record<string, unknown>;
}) {
  return (
    <>
      {config.sections.map((sec, idx) => (
        <MetaDetailSection key={idx} section={sec} data={data} />
      ))}
    </>
  );
}

function MetaDetailSection({
  section, data,
}: {
  section: DetailSectionConfig;
  data: Record<string, unknown>;
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
            return (
              <DetailField
                key={f.key}
                label={f.label}
                span={f.span}
              >
                {renderFieldValue(f, data)}
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
            <MetaDetailSection key={idx} section={sec} data={rec} />
          ))}
        </>
      ) : (
        config.sections.map((sec, idx) => (
          <MetaDetailSection key={idx} section={sec} data={rec} />
        ))
      )}

      {config.extraBlocks?.map((block, idx) => (
        <div key={idx}>{renderBlock(block, rec)}</div>
      ))}
    </div>
  );
}
