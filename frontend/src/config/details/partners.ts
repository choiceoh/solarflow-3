// 거래처 master 상세 — bank 패턴 복제. 2 탭 구조 (기본 정보 / 거래 현황).
//
// 메타 인프라 검증 항목:
// - tabs[] (기본 정보 + 거래 현황 placeholder)
// - inlineEdit (contact_name / contact_phone 자주 갱신)
// - visibleIf (payment_terms 는 customer/both 에만)
// - erp_code 는 admin only — form 에서만 변경

import type { MetaDetailConfig } from '@/templates/types';

const partnerDetailConfig: MetaDetailConfig = {
  id: 'partner_detail',
  source: { hookId: 'usePartnerDetail' },
  header: {
    title: '거래처 상세',
  },
  inlineEdit: {
    enabled: true,
    endpoint: '/api/v1/partners/:id',
    idField: 'partner_id',
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        { key: 'partner_name', label: '거래처명', span: 2 },
        { key: 'partner_type', label: '유형', rendererId: 'partner_type_badge' },
        {
          key: 'is_active',
          label: '활성',
          formatter: 'enum',
          enumKey: 'BANK_ACTIVE_LABEL',
        },
        { key: 'erp_code', label: 'ERP 코드' },
      ],
    },
  ],
  tabs: [
    {
      key: 'basic',
      label: '기본 정보',
      sections: [
        {
          title: '기본',
          cols: 4,
          fields: [
            { key: 'partner_name', label: '거래처명', span: 2 },
            { key: 'partner_type', label: '유형', rendererId: 'partner_type_badge' },
            {
              key: 'is_active',
              label: '활성',
              formatter: 'enum',
              enumKey: 'BANK_ACTIVE_LABEL',
            },
            { key: 'erp_code', label: 'ERP 코드' },
          ],
        },
        {
          title: '연락처',
          cols: 3,
          fields: [
            {
              key: 'contact_name',
              label: '담당자',
              inlineEditable: true,
              inlineEditType: 'text',
            },
            {
              key: 'contact_phone',
              label: '연락처',
              inlineEditable: true,
              inlineEditType: 'text',
            },
            { key: 'contact_email', label: '이메일' },
          ],
        },
        {
          title: '결제 조건',
          cols: 1,
          // payment_terms 는 customer 또는 both 일 때만 의미
          visibleIf: { field: 'partner_type', value: ['customer', 'both'] },
          fields: [
            { key: 'payment_terms', label: '결제 조건', span: 1 },
          ],
        },
      ],
    },
    {
      key: 'transactions',
      label: '거래 현황',
      sections: [
        {
          title: '거래 요약',
          contentBlock: { blockId: 'partner_transactions_placeholder' },
        },
      ],
    },
  ],
  defaultTab: 'basic',
};

export default partnerDetailConfig;
