// Phase 4 보강: MetaForm 메타 인프라 종합 시연 폼 (저장 없음 — UI 데모 전용)
// 17 기능 동시 시연:
//   1) visibleIf — has_warranty=true 시 warranty_months 노출
//   2) optionsDependsOn — manufacturer_id 옵션이 domestic_filter 값에 따라 필터됨
//   3) multiselect — features 다중 체크박스
//   4) file — product_image 파일 첨부
//   5) staticOptionsIf — delivery_slot 옵션이 delivery_type 값에 따라 분기
//   6) masterSource.search — linked_product_id combobox (서버 검색, 디바운스 300ms)
//   7) computed — total_price = quantity * unit_price (자동 계산, readonly)
//   8) extraPayload — static {form_kind:'demo'} 자동 첨가 + fromStore company_id
//   9) dialogSize='lg' — 더 넓은 폼 레이아웃
//   10) section title + tone — 단계별 색상 섹션 헤더
//   11) @today defaultValue — order_date 기본값 = 오늘
//   12) numberFormat='krw' — unit_price 천단위 콤마 입력
//   13) description — 필드 아래 설명 텍스트
//   14) refine (cross-field) — total <= 1억, warranty_months % 12 == 0
//   15) file.multiple — attachments 다중 파일
//   16) datetime/time — pickup_at, expected_time
//   17) draftAutoSave — 입력 중 localStorage 자동 저장, 복구

import type { MetaFormConfig } from '@/templates/types';

const depsDemo: MetaFormConfig = {
  id: 'deps_demo',
  title: { create: '의존성 데모', edit: '의존성 데모' },
  // Phase 4 보강 — 다이얼로그 크기 lg
  dialogSize: 'lg',
  // Phase 4 보강 — 외부 컨텍스트 자동 첨가
  extraPayload: {
    static: { form_kind: 'meta_demo' },
    fromStore: { company_id: 'selectedCompanyId' },
  },
  // Phase 4 보강 Tier 3 — 폼 단위 cross-field 검증
  refine: [
    {
      ruleId: 'limit_total_under_100m',
      message: '총액이 1억원을 초과합니다 (정책: quantity × unit_price ≤ 100,000,000).',
      path: ['unit_price'],
    },
    {
      ruleId: 'warranty_year_aligned',
      message: '보증 기간은 12 개월 단위여야 합니다 (12, 24, 36, ...).',
      path: ['warranty_months'],
    },
  ],
  // Phase 4 보강 Tier 3 — 초안 자동 저장
  draftAutoSave: true,
  sections: [
    // Phase 4 보강 — 섹션 제목 + tone (단계 그룹화)
    {
      title: '기본 정보',
      tone: 'ink',
      cols: 2,
      fields: [
        { key: 'product_name', label: '제품명', type: 'text', required: true, placeholder: '예: 데모 모듈' },
        // Phase 4 보강 — @today defaultValue (mount 시 오늘 날짜로 prefill)
        { key: 'order_date', label: '주문일', type: 'date', defaultValue: '@today' },
      ],
    },
    {
      title: '제조사 선택',
      tone: 'solar',
      cols: 1,
      fields: [
        {
          key: 'domestic_filter', label: '제조사 범위',
          type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: '전체', label: '전체' },
            { value: '국내', label: '국내만' },
            { value: '해외', label: '해외만' },
          ],
          defaultValue: '전체',
          // Phase 4 보강 — description (필드 아래 설명)
          description: '선택 즉시 아래 제조사 옵션이 필터됩니다 (optionsDependsOn 시연).',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        // 동적 옵션 — domestic_filter 값에 따라 옵션 변경
        {
          key: 'manufacturer_id', label: '제조사', type: 'select', required: true,
          optionsFrom: 'master',
          masterKey: 'manufacturers.byDomestic',
          optionsDependsOn: ['domestic_filter'],
        },
      ],
    },
    {
      title: '보증',
      tone: 'info',
      cols: 1,
      fields: [
        { key: 'has_warranty', label: '보증 포함', type: 'switch', defaultValue: false },
      ],
    },
    {
      cols: 1,
      fields: [
        // 의존성 필드 — has_warranty=true 일 때만 노출
        {
          key: 'warranty_months', label: '보증 개월 수', type: 'number', minValue: 1, maxValue: 240,
          visibleIf: { field: 'has_warranty', value: 'true' },
          description: '1~240 개월 사이로 입력 (visibleIf 로 has_warranty=true 일 때만 노출).',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        // 다중 선택 — 체크박스 리스트
        {
          key: 'features', label: '제품 특성 (복수 선택)', type: 'multiselect',
          optionsFrom: 'static',
          staticOptions: [
            { value: 'bifacial', label: '양면형(Bifacial)' },
            { value: 'half_cell', label: '하프셀' },
            { value: 'mbb', label: 'MBB(다중 바스바)' },
            { value: 'topcon', label: 'TOPCon' },
            { value: 'perc', label: 'PERC' },
          ],
        },
      ],
    },
    {
      cols: 1,
      fields: [
        // 동적 정적옵션 — delivery_type 분기
        {
          key: 'delivery_type', label: '배송 방식', type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: 'shipping', label: '택배 배송' },
            { value: 'pickup', label: '직접 픽업' },
          ],
          defaultValue: 'shipping',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        // staticOptionsIf — delivery_type 값에 따라 옵션 분기
        {
          key: 'delivery_slot', label: '시간대',
          type: 'select',
          optionsFrom: 'static',
          // staticOptionsIf 가 staticOptions 보다 우선
          staticOptionsIf: {
            field: 'delivery_type',
            cases: [
              {
                value: 'shipping',
                options: [
                  { value: 'standard', label: '일반(2~3일)' },
                  { value: 'express', label: '익일' },
                  { value: 'economy', label: '경제(4~5일)' },
                ],
              },
              {
                value: 'pickup',
                options: [
                  { value: 'pickup_morning', label: '오전 (10~12시)' },
                  { value: 'pickup_afternoon', label: '오후 (14~17시)' },
                ],
              },
            ],
            fallback: [{ value: '', label: '먼저 배송 방식 선택' }],
          },
        },
      ],
    },
    {
      title: '첨부 · 시간',
      tone: 'warn',
      cols: 1,
      fields: [
        // 단일 파일 (기존)
        { key: 'product_image', label: '제품 이미지 (단일)', type: 'file' },
        // Phase 4 보강 Tier 3 — multifile (File[])
        {
          key: 'attachments', label: '첨부 파일 (다중)', type: 'file', multiple: true,
          description: '여러 파일을 한 번에 선택 가능 (multiple=true).',
        },
      ],
    },
    {
      cols: 2,
      fields: [
        // Phase 4 보강 Tier 3 — datetime
        {
          key: 'pickup_at', label: '픽업 일시 (datetime)', type: 'datetime',
          defaultValue: '@now',
          description: 'datetime-local 입력. 기본값 @now.',
        },
        // Phase 4 보강 Tier 3 — time
        { key: 'expected_time', label: '예상 시간 (time)', type: 'time' },
      ],
    },
    {
      cols: 1,
      fields: [
        // 서버 측 검색 (combobox) — masterSource 에 search() 가 있으면 자동으로
        // combobox UI 활성화. 디바운스 300ms, 최대 20개 결과.
        // 편집 모드 prefill 은 resolveLabel(value) 사용.
        {
          key: 'linked_product_id', label: '연관 제품 (서버 검색)', type: 'select',
          optionsFrom: 'master',
          masterKey: 'products.search',
          placeholder: '품번/품명/제조사 약칭으로 검색',
        },
      ],
    },
    {
      title: '가격 계산',
      tone: 'pos',
      cols: 3,
      fields: [
        { key: 'quantity', label: '수량', type: 'number', minValue: 0 },
        // Phase 4 보강 — numberFormat='krw' (천단위 콤마 + '원' 접미)
        {
          key: 'unit_price', label: '단가', type: 'number', minValue: 0,
          numberFormat: 'krw',
          placeholder: '0',
        },
        // 계산 필드 (자동 = quantity * unit_price, readonly)
        {
          key: 'total_price', label: '총액 (자동)', type: 'computed',
          formula: { computerId: 'multiply_qty_price' },
          dependsOn: ['quantity', 'unit_price'],
          formatter: 'number',
        },
      ],
    },
  ],
};

export default depsDemo;
