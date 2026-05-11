import { describe, expect, it } from 'bun:test';
import { validateRows } from '@/lib/excelValidation';
import type { MasterDataForExcel, ParsedRow } from '@/types/excel';

const masterData: MasterDataForExcel = {
  companies: [{ company_id: 'c-1', company_code: 'TS', company_name: '탑솔라' }],
  manufacturers: [{ manufacturer_id: 'm-1', name_kr: '진코솔라' }],
  products: [{ product_id: 'p-1', product_code: 'JKM-590', product_name: 'Tiger Neo', spec_wp: 590 }],
  partners: [{ partner_id: 'pt-1', partner_name: '솔라건설', partner_type: 'customer' }],
  warehouses: [{ warehouse_id: 'w-1', warehouse_code: 'WH-A', warehouse_name: 'A창고' }],
  banks: [{ bank_id: 'b-1', bank_name: '국민은행', company_id: 'c-1' }],
  purchaseOrders: [{ po_id: 'po-1', po_number: 'PO-2026-001', company_id: 'c-1', manufacturer_name: '진코솔라' }],
};

function row(data: Record<string, unknown>): ParsedRow {
  return { rowNumber: 2, data, valid: true, errors: [] };
}

describe('validateRows', () => {
  it('업로드 전에 한글 선택값을 서버 코드값으로 정규화한다', () => {
    const [validated] = validateRows([
      row({
        bl_number: 'BL-20260503',
        inbound_type: '해외직수입',
        company_code: 'TS',
        manufacturer_name: '진코솔라',
        currency: 'usd',
        product_code: 'JKM-590',
        quantity: 10,
        item_type: '본품',
        payment_type: '유상',
        usage_category: '상품판매',
      }),
    ], 'inbound', masterData);

    expect(validated.valid).toBe(true);
    expect(validated.data).toMatchObject({
      inbound_type: 'import',
      currency: 'USD',
      item_type: 'main',
      payment_type: 'paid',
      usage_category: 'sale',
    });
  });

  it('숫자가 아닌 입력을 미리보기 단계에서 막는다', () => {
    const [validated] = validateRows([
      row({
        customer_name: '솔라건설',
        receipt_date: '2026-05-03',
        amount: '십만원',
      }),
    ], 'receipt', masterData);

    expect(validated.valid).toBe(false);
    expect(validated.errors).toContainEqual({ field: '입금액(원)', message: '숫자여야 합니다' });
  });

  it('PO 이관번호와 날짜 역전을 미리보기에서 분리한다', () => {
    const [validated] = validateRows([
      row({
        po_number: 'MIG-PO-20260507-001',
        company_code: 'TS',
        manufacturer_name: '진코솔라',
        contract_type: '스팟',
        contract_date: '2026-05-07',
        currency: 'USD',
        contract_period_start: '2026-12-31',
        contract_period_end: '2026-05-07',
        product_code: 'JKM-590',
        quantity: 10,
        unit_price_usd_wp: 0.09,
        item_type: '본품',
        payment_type: '유상',
      }),
    ], 'purchase_order', masterData);

    expect(validated.valid).toBe(false);
    expect(validated.warnings).toContainEqual({ field: '발주번호', message: '이관용 PO 번호입니다' });
    expect(validated.errors).toContainEqual({ field: '계약시작일/계약종료일', message: '계약시작일은 계약종료일보다 늦을 수 없습니다' });
  });

  it('LC/T/T는 존재하는 PO와 은행을 요구하고 상태 라벨을 정규화한다', () => {
    const [lc] = validateRows([
      row({
        lc_number: 'MIG-LC-20260507-001',
        po_number: 'PO-2026-001',
        company_code: 'TS',
        bank_name: '국민은행',
        open_date: '2026-05-07',
        maturity_date: '2026-08-07',
        amount_usd: 1000,
        target_mw: 1.2,
      }),
    ], 'lc', masterData);
    expect(lc.valid).toBe(true);
    expect(lc.warnings).toContainEqual({ field: 'L/C No.', message: '이관용 LC 번호입니다' });

    const [tt] = validateRows([
      row({
        po_number: 'PO-2026-001',
        company_code: 'TS',
        remit_date: '2026-05-07',
        amount_usd: 1000,
        exchange_rate: 1350,
        bank_name: '국민은행',
        status: '완료',
      }),
    ], 'tt', masterData);
    expect(tt.valid).toBe(true);
    expect(tt.data.status).toBe('completed');
  });
});
