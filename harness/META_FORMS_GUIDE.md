# 메타 인프라 가이드 (Phase 4)

SolarFlow 의 **메타데이터 기반 UI 인프라** — config 파일 한 개만 추가하면 새 화면/폼/상세가 생긴다. 운영자는 GUI 로 라벨/컬럼/필드를 편집하고, 계열사 별로 override 할 수 있다.

> **⚡ 듀얼 product 관점 (RULES.md #0)** — 이 메타 인프라 + GUI 편집기는 SolarFlow ERP 의 부속 도구가 아니라 **그 자체로 product**. Webflow / Figma / Builder.io 부류의 화면 편집기를 만든다고 생각해라. 새 인프라 기능을 추가하면 편집기에도 픽커가 따라와야 하고, registry key 는 combobox 로 노출해야 하고, 편집기 UX 는 runtime 과 mimicry 해야 함. 자세한 판단 기준은 `harness/RULES.md` 참고.

## 목차

1. [개요](#개요)
2. [3-Layer 구성](#3-layer-구성)
3. [메타 폼 (MetaForm)](#메타-폼-metaform)
4. [메타 화면 (ListScreen)](#메타-화면-listscreen)
5. [메타 상세 (MetaDetail)](#메타-상세-metadetail)
6. [Registry — 코드 등록소](#registry--코드-등록소)
7. [운영자 GUI 편집기](#운영자-gui-편집기)
8. [계열사 포크 (Tenant)](#계열사-포크-tenant)
9. [zod 폼 → 메타 마이그레이션](#zod-폼--메타-마이그레이션)
10. [메타 한계선 — 코드에 남길 영역](#메타-한계선--코드에-남길-영역)

---

## 개요

| 항목 | 위치 | 역할 |
|---|---|---|
| **메타 config** | `frontend/src/config/{forms,screens,details}/<id>.ts` | 화면/폼 정의 (정적) |
| **Registry** | `frontend/src/templates/registry.tsx` | 코드 함수 등록 (cell renderer, computed formula, master source 등) |
| **MetaForm** | `frontend/src/templates/MetaForm.tsx` | 폼 렌더 엔진 |
| **ListScreen** | `frontend/src/templates/ListScreen.tsx` | 목록 화면 렌더 엔진 |
| **MetaDetail** | `frontend/src/templates/MetaDetail.tsx` | 상세 화면 렌더 엔진 |
| **DB override** | `ui_configs` 테이블 + `useResolvedConfig` 훅 | 운영자 GUI 편집 결과 |
| **Tenant overlay** | `config/tenants/<id>.ts` + runtime localStorage | 계열사 별 라벨/컬럼/필드 차별화 |

## 3-Layer 구성

```
defaultConfig (코드 base)
   ↓ applyTenantToX (코드 tenant overlay)
   ↓ runtime overlay (admin GUI 편집, localStorage)
tenant-aware config
   ↓ useResolvedConfig (DB override)
final config
   ↓ ListScreen / MetaForm / MetaDetail 렌더
화면
```

각 레이어는 **선택적**이고 **합산 적용**된다. 객체 (page/title) 는 deep merge, 배열 (columns/sections/metrics) 은 통째로 교체.

---

## 메타 폼 (MetaForm)

### 필드 타입 (10종)

| 타입 | 값 | 비고 |
|---|---|---|
| `text` | string | placeholder, minLength, maxLength, pattern |
| `number` | number | minValue, maxValue, **numberFormat** (천단위 콤마/원/USD) |
| `textarea` | string | rows |
| `select` | string | optionsFrom: static / enum / master, optionsDependsOn, staticOptionsIf |
| `multiselect` | string[] | 체크박스 리스트 |
| `switch` | boolean | toggle |
| `date` | 'YYYY-MM-DD' | defaultValue: `'@today'` 지원 |
| `datetime` | 'YYYY-MM-DDTHH:MM' | defaultValue: `'@now'` 지원 |
| `time` | 'HH:MM' | |
| `file` | File / File[] | `multiple: true` 시 배열 |
| `computed` | unknown | formula.computerId, dependsOn, readonly + payload 자동 포함 |

### MetaFormConfig 핵심 필드

```ts
{
  id: 'partner_form_v2',                 // registry/screen 에서 참조
  title: { create: '...', edit: '...' },
  dialogSize: 'sm' | 'md' | 'lg' | 'xl' | '2xl',
  draftAutoSave: true,                   // 입력 중 localStorage 자동 저장
  extraPayload: {                         // submit 시 자동 첨가
    static: { form_kind: 'demo' },
    fromContext: ['po_id'],               // MetaForm props.extraContext 에서
    fromStore: { company_id: 'selectedCompanyId' },  // appStore 에서
  },
  refine: [                               // 폼 단위 cross-field 검증
    { ruleId: 'limit_total_under_100m', message: '...', path: ['unit_price'] },
  ],
  sections: [
    { title: '기본 정보', tone: 'ink', cols: 2, fields: [...] },
    { title: 'Stage 1', tone: 'solar', cols: 3, fields: [...] },
    ...
  ],
}
```

### 필드 옵션 패턴

```ts
// 정적 옵션
{ optionsFrom: 'static', staticOptions: [{value: 'a', label: 'A'}, ...] }

// 동적 정적 옵션 (다른 필드 값에 따라 분기)
{ staticOptionsIf: {
    field: 'delivery_type',
    cases: [{ value: 'shipping', options: [...] }],
    fallback: [...]
  }
}

// Master 데이터 (registry.masterSources 참조)
{ optionsFrom: 'master', masterKey: 'manufacturers' }

// 의존 master (다른 필드 값을 context 로)
{ masterKey: 'manufacturers.byDomestic', optionsDependsOn: ['domestic_filter'] }

// Combobox (서버 검색 — masterSource.search 정의 시 자동 활성)
{ masterKey: 'products.search' }
```

### 검증

```ts
// 필드 단위 (FieldConfig)
required, minLength, maxLength, minValue, maxValue, pattern,
editableByRoles: ['admin'],         // 다른 역할은 자동 readonly

// 필드 표시 조건
visibleIf: { field: 'has_warranty', value: 'true' }

// 폼 단위 cross-field (MetaFormConfig.refine + registry.formRefinements)
```

### Computed 필드

```ts
// 메타 (config/forms/<...>.ts)
{ key: 'total_amount', label: '총액 (자동)', type: 'computed',
  formula: { computerId: 'multiply_qty_price' },
  dependsOn: ['quantity', 'unit_price'],
  formatter: 'number' }

// 코드 (registry.tsx)
export const computedFormulas: Record<string, ComputedFormula> = {
  'multiply_qty_price': (values, context) => {
    const q = Number(values.quantity), p = Number(values.unit_price);
    return Number.isFinite(q) && Number.isFinite(p) ? q * p : undefined;
  },
};
```

`dependsOn` 필드 값이 변경되면 자동 재계산. submit 시 payload 에 자동 포함.

---

## 메타 화면 (ListScreen)

### ListScreenConfig 핵심

```ts
{
  id: 'partners',
  page: { eyebrow: 'MASTER DATA', title: '거래처 관리', description: '...' },
  source: { hookId: 'usePartnerList' },        // registry.dataHooks
  requiresCompany: false,                       // 법인 미선택 시 안내
  filters: [...],
  searchable: { placeholder: '...', fields: ['partner_name', ...] },
  metrics: [
    { label: '전체', computerId: 'count', tone: 'solar', spark: 'auto' },
  ],
  columns: [
    { key: 'partner_name', label: '거래처명', sortable: true },
    { key: 'is_active', label: '상태', rendererId: 'active_badge' },
    { key: 'memo', label: '메모', hideable: true, hiddenByDefault: true },
  ],
  actions: [
    { id: 'create', trigger: 'header', kind: 'open_form', formId: 'partner_form' },
    { id: 'edit_row', trigger: 'row', kind: 'edit_form', formId: 'partner_form' },
    { id: 'delete_row', trigger: 'row', kind: 'confirm_call', endpoint: '/api/v1/partners/:id', method: 'DELETE', idField: 'partner_id' },
    { id: 'bulk_delete', trigger: 'bulk', kind: 'bulk_call', ... },
  ],
  forms: [
    { id: 'partner_form', componentId: 'partner_form_v2', endpoint: '/api/v1/partners', editEndpoint: '/api/v1/partners/:id', editIdField: 'partner_id' },
  ],
  rail: [{ blockId: 'partner_recent', props: { limit: 4 } }],
  emptyState: { message: '...', actionId: 'create' },
}
```

### 기능

- **정렬**: column.sortable=true → 헤더 클릭 (asc → desc → 해제)
- **컬럼 토글**: column.hideable=true → 컬럼 메뉴에서 on/off, localStorage 영속
- **멀티 선택**: actions 에 trigger='bulk' 액션 → 체크박스 컬럼 + 선택 시 toolbar 노출
- **인라인 액션**: trigger='row' (edit, delete 등)
- **헤더 액션**: trigger='header' (새로 등록 등)
- **Rail (사이드 패널)**: registry.railBlocks 컴포넌트 매핑

---

## 메타 상세 (MetaDetail)

```ts
{
  id: 'outbound_detail_simple',
  source: { hookId: 'useOutboundDetail' },
  header: { title: '출고 상세', actionsBlock: { blockId: 'outbound_actions' } },
  sections: [
    { title: '기본 정보', cols: 4, fields: [
      { key: 'outbound_date', label: '출고일', formatter: 'date' },
      { key: 'usage_category', label: '용도', formatter: 'enum', enumKey: 'USAGE_CATEGORY_LABEL' },
      ...
    ]},
    { title: 'B/L 연결', visibleIf: { field: 'bl_items', value: '__truthy' },
      contentBlock: { blockId: 'outbound_bl_items_section' } },
  ],
}
```

contentBlock 으로 복잡 위젯을 슬롯에 위임. 단순 데이터 표시는 100% 메타 가능.

---

## Registry — 코드 등록소

`frontend/src/templates/registry.tsx` 에 ID → 함수 매핑 등록:

```ts
export const cellRenderers: Record<string, CellRenderer> = {
  active_badge: (v) => v ? <span className="...">활성</span> : <span>비활성</span>,
  // ...
};

export const masterSources: Record<string, MasterOptionSource> = {
  partners: { load: async () => [...] },
  'manufacturers.byDomestic': {
    load: async (ctx) => filteredManufacturers(ctx?.domestic_foreign),
  },
  'products.search': {
    load: ..., search: (q) => ..., resolveLabel: async (id) => ...,
  },
};

export const computedFormulas: Record<string, ComputedFormula> = {
  multiply_qty_price: (values) => Number(values.quantity) * Number(values.unit_price),
};

export const formRefinements: Record<string, FormRefinement> = {
  limit_total_under_100m: (values) => Number(values.quantity) * Number(values.unit_price) <= 100_000_000,
};

// + dataHooks, detailDataHooks, metricComputers, toneComputers, sparkComputers,
// + subComputers, formComponents, detailComponents, railBlocks, toolbarExtras,
// + enumDictionaries, applyFormatter, getFieldValue
```

---

## 운영자 GUI 편집기

### `/ui-config-editor` (Phase 3)
- DB (`ui_configs` 테이블) 에 config 별 override 저장
- JSON 편집 + 시각 편집 (컬럼/메트릭/필드 인라인 편집)
- 적용 시 모든 사용자에 즉시 반영 (이벤트 + 캐시)

### `/tenant-config-editor` (Phase 4)
- 현재 tenant 의 runtime override 를 `localStorage` 에 저장
- partial JSON 입력 (예: `{ "page": { "title": "..." } }`)
- 코드 overlay 위에 한 층 더 얹음

---

## 계열사 포크 (Tenant)

### 추가하기

1. `stores/tenantStore.ts` 의 `TenantId` 와 `TENANT_LABELS` 에 신규 ID 추가
2. `config/tenants/<newId>.ts` 작성:
   ```ts
   export const newTenantOverrides: TenantOverrides = {
     screens: {
       companies: {
         page: { title: '...' },
         columns: [...],   // 통째로 교체
       },
     },
     forms: {
       company_form_v2: { title: { create: '...', edit: '...' } },
     },
   };
   ```
3. `config/tenants/index.ts` 의 `tenantOverrides` 에 추가
4. 사이드바 `TenantSwitcher` 에 자동 노출

### 전환

- 사이드바 dropdown
- URL `?tenant=<id>` (자동 양방향 동기화)
- localStorage 영속

---

## zod 폼 → 메타 마이그레이션

### 변환 패턴 (실제 사례)

| 폼 | 기존 zod | 메타 config | 절감 |
|---|---|---|---|
| POLineForm | 102 줄 | ~55 | -46% |
| CostForm | 249 줄 | ~120 | -52% |
| BLLineForm | 225 줄 | ~70 | -69% |
| ReceiptForm | 135 줄 | ~50 | -63% |
| DeclarationForm | 159 줄 | ~65 | -59% |
| **5 child 폼 합** | **870** | **~360** | **-59%** |

### 단계

1. 원본 zod 폼 분석 — 필드, 검증, 자동계산, extraPayload 패턴
2. `config/forms/<name>.ts` 작성 (sections + fields)
3. 자동계산은 `registry.computedFormulas` 에 등록 + `type: 'computed'`
4. 외부 ID (po_id 등) 는 `extraPayload.fromContext`
5. 회사ID 는 `extraPayload.fromStore: { company_id: 'selectedCompanyId' }`
6. master select 는 `masterSources` 에 등록 + `optionsFrom: 'master', masterKey: '...'`
7. `registry.formComponents` 에 wrapper 등록
8. (선택) `KNOWN_CONFIGS` 에 추가 → 운영자 GUI 편집 가능

---

## 메타 한계선 — 코드에 남길 영역

다음은 **메타화 부적합** — 코드 영역으로 유지하는 것이 자연스러움:

- **워크플로우 액션 시퀀스** (취소 처리, 다단계 승인, 상태 전이)
- **외부 위젯·계산 패널** (Landed Cost 패널, OCR 자동 입력)
- **편집 모드 토글** (인라인 편집 vs 다이얼로그)
- **3 모드 이상 패널** (예: 매출 패널 — 미등록·등록됨·편집중)
- **다단계 wizard** (부분적으로 메타 가능하나 step 간 분기 코드 필요)
- **OCR/Excel import** (외부 입력 처리)

**메타 한계선 데모 사례**: `OutboundDetailMetaDemoPage`, `DeclarationDetailMetaDemoPage` — 단순 데이터 표시 60% 메타 + 워크플로우 코드 영역.

---

## Phase 4 마일스톤 (참고)

| 항목 | 라우트 |
|---|---|
| 8 마스터 v2 (CRUD) | `/masters/{partners,companies,banks,warehouses,manufacturers,products,construction-sites}-v2` |
| 5 child 폼 메타화 | `/po-line-meta-demo`, `/cost-meta-demo`, `/child-forms-meta-demo` |
| 의존성·동적옵션 데모 | `/meta-form-deps-demo` |
| 면장 상세 메타 | `/declaration-detail-meta-demo` |
| 출고 상세 메타 | `/outbound-detail-meta-demo` |
| **계열사 포크 PoC** | `/tenant-fork-demo` |
| **운영자 GUI 편집기** | `/ui-config-editor`, `/tenant-config-editor` |
