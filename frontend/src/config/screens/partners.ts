// Phase 1.5 PoC: 거래처 마스터 페이지 config
// 출고/매출과 구조가 다른 페이지(단일 리스트, 클라이언트 검색, 편집·삭제·토글 행 액션, 헤더 등록 버튼)를
// 같은 ListScreen 템플릿으로 표현해 스키마 재사용성을 검증한다.

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'partners',
  page: {
    eyebrow: 'MASTER DATA',
    title: '거래처 관리',
    description: '고객사, 공급사, 양방향 거래처를 판매·구매·수금 흐름에 연결합니다.',
  },
  source: { hookId: 'usePartnerList' },
  requiresCompany: false,
  filters: [],
  searchable: {
    placeholder: '거래처명, ERP코드, 담당자 검색',
    fields: ['partner_name', 'erp_code', 'contact_name'],
  },
  metrics: [
    { label: '전체 거래처', computerId: 'count', tone: 'solar', spark: 'auto' },
    { label: '고객사', computerId: 'count.partner_customer', tone: 'info' },
    { label: '공급사', computerId: 'count.partner_supplier', tone: 'warn' },
    { label: '활성', computerId: 'count.partner_active', tone: 'pos' },
  ],
  columns: [
    { key: 'partner_name', label: '거래처명' },
    { key: 'partner_type', label: '유형', rendererId: 'partner_type_badge' },
    { key: 'erp_code', label: 'ERP코드' },
    { key: 'contact_name', label: '담당자' },
    { key: 'contact_phone', label: '연락처' },
    { key: 'is_active', label: '상태', rendererId: 'active_badge' },
  ],
  actions: [
    {
      id: 'create',
      label: '새로 등록',
      trigger: 'header',
      kind: 'open_form',
      formId: 'partner_form',
      iconId: 'plus',
      variant: 'primary',
    },
    {
      id: 'edit_row',
      label: '수정',
      trigger: 'row',
      kind: 'edit_form',
      formId: 'partner_form',
      iconId: 'pencil',
      variant: 'ghost',
    },
    {
      id: 'delete_row',
      label: '삭제',
      trigger: 'row',
      kind: 'confirm_call',
      endpoint: '/api/v1/partners/:id',
      method: 'DELETE',
      idField: 'partner_id',
      iconId: 'trash',
      variant: 'destructive',
      confirm: {
        title: '거래처 삭제',
        description: '"{partner_name}"을(를) 삭제하시겠습니까? 연결된 데이터가 있으면 삭제가 실패할 수 있습니다.',
        confirmLabel: '삭제',
        variant: 'destructive',
      },
    },
  ],
  rail: [
    { blockId: 'partner_type_breakdown', props: { title: '거래 유형' } },
    { blockId: 'partner_recent', props: { title: '최근 표시', limit: 4 } },
  ],
  emptyState: { message: '등록된 거래처가 없습니다', actionId: 'create' },
  forms: [
    {
      id: 'partner_form',
      componentId: 'partner_form_v2',           // Phase 2: 메타 폼 사용
      endpoint: '/api/v1/partners',
      editEndpoint: '/api/v1/partners/:id',
      editIdField: 'partner_id',
    },
  ],
  tableSubFromTotal: true,
};

export default config;
