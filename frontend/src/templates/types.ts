// Phase 1 PoC: 화면 템플릿 메타 스키마
// 출고관리 페이지를 메타데이터로 표현하기 위한 최소 스키마.
// 타입 안전성과 디버깅을 위해 런타임 참조는 모두 ID 키로만 한다.

import type { ReactNode } from 'react';

// MasterConsoleMetric의 tone과 일치하게 'neg' 제외
export type Tone = 'solar' | 'ink' | 'info' | 'warn' | 'pos';

// ── Renderers / Hooks / Computers / Handlers (registry-backed)
export type CellRendererId = string;
export type DataHookId = string;
export type ComputerId = string;
export type ActionHandlerId = string;
export type FormComponentId = string;
export type DetailComponentId = string;
export type RailBlockId = string;
export type ToolbarExtraId = string;
export type EnumKey = string;
export type MasterKey = string;

// ── Columns
export type Formatter = 'date' | 'number' | 'kw' | 'currency';

export interface ColumnConfig {
  key: string;                      // 데이터 필드 (점 표기 OK: 'sale.tax_invoice_date')
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: string;                   // CSS width (예: '120px')
  formatter?: Formatter;            // 단순 포맷
  rendererId?: CellRendererId;      // 커스텀 렌더러 (formatter보다 우선)
  fallback?: string;                // 빈 값 표시 (기본 '—')
  visibleIf?: string;               // 권한/조건 (PoC에서는 미사용)
  className?: string;
}

// ── Filters
export type FilterType = 'select' | 'month' | 'date' | 'text';

export interface FilterConfig {
  key: string;                      // hook 필터 객체의 key
  label: string;
  type: FilterType;
  optionsFrom?: 'enum' | 'master' | 'static' | 'months';
  enumKey?: EnumKey;                // 'OUTBOUND_STATUS_LABEL' 등
  masterKey?: MasterKey;            // 'manufacturers' | 'partners.customer'
  staticOptions?: { value: string; label: string }[];
  monthsBack?: number;              // type=month, optionsFrom=months
  // 필터 라벨이 메트릭 sub로 쓰일 때 '전체 X' 표기용
  allLabel?: string;
}

// ── Metrics (KPI 타일)
export interface MetricConfig {
  label: string;
  computerId: ComputerId;           // count | sum:field | count_where:status=active 등
  unit?: string;
  tone?: Tone | { computerId: ComputerId };  // 동적 톤은 computer 결과로 결정
  spark?: 'auto';                   // 현재 값 기반 sparkline
  subFromFilter?: string;           // 필터 키 — 그 필터 라벨이 sub로
  subFromComputer?: ComputerId;     // 동적 sub 텍스트 (subComputers 레지스트리)
}

// ── Actions
export type ActionTrigger = 'toolbar' | 'row' | 'header';
export type ActionKind = 'open_form' | 'edit_form' | 'confirm_call' | 'custom';
export type ActionVariant = 'primary' | 'outline' | 'ghost' | 'destructive';
export type ActionIcon = 'plus' | 'pencil' | 'trash';

export interface ActionConfig {
  id: string;
  label: string;
  trigger: ActionTrigger;
  kind: ActionKind;
  formId?: FormComponentId;         // kind=open_form|edit_form
  handlerId?: ActionHandlerId;      // kind=custom
  visibleIf?: string;
  iconId?: ActionIcon;
  variant?: ActionVariant;
  // kind=confirm_call: REST 호출 (URL의 :id는 idField로 치환)
  endpoint?: string;
  method?: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  idField?: string;                 // 행 데이터에서 :id로 사용할 필드
  body?: Record<string, unknown>;   // PATCH/POST body (정적)
  confirm?: {
    title: string;
    description: string;            // {field} 템플릿 치환 지원
    confirmLabel?: string;
    variant?: 'destructive' | 'default';
  };
}

// ── Row appearance
export interface RowAppearanceRule {
  whenEquals: { field: string; value: string };
  className: string;
}

// ── Rail (사이드 패널)
export interface RailBlockConfig {
  blockId: RailBlockId;             // 'recent_items' | 'static_text' 등
  props?: Record<string, unknown>;
}

// ── Toolbar extras (필터 버튼 우측)
export interface ToolbarExtraConfig {
  extraId: ToolbarExtraId;          // 'excel_toolbar' 등
  props?: Record<string, unknown>;
}

// ── Forms (편집 모드는 editEndpoint + editIdField로 처리)
export interface FormConfig {
  id: FormComponentId;
  componentId: string;              // 등록된 폼 컴포넌트
  endpoint: string;                 // POST 대상 (신규 등록)
  editEndpoint?: string;            // PUT 대상 (수정) — :id 치환
  editIdField?: string;             // 행 데이터에서 :id로 쓸 필드
}

// ── 클라이언트 검색 (서버 필터와 별도)
export interface SearchableConfig {
  placeholder?: string;
  fields: string[];                 // 행에서 검색 매칭할 필드들
}

// ── 단일 리스트 화면
export interface ListScreenConfig {
  id: string;
  page: { eyebrow: string; title: string; description: string };
  source: { hookId: DataHookId };
  filters: FilterConfig[];
  searchable?: SearchableConfig;
  toolbarExtras?: ToolbarExtraConfig[];
  metrics: MetricConfig[];
  columns: ColumnConfig[];
  actions?: ActionConfig[];         // toolbar/row/header에 분배됨
  requiresCompany?: boolean;        // 법인 선택 필요 여부 (기본 true — 운영 데이터)
  rowAppearance?: RowAppearanceRule[];
  onRowClick?:
    | { kind: 'detail'; detailId: DetailComponentId; idField: string }
    | { kind: 'navigate'; toPattern: string; idField: string };
  rail?: RailBlockConfig[];
  emptyState?: { message: string; actionId?: string };
  forms?: FormConfig[];
  tableTitleFromFilter?: string;
  tableSubFromTotal?: boolean;      // "X / Y개 표시" 식 부제 (검색 시)
}

// ── 탭 묶음 화면 — 메트릭/Rail은 공통이지만 어느 탭 데이터를 쓸지는 명시
export interface SharedMetricConfig extends MetricConfig {
  sourceTabKey: string;             // 메트릭에 사용할 데이터 탭
  subFromTab?: string;              // sub 라벨 출처 탭 (필터 적용)
}
export interface SharedRailBlockConfig extends RailBlockConfig {
  sourceTabKey?: string;            // 미지정이면 active tab
}

export interface ContentBlockConfig {
  blockId: string;                  // 'sale_summary_cards' 등
  props?: Record<string, unknown>;
}
export type ContentBlock = (props: {
  items: unknown[];
  config: Record<string, unknown>;
}) => ReactNode;

export interface TabbedListConfig {
  id: string;
  page: { eyebrow: string; title: string; description: string };
  metrics?: SharedMetricConfig[];
  rail?: SharedRailBlockConfig[];
  tabs: Array<{
    key: string;
    label: string;
    list: ListScreenConfig;
    aboveTable?: ContentBlockConfig;
  }>;
}

// ── Runtime 헬퍼 타입 (registry용)
// 레지스트리는 도메인 경계라 unknown으로 일원화하고, 각 등록 함수가 자체 cast로 타입을 좁힌다.
export type CellRenderer = (value: unknown, row: unknown) => ReactNode;
export type MetricComputer = (
  items: unknown[],
  filters: Record<string, string>,
) => string | number;
export type DataHookResult = { data: unknown[]; loading: boolean; reload: () => void };
export type DataHook = (filters: Record<string, string>) => DataHookResult;

export interface ActionContext {
  reload: () => void;
  openForm: (formId: FormComponentId) => void;
  selectRow: (id: string | null) => void;
}
export type ActionHandler = (ctx: ActionContext, row?: unknown) => void | Promise<void>;

export interface MasterOptionSource {
  load: () => Promise<{ value: string; label: string }[]>;
}

export type FormComponent = (props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (formData: Record<string, unknown>) => Promise<void>;
  editData?: unknown;               // 편집 모드 — 폼 컴포넌트가 prefill에 사용
}) => ReactNode;

export type DetailComponent = (props: {
  id: string;
  onBack: () => void;
}) => ReactNode;

export type RailBlock = (props: {
  items: unknown[];
  filters: Record<string, string>;
  config: Record<string, unknown>;
}) => ReactNode;

export type ToolbarExtra = (props: {
  config: Record<string, unknown>;
  openForm: (formId: FormComponentId) => void;
}) => ReactNode;
