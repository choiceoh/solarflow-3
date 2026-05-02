// Phase 4 — Step 3a: BLForm 메타 (기본 필드만, 진행 단계)
// 단계별:
//  Step 3a (이 파일 현재): 기본 폼 필드 ~20개 + 섹션 4개 (기본/PO LC/선적/통관)
//  Step 3b 추가: lines child_array (입고 품목)
//  Step 3c 추가: OCR 위젯 contentBlock
//  Step 3d 추가: PO/LC fieldCascade
//  Step 3e 추가: 결제조건 파서 contentBlock
// 진입점: /bl-meta-demo (운영 /inbound 의 BLForm 은 그대로 유지 — Step 3 완료 시 교체)

import type { MetaFormConfig } from '@/templates/types';

const config: MetaFormConfig = {
  id: 'bl_form_v2',
  title: { create: '입고등록 (메타 v2)', edit: '입고 수정 (메타 v2)' },
  dialogSize: '2xl',
  draftAutoSave: false,
  sections: [
    {
      title: '기본 정보',
      cols: 2,
      fields: [
        { key: 'inbound_type', label: '입고 구분', type: 'select', required: true,
          optionsFrom: 'enum', enumKey: 'INBOUND_TYPE_LABEL' },
        { key: 'bl_number', label: 'B/L 번호', type: 'text',
          placeholder: 'SOLARBL-2026-001 (자동생성 가능)' },
        { key: 'manufacturer_id', label: '제조사', type: 'select', required: true,
          optionsFrom: 'master', masterKey: 'manufacturers' },
        { key: 'currency', label: '통화', type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: 'USD', label: 'USD (달러)' },
            { value: 'KRW', label: 'KRW (원)' },
          ],
          defaultValue: 'USD' },
        { key: 'exchange_rate', label: '환율', type: 'number',
          placeholder: '1364.20 (해외직수입 시)',
          visibleIf: { field: 'inbound_type', value: 'import' },
          numberFormat: 'plain' },
        { key: 'warehouse_id', label: '입고 창고', type: 'select',
          optionsFrom: 'master', masterKey: 'warehouses' },
      ],
    },
    // Step 3d 에서 PO·LC 연결 + fieldCascade 추가 예정 (현재 master 소스 미등록)
    {
      title: '선적 일정',
      cols: 4,
      visibleIf: { field: 'inbound_type', value: 'import' },
      fields: [
        { key: 'etd', label: 'ETD', type: 'date' },
        { key: 'eta', label: 'ETA', type: 'date' },
        { key: 'actual_arrival', label: '실제 입항', type: 'date' },
        { key: 'incoterms', label: '인코텀즈', type: 'select',
          optionsFrom: 'static',
          staticOptions: [
            { value: 'FOB', label: 'FOB' }, { value: 'CIF', label: 'CIF' },
            { value: 'CFR', label: 'CFR' }, { value: 'EXW', label: 'EXW' },
            { value: 'FCA', label: 'FCA' }, { value: 'DAP', label: 'DAP' },
            { value: 'DDP', label: 'DDP' }, { value: 'CIP', label: 'CIP' },
          ] },
        { key: 'port', label: '항구', type: 'text', placeholder: '광양항' },
        { key: 'forwarder', label: '포워더', type: 'text' },
        { key: 'invoice_number', label: 'Invoice No.', type: 'text' },
        { key: 'declaration_number', label: '면장번호', type: 'text', placeholder: '선택사항' },
      ],
    },
    {
      title: '국내 입고 정보',
      cols: 2,
      visibleIf: { field: 'inbound_type', value: ['domestic', 'group'] },
      fields: [
        { key: 'actual_arrival', label: '입고/납품일', type: 'date', required: true },
        { key: 'declaration_number', label: '면장번호 (있으면)', type: 'text' },
      ],
    },
    {
      title: '메모',
      fields: [
        { key: 'memo', label: '메모', type: 'textarea', placeholder: '비고 (선택)' },
      ],
    },
    // Step 3b: 입고 품목 (lines) — child_array — 별 sub-step 에서 추가 예정
    // Step 3c: OCR 위젯 — contentBlock — 별 sub-step
    // Step 3e: 결제조건 파서 — contentBlock — 별 sub-step
  ],
};

export default config;
