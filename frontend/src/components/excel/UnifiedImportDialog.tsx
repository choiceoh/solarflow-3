// 통합 양식 업로드 미리보기 다이얼로그.
// 비유: 통합 접수창 — 모든 섹션을 탭으로 펼쳐 보여주고 한 번에 등록한다.
// 부분 실패 허용: 섹션 단위로 직렬 등록, 실패 섹션은 결과창에서 안내.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, MinusCircle, Upload, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FIELDS_MAP, DECLARATION_FIELDS, DECLARATION_COST_FIELDS,
} from '@/types/excel';
import type { UnifiedImportPreview, UnifiedSection } from '@/types/excel';
import ImportPreviewTable, { type ImportPreviewTableHandle } from './ImportPreviewTable';
import ImportPreviewErrorList from './ImportPreviewErrorList';

interface Props {
  preview: UnifiedImportPreview | null;
  loading?: boolean;
  onClose: () => void;
  onDownloadErrors?: () => void;
  onSubmit: () => void;
}

type FilterMode = 'all' | 'valid' | 'warning' | 'error';

interface SectionSummary {
  total: number;
  valid: number;
  warning: number;
  error: number;
}

interface ImpactItem {
  label: string;
  value: string;
  sub: string;
  tone: 'pos' | 'warn' | 'info' | 'ink';
}

function summarize(section: UnifiedSection): SectionSummary {
  if (!section.present || section.parseError) return { total: 0, valid: 0, warning: 0, error: 0 };
  if (section.declPreview) {
    const d = section.declPreview.declarations;
    const c = section.declPreview.costs;
    return {
      total: d.length + c.length,
      valid: d.filter((r) => r.valid).length + c.filter((r) => r.valid).length,
      warning: d.filter((r) => r.valid && (r.warnings?.length ?? 0) > 0).length
        + c.filter((r) => r.valid && (r.warnings?.length ?? 0) > 0).length,
      error: d.filter((r) => !r.valid).length + c.filter((r) => !r.valid).length,
    };
  }
  if (section.preview) {
    return {
      total: section.preview.totalRows,
      valid: section.preview.validRows,
      warning: section.preview.warningRows ?? section.preview.rows.filter((r) => r.valid && (r.warnings?.length ?? 0) > 0).length,
      error: section.preview.errorRows,
    };
  }
  return { total: 0, valid: 0, warning: 0, error: 0 };
}

function sectionTone(section: UnifiedSection, sum: SectionSummary): 'pos' | 'warn' | 'neg' | 'mute' {
  if (!section.present) return 'mute';
  if (section.parseError) return 'neg';
  if (sum.error > 0 || sum.warning > 0) return 'warn';
  if (sum.valid > 0) return 'pos';
  return 'mute';
}

function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function validRows(section?: UnifiedSection) {
  return section?.preview?.rows.filter((row) => row.valid) ?? [];
}

function formatCount(value: number): string {
  return value.toLocaleString('ko-KR');
}

function formatUsd(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${Math.round(value).toLocaleString('ko-KR')}`;
}

function formatKrw(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString('ko-KR')}만`;
  return Math.round(value).toLocaleString('ko-KR');
}

function buildImpactItems(sections: UnifiedSection[], totals: SectionSummary): ImpactItem[] {
  const sectionByType = new Map(sections.map((section) => [section.type, section]));
  const poRows = validRows(sectionByType.get('purchase_order'));
  const lcRows = validRows(sectionByType.get('lc'));
  const ttRows = validRows(sectionByType.get('tt'));
  const masterRows = ['company', 'manufacturer', 'product', 'warehouse', 'bank', 'partner']
    .reduce((sum, type) => sum + validRows(sectionByType.get(type as UnifiedSection['type'])).length, 0);

  const poNumbers = new Set(poRows.map((row) => String(row.data.po_number ?? '').trim()).filter(Boolean));
  const poQty = poRows.reduce((sum, row) => sum + numberValue(row.data.quantity), 0);
  const lcUsd = lcRows.reduce((sum, row) => sum + numberValue(row.data.amount_usd), 0);
  const lcMw = lcRows.reduce((sum, row) => sum + numberValue(row.data.target_mw), 0);
  const ttUsd = ttRows.reduce((sum, row) => sum + numberValue(row.data.amount_usd), 0);
  const ttKrw = ttRows.reduce(
    (sum, row) => sum + numberValue(row.data.amount_usd) * numberValue(row.data.exchange_rate),
    0,
  );

  return [
    {
      label: '등록 예정',
      value: `${formatCount(totals.valid)}건`,
      sub: masterRows > 0 ? `마스터 ${formatCount(masterRows)}건 포함` : '유효행 기준',
      tone: 'pos',
    },
    {
      label: 'PO 영향',
      value: `${formatCount(poNumbers.size)}건`,
      sub: `라인 ${formatCount(poRows.length)} · 수량 ${formatCount(poQty)}`,
      tone: poRows.length > 0 ? 'info' : 'ink',
    },
    {
      label: 'LC 영향',
      value: `${formatCount(lcRows.length)}건`,
      sub: `${formatUsd(lcUsd)} · ${lcMw.toFixed(2)}MW`,
      tone: lcRows.length > 0 ? 'info' : 'ink',
    },
    {
      label: 'T/T 영향',
      value: `${formatCount(ttRows.length)}건`,
      sub: `${formatUsd(ttUsd)} · ${formatKrw(ttKrw)}원`,
      tone: ttRows.length > 0 ? 'info' : 'ink',
    },
    {
      label: '검토 필요',
      value: `${formatCount(totals.warning + totals.error)}건`,
      sub: `경고 ${formatCount(totals.warning)} · 에러 ${formatCount(totals.error)}`,
      tone: totals.error > 0 || totals.warning > 0 ? 'warn' : 'pos',
    },
  ];
}

export default function UnifiedImportDialog({
  preview, loading, onClose, onDownloadErrors, onSubmit,
}: Props) {
  const [activeTab, setActiveTab] = useState<string>('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sections = preview?.sections ?? [];
  const totals = useMemo(() => {
    return sections.reduce(
      (acc, s) => {
        const sum = summarize(s);
        return {
          total: acc.total + sum.total,
          valid: acc.valid + sum.valid,
          error: acc.error + sum.error,
          warning: acc.warning + sum.warning,
          presentCount: acc.presentCount + (s.present ? 1 : 0),
        };
      },
      { total: 0, valid: 0, warning: 0, error: 0, presentCount: 0 },
    );
  }, [sections]);

  // 처음 열릴 때 첫 번째 present + valid > 0 섹션, 없으면 첫 present, 없으면 첫 섹션
  const defaultTab = useMemo(() => {
    if (sections.length === 0) return '';
    const firstWithData = sections.find((s) => s.present && summarize(s).total > 0);
    if (firstWithData) return firstWithData.type;
    const firstPresent = sections.find((s) => s.present);
    return (firstPresent ?? sections[0]).type;
  }, [sections]);

  const currentTab = activeTab || defaultTab;

  if (!preview) return null;

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-5xl max-h-[88vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              통합 양식 업로드 미리보기
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {preview.fileName} · {sections.length}섹션 중 {totals.presentCount}개 시트 · 전체 {totals.total}건 (정상 {totals.valid - totals.warning} / 경고 {totals.warning} / 에러 {totals.error})
            </p>
          </DialogHeader>

          <ImpactSummary items={buildImpactItems(sections, totals)} />

          <Tabs value={currentTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="flex flex-wrap gap-1 bg-transparent justify-start h-auto p-0">
              {sections.map((s) => {
                const sum = summarize(s);
                const tone = sectionTone(s, sum);
                return (
                  <TabsTrigger
                    key={s.type}
                    value={s.type}
                    className="h-auto py-1.5 px-2.5 text-[12px] gap-1.5"
                  >
                    <SectionDot tone={tone} />
                    <span>{s.label}</span>
                    {s.present && !s.parseError && sum.total > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {sum.valid}/{sum.total}
                      </span>
                    )}
                    {!s.present && (
                      <span className="text-[11px] text-muted-foreground">없음</span>
                    )}
                    {s.parseError && (
                      <span className="sf-text-neg text-[11px]">오류</span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {sections.map((s) => (
              <TabsContent key={s.type} value={s.type} className="flex-1 overflow-hidden mt-3 flex flex-col">
                <SectionPanel section={s} filter={filter} onFilter={setFilter} />
              </TabsContent>
            ))}
          </Tabs>

          <DialogFooter>
            {totals.error > 0 && onDownloadErrors && (
              <Button variant="outline" size="sm" onClick={onDownloadErrors}>
                <Download className="mr-1.5 h-4 w-4" />에러만 다운로드
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="mr-1.5 h-4 w-4" />취소
            </Button>
            <Button
              size="sm"
              disabled={totals.valid === 0 || loading}
              onClick={() => setConfirmOpen(true)}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              {loading ? '등록 중...' : `전체 등록 (유효 ${totals.valid}건)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>전체 등록</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            유효한 {totals.valid}건을 의존 순서대로 등록합니다.
            {totals.error > 0 && ` 에러 ${totals.error}건은 건너뜁니다.`}
            {' '}한 섹션이 실패해도 다음 섹션은 계속 시도하며, 결과는 등록 후 안내합니다.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button size="sm" onClick={() => { setConfirmOpen(false); onSubmit(); }}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImpactSummary({ items }: { items: ImpactItem[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-md border bg-[var(--surface)] px-3 py-2"
          style={{
            borderColor:
              item.tone === 'pos' ? 'var(--sf-pos)'
              : item.tone === 'warn' ? 'var(--sf-warn)'
              : item.tone === 'info' ? 'var(--sf-info)'
              : 'var(--sf-line-2)',
          }}
        >
          <div className="text-[11px] font-medium text-muted-foreground">{item.label}</div>
          <div className="mt-1 text-[15px] font-semibold text-[var(--ink)]">{item.value}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.sub}</div>
        </div>
      ))}
    </div>
  );
}

function SectionDot({ tone }: { tone: 'pos' | 'warn' | 'neg' | 'mute' }) {
  const color
    = tone === 'pos' ? 'var(--sf-pos)'
    : tone === 'warn' ? 'var(--sf-warn)'
    : tone === 'neg' ? 'var(--sf-neg)'
    : 'var(--sf-line-2)';
  return (
    <span
      aria-hidden
      style={{ background: color }}
      className="inline-block h-1.5 w-1.5 rounded-full"
    />
  );
}

interface PanelProps {
  section: UnifiedSection;
  filter: FilterMode;
  onFilter: (m: FilterMode) => void;
}

function SectionPanel({ section, filter, onFilter }: PanelProps) {
  if (!section.present) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center">
        <MinusCircle className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">{section.label} 시트 없음</p>
        <p className="text-xs text-muted-foreground">이 섹션은 등록에서 제외됩니다.</p>
      </div>
    );
  }
  if (section.parseError) {
    return (
      <div className="rounded-md border p-4" style={{ borderColor: 'var(--sf-neg-2)' }}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="sf-text-neg h-4 w-4" />
          <p className="text-sm font-medium">{section.label} 파싱 실패</p>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{section.parseError}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          이 섹션은 등록에서 제외됩니다. 헤더를 점검한 뒤 다시 업로드해주세요.
        </p>
      </div>
    );
  }

  if (section.declPreview) {
    return (
      <DeclarationPanel
        section={section}
        filter={filter}
        onFilter={onFilter}
      />
    );
  }

  if (section.preview) {
    return (
      <SimpleSectionPanel
        section={section}
        filter={filter}
        onFilter={onFilter}
      />
    );
  }

  return null;
}

/**
 * 단일 표 섹션 — 좌측 표 + 우측 에러/경고 사이드 패널.
 * 패널 항목 클릭 → 표가 그 행으로 scrollIntoView + 잠깐 노란 글로우.
 */
function SimpleSectionPanel({
  section,
  filter,
  onFilter,
}: {
  section: UnifiedSection;
  filter: FilterMode;
  onFilter: (m: FilterMode) => void;
}) {
  const tableRef = useRef<ImportPreviewTableHandle>(null);
  const [activeRow, setActiveRow] = useState<number | null>(null);
  // 강조는 잠깐 — 1.5초 후 자동 해제. 다음 클릭이 들어오면 타이머 재설정.
  useEffect(() => {
    if (activeRow == null) return;
    const t = window.setTimeout(() => setActiveRow(null), 1500);
    return () => window.clearTimeout(t);
  }, [activeRow]);

  function jump(rowNumber: number) {
    setActiveRow(rowNumber);
    tableRef.current?.scrollToRow(rowNumber);
  }

  if (!section.preview) return null;

  return (
    <div className="flex flex-col gap-2 overflow-hidden">
      <SectionMeta
        valid={section.preview.validRows}
        warning={section.preview.warningRows ?? section.preview.rows.filter((r) => r.valid && (r.warnings?.length ?? 0) > 0).length}
        total={section.preview.totalRows}
        filter={filter}
        onFilter={onFilter}
      />
      <div className="flex flex-1 gap-2 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <ImportPreviewTable
            ref={tableRef}
            rows={section.preview.rows}
            fields={FIELDS_MAP[section.type]}
            filter={filter}
            highlightedRow={activeRow}
          />
        </div>
        <ImportPreviewErrorList
          rows={section.preview.rows}
          onJump={jump}
          activeRow={activeRow}
        />
      </div>
    </div>
  );
}

/**
 * 면장 섹션 — declarations / costs 탭 각각이 자기 표 + 사이드 에러 패널.
 */
function DeclarationPanel({
  section,
  filter,
  onFilter,
}: {
  section: UnifiedSection;
  filter: FilterMode;
  onFilter: (m: FilterMode) => void;
}) {
  if (!section.declPreview) return null;
  const declValid = section.declPreview.declarations.filter((r) => r.valid).length;
  const declError = section.declPreview.declarations.filter((r) => !r.valid).length;
  const costValid = section.declPreview.costs.filter((r) => r.valid).length;
  const costError = section.declPreview.costs.filter((r) => !r.valid).length;
  return (
    <div className="flex flex-col gap-2 overflow-hidden">
      <SectionMeta
        valid={declValid + costValid}
        warning={summarize(section).warning}
        total={section.declPreview.declarations.length + section.declPreview.costs.length}
        filter={filter}
        onFilter={onFilter}
      />
      <Tabs defaultValue="declarations" className="flex-1 overflow-hidden flex flex-col">
        <TabsList>
          <TabsTrigger value="declarations">
            면장 ({declValid}/{section.declPreview.declarations.length})
            {declError > 0 && <span className="sf-text-neg"> · 에러 {declError}</span>}
          </TabsTrigger>
          <TabsTrigger value="costs">
            원가 ({costValid}/{section.declPreview.costs.length})
            {costError > 0 && <span className="sf-text-neg"> · 에러 {costError}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="declarations" className="flex-1 overflow-hidden mt-2">
          <DeclarationSubPanel
            rows={section.declPreview.declarations}
            fields={DECLARATION_FIELDS}
            filter={filter}
          />
        </TabsContent>
        <TabsContent value="costs" className="flex-1 overflow-hidden mt-2">
          <DeclarationSubPanel
            rows={section.declPreview.costs}
            fields={DECLARATION_COST_FIELDS}
            filter={filter}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DeclarationSubPanel({
  rows,
  fields,
  filter,
}: {
  rows: import('@/types/excel').ParsedRow[];
  fields: import('@/types/excel').FieldDef[];
  filter: FilterMode;
}) {
  const tableRef = useRef<ImportPreviewTableHandle>(null);
  const [activeRow, setActiveRow] = useState<number | null>(null);
  useEffect(() => {
    if (activeRow == null) return;
    const t = window.setTimeout(() => setActiveRow(null), 1500);
    return () => window.clearTimeout(t);
  }, [activeRow]);

  function jump(rowNumber: number) {
    setActiveRow(rowNumber);
    tableRef.current?.scrollToRow(rowNumber);
  }

  return (
    <div className="flex h-full gap-2 overflow-hidden">
      <div className="flex-1 overflow-auto">
        <ImportPreviewTable
          ref={tableRef}
          rows={rows}
          fields={fields}
          filter={filter}
          highlightedRow={activeRow}
        />
      </div>
      <ImportPreviewErrorList rows={rows} onJump={jump} activeRow={activeRow} />
    </div>
  );
}

interface MetaProps {
  valid: number;
  warning: number;
  total: number;
  filter: FilterMode;
  onFilter: (m: FilterMode) => void;
}

function SectionMeta({ valid, warning, total, filter, onFilter }: MetaProps) {
  const error = total - valid;
  const normal = valid - warning;
  return (
    <div className="flex items-center gap-2 text-xs">
      <CheckCircle2 className="sf-text-pos h-3.5 w-3.5" />
      <span className="font-medium">{total}건</span>
      <span className="text-muted-foreground">정상</span>
      <span className="sf-text-pos">{normal}</span>
      <span className="text-muted-foreground">경고</span>
      <span className="text-amber-600">{warning}</span>
      <span className="text-muted-foreground">에러</span>
      <span className="sf-text-neg">{error}</span>
      <div className="ml-auto flex gap-1">
        <FilterChip current={filter} mode="all" label="전체" onClick={onFilter} />
        <FilterChip current={filter} mode="valid" label="정상" onClick={onFilter} />
        <FilterChip current={filter} mode="warning" label="경고" onClick={onFilter} />
        <FilterChip current={filter} mode="error" label="에러" onClick={onFilter} />
      </div>
    </div>
  );
}

function FilterChip({
  mode, current, label, onClick,
}: {
  mode: FilterMode;
  current: FilterMode;
  label: string;
  onClick: (m: FilterMode) => void;
}) {
  const isActive = current === mode;
  return (
    <button
      type="button"
      onClick={() => onClick(mode)}
      className="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
      style={{
        background: isActive ? 'var(--sf-solar-bg)' : 'transparent',
        color: isActive ? 'var(--sf-solar-3)' : 'var(--sf-ink-3)',
        border: `1px solid ${isActive ? 'var(--sf-solar-2)' : 'transparent'}`,
        fontWeight: isActive ? 600 : 500,
      }}
    >
      {label}
    </button>
  );
}
