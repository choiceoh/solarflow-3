export const testCompany = {
  company_id: 'company-1',
  company_name: '탑솔라',
  company_code: 'TS',
  is_active: true,
};

export const testManufacturer = {
  manufacturer_id: 'mfg-1',
  name_kr: '진코솔라',
  short_name: '진코',
  priority_rank: 1,
  country: '중국',
  domestic_foreign: '해외',
  is_active: true,
};

export const testProduct = {
  product_id: 'product-1',
  product_code: 'M-SF0635',
  product_name: '테스트 모듈 635',
  manufacturer_id: testManufacturer.manufacturer_id,
  manufacturer_name: testManufacturer.name_kr,
  manufacturers: {
    short_name: testManufacturer.short_name,
    name_kr: testManufacturer.name_kr,
  },
  spec_wp: 635,
  wattage_kw: 0.635,
  module_width_mm: 2465,
  module_height_mm: 1134,
  is_active: true,
};

export const testPartner = {
  partner_id: 'partner-1',
  partner_name: '신명엔지니어링',
  partner_type: 'customer',
  is_active: true,
};

export const otherPartner = {
  partner_id: 'partner-2',
  partner_name: '다른거래처',
  partner_type: 'customer',
  is_active: true,
};

export const testInventoryItem = {
  company_id: testCompany.company_id,
  product_id: testProduct.product_id,
  product_code: testProduct.product_code,
  product_name: testProduct.product_name,
  manufacturer_name: testManufacturer.name_kr,
  spec_wp: testProduct.spec_wp,
  module_width_mm: testProduct.module_width_mm,
  module_height_mm: testProduct.module_height_mm,
  physical_kw: 1500,
  reserved_kw: 0,
  allocated_kw: 0,
  available_kw: 1500,
  incoming_kw: 0,
  incoming_reserved_kw: 0,
  available_incoming_kw: 0,
  total_secured_kw: 1500,
  long_term_status: 'normal' as const,
};

export const testInventoryResponse = {
  items: [testInventoryItem],
  summary: {
    total_physical_kw: 1500,
    total_available_kw: 1500,
    total_incoming_kw: 0,
    total_secured_kw: 1500,
  },
  calculated_at: '2026-04-28T00:00:00Z',
};

export const testBl = {
  bl_id: 'bl-1',
  bl_number: 'BL-001',
  company_id: testCompany.company_id,
  manufacturer_id: testManufacturer.manufacturer_id,
  inbound_type: 'import' as const,
  currency: 'USD' as const,
  exchange_rate: 1380,
  etd: '2026-05-01',
  eta: '2026-05-15',
  status: 'completed' as const,
  total_mw: 0.635,
};

export const testBlLine = {
  bl_line_id: 'bl-line-1',
  bl_id: testBl.bl_id,
  product_id: testProduct.product_id,
  quantity: 1000,
  capacity_kw: 635,
  item_type: 'main' as const,
  payment_type: 'paid' as const,
  unit_price_usd_wp: 0.12,
  usage_category: 'sale',
};

export const testPo = {
  po_id: 'po-1',
  po_number: 'PO-2026-001',
  company_id: testCompany.company_id,
  manufacturer_id: testManufacturer.manufacturer_id,
  manufacturer_name: testManufacturer.name_kr,
  contract_type: 'spot' as const,
  contract_date: '2026-04-01',
  incoterms: 'CIF',
  payment_terms: '계약금 5% T/T + L/C Usance 90',
  status: 'contracted' as const,
};

export const testPoLine = {
  po_line_id: 'po-line-1',
  po_id: testPo.po_id,
  product_id: testProduct.product_id,
  quantity: 2000,
  total_amount_usd: 100000,
  products: {
    product_code: testProduct.product_code,
    product_name: testProduct.product_name,
    spec_wp: testProduct.spec_wp,
  },
};

export const testLc = {
  lc_id: 'lc-1',
  lc_number: 'LC-001',
  po_id: testPo.po_id,
  bank_id: 'bank-1',
  bank_name: '하나은행',
  company_id: testCompany.company_id,
  amount_usd: 60000,
  target_mw: 0.8,
  maturity_date: '2026-07-31',
  status: 'opened' as const,
};

export const testTt = {
  tt_id: 'tt-1',
  po_id: testPo.po_id,
  amount_usd: 5000,
  status: 'completed' as const,
};

export const testAllocation = {
  alloc_id: 'alloc-1',
  company_id: testCompany.company_id,
  product_id: testProduct.product_id,
  product_name: testProduct.product_name,
  product_code: testProduct.product_code,
  spec_wp: testProduct.spec_wp,
  quantity: 1000,
  capacity_kw: 635,
  purpose: 'sale' as const,
  source_type: 'stock' as const,
  customer_name: testPartner.partner_name,
  customer_order_no: 'CUST-OLD',
  site_name: '영광 갈동리',
  notes: '[발주번호:CUST-OLD] 기존 메모',
  expected_price_per_wp: 260,
  free_spare_qty: 5,
  status: 'pending' as const,
  bl_id: testBl.bl_id,
  created_at: '2026-04-28T00:00:00Z',
};
