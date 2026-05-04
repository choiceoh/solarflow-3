// Phase 2 PoC: 거래처 폼 메타데이터 — 기존 PartnerForm을 메타로 표현
// 기존 PartnerForm.tsx는 보존. 이 config는 partner_form_v2로 등록되어 partners-v2 화면에서 사용.

import type { MetaFormConfig } from '@/templates/types';

const partnerForm: MetaFormConfig = {
  id: 'partner_form_v2',
  title: { create: '거래처 등록', edit: '거래처 수정' },
  description: '공급사·고객사·양방향 거래처를 등록합니다. ERP코드는 admin 만 편집 가능하고, 결제조건은 고객/양방향에만 표시됩니다.',
  aiHint: '거래처 한 행은 후속 P/O·수주·세금계산서의 기본 키. is_active=false 면 신규 PO/수주 선택지에서 자동 제외 — 삭제 대신 비활성을 권장.',
  sections: [
    {
      cols: 1,
      fields: [
        {
          key: 'partner_name', label: '거래처명', type: 'text', required: true,
          description: '사업자등록증 상의 정식 명칭. 약칭/별명은 사용 금지 — 회계·세금계산서 매칭 키로 사용됨.',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        {
          key: 'partner_type', label: '유형', type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: 'supplier', label: '공급사' },
            { value: 'customer', label: '고객사' },
            { value: 'both', label: '공급+고객' },
          ],
          description: '공급사=수입처, 고객사=판매처, 양방향=둘 다. 유형에 따라 노출되는 필드가 달라짐.',
          aiHint: '유형에 따라 결제조건 필드 노출 여부가 결정됨 (customer/both 만). 변경 시 기존 PO/수주에는 영향 없음.',
        },
      ],
    },
    {
      cols: 2,
      fields: [
        // Phase 2.3: ERP코드는 admin만 편집 가능 (다른 역할은 자동 readOnly)
        {
          key: 'erp_code', label: 'ERP코드', type: 'text', editableByRoles: ['admin'],
          description: '외부 회계 시스템(더존/SAP 등)의 거래처 코드. admin 만 수정 가능.',
          aiHint: '회계 연동(import/export)의 매칭 키. 변경하면 과거 회계 데이터와 분리될 수 있어 신중히.',
        },
        // Phase 2.3: 결제조건은 고객/양방향 거래처에만 노출 (공급사 전용은 숨김)
        {
          key: 'payment_terms', label: '결제조건', type: 'text',
          visibleIf: { field: 'partner_type', value: ['customer', 'both'] },
          description: '예: "월말 결제 + 30일", "납품 후 60일". 자유 텍스트 — 표준화는 별도 정책으로.',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'contact_name', label: '담당자', type: 'text' },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'contact_phone', label: '연락처', type: 'text' },
        {
          key: 'contact_email', label: '이메일', type: 'text',
          pattern: { regex: '^$|^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', message: '올바른 이메일 형식이 아닙니다' },
        },
      ],
    },
    {
      cols: 1,
      fields: [
        {
          key: 'is_active', label: '활성', type: 'switch', defaultValue: true,
          description: 'OFF 로 두면 신규 PO/수주 선택지에서 숨겨집니다. 기존 거래는 영향 없음 (소프트 비활성).',
          aiHint: 'is_active=false 거래처를 다시 활성화하려면 admin 이 직접 ON. 삭제 기능은 의도적으로 없음 — 회계 이력 보존.',
        },
      ],
    },
  ],
};

export default partnerForm;
