// 엑셀 Import/Export 타입 (Step 29A)

export type TemplateType =
  | 'company'
  | 'inbound'
  | 'outbound'
  | 'sale'
  | 'declaration'
  | 'expense'
  | 'order'
  | 'receipt'
  | 'purchase_order'
  | 'lc';

export interface RowError {
  field: string;
  message: string;
}

export interface ParsedRow {
  rowNumber: number;
  data: Record<string, unknown>;
  valid: boolean;
  errors: RowError[];
}

export interface ImportPreview {
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: ParsedRow[];
}

export interface DeclarationImportPreview {
  fileName: string;
  declarations: ParsedRow[];
  costs: ParsedRow[];
}

export interface MasterDataForExcel {
  companies: { company_id: string; company_code: string; company_name: string }[];
  manufacturers: { manufacturer_id: string; name_kr: string }[];
  products: { product_id: string; product_code: string; product_name: string; spec_wp?: number; wattage_kw?: number }[];
  partners: { partner_id: string; partner_name: string; partner_type: string }[];
  warehouses: { warehouse_id: string; warehouse_code: string; warehouse_name: string }[];
  outbounds?: { outbound_id: string; outbound_date: string; product_id: string; quantity: number; site_name?: string }[];
  // 발주(PO)·신용장(LC) 양식의 거래처(제조사 외)·은행 코드표용 — 각 법인별로 등록된 은행 한도.
  banks?: { bank_id: string; bank_name: string; company_id: string }[];
  // LC.po_number 드롭다운에서 사용할 PO 식별자 — 자연키(po_number)가 비면 첫 8자 id.
  purchaseOrders?: { po_id: string; po_number?: string; manufacturer_name?: string; contract_date?: string }[];
}

// 양식별 한글 이름
export const TEMPLATE_LABEL: Record<TemplateType, string> = {
  company: '법인',
  inbound: '입고',
  outbound: '출고',
  sale: '매출',
  declaration: '면장',
  expense: '부대비용',
  order: '수주',
  receipt: '수금',
  purchase_order: '발주',
  lc: '신용장',
};

// 양식별 필드 정의
export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  type: 'string' | 'number' | 'date' | 'boolean';
}

// 법인 필드
export const COMPANY_FIELDS: FieldDef[] = [
  { key: 'company_name', label: '법인명', required: true, type: 'string' },
  { key: 'company_code', label: '법인코드', required: true, type: 'string' },
  { key: 'business_number', label: '사업자번호', required: false, type: 'string' },
];

// 입고 필드
export const INBOUND_FIELDS: FieldDef[] = [
  { key: 'bl_number', label: 'B/L No.', required: true, type: 'string' },
  { key: 'inbound_type', label: '입고유형', required: true, type: 'string' },
  { key: 'company_code', label: '법인코드', required: true, type: 'string' },
  { key: 'manufacturer_name', label: '제조사명', required: true, type: 'string' },
  { key: 'currency', label: '통화', required: true, type: 'string' },
  { key: 'exchange_rate', label: '환율', required: false, type: 'number' },
  { key: 'etd', label: 'ETD', required: false, type: 'date' },
  { key: 'eta', label: 'ETA', required: false, type: 'date' },
  { key: 'actual_arrival', label: '실제입항일', required: false, type: 'date' },
  { key: 'port', label: '항구', required: false, type: 'string' },
  { key: 'forwarder', label: '포워더', required: false, type: 'string' },
  { key: 'warehouse_code', label: '창고코드', required: false, type: 'string' },
  { key: 'invoice_number', label: 'Invoice No.', required: false, type: 'string' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
  { key: 'product_code', label: '품번코드', required: true, type: 'string' },
  { key: 'quantity', label: '수량', required: true, type: 'number' },
  { key: 'item_type', label: '본품/스페어', required: true, type: 'string' },
  { key: 'payment_type', label: '유상/무상', required: true, type: 'string' },
  { key: 'invoice_amount_usd', label: 'Invoice금액(USD)', required: false, type: 'number' },
  { key: 'unit_price_usd_wp', label: 'USD/Wp단가', required: false, type: 'number' },
  { key: 'unit_price_krw_wp', label: 'KRW/Wp단가', required: false, type: 'number' },
  { key: 'usage_category', label: '용도', required: true, type: 'string' },
  { key: 'line_memo', label: '라인메모', required: false, type: 'string' },
];

// 출고 필드
// D-055: 워크플로우 체크박스 4개 + source_payload 추가 (외부 양식 변환 시 정보 손실 0).
export const OUTBOUND_FIELDS: FieldDef[] = [
  { key: 'outbound_date', label: '출고일', required: true, type: 'date' },
  { key: 'company_code', label: '법인코드', required: true, type: 'string' },
  { key: 'product_code', label: '품번코드', required: true, type: 'string' },
  { key: 'quantity', label: '수량', required: true, type: 'number' },
  { key: 'warehouse_code', label: '창고코드', required: true, type: 'string' },
  { key: 'usage_category', label: '용도', required: true, type: 'string' },
  { key: 'order_number', label: '수주번호', required: false, type: 'string' },
  { key: 'site_name', label: '현장명', required: false, type: 'string' },
  { key: 'site_address', label: '현장주소', required: false, type: 'string' },
  { key: 'spare_qty', label: '스페어수량', required: false, type: 'number' },
  { key: 'group_trade', label: '그룹거래(Y/N)', required: false, type: 'string' },
  { key: 'target_company_code', label: '상대법인코드', required: false, type: 'string' },
  { key: 'erp_outbound_no', label: 'ERP출고번호', required: false, type: 'string' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
  // 워크플로우 4종 — 표준 양식에서는 Y/N 입력
  { key: 'tx_statement_ready', label: '거래명세서(Y/N)', required: false, type: 'boolean' },
  { key: 'inspection_request_sent', label: '인수검수요청서(Y/N)', required: false, type: 'boolean' },
  { key: 'approval_requested', label: '결재요청(Y/N)', required: false, type: 'boolean' },
  { key: 'tax_invoice_issued', label: '계산서발행(Y/N)', required: false, type: 'boolean' },
];

// 매출 필드 (지적 1 반영: outbound_id 필수, 출고일/품번 제거 — outbound에서 자동 조회)
export const SALE_FIELDS: FieldDef[] = [
  { key: 'outbound_id', label: '출고 선택', required: true, type: 'string' },
  { key: 'customer_name', label: '거래처명', required: true, type: 'string' },
  { key: 'unit_price_wp', label: 'Wp단가(원)', required: true, type: 'number' },
  { key: 'tax_invoice_date', label: '세금계산서발행일', required: false, type: 'date' },
  { key: 'tax_invoice_email', label: '발행메일', required: false, type: 'string' },
  { key: 'erp_closed', label: 'ERP마감(Y/N)', required: false, type: 'string' },
  { key: 'erp_closed_date', label: 'ERP마감일', required: false, type: 'date' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
];

// 면장등록 필드
export const DECLARATION_FIELDS: FieldDef[] = [
  { key: 'declaration_number', label: '면장번호', required: true, type: 'string' },
  { key: 'bl_number', label: 'B/L No.', required: true, type: 'string' },
  { key: 'company_code', label: '법인코드', required: true, type: 'string' },
  { key: 'declaration_date', label: '신고일', required: true, type: 'date' },
  { key: 'arrival_date', label: '입항일', required: false, type: 'date' },
  { key: 'release_date', label: '반출일', required: false, type: 'date' },
  { key: 'hs_code', label: 'HS코드', required: false, type: 'string' },
  { key: 'customs_office', label: '세관', required: false, type: 'string' },
  { key: 'port', label: '항구', required: false, type: 'string' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
];

// 원가등록 필드
export const DECLARATION_COST_FIELDS: FieldDef[] = [
  { key: 'declaration_number', label: '면장번호(참조)', required: true, type: 'string' },
  { key: 'product_code', label: '품번코드', required: true, type: 'string' },
  { key: 'quantity', label: '수량', required: true, type: 'number' },
  { key: 'exchange_rate', label: '환율', required: true, type: 'number' },
  { key: 'fob_unit_usd', label: 'FOB단가(USD/Wp)', required: false, type: 'number' },
  { key: 'fob_total_usd', label: 'FOB총액(USD)', required: false, type: 'number' },
  { key: 'fob_wp_krw', label: 'FOB Wp단가(원)', required: false, type: 'number' },
  { key: 'cif_total_krw', label: 'CIF총액(원)', required: true, type: 'number' },
  { key: 'cif_unit_usd', label: 'CIF단가(USD/Wp)', required: false, type: 'number' },
  { key: 'cif_total_usd', label: 'CIF총액(USD)', required: false, type: 'number' },
  { key: 'tariff_rate', label: '관세율(%)', required: false, type: 'number' },
  { key: 'tariff_amount', label: '관세액(원)', required: false, type: 'number' },
  { key: 'vat_amount', label: '부가세(원)', required: false, type: 'number' },
  { key: 'customs_fee', label: '통관비(원)', required: false, type: 'number' },
  { key: 'incidental_cost', label: '기타부대비(원)', required: false, type: 'number' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
];

// 부대비용 필드
export const EXPENSE_FIELDS: FieldDef[] = [
  { key: 'bl_number', label: 'B/L No.', required: false, type: 'string' },
  { key: 'month', label: '월(YYYY-MM)', required: false, type: 'string' },
  { key: 'company_code', label: '법인코드', required: true, type: 'string' },
  { key: 'expense_type', label: '비용유형', required: true, type: 'string' },
  { key: 'amount', label: '금액(원)', required: true, type: 'number' },
  { key: 'vat', label: '부가세(원)', required: false, type: 'number' },
  { key: 'vendor', label: '거래처', required: false, type: 'string' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
];

// 수주 필드
export const ORDER_FIELDS: FieldDef[] = [
  { key: 'order_number', label: '발주번호', required: false, type: 'string' },
  { key: 'company_code', label: '법인코드', required: true, type: 'string' },
  { key: 'customer_name', label: '거래처명', required: true, type: 'string' },
  { key: 'order_date', label: '수주일', required: true, type: 'date' },
  { key: 'receipt_method', label: '접수방법', required: true, type: 'string' },
  { key: 'management_category', label: '관리구분', required: true, type: 'string' },
  { key: 'fulfillment_source', label: '충당소스', required: true, type: 'string' },
  { key: 'product_code', label: '품번코드', required: true, type: 'string' },
  { key: 'quantity', label: '수량', required: true, type: 'number' },
  { key: 'unit_price_wp', label: 'Wp단가(원)', required: true, type: 'number' },
  { key: 'site_name', label: '현장명', required: false, type: 'string' },
  { key: 'site_address', label: '현장주소', required: false, type: 'string' },
  { key: 'site_contact', label: '현장담당자', required: false, type: 'string' },
  { key: 'site_phone', label: '현장연락처', required: false, type: 'string' },
  { key: 'payment_terms', label: '결제조건', required: false, type: 'string' },
  { key: 'deposit_rate', label: '계약금비율(%)', required: false, type: 'number' },
  { key: 'delivery_due', label: '납기요청일', required: false, type: 'date' },
  { key: 'spare_qty', label: '스페어수량', required: false, type: 'number' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
];

// 수금 필드
export const RECEIPT_FIELDS: FieldDef[] = [
  { key: 'customer_name', label: '거래처명', required: true, type: 'string' },
  { key: 'receipt_date', label: '입금일', required: true, type: 'date' },
  { key: 'amount', label: '입금액(원)', required: true, type: 'number' },
  { key: 'bank_account', label: '입금계좌', required: false, type: 'string' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
];

// 발주(PO) 필드 — 같은 po_number의 모든 행이 한 PO로 묶이고 각 행이 하나의 PO 라인.
// 헤더 컬럼(법인·제조사·계약유형·계약일·인코텀즈·결제조건·계약기간·메모)은 같은 그룹 안에서 동일해야 한다.
export const PURCHASE_ORDER_FIELDS: FieldDef[] = [
  { key: 'po_number', label: '발주번호', required: true, type: 'string' },
  { key: 'company_code', label: '법인코드', required: true, type: 'string' },
  { key: 'manufacturer_name', label: '제조사명', required: true, type: 'string' },
  { key: 'contract_type', label: '계약유형', required: true, type: 'string' },
  { key: 'contract_date', label: '계약일', required: true, type: 'date' },
  { key: 'incoterms', label: '인코텀즈', required: false, type: 'string' },
  { key: 'payment_terms', label: '결제조건', required: false, type: 'string' },
  { key: 'contract_period_start', label: '계약시작일', required: false, type: 'date' },
  { key: 'contract_period_end', label: '계약종료일', required: false, type: 'date' },
  { key: 'product_code', label: '품번코드', required: true, type: 'string' },
  { key: 'quantity', label: '수량', required: true, type: 'number' },
  { key: 'unit_price_usd_wp', label: 'USD/Wp단가', required: true, type: 'number' },
  { key: 'item_type', label: '본품/스페어', required: true, type: 'string' },
  { key: 'payment_type', label: '유상/무상', required: true, type: 'string' },
  { key: 'line_memo', label: '라인메모', required: false, type: 'string' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
];

// 신용장(LC) 필드 — 1차는 헤더만. 라인(분할 인수)은 별도 다이얼로그에서.
// po_number는 발주 양식에 등록된 자연키와 일치해야 서버에서 po_id로 매핑된다.
export const LC_FIELDS: FieldDef[] = [
  { key: 'lc_number', label: 'L/C No.', required: false, type: 'string' },
  { key: 'po_number', label: '발주번호(참조)', required: true, type: 'string' },
  { key: 'company_code', label: '법인코드', required: true, type: 'string' },
  { key: 'bank_name', label: '은행명', required: true, type: 'string' },
  { key: 'open_date', label: '개설일', required: false, type: 'date' },
  { key: 'amount_usd', label: 'L/C금액(USD)', required: true, type: 'number' },
  { key: 'target_qty', label: '대상수량', required: false, type: 'number' },
  { key: 'usance_days', label: '유산스(일)', required: false, type: 'number' },
  { key: 'usance_type', label: '유산스유형', required: false, type: 'string' },
  { key: 'maturity_date', label: '만기일', required: false, type: 'date' },
  { key: 'memo', label: '메모', required: false, type: 'string' },
];

// Import 결과 타입 (Go API 응답)
export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportWarning {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  success: boolean;
  imported_count: number;
  error_count: number;
  warning_count: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

// 통합 양식 업로드 — 한 파일에 모든 섹션이 같이 들어 있는 경우.
export interface UnifiedSection {
  type: TemplateType;
  label: string;
  present: boolean;
  parseError?: string;
  preview?: ImportPreview;
  declPreview?: DeclarationImportPreview;
}

export interface UnifiedImportPreview {
  fileName: string;
  sections: UnifiedSection[];
}

// 섹션별 등록 결과 — 부분 실패 정책: 한 섹션이 실패해도 다음 섹션은 계속 시도.
export type UnifiedSubmitStatus = 'success' | 'failed' | 'skipped';

export interface UnifiedSubmitOutcome {
  type: TemplateType;
  label: string;
  status: UnifiedSubmitStatus;
  result?: ImportResult;
  error?: string;
}

export interface UnifiedSubmitResult {
  outcomes: UnifiedSubmitOutcome[];
}

// 양식별 필드 맵
export const FIELDS_MAP: Record<TemplateType, FieldDef[]> = {
  company: COMPANY_FIELDS,
  inbound: INBOUND_FIELDS,
  outbound: OUTBOUND_FIELDS,
  sale: SALE_FIELDS,
  declaration: DECLARATION_FIELDS,
  expense: EXPENSE_FIELDS,
  order: ORDER_FIELDS,
  receipt: RECEIPT_FIELDS,
  purchase_order: PURCHASE_ORDER_FIELDS,
  lc: LC_FIELDS,
};
