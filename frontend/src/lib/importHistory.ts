import type {
  TemplateType,
  UnifiedImportPreview,
  UnifiedSection,
  UnifiedSubmitResult,
} from '@/types/excel';

const IMPORT_HISTORY_KEY = 'sf.import.history.v1';
const IMPORT_HISTORY_LIMIT = 12;

export type ImportHistoryStatus = 'preview' | 'success' | 'partial' | 'failed';

export interface ImportHistorySection {
  type: TemplateType;
  label: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  importedRows?: number;
  status?: 'success' | 'failed' | 'skipped' | 'pending';
}

export interface ImportHistoryEntry {
  id: string;
  createdAt: string;
  fileName: string;
  status: ImportHistoryStatus;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  importedRows: number;
  sections: ImportHistorySection[];
}

function safeArray(value: unknown): ImportHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ImportHistoryEntry => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Partial<ImportHistoryEntry>;
    return typeof row.id === 'string'
      && typeof row.createdAt === 'string'
      && typeof row.fileName === 'string'
      && Array.isArray(row.sections);
  });
}

function makeHistoryId(fileName: string) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${fileName}-${suffix}`;
}

function countSection(section: UnifiedSection): ImportHistorySection {
  if (!section.present || section.parseError) {
    return {
      type: section.type,
      label: section.label,
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: section.parseError ? 1 : 0,
      status: section.parseError ? 'failed' : 'skipped',
    };
  }

  if (section.declPreview) {
    const rows = [...section.declPreview.declarations, ...section.declPreview.costs];
    const validRows = rows.filter((row) => row.valid).length;
    const warningRows = rows.filter((row) => row.valid && (row.warnings?.length ?? 0) > 0).length;
    return {
      type: section.type,
      label: section.label,
      totalRows: rows.length,
      validRows,
      warningRows,
      errorRows: rows.length - validRows,
      status: 'pending',
    };
  }

  const preview = section.preview;
  if (!preview) {
    return {
      type: section.type,
      label: section.label,
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0,
      status: 'skipped',
    };
  }

  return {
    type: section.type,
    label: section.label,
    totalRows: preview.totalRows,
    validRows: preview.validRows,
    warningRows: preview.warningRows ?? 0,
    errorRows: preview.errorRows,
    status: 'pending',
  };
}

function totalsFromSections(sections: ImportHistorySection[]) {
  return sections.reduce(
    (acc, section) => ({
      totalRows: acc.totalRows + section.totalRows,
      validRows: acc.validRows + section.validRows,
      warningRows: acc.warningRows + section.warningRows,
      errorRows: acc.errorRows + section.errorRows,
      importedRows: acc.importedRows + (section.importedRows ?? 0),
    }),
    { totalRows: 0, validRows: 0, warningRows: 0, errorRows: 0, importedRows: 0 },
  );
}

export function loadImportHistory(): ImportHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(IMPORT_HISTORY_KEY);
    if (!raw) return [];
    return safeArray(JSON.parse(raw)).slice(0, IMPORT_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveImportHistory(entries: ImportHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      IMPORT_HISTORY_KEY,
      JSON.stringify(entries.slice(0, IMPORT_HISTORY_LIMIT)),
    );
  } catch {
    // localStorage가 막힌 환경에서는 화면 동작만 유지한다.
  }
}

export function clearImportHistory() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(IMPORT_HISTORY_KEY);
  } catch {
    // noop
  }
}

export function prependImportHistory(
  entries: ImportHistoryEntry[],
  entry: ImportHistoryEntry,
): ImportHistoryEntry[] {
  return [entry, ...entries].slice(0, IMPORT_HISTORY_LIMIT);
}

export function buildPreviewHistoryEntry(preview: UnifiedImportPreview): ImportHistoryEntry {
  const sections = preview.sections.map(countSection);
  const totals = totalsFromSections(sections);
  return {
    id: makeHistoryId(preview.fileName),
    createdAt: new Date().toISOString(),
    fileName: preview.fileName,
    status: 'preview',
    ...totals,
    sections,
  };
}

export function buildSubmitHistoryEntry(
  fileName: string,
  result: UnifiedSubmitResult,
): ImportHistoryEntry {
  const sections: ImportHistorySection[] = result.outcomes.map((outcome) => ({
    type: outcome.type,
    label: outcome.label,
    totalRows: outcome.result
      ? outcome.result.imported_count + outcome.result.error_count
      : 0,
    validRows: outcome.result?.imported_count ?? 0,
    warningRows: outcome.result?.warning_count ?? 0,
    errorRows: outcome.result?.error_count ?? (outcome.status === 'failed' ? 1 : 0),
    importedRows: outcome.result?.imported_count ?? 0,
    status: outcome.status,
  }));
  const totals = totalsFromSections(sections);
  const failed = sections.some((section) => section.status === 'failed' || section.errorRows > 0);
  const success = sections.some((section) => section.status === 'success' && (section.importedRows ?? 0) > 0);
  const status: ImportHistoryStatus = failed && success ? 'partial' : failed ? 'failed' : 'success';
  return {
    id: makeHistoryId(fileName),
    createdAt: new Date().toISOString(),
    fileName,
    status,
    ...totals,
    sections,
  };
}
