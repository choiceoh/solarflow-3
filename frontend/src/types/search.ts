// 검색 타입 (Step 31 — Rust search API 응답과 정확히 일치)

export interface SearchResponse {
  query: string;
  intent: string;
  parsed: ParsedInfo;
  results: SearchResult[];
  warnings: string[];
  calculated_at: string;
}

// ParsedInfo — optional 필드는 Rust skip_serializing_if → 필드 자체 없을 수 있음
export interface ParsedInfo {
  manufacturer?: string;
  spec_wp?: number;
  month?: string;
  days?: number;
  keywords: string[];
}

export interface SearchResult {
  result_type: string;
  title: string;
  data: unknown;
  link: SearchLink;
}

export interface SearchLink {
  module: string;
  params: Record<string, string>;
}

// module → 프론트 페이지 경로 매핑
export const SEARCH_MODULE_ROUTE: Record<string, string> = {
  inventory:           '/inventory',
  po:                  '/procurement',
  procurement:         '/procurement',
  outbound:            '/outbound',
  lc:                  '/banking',
  banking:             '/banking',
  'customer-analysis': '/orders',
  orders:              '/orders',
  inbound:             '/inbound',
  partner:             '/masters/partners',
  'construction-sites': '/masters/construction-sites',
};
