// Phase 1 PoC: 화면 템플릿 메타 스키마
// 출고관리 페이지를 메타데이터로 표현하기 위한 최소 스키마.
// 타입 안전성과 디버깅을 위해 런타임 참조는 모두 ID 키로만 한다.

import type { ReactNode } from 'react';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';

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

export interface ColumnConfig extends ColumnVisibilityMeta {
  align?: 'left' | 'right' | 'center';
  width?: string;                   // CSS width (예: '120px')
  formatter?: Formatter;            // 단순 포맷
  rendererId?: CellRendererId;      // 커스텀 렌더러 (formatter보다 우선)
  fallback?: string;                // 빈 값 표시 (기본 '—')
  visibleIf?: string;               // 권한/조건 (PoC에서는 미사용)
  className?: string;
  // Phase 4 보강: 정렬 가능 헤더 (클릭 → asc → desc → 해제)
  sortable?: boolean;
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
// trigger='bulk' — 다중선택된 행에 일괄 적용 (체크박스 컬럼 + 선택 시 툴바 노출)
export type ActionTrigger = 'toolbar' | 'row' | 'header' | 'bulk';
// kind='bulk_call' — 선택된 모든 행에 confirm_call 처럼 endpoint 호출 (idField 로 :id 치환)
export type ActionKind = 'open_form' | 'edit_form' | 'confirm_call' | 'custom' | 'bulk_call';
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
  endpoint: string;                 // POST 대상 (신규 등록) — submitterId 없을 때만 사용
  editEndpoint?: string;            // PUT 대상 (수정) — :id 치환
  editIdField?: string;             // 행 데이터에서 :id로 쓸 필드
  // Phase 4: 단순 endpoint POST/PUT 으로 표현 안 되는 저장 (parent + child lines, multi-step) 처리.
  // 제공 시 endpoint 무시하고 registry.formSubmitters[submitterId] 호출.
  submitterId?: string;
}

// ── 메타 폼 (Phase 2)
export type FieldType =
  | 'text' | 'select' | 'number' | 'textarea' | 'switch' | 'date'
  | 'multiselect'   // Phase 4 보강: 다중 선택 (값은 string[])
  | 'file'          // Phase 4 보강: 파일 업로드 (값은 File | null — 캡처만, 업로드는 페이지가 처리)
  | 'computed'      // Phase 4 보강: 계산 필드 (다른 필드 값에서 자동 계산, readonly 표시 + payload 포함)
  | 'datetime'      // Phase 4 보강 Tier 3: ISO 8601 datetime-local (값은 'YYYY-MM-DDTHH:MM')
  | 'time';         // Phase 4 보강 Tier 3: 시간 (값은 'HH:MM')

export interface FieldConfig {
  key: string;                      // form 필드명 (zod 키 = react-hook-form 키)
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;

  // 검증
  minLength?: number;
  maxLength?: number;
  minValue?: number;                // number 타입
  maxValue?: number;
  pattern?: { regex: string; message: string };

  // select 옵션
  optionsFrom?: 'static' | 'enum' | 'master';
  staticOptions?: { value: string; label: string }[];
  enumKey?: EnumKey;                // 'PARTNER_TYPE_LABEL' 등 — registry.enumDictionaries
  masterKey?: MasterKey;            // 'manufacturers' 등
  // 동적 옵션 — 다른 필드 값(들)이 바뀌면 master 소스 재로드 (context 로 전달)
  // 예) optionsDependsOn: ['domestic_foreign'] + masterKey: 'manufacturers.byDomestic'
  //     → 사용자가 '국내' 선택 시 manufacturers.byDomestic.load({domestic_foreign: '국내'}) 호출
  optionsDependsOn?: string[];
  // 조건부 정적 옵션 — 다른 필드 값에 따라 staticOptions 자체가 바뀜 (master 소스 불필요)
  // 예) staticOptionsIf: { field: 'delivery_type',
  //                        cases: [{ value: 'shipping', options: [...] }, ...],
  //                        fallback: [...] }
  // staticOptions 와 함께 쓰면 staticOptionsIf 가 우선 (매칭되면 case 옵션, 아니면 fallback → staticOptions)
  staticOptionsIf?: {
    field: string;
    cases: { value: string | string[]; options: { value: string; label: string }[] }[];
    fallback?: { value: string; label: string }[];
  };

  // Phase 4 보강: 계산 필드 (type='computed') — 다른 필드 값에서 자동 계산
  // formula.computerId 는 registry.computedFormulas 에 등록된 함수 키.
  // dependsOn 에 나열된 필드 값이 변하면 재계산.
  // submit 시 payload 에 자동 포함 (사용자 입력 없음).
  formula?: { computerId: string };
  dependsOn?: string[];
  // 표시 포맷 (computed 필드 결과 포맷팅에 사용 — number/currency/date/kw)
  formatter?: Formatter;

  // Phase 4 보강: 천단위 콤마 등 숫자 입력 포맷
  // 'thousands' — 1,000,000 (단위 없음)
  // 'krw' — 1,000,000원
  // 'usd' — $1,000,000.00
  // 'plain' — 기본 (포맷 없음, 동작은 type=number 와 동일)
  numberFormat?: 'plain' | 'thousands' | 'krw' | 'usd';

  // Phase 4 보강: 필드 아래 설명 텍스트 (placeholder 와 다름 — 필드 옆 muted 글)
  description?: string;

  // Phase 4 보강 Tier 3: 파일 다중 업로드 (type='file' 와 함께)
  // true 면 값은 File[], 표시는 메타정보 리스트
  multiple?: boolean;

  // 권한별 readonly (PoC: 단순 boolean)
  readOnly?: boolean;
  // 편집 가능한 역할 목록 — 현재 사용자가 이 목록에 없으면 자동 readOnly
  // (예: ['admin'] 이면 admin만 편집 가능, 나머지는 readOnly)
  editableByRoles?: string[];

  // 조건부 표시 — 다른 필드 값에 따라 노출/숨김
  // source 'field' (기본) — 같은 폼의 다른 필드 watchedValues 비교
  // source 'context' — MetaForm props.extraContext 의 값 비교 (페이지가 주입한 부모 컨텍스트)
  visibleIf?: {
    field: string;
    value: string | string[];
    source?: 'field' | 'context';
  };
  // Phase 4 보강: 조건부 readOnly — 다른 필드 값/컨텍스트 값에 따라 readonly 처리
  // (editableByRoles 와 함께 동작 — 둘 중 하나라도 readonly 면 readonly)
  readOnlyIf?: {
    field: string;
    value: string | string[];
    source?: 'field' | 'context';
  };
}

export interface FormSection {
  cols?: 1 | 2 | 3;                 // grid 컬럼 수 (기본 1)
  fields: FieldConfig[];
  // Phase 4 보강: 섹션 헤더 (단계 그룹화 — CostForm "Stage 1: FOB" 등)
  title?: string;
  tone?: Tone;                      // 헤더 색상 (solar/ink/info/warn/pos)
}

// Phase 4 보강: 다이얼로그 크기 (max-w-md/lg/xl/2xl) — 큰 폼은 lg 이상
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

// Phase 4 보강: 폼 외부 컨텍스트를 payload 에 자동 첨가
// (po_id, declaration_id, company_id 등 — 페이지가 직접 합치던 패턴을 메타로)
export interface ExtraPayloadConfig {
  // 항상 포함되는 정적 값 (예: { source: 'meta_form_v2' })
  static?: Record<string, unknown>;
  // MetaForm props 의 extraContext 에서 키 추출 (예: ['po_id', 'declaration_id'])
  fromContext?: string[];
  // appStore 의 키에서 추출 (예: { company_id: 'selectedCompanyId' })
  fromStore?: Record<string, string>;
}

// Phase 4 보강: 계산 함수 시그니처 (registry.computedFormulas)
export type ComputedFormula = (
  values: Record<string, unknown>,
  context?: Record<string, unknown>,
) => unknown;

// Phase 4 보강: 폼 저장 함수 (registry.formSubmitters)
// FormConfig.submitterId 가 이 키를 참조. parent + child lines 같이 multi-step 저장 처리.
// data: 폼이 onSubmit 으로 넘긴 값 (id 포함 가능 — 수정 시).
// editData: 편집 모드일 때 원본 (없으면 신규).
export type FormSubmitter = (
  data: Record<string, unknown>,
  editData: unknown | null,
) => Promise<void>;

// Phase 4 보강 Tier 3: 폼 단위 cross-field 검증 함수 (registry.formRefinements)
// values 가 통과 → true, 실패 → false. zod superRefine 으로 통합.
export type FormRefinement = (values: Record<string, unknown>) => boolean;

export interface FormRefineRule {
  ruleId: string;                   // registry.formRefinements 키
  message: string;                  // 실패 시 표시 메시지
  path?: string[];                  // 에러를 표시할 필드 경로 (미지정 시 form-level)
}

export interface MetaFormConfig {
  id: string;                       // 'partner_form_v2' — registry/screen에서 참조
  title: { create: string; edit: string };
  sections: FormSection[];
  // Phase 4 보강
  dialogSize?: DialogSize;          // 기본 'md'
  extraPayload?: ExtraPayloadConfig;
  // Phase 4 보강 Tier 3: 폼 단위 cross-field 검증 (예: previous_limit !== new_limit)
  refine?: FormRefineRule[];
  // Phase 4 보강 Tier 3: 초안 localStorage 자동 저장 (debounced 500ms)
  // 신규 등록 모드에만 적용 — 편집 모드는 editData 가 진실 소스.
  draftAutoSave?: boolean;
  // Phase 4 보강: 다단계 wizard — 각 section.title 이 step 라벨이 됨.
  // 활성 시 한 step 씩 렌더 + 이전/다음/저장 버튼 + 진행률 표시.
  // 'previous' → 단순 이동 / 'next' → 현 step 내 필드 검증 후 이동 / 'submit' → 마지막 step 만 노출.
  wizard?: boolean;
}

// ── 메타 상세화면 (Phase 2.5)
// Detail은 입력이 아니라 데이터 표시라 Form보다 메타 친화적.
// 단, 워크플로우 버튼·편집 모드·외부 패널은 contentBlock 슬롯으로 위임.
export type DetailFormatter = 'date' | 'number' | 'kw' | 'currency' | 'enum';

export interface DetailFieldConfig {
  key: string;                      // 점 표기 OK ('sale.customer_name')
  label: string;
  formatter?: DetailFormatter;
  enumKey?: EnumKey;                // formatter='enum'일 때 사전 키
  rendererId?: CellRendererId;      // 셀 렌더러 재사용 (registry.cellRenderers)
  span?: 1 | 2 | 3 | 4;
  fallback?: string;                // 빈 값 표시 (기본 '—')
  visibleIf?: { field: string; value: string | string[] };
  // 단순 단위 접미사 (formatter로 표현 안 되는 "원/Wp" 등)
  suffix?: string;
}

export interface DetailSectionConfig {
  title: string;
  cols?: 2 | 3 | 4;                 // grid columns (기본 4)
  fields?: DetailFieldConfig[];     // 데이터 필드 (없으면 contentBlock 사용)
  contentBlock?: ContentBlockConfig; // 섹션 본문을 통째로 커스텀 블록에
  badgesBlock?: ContentBlockConfig; // 헤더 우측 배지 슬롯 (status 등)
  actionsBlock?: ContentBlockConfig; // 헤더 우측 액션 슬롯 (수정 버튼 등)
  visibleIf?: { field: string; value: string | string[] };
}

export interface MetaDetailConfig {
  id: string;
  source: { hookId: DataHookId };   // useOutboundDetail 등 — id 받아 단건 fetch
  header: {
    title: string;
    actionsBlock?: ContentBlockConfig;
  };
  sections: DetailSectionConfig[];
  extraBlocks?: ContentBlockConfig[];
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
  // context: optionsDependsOn 으로 선언된 다른 필드들의 현재 값
  // 미사용 source 는 인자를 무시. 하위호환 — 기존 source 들은 그대로 작동
  load: (context?: Record<string, unknown>) => Promise<{ value: string; label: string }[]>;
  // Phase 4 보강: 서버 측 검색 (대용량 옵션) — 정의되면 UI 가 combobox 모드로 전환
  // 입력 변화 시 디바운스 호출. load 와 비슷하나 query 파라미터 추가
  search?: (query: string, context?: Record<string, unknown>) => Promise<{ value: string; label: string }[]>;
  // 단일 값 라벨 조회 — 편집 모드 prefill 시 또는 search 결과 밖의 값 표시용
  // 미정의면 load() 결과에서 찾아 폴백
  resolveLabel?: (value: string, context?: Record<string, unknown>) => Promise<string | null>;
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
