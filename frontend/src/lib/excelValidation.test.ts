import { describe, expect, it } from 'vitest';
import { validateRows } from '@/lib/excelValidation';
import type { MasterDataForExcel, ParsedRow } from '@/types/excel';

const masterData: MasterDataForExcel = {
  companies: [{ company_id: 'c-1', company_code: 'TS', company_name: '탑솔라' }],
  manufacturers: [{ manufacturer_id: 'm-1', name_kr: '진코솔라' }],
  products: [{ product_id: 'p-1', product_code: 'JKM-590', product_name: 'Tiger Neo', spec_wp: 590 }],
  partners: [{ partner_id: 'pt-1', partner_name: '솔라건설', partner_type: 'customer' }],
  warehouses: [{ warehouse_id: 'w-1', warehouse_code: 'WH-A', warehouse_name: 'A창고' }],
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
});
