// Phase 4 보강: 면장(DeclarationForm) 메타화
// 기존 DeclarationForm.tsx (159 줄) → 메타 config (~65 줄)
// 단순화 영역 (메타 한계선):
//   - presetBLId prop 으로 BL 사전 선택 → editData.bl_id 로 prefill 가능
//     (페이지가 editData={ bl_id: presetBLId } 로 폼 호출)

import type { MetaFormConfig } from '@/templates/types';

const declarationForm: MetaFormConfig = {
  id: 'declaration_form_v2',
  title: { create: '면장 등록', edit: '면장 수정' },
  dialogSize: 'lg',
  extraPayload: {
    fromStore: { company_id: 'selectedCompanyId' },
  },
  draftAutoSave: true,
  sections: [
    {
      cols: 1,
      fields: [
        { key: 'declaration_number', label: '면장번호', type: 'text', required: true, placeholder: '예) IL-26-0421-01' },
      ],
    },
    {
      cols: 1,
      fields: [
        {
          key: 'bl_id', label: 'B/L', type: 'select', required: true,
          optionsFrom: 'master',
          masterKey: 'bls.byCompany',
          placeholder: 'B/L 선택 (선택 법인 필터)',
          description: '좌측 상단 법인 선택 시 해당 법인의 B/L 만 표시.',
        },
      ],
    },
    {
      title: '일정',
      tone: 'solar',
      cols: 1,
      fields: [
        { key: 'declaration_date', label: '신고일', type: 'date', required: true, defaultValue: '@today' },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'arrival_date', label: '입항일', type: 'date' },
        { key: 'release_date', label: '반출일', type: 'date' },
      ],
    },
    {
      title: '분류 정보',
      tone: 'info',
      cols: 1,
      fields: [
        { key: 'hs_code', label: 'HS코드', type: 'text', placeholder: '예) 8541.43' },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'customs_office', label: '세관', type: 'text', placeholder: '예) 인천세관' },
        { key: 'port', label: '항구', type: 'text', placeholder: '예) 인천항' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'memo', label: '메모', type: 'textarea' },
      ],
    },
  ],
};

export default declarationForm;
