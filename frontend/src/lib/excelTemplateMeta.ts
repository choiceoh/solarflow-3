import type { TemplateType } from '@/types/excel';

export const EXCEL_TEMPLATE_META_SHEET = '_SolarFlowMeta';
export const EXCEL_TEMPLATE_VERSION = '2026-05-11.1';

export type ExcelTemplateKind =
  | 'single'
  | 'unified_transaction'
  | 'unified_master'
  | 'rehearsal_sample';

export interface ExcelTemplateMeta {
  version: string;
  kind: ExcelTemplateKind;
  types: TemplateType[];
  generatedAt?: string;
}

const SUPPORTED_TEMPLATE_VERSIONS = new Set([EXCEL_TEMPLATE_VERSION]);

export function isSupportedExcelTemplateVersion(version: string): boolean {
  return SUPPORTED_TEMPLATE_VERSIONS.has(version);
}

export function assertExcelTemplateMeta(
  meta: ExcelTemplateMeta | null,
  allowedKinds: ExcelTemplateKind[],
  requiredTypes: TemplateType[] = [],
) {
  if (!meta) {
    throw new Error('양식 버전 정보가 없습니다. Import Hub에서 최신 양식을 다시 다운로드해주세요.');
  }
  if (!isSupportedExcelTemplateVersion(meta.version)) {
    throw new Error(`지원하지 않는 양식 버전입니다: ${meta.version}. 최신 양식을 다시 다운로드해주세요.`);
  }
  if (!allowedKinds.includes(meta.kind)) {
    throw new Error('업로드한 파일의 양식 종류가 현재 업로드 위치와 다릅니다.');
  }
  const typeSet = new Set(meta.types);
  const missing = requiredTypes.filter((type) => !typeSet.has(type));
  if (missing.length > 0) {
    throw new Error(`양식 메타에 필요한 섹션이 없습니다: ${missing.join(', ')}`);
  }
}
