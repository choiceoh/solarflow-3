// 법인 master 상세 — bank 패턴 복제. 단순 구조.
//
// 메타 인프라 검증:
// - inlineEdit (company_name / business_number 가끔 갱신)
// - company_code 는 immutable — admin form 으로만.

import type { MetaDetailConfig } from '@/templates/types';

const companyDetailConfig: MetaDetailConfig = {
  id: 'company_detail',
  source: { hookId: 'useCompanyDetail' },
  header: {
    title: '법인 상세',
  },
  inlineEdit: {
    enabled: true,
    endpoint: '/api/v1/companies/:id',
    idField: 'company_id',
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        { key: 'company_code', label: '법인 코드' },
        {
          key: 'company_name',
          label: '법인명',
          span: 2,
          inlineEditable: true,
          inlineEditType: 'text',
        },
        {
          key: 'is_active',
          label: '활성',
          formatter: 'enum',
          enumKey: 'BANK_ACTIVE_LABEL',
        },
        {
          key: 'business_number',
          label: '사업자등록번호',
          span: 2,
          inlineEditable: true,
          inlineEditType: 'text',
        },
      ],
    },
  ],
};

export default companyDetailConfig;
