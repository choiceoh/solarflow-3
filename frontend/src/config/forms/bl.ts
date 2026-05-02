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
    // Step 3d: PO 선택 → LC/제조사/통화 자동 fill
    {
      title: 'PO · LC 연결',
      cols: 2,
      visibleIf: { field: 'inbound_type', value: 'import' },
      fields: [
        { key: 'po_id', label: 'PO 연결', type: 'select',
          placeholder: 'PO 선택 (선택사항)',
          optionsFrom: 'master', masterKey: 'pos.import',
          cascadeId: 'bl_po_to_lc_mfg' },
        { key: 'lc_id', label: 'LC 연결 (해외직수입 필수)', type: 'select',
          placeholder: 'PO 먼저 선택 → LC 자동 채움',
          optionsFrom: 'master', masterKey: 'lcs.byPo',
          optionsDependsOn: ['po_id'] },
      ],
    },
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
    // Step 3c: OCR 위젯 (해외직수입 시 PDF 면장 자동 입력) — 위젯은 Stub, 실 로직 follow-up
    {
      title: '면장 OCR (해외직수입 시)',
      visibleIf: { field: 'inbound_type', value: 'import' },
      contentBlock: { blockId: 'bl_ocr_widget' },
    },
    // Step 3b: 입고 품목 (lines) — child_array
    {
      title: '입고 품목',
      fields: [
        {
          key: 'lines',
          type: 'child_array',
          label: '품목 라인',
          addLabel: '+ 라인 추가',
          required: true,
          minItems: 1,
          childCols: 4,
          childFields: [
            { key: 'product_code', label: '품번', type: 'text', placeholder: 'JKO-N620' },
            { key: 'product_name', label: '품명', type: 'text' },
            { key: 'quantity', label: '수량 EA', type: 'number', required: true },
            { key: 'capacity_kw', label: '용량 kW', type: 'number' },
            { key: 'item_type', label: '구분', type: 'select',
              staticOptions: [
                { value: 'main', label: '메인' },
                { value: 'spare', label: '스페어' },
              ],
            },
            { key: 'payment_type', label: '결제구분', type: 'select',
              staticOptions: [
                { value: 'paid', label: '유상' },
                { value: 'free', label: '무상' },
              ],
            },
            { key: 'unit_price_usd_wp', label: '단가 $/Wp', type: 'number' },
            { key: 'invoice_amount_usd', label: 'Invoice $', type: 'number' },
          ],
        },
      ],
    },
    // Step 3e: 결제조건 파서 (해외직수입 multi-tranche, 국내 NET) — Stub, 실 로직 follow-up
    {
      title: '결제 조건',
      contentBlock: { blockId: 'bl_payment_terms_widget' },
    },
    {
      title: '메모',
      fields: [
        { key: 'memo', label: '메모', type: 'textarea', placeholder: '비고 (선택)' },
      ],
    },
  ],
};

export default config;
