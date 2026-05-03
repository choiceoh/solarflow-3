// Phase 4: 은행(banks) 마스터 메타 폼
// 기존 BankForm.tsx (zod 직접 정의 + 9 필드)를 메타로 표현.
// 법인 select는 masterKey='companies' (registry.masterSources)에서 옵션 로드.

import type { MetaFormConfig } from '@/templates/types';

const bankForm: MetaFormConfig = {
  id: 'bank_form_v2',
  title: { create: '은행 등록', edit: '은행 수정' },
  sections: [
    {
      cols: 1,
      fields: [
        {
          key: 'company_id', label: '법인', type: 'select', required: true,
          optionsFrom: 'master', masterKey: 'companies',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'bank_name', label: '은행명', type: 'text', required: true },
      ],
    },
    {
      cols: 1,
      fields: [
        // LC 한도 — 은행 약정 금액. 신규 메타 인프라 13·14 의 첫 실제 등록.
        // - editableByRoles: ['admin']  — 정적 role 화이트리스트 (기존 보호장치)
        // - permissionGuardId: 'adminOnly' — 동적 가드 (registry.permissionGuards 의 첫 entry)
        //   같이 적용 — 둘 중 하나만 막아도 readOnly. (RLS 계층은 backend 가 별도 보장)
        // - maskByRoles: ['viewer', 'manager']  — 조회·본부장 역할에는 ●●●●●● 마스킹 표시
        //   (운영팀·경영진·시스템관리자는 평문)
        {
          key: 'lc_limit_usd',
          label: 'LC 한도(USD)',
          type: 'number',
          required: true,
          minValue: 0,
          editableByRoles: ['admin'],
          permissionGuardId: 'adminOnly',
          maskByRoles: ['viewer', 'manager'],
        },
      ],
    },
    {
      cols: 2,
      fields: [
        // 승인일·기한도 LC 한도 변경과 함께 admin 이 결정 — 같은 가드 적용
        {
          key: 'limit_approve_date',
          label: '승인일',
          type: 'date',
          permissionGuardId: 'adminOnly',
        },
        {
          key: 'limit_expiry_date',
          label: '승인기한',
          type: 'date',
          permissionGuardId: 'adminOnly',
        },
      ],
    },
    {
      cols: 2,
      fields: [
        // 수수료율은 admin + operator 둘 다 갱신 가능 (일상 운영값)
        {
          key: 'opening_fee_rate',
          label: '개설수수료율(%)',
          type: 'number',
          minValue: 0,
          permissionGuardId: 'operatorOrAdmin',
        },
        {
          key: 'acceptance_fee_rate',
          label: '인수수수료율(%)',
          type: 'number',
          minValue: 0,
          permissionGuardId: 'operatorOrAdmin',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'fee_calc_method', label: '수수료 계산방식', type: 'text' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'memo', label: '메모', type: 'textarea' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'is_active', label: '활성', type: 'switch', defaultValue: true },
      ],
    },
  ],
};

export default bankForm;
