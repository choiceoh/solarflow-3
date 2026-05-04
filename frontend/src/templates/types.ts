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
  // 메타 인프라 확장: 인라인 편집 가능 (ListScreen.inlineEdit.enabled 와 함께 사용)
  // 셀 클릭 → input → blur/Enter 시 endpoint PATCH 자동 저장.
  inlineEditable?: boolean;
  // 메타 인프라 확장: 인라인 편집 시 input 타입 (text|number|select|date)
  inlineEditType?: 'text' | 'number' | 'select' | 'date';
  // select 타입 시 옵션 (static)
  inlineEditOptions?: { value: string; label: string }[];
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
  sub?: string;                     // 정적 sub 텍스트 (subFromFilter/subFromComputer 가 비어있을 때 사용)
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
  | 'time'          // Phase 4 보강 Tier 3: 시간 (값은 'HH:MM')
  | 'child_array'   // Phase 4 — Step 3 prep: 자식 행 배열 (BL lines, PO lines 등). childFields 로 구조 정의.
  | 'date_range'    // Phase 4 메타 인프라 확장: 시작/종료 날짜 페어 — { start: string; end: string } 객체 값
  | 'currency_amount' // 통화+금액 페어 — { currency: 'USD'|'KRW'|...; amount: number } 객체 값
  | 'address'       // 주소 — { postcode: string; road: string; detail: string } (Daum/Kakao postcode 옵션)
  | 'rich_text';    // 마크다운/서식 메모 — string (간단 textarea + 미리보기)

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
  // 사용자에게 표시 + AI 어시스턴트의 [화면 도움말] 섹션에 자동 주입.
  description?: string;
  // AI 어시스턴트 전용 추가 컨텍스트 (사용자에게는 표시 안 됨).
  // description 으로 표현하기엔 길거나 내부 설명이 필요한 경우 (예: "이 필드는 PO 등록 시
  // 자동 채워지지만 admin 은 수동 수정 가능").
  aiHint?: string;

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

  // Phase 4 — Step 3 prep: child_array 자식 행 정의
  // type='child_array' 일 때 사용. 각 자식 행이 이 fields 로 구성됨.
  // 값: 행별 { [key]: value } 객체의 배열 (e.g. lines: BLLineItem[])
  childFields?: FieldConfig[];
  addLabel?: string;                // 추가 버튼 라벨 (기본 "+ 추가")
  minItems?: number;                // 최소 행 (validation)
  maxItems?: number;                // 최대 행
  childCols?: 1 | 2 | 3 | 4;        // 자식 행 grid 컬럼 (기본 4)

  // Phase 4 — Step 3 prep: 이 필드 값 변경 시 다른 필드 자동 채우기
  // registry.fieldCascades[cascadeId] 호출 — sourceValue/values/setValue/context 받음.
  cascadeId?: string;

  // 메타 인프라 확장: type='currency_amount' 의 통화 옵션 (기본 USD/KRW)
  currencyOptions?: { value: string; label: string }[];

  // 메타 인프라 확장 (보안):
  // 이 역할들에는 값을 마스킹 (***) 표시. e.g. ['viewer', 'manager'] → 단가/원가 숨김.
  maskByRoles?: string[];
  // 동적 권한 — 컨텍스트 기반 권한 체크. 호출 시 false 반환하면 readOnly + 마스킹.
  // registry.permissionGuards[id] (Phase 5 follow-up)
  permissionGuardId?: string;

  // 레이아웃: 입력 칸 가로폭 상한 — grid 셀 안에서 input 이 실제 데이터 길이에 맞게 좁아지도록.
  // 미지정 시 type 별 기본값 적용 (date/time → sm, number → sm, text → lg, textarea → full 등).
  // 항상 max-width 만 — grid 셀이 더 좁으면 셀 폭이 우선 (모바일/좁은 다이얼로그 호환).
  // xs ~96px / sm ~144px / md ~224px / lg ~320px / xl ~448px / full = 제한 없음.
  width?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export interface FormSection {
  cols?: 1 | 2 | 3 | 4;             // grid 컬럼 수 (기본 1)
  fields?: FieldConfig[];           // contentBlock 만 쓰는 섹션은 비울 수 있음
  // Phase 4 보강: 섹션 헤더 (단계 그룹화)
  title?: string;
  tone?: Tone;                      // 헤더 색상 (solar/ink/info/warn/pos)
  // Phase 4 — Step 3 prep: 임의 React 컴포넌트 슬롯
  // 제공 시 fields 대신 렌더 (registry.formContentBlocks[blockId] 호출)
  // 메타로 표현 안 되는 OCR 위젯, 결제조건 파서 등 도메인 특수 로직 임베드용.
  contentBlock?: ContentBlockConfig;
  // 메타 인프라 확장: 역할별 섹션 노출 (admin 전용 섹션 등). 빈 배열/미지정 = 모두 가능.
  visibleByRoles?: string[];
  // 메타 인프라 확장: 섹션 접기/펼치기. true 면 기본 펼침, 'collapsed' 면 기본 접힘.
  collapsible?: boolean | 'collapsed';
  // 메타 인프라 확장: 다른 필드 값에 따라 섹션 통째로 노출/숨김 (FieldConfig.visibleIf 와 동일 시그니처)
  visibleIf?: { field: string; value: string | string[]; source?: 'field' | 'context' };
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

// Phase 4 — Step 3 prep: 한 필드 값 변경 시 다른 필드들 자동 채우기 (cascade).
// 예: PO 선택 → 그 PO 의 LC/제조사/통화 자동 fill.
// FieldConfig.cascadeId 가 이 키를 참조 (registry.fieldCascades).
// 함수는 idempotent 해야 함 — 결과가 같으면 setValue 호출 안 함 (무한 루프 방지).
export type FieldCascade = (
  sourceValue: unknown,
  values: Record<string, unknown>,
  setValue: (key: string, value: unknown) => void,
  context?: Record<string, unknown>,
) => void | Promise<void>;

// Phase 4 — Step 3 prep: 폼 안에 임의 React 컴포넌트 임베드 (FormSection.contentBlock 슬롯용)
// list 의 ContentBlock 과 다른 시그니처 — form 의 watch/setValue API 와 extraContext 받음.
export interface FormContentBlockProps {
  /** react-hook-form 의 watch — 키 미지정 시 전체, 키 지정 시 해당 필드 값 */
  watch: (name?: string) => unknown;
  /** 다른 필드 값 자동 채움 등 */
  setValue: (name: string, value: unknown) => void;
  /** 현재 모든 폼 값 (한 번 스냅샷) */
  getValues: () => Record<string, unknown>;
  /** 페이지가 주입한 외부 컨텍스트 (BL OCR 파일 등) */
  extraContext?: Record<string, unknown>;
  /** ContentBlockConfig.props 통과 */
  config?: Record<string, unknown>;
}
export type FormContentBlock = (props: FormContentBlockProps) => import('react').ReactNode;

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

// 메타 인프라 확장: 비동기 cross-field 검증 (예: BL 번호 DB 중복 체크)
// MetaForm 의 submit 직전에 실행. 실패 시 onSubmit 호출 안 됨 + 에러 표시.
// fn 은 true(통과) 또는 string(에러 메시지) 반환. 비동기 OK.
export type AsyncFormRefinement = (
  values: Record<string, unknown>,
  context?: Record<string, unknown>,
) => Promise<boolean | string>;

export interface AsyncRefineRule {
  ruleId: string;                   // registry.asyncRefinements 키
  message: string;                  // fn 이 false 반환 시 표시 (string 반환 시 그게 우선)
  path?: string[];                  // 에러를 표시할 필드 경로
}

export interface MetaFormConfig {
  id: string;                       // 'partner_form_v2' — registry/screen에서 참조
  title: { create: string; edit: string };
  // 폼 단위 도움말 — 사용자 표시 (다이얼로그 헤더 sub) + AI 어시스턴트 [화면 도움말] 자동 주입.
  description?: string;
  // AI 전용 추가 컨텍스트 (사용자에게는 표시 안 됨).
  aiHint?: string;
  sections: FormSection[];
  // Phase 4 보강
  dialogSize?: DialogSize;          // 기본 'md'
  extraPayload?: ExtraPayloadConfig;
  // Phase 4 보강 Tier 3: 폼 단위 cross-field 검증 (예: previous_limit !== new_limit)
  refine?: FormRefineRule[];
  // 메타 인프라 확장: 비동기 cross-field 검증 (DB 중복 체크 등). submit 직전 실행.
  asyncRefine?: AsyncRefineRule[];
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
  // 필드 도움말 (라벨 옆 tooltip) + AI 어시스턴트 [화면 도움말] 자동 주입.
  description?: string;
  // AI 전용 추가 컨텍스트 (사용자에게는 표시 안 됨).
  aiHint?: string;
  // 메타 인프라 확장: 인라인 편집 (이 필드 클릭 시 input → 즉시 저장)
  inlineEditable?: boolean;
  inlineEditType?: 'text' | 'number' | 'select' | 'date';
  inlineEditOptions?: { value: string; label: string }[];
}

export interface DetailSectionConfig {
  title: string;
  cols?: 1 | 2 | 3 | 4;             // grid columns (기본 4) — 1은 단일 필드 풀폭 섹션
  fields?: DetailFieldConfig[];     // 데이터 필드 (없으면 contentBlock 사용)
  contentBlock?: ContentBlockConfig; // 섹션 본문을 통째로 커스텀 블록에
  badgesBlock?: ContentBlockConfig; // 헤더 우측 배지 슬롯 (status 등)
  actionsBlock?: ContentBlockConfig; // 헤더 우측 액션 슬롯 (수정 버튼 등)
  visibleIf?: { field: string; value: string | string[] };
}

// 메타 인프라 확장: Detail 탭 구조 (BLDetailView 같은 multi-tab 상세 화면)
export interface DetailTabConfig {
  key: string;                      // 탭 식별자
  label: string;                    // 탭 라벨
  sections?: DetailSectionConfig[]; // 데이터 섹션 (탭 안에서)
  contentBlock?: ContentBlockConfig; // 또는 통째로 커스텀 컴포넌트 (BLLineTable 같은)
  visibleIf?: { field: string; value: string | string[] };
}

export interface MetaDetailConfig {
  id: string;
  // 상세 화면 도움말 — 사용자 표시 (헤더 sub) + AI 어시스턴트 [화면 도움말] 자동 주입.
  description?: string;
  // AI 전용 추가 컨텍스트 (사용자에게는 표시 안 됨).
  aiHint?: string;
  source: { hookId: DataHookId };   // useOutboundDetail 등 — id 받아 단건 fetch
  header: {
    title: string;
    actionsBlock?: ContentBlockConfig;
  };
  sections: DetailSectionConfig[];
  extraBlocks?: ContentBlockConfig[];
  // 메타 인프라 확장: 탭 모드 (sections 대신 또는 함께). 제공 시 탭 네비 + 각 탭 내 sections/contentBlock.
  tabs?: DetailTabConfig[];
  defaultTab?: string;              // 기본 활성 탭 key
  // 메타 인프라 확장: 인라인 편집 (DetailField.inlineEditable=true 인 필드 즉시 저장)
  inlineEdit?: {
    enabled: boolean;
    endpoint?: string;              // PATCH endpoint (e.g. '/api/v1/bls/:id')
    idField?: string;               // 행 데이터에서 :id 로 쓸 필드
  };
  // 우측 사이드바 — 레지스트리에 등록된 contentBlock 들을 카드처럼 stack.
  // 미지정 시 단일 컬럼 (기존 동작). 지정 시 grid-cols-[1fr_320px] 레이아웃.
  rail?: ContentBlockConfig[];
}

// ── 클라이언트 검색 (서버 필터와 별도)
export interface SearchableConfig {
  placeholder?: string;
  fields: string[];                 // 행에서 검색 매칭할 필드들
}

// ── 단일 리스트 화면
export interface ListScreenConfig {
  id: string;
  page: { eyebrow: string; title: string; description: string; aiHint?: string };
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
  // 메타 인프라 확장: pagination 설정. 미지정 시 client-side, 모든 행 표시.
  // serverMode 시 dataHook 이 _page/_limit 필터 받아 paged data 반환 (반드시 total 도 반환).
  pagination?: {
    defaultPageSize?: number;       // 기본 50
    allowedSizes?: number[];        // 사용자 선택 가능 사이즈 (e.g. [25, 50, 100])
    serverMode?: boolean;           // true 면 dataHook 이 서버 측 pagination 처리
  };
  // 메타 인프라 확장: 인라인 편집 가능 컬럼 (form 안 열고 셀 클릭으로 수정)
  // 활성 시 col.inlineEditable=true 인 컬럼만 편집 가능.
  // 저장 endpoint: /api/v1/<entity>/:id PATCH { [col.key]: newValue }
  inlineEdit?: {
    enabled: boolean;
    endpoint?: string;              // PATCH endpoint (e.g. '/api/v1/bls/:id')
    idField?: string;               // 행 데이터에서 :id 로 쓸 필드
  };
  // 메타 인프라 확장: 저장된 뷰 (admin 이 filter+sort+columns 명명 저장)
  // localStorage 'sf.list.<id>.savedViews' 에 저장. 로드 시 활성 뷰 적용.
  savedViews?: {
    enabled: boolean;
    storage?: 'localStorage' | 'db'; // 기본 localStorage
  };
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
  page: { eyebrow: string; title: string; description: string; aiHint?: string };
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
// 메타 인프라 확장: total — server pagination 시 전체 행 수 (data 는 현재 page 만 포함).
// client-mode 에선 omit. ListScreen 이 fallback 으로 data.length 사용.
export type DataHookResult = { data: unknown[]; loading: boolean; reload: () => void; total?: number };
export type DataHook = (filters: Record<string, string>) => DataHookResult;

export interface ActionContext {
  reload: () => void;
  openForm: (formId: FormComponentId) => void;
  selectRow: (id: string | null) => void;
}
export type ActionHandler = (ctx?: ActionContext, row?: unknown) => void | Promise<void>;

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
