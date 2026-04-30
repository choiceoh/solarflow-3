import { DEV_MOCK_PROFILE, isDevMockSessionActive } from '@/lib/devMockMode';

type MockRow = Record<string, unknown>;
type CompanyScoped = MockRow & { company_id?: string };

const nowIso = '2026-05-01T00:00:00.000Z';

const companies = [
  { company_id: 'company-topsolar', company_name: '탑솔라', company_code: 'TOP', business_number: '123-81-45678', is_active: true },
  { company_id: 'company-energy', company_name: '탑에너지', company_code: 'TEN', business_number: '234-82-56789', is_active: false },
];

const manufacturers = [
  { manufacturer_id: 'mfg-jko', name_kr: '진코솔라', name_en: 'JinkoSolar', short_name: 'JKO', tier: 1, priority_rank: 1, country: '중국', domestic_foreign: 'foreign', is_active: true },
  { manufacturer_id: 'mfg-jas', name_kr: 'JA솔라', name_en: 'JA Solar', short_name: 'JAS', tier: 1, priority_rank: 2, country: '중국', domestic_foreign: 'foreign', is_active: true },
  { manufacturer_id: 'mfg-trn', name_kr: '트리나솔라', name_en: 'Trina Solar', short_name: 'TRN', tier: 1, priority_rank: 3, country: '중국', domestic_foreign: 'foreign', is_active: true },
  { manufacturer_id: 'mfg-lon', name_kr: '론지', name_en: 'LONGi', short_name: 'LON', tier: 1, priority_rank: 4, country: '중국', domestic_foreign: 'foreign', is_active: true },
  { manufacturer_id: 'mfg-csi', name_kr: '캐나디안솔라', name_en: 'Canadian Solar', short_name: 'CSI', tier: 1, priority_rank: 5, country: '중국', domestic_foreign: 'foreign', is_active: true },
  { manufacturer_id: 'mfg-hnw', name_kr: '한화큐셀', name_en: 'Hanwha Q.Cells', short_name: 'HNW', tier: 1, priority_rank: 6, country: '한국', domestic_foreign: 'domestic', is_active: true },
];

const products = [
  { product_id: 'prd-jko-n620', product_code: 'JKO-N620', product_name: 'JKO-N620 N-type TOPCon', manufacturer_id: 'mfg-jko', manufacturer_name: '진코솔라', spec_wp: 620, wattage_kw: 0.62, module_width_mm: 1134, module_height_mm: 2465, module_depth_mm: 35, wafer_platform: 'N-type TOPCon', is_active: true },
  { product_id: 'prd-jko-n580', product_code: 'JKO-N580', product_name: 'JKO-N580 N-type TOPCon', manufacturer_id: 'mfg-jko', manufacturer_name: '진코솔라', spec_wp: 580, wattage_kw: 0.58, module_width_mm: 1134, module_height_mm: 2278, module_depth_mm: 35, wafer_platform: 'N-type TOPCon', is_active: true },
  { product_id: 'prd-jas-dh580', product_code: 'JAS-DH580', product_name: 'JAS-DH580 PERC bifacial', manufacturer_id: 'mfg-jas', manufacturer_name: 'JA솔라', spec_wp: 580, wattage_kw: 0.58, module_width_mm: 1134, module_height_mm: 2278, module_depth_mm: 35, wafer_platform: 'PERC bifacial', is_active: true },
  { product_id: 'prd-jas-n610', product_code: 'JAS-N610', product_name: 'JAS-N610 N-type', manufacturer_id: 'mfg-jas', manufacturer_name: 'JA솔라', spec_wp: 610, wattage_kw: 0.61, module_width_mm: 1134, module_height_mm: 2382, module_depth_mm: 35, wafer_platform: 'N-type', is_active: true },
  { product_id: 'prd-trn-v605', product_code: 'TRN-V605', product_name: 'TRN-V605 Vertex N', manufacturer_id: 'mfg-trn', manufacturer_name: '트리나솔라', spec_wp: 605, wattage_kw: 0.605, module_width_mm: 1134, module_height_mm: 2384, module_depth_mm: 35, wafer_platform: 'Vertex N', is_active: true },
  { product_id: 'prd-trn-v550', product_code: 'TRN-V550', product_name: 'TRN-V550 Vertex S', manufacturer_id: 'mfg-trn', manufacturer_name: '트리나솔라', spec_wp: 550, wattage_kw: 0.55, module_width_mm: 1134, module_height_mm: 2278, module_depth_mm: 35, wafer_platform: 'Vertex S', is_active: true },
  { product_id: 'prd-lon-x600', product_code: 'LON-X600', product_name: 'LON-X600 Hi-MO 7', manufacturer_id: 'mfg-lon', manufacturer_name: '론지', spec_wp: 600, wattage_kw: 0.6, module_width_mm: 1134, module_height_mm: 2382, module_depth_mm: 35, wafer_platform: 'Hi-MO 7', is_active: true },
  { product_id: 'prd-lon-x575', product_code: 'LON-X575', product_name: 'LON-X575 Hi-MO 6', manufacturer_id: 'mfg-lon', manufacturer_name: '론지', spec_wp: 575, wattage_kw: 0.575, module_width_mm: 1134, module_height_mm: 2278, module_depth_mm: 35, wafer_platform: 'Hi-MO 6', is_active: true },
  { product_id: 'prd-csi-t715', product_code: 'CSI-T715', product_name: 'CSI-T715 TOPHiKu', manufacturer_id: 'mfg-csi', manufacturer_name: '캐나디안솔라', spec_wp: 715, wattage_kw: 0.715, module_width_mm: 1303, module_height_mm: 2384, module_depth_mm: 35, wafer_platform: 'TOPHiKu', is_active: true },
  { product_id: 'prd-hnw-q425', product_code: 'HNW-Q425', product_name: 'HNW-Q425 Q.PEAK DUO', manufacturer_id: 'mfg-hnw', manufacturer_name: '한화큐셀', spec_wp: 425, wattage_kw: 0.425, module_width_mm: 1045, module_height_mm: 1879, module_depth_mm: 32, wafer_platform: 'Q.PEAK DUO', is_active: true },
].map((product) => ({
  ...product,
  manufacturers: {
    name_kr: product.manufacturer_name,
    short_name: manufacturers.find((m) => m.manufacturer_id === product.manufacturer_id)?.short_name,
    name_en: manufacturers.find((m) => m.manufacturer_id === product.manufacturer_id)?.name_en,
  },
}));

const productStocks = [
  { product_id: 'prd-jko-n620', physical_ea: 28200, reserved_ea: 3400, incoming_ea: 8800, long_term_status: 'normal', latest_arrival: '2026-04-16', latest_lc_open: '2026-04-12' },
  { product_id: 'prd-jko-n580', physical_ea: 21000, reserved_ea: 2600, incoming_ea: 0, long_term_status: 'normal', latest_arrival: '2026-04-02', latest_lc_open: '2026-03-20' },
  { product_id: 'prd-jas-dh580', physical_ea: 17100, reserved_ea: 900, incoming_ea: 4400, long_term_status: 'normal', latest_arrival: '2026-03-28', latest_lc_open: '2026-04-05' },
  { product_id: 'prd-jas-n610', physical_ea: 12200, reserved_ea: 2400, incoming_ea: 0, long_term_status: 'warning', latest_arrival: '2025-10-21', latest_lc_open: '2026-02-18' },
  { product_id: 'prd-trn-v605', physical_ea: 14800, reserved_ea: 2400, incoming_ea: 5200, long_term_status: 'normal', latest_arrival: '2026-04-10', latest_lc_open: '2026-04-08' },
  { product_id: 'prd-trn-v550', physical_ea: 1800, reserved_ea: 1800, incoming_ea: 0, long_term_status: 'critical', latest_arrival: '2025-02-19', latest_lc_open: '2025-03-03' },
  { product_id: 'prd-lon-x600', physical_ea: 23800, reserved_ea: 1200, incoming_ea: 0, long_term_status: 'normal', latest_arrival: '2026-03-31', latest_lc_open: '2026-03-11' },
  { product_id: 'prd-lon-x575', physical_ea: 4200, reserved_ea: 2400, incoming_ea: 0, long_term_status: 'warning', latest_arrival: '2025-09-12', latest_lc_open: '2025-09-01' },
  { product_id: 'prd-csi-t715', physical_ea: 8200, reserved_ea: 2000, incoming_ea: 0, long_term_status: 'normal', latest_arrival: '2026-04-08', latest_lc_open: '2026-03-25' },
  { product_id: 'prd-hnw-q425', physical_ea: 4900, reserved_ea: 2900, incoming_ea: 0, long_term_status: 'critical', latest_arrival: '2024-12-11', latest_lc_open: '2025-01-12' },
];

const partners = [
  { partner_id: 'ptn-solarnet', partner_name: '솔라넷(주)', partner_type: 'customer', payment_terms: '말일 + 30일', contact_name: '정민수', is_active: true },
  { partner_id: 'ptn-hanbit', partner_name: '한빛에너지', partner_type: 'customer', payment_terms: '계산서 발행 후 45일', contact_name: '김도윤', is_active: true },
  { partner_id: 'ptn-dongbang', partner_name: '동방솔라', partner_type: 'customer', payment_terms: '선금 30% / 잔금 70%', contact_name: '이서연', is_active: true },
  { partner_id: 'ptn-apex', partner_name: '에이펙스EPC', partner_type: 'customer', payment_terms: '프로젝트별 협의', contact_name: '박지훈', is_active: true },
  { partner_id: 'ptn-green', partner_name: '그린파워', partner_type: 'customer', payment_terms: '말일 + 60일', contact_name: '윤하늘', is_active: true },
  { partner_id: 'ptn-forward', partner_name: '동해국제물류', partner_type: 'forwarder', payment_terms: '월말 정산', contact_name: '최유진', is_active: true },
];

const warehouses = [
  { warehouse_id: 'wh-incheon-1', warehouse_code: 'ICN-1', warehouse_name: '인천 1창고', warehouse_type: 'bonded', location_code: 'ICN', location_name: '인천항', is_active: true },
  { warehouse_id: 'wh-pyeongtaek', warehouse_code: 'PTK', warehouse_name: '평택 모듈창고', warehouse_type: 'normal', location_code: 'PTK', location_name: '평택', is_active: true },
  { warehouse_id: 'wh-gwangju', warehouse_code: 'GWJ', warehouse_name: '광주 공사용 창고', warehouse_type: 'site', location_code: 'GWJ', location_name: '광주', is_active: true },
];

const banks = [
  { bank_id: 'bank-hana', company_id: 'company-topsolar', company_name: '탑솔라', bank_name: '하나은행', lc_limit_usd: 4500000, limit_approve_date: '2026-01-05', limit_expiry_date: '2026-12-31', opening_fee_rate: 0.11, acceptance_fee_rate: 0.35, fee_calc_method: 'usance', is_active: true },
  { bank_id: 'bank-shinhan', company_id: 'company-topsolar', company_name: '탑솔라', bank_name: '신한은행', lc_limit_usd: 3200000, limit_approve_date: '2026-01-15', limit_expiry_date: '2026-12-31', opening_fee_rate: 0.12, acceptance_fee_rate: 0.36, fee_calc_method: 'usance', is_active: true },
  { bank_id: 'bank-kb', company_id: 'company-energy', company_name: '탑에너지', bank_name: '국민은행', lc_limit_usd: 2800000, limit_approve_date: '2026-02-01', limit_expiry_date: '2026-12-31', opening_fee_rate: 0.1, acceptance_fee_rate: 0.34, fee_calc_method: 'usance', is_active: true },
];

const purchaseOrders = [
  { po_id: 'po-2604-jko', po_number: 'PO-26-0412', company_id: 'company-topsolar', company_name: '탑솔라', manufacturer_id: 'mfg-jko', manufacturer_name: '진코솔라', first_spec_wp: 620, contract_type: 'frame', contract_date: '2026-04-12', incoterms: 'FOB Shanghai', payment_terms: 'LC 90D', total_qty: 21000, total_mw: 13.02, status: 'in_progress', memo: '목업 P/O' },
  { po_id: 'po-2604-trn', po_number: 'PO-26-0408', company_id: 'company-topsolar', company_name: '탑솔라', manufacturer_id: 'mfg-trn', manufacturer_name: '트리나솔라', first_spec_wp: 605, contract_type: 'spot', contract_date: '2026-04-08', incoterms: 'FOB Ningbo', payment_terms: 'LC 60D', total_qty: 5200, total_mw: 3.15, status: 'in_progress', memo: '목업 P/O' },
  { po_id: 'po-2603-lon', po_number: 'PO-26-0331', company_id: 'company-energy', company_name: '탑에너지', manufacturer_id: 'mfg-lon', manufacturer_name: '론지', first_spec_wp: 600, contract_type: 'frame', contract_date: '2026-03-31', incoterms: 'FOB Shanghai', payment_terms: 'TT 30/70', total_qty: 6400, total_mw: 3.84, status: 'completed', memo: '목업 P/O' },
];

const poLines = [
  { po_line_id: 'pol-jko-n620', po_id: 'po-2604-jko', product_id: 'prd-jko-n620', product_code: 'JKO-N620', product_name: 'JKO-N620 N-type TOPCon', spec_wp: 620, quantity: 8800, unit_price_usd_wp: 0.116, unit_price_usd: 71.92, total_amount_usd: 632896, item_type: 'main', payment_type: 'paid' },
  { po_line_id: 'pol-jko-n580', po_id: 'po-2604-jko', product_id: 'prd-jko-n580', product_code: 'JKO-N580', product_name: 'JKO-N580 N-type TOPCon', spec_wp: 580, quantity: 12200, unit_price_usd_wp: 0.111, unit_price_usd: 64.38, total_amount_usd: 785436, item_type: 'main', payment_type: 'paid' },
  { po_line_id: 'pol-trn-v605', po_id: 'po-2604-trn', product_id: 'prd-trn-v605', product_code: 'TRN-V605', product_name: 'TRN-V605 Vertex N', spec_wp: 605, quantity: 5200, unit_price_usd_wp: 0.119, unit_price_usd: 71.995, total_amount_usd: 374374, item_type: 'main', payment_type: 'paid' },
  { po_line_id: 'pol-lon-x600', po_id: 'po-2603-lon', product_id: 'prd-lon-x600', product_code: 'LON-X600', product_name: 'LON-X600 Hi-MO 7', spec_wp: 600, quantity: 6400, unit_price_usd_wp: 0.113, unit_price_usd: 67.8, total_amount_usd: 433920, item_type: 'main', payment_type: 'paid' },
];

const lcs = [
  { lc_id: 'lc-260405', lc_number: 'LC-26-0405', po_id: 'po-2604-jko', po_number: 'PO-26-0412', bank_id: 'bank-hana', bank_name: '하나은행', company_id: 'company-topsolar', company_name: '탑솔라', open_date: '2026-04-05', amount_usd: 1840000, target_qty: 21000, target_mw: 13.02, usance_days: 90, usance_type: 'sight', maturity_date: '2026-05-04', repaid: false, status: 'opened', memo: '목업 LC' },
  { lc_id: 'lc-260412', lc_number: 'LC-26-0412', po_id: 'po-2604-trn', po_number: 'PO-26-0408', bank_id: 'bank-shinhan', bank_name: '신한은행', company_id: 'company-topsolar', company_name: '탑솔라', open_date: '2026-04-12', amount_usd: 2420000, target_qty: 5200, target_mw: 3.15, usance_days: 60, usance_type: 'sight', maturity_date: '2026-06-11', repaid: false, status: 'opened', memo: '목업 LC' },
];

const lcLines = poLines.slice(0, 3).map((line, index) => ({
  lc_line_id: `lcl-${index + 1}`,
  lc_id: index === 2 ? 'lc-260412' : 'lc-260405',
  po_line_id: line.po_line_id,
  product_id: line.product_id,
  product_name: line.product_name,
  product_code: line.product_code,
  spec_wp: line.spec_wp,
  quantity: line.quantity,
  capacity_kw: Number(line.quantity) * Number(line.spec_wp) / 1000,
  amount_usd: line.total_amount_usd,
  unit_price_usd_wp: line.unit_price_usd_wp,
  item_type: 'main',
  payment_type: 'paid',
}));

const tts = [
  { tt_id: 'tt-260401', po_id: 'po-2603-lon', po_number: 'PO-26-0331', manufacturer_name: '론지', remit_date: '2026-04-01', amount_usd: 130000, amount_krw: 176800000, exchange_rate: 1360, purpose: '계약금', status: 'completed', bank_name: '국민은행' },
  { tt_id: 'tt-260415', po_id: 'po-2604-jko', po_number: 'PO-26-0412', manufacturer_name: '진코솔라', remit_date: '2026-04-15', amount_usd: 220000, amount_krw: 300300000, exchange_rate: 1365, purpose: '선적 전 대금', status: 'planned', bank_name: '하나은행' },
];

const bls = [
  { bl_id: 'bl-260412', bl_number: 'BL-26-0412', po_id: 'po-2604-jko', po_number: 'PO-26-0412', lc_id: 'lc-260405', lc_number: 'LC-26-0405', company_id: 'company-topsolar', manufacturer_id: 'mfg-jko', manufacturer_name: '진코솔라', inbound_type: 'import', currency: 'USD', exchange_rate: 1364.2, etd: '2026-04-25', eta: '2026-05-02', port: '인천항', forwarder: '동해국제물류', warehouse_id: 'wh-incheon-1', warehouse_name: '인천 1창고', invoice_number: 'INV-JKO-260412', status: 'shipping', payment_terms: 'LC 90D', incoterms: 'FOB Shanghai', declaration_number: 'IL-25-1204-04', cif_amount_krw: 928400000 },
  { bl_id: 'bl-260408', bl_number: 'BL-26-0408', po_id: 'po-2604-trn', po_number: 'PO-26-0408', lc_id: 'lc-260412', lc_number: 'LC-26-0412', company_id: 'company-topsolar', manufacturer_id: 'mfg-trn', manufacturer_name: '트리나솔라', inbound_type: 'import', currency: 'USD', exchange_rate: 1362.1, etd: '2026-04-23', eta: '2026-05-04', port: '인천항', forwarder: '동해국제물류', warehouse_id: 'wh-incheon-1', warehouse_name: '인천 1창고', invoice_number: 'INV-TRN-260408', status: 'shipping', payment_terms: 'LC 60D', incoterms: 'FOB Ningbo', cif_amount_krw: 515400000 },
  { bl_id: 'bl-260331', bl_number: 'BL-26-0331', po_id: 'po-2603-lon', po_number: 'PO-26-0331', company_id: 'company-energy', manufacturer_id: 'mfg-lon', manufacturer_name: '론지', inbound_type: 'import', currency: 'USD', exchange_rate: 1358.7, etd: '2026-03-20', eta: '2026-03-31', actual_arrival: '2026-03-31', port: '평택항', forwarder: '동해국제물류', warehouse_id: 'wh-pyeongtaek', warehouse_name: '평택 모듈창고', invoice_number: 'INV-LON-260331', status: 'completed', erp_registered: true, payment_terms: 'TT 30/70', incoterms: 'FOB Shanghai', cif_amount_krw: 604200000 },
];

const blLines = [
  { bl_line_id: 'bll-jko-n620', bl_id: 'bl-260412', product_id: 'prd-jko-n620', po_line_id: 'pol-jko-n620', product_name: 'JKO-N620 N-type TOPCon', product_code: 'JKO-N620', quantity: 8800, capacity_kw: 5456, item_type: 'main', payment_type: 'paid', invoice_amount_usd: 632896, unit_price_usd_wp: 0.116, usage_category: 'sale' },
  { bl_line_id: 'bll-trn-v605', bl_id: 'bl-260408', product_id: 'prd-trn-v605', po_line_id: 'pol-trn-v605', product_name: 'TRN-V605 Vertex N', product_code: 'TRN-V605', quantity: 5200, capacity_kw: 3146, item_type: 'main', payment_type: 'paid', invoice_amount_usd: 374374, unit_price_usd_wp: 0.119, usage_category: 'sale' },
  { bl_line_id: 'bll-lon-x600', bl_id: 'bl-260331', product_id: 'prd-lon-x600', po_line_id: 'pol-lon-x600', product_name: 'LON-X600 Hi-MO 7', product_code: 'LON-X600', quantity: 6400, capacity_kw: 3840, item_type: 'main', payment_type: 'paid', invoice_amount_usd: 433920, unit_price_usd_wp: 0.113, usage_category: 'sale' },
];

const constructionSites = [
  { site_id: 'site-yeonggwang', company_id: 'company-topsolar', name: '영광 갈동 태양광', location: '전남 영광군 갈동리', site_type: 'own', capacity_mw: 4.8, started_at: '2026-03-10', notes: '자체 공사 목업 현장', is_active: true, created_at: nowIso, updated_at: nowIso },
  { site_id: 'site-dangjin', company_id: 'company-topsolar', name: '당진 물류센터 지붕', location: '충남 당진시', site_type: 'epc', capacity_mw: 2.2, started_at: '2026-04-01', notes: 'EPC 현장', is_active: true, created_at: nowIso, updated_at: nowIso },
];

const allocations = [
  { alloc_id: 'alloc-2604-018', company_id: 'company-topsolar', product_id: 'prd-lon-x600', product_name: 'LON-X600 Hi-MO 7', product_code: 'LON-X600', spec_wp: 600, quantity: 1800, capacity_kw: 1080, purpose: 'sale', source_type: 'stock', customer_name: '솔라넷(주)', customer_order_no: 'RSV-2604-018', notes: '목업 예약', expected_price_per_wp: 404, free_spare_qty: 18, status: 'pending', order_id: 'ord-2604-018', created_at: nowIso },
  { alloc_id: 'alloc-2604-017', company_id: 'company-topsolar', product_id: 'prd-jas-dh580', product_name: 'JAS-DH580 PERC bifacial', product_code: 'JAS-DH580', spec_wp: 580, quantity: 2200, capacity_kw: 1276, purpose: 'sale', source_type: 'stock', customer_name: '한빛에너지', customer_order_no: 'RSV-2604-017', notes: '목업 예약', expected_price_per_wp: 398, status: 'pending', order_id: 'ord-2604-017', created_at: nowIso },
  { alloc_id: 'alloc-2604-014', company_id: 'company-topsolar', product_id: 'prd-jko-n620', product_name: 'JKO-N620 N-type TOPCon', product_code: 'JKO-N620', spec_wp: 620, quantity: 1400, capacity_kw: 868, purpose: 'sale', source_type: 'incoming', customer_name: '동방솔라', customer_order_no: 'RSV-2604-014', notes: '신용한도 검토 필요', expected_price_per_wp: 410, status: 'hold', bl_id: 'bl-260412', order_id: 'ord-2604-014', created_at: nowIso },
  { alloc_id: 'alloc-2604-012', company_id: 'company-topsolar', product_id: 'prd-trn-v605', product_name: 'TRN-V605 Vertex N', product_code: 'TRN-V605', spec_wp: 605, quantity: 2400, capacity_kw: 1452, purpose: 'sale', source_type: 'incoming', customer_name: '에이펙스EPC', customer_order_no: 'RSV-2604-012', site_id: 'site-dangjin', site_name: '당진 물류센터 지붕', notes: '목업 예약', expected_price_per_wp: 412, status: 'pending', bl_id: 'bl-260408', order_id: 'ord-2604-012', created_at: nowIso },
  { alloc_id: 'alloc-2604-009', company_id: 'company-topsolar', product_id: 'prd-jko-n580', product_name: 'JKO-N580 N-type TOPCon', product_code: 'JKO-N580', spec_wp: 580, quantity: 1600, capacity_kw: 928, purpose: 'sale', source_type: 'stock', customer_name: '그린파워', customer_order_no: 'RSV-2604-009', notes: '목업 보류', expected_price_per_wp: 396, status: 'hold', order_id: 'ord-2604-009', created_at: nowIso },
];

const orders = allocations.map((alloc, index) => ({
  order_id: String(alloc.order_id),
  order_number: String(alloc.customer_order_no),
  company_id: String(alloc.company_id),
  company_name: '탑솔라',
  customer_id: partners[index]?.partner_id ?? 'ptn-solarnet',
  customer_name: String(alloc.customer_name),
  order_date: index < 2 ? '2026-04-26' : '2026-04-25',
  receipt_method: 'email',
  management_category: index === 3 ? 'construction' : 'sale',
  fulfillment_source: alloc.source_type,
  product_id: String(alloc.product_id),
  product_name: String(alloc.product_name),
  product_code: String(alloc.product_code),
  manufacturer_name: products.find((p) => p.product_id === alloc.product_id)?.manufacturer_name,
  spec_wp: alloc.spec_wp,
  wattage_kw: Number(alloc.spec_wp) / 1000,
  quantity: alloc.quantity,
  capacity_kw: alloc.capacity_kw,
  unit_price_wp: alloc.expected_price_per_wp,
  site_id: alloc.site_id,
  site_name: alloc.site_name,
  payment_terms: '계산서 발행 후 30일',
  deposit_rate: index === 2 ? 30 : 0,
  delivery_due: index === 0 ? '2026-05-06' : index === 1 ? '2026-05-08' : '2026-05-15',
  shipped_qty: index === 0 ? 400 : 0,
  remaining_qty: index === 0 ? Number(alloc.quantity) - 400 : alloc.quantity,
  spare_qty: alloc.free_spare_qty ?? 0,
  status: index === 0 ? 'partial' : 'received',
  memo: '목업 수주',
  bl_id: alloc.bl_id,
}));

const outbounds = [
  { outbound_id: 'ob-2604-018-1', outbound_date: '2026-04-29', company_id: 'company-topsolar', company_name: '탑솔라', product_id: 'prd-lon-x600', product_name: 'LON-X600 Hi-MO 7', product_code: 'LON-X600', spec_wp: 600, wattage_kw: 0.6, quantity: 400, capacity_kw: 240, warehouse_id: 'wh-pyeongtaek', warehouse_name: '평택 모듈창고', usage_category: 'sale', order_id: 'ord-2604-018', order_number: 'RSV-2604-018', customer_id: 'ptn-solarnet', customer_name: '솔라넷(주)', unit_price_wp: 404, site_name: '충북 음성 ESS', status: 'active', memo: '목업 출고' },
  { outbound_id: 'ob-2604-017-1', outbound_date: '2026-04-27', company_id: 'company-topsolar', company_name: '탑솔라', product_id: 'prd-jas-dh580', product_name: 'JAS-DH580 PERC bifacial', product_code: 'JAS-DH580', spec_wp: 580, wattage_kw: 0.58, quantity: 2200, capacity_kw: 1276, warehouse_id: 'wh-incheon-1', warehouse_name: '인천 1창고', usage_category: 'sale', order_id: 'ord-2604-017', order_number: 'RSV-2604-017', customer_id: 'ptn-hanbit', customer_name: '한빛에너지', unit_price_wp: 398, site_name: '해남 농촌태양광', status: 'active', memo: '계산서 미발행 목업' },
];

const sales = [
  { sale_id: 'sale-2604-018-1', outbound_id: 'ob-2604-018-1', order_id: 'ord-2604-018', customer_id: 'ptn-solarnet', customer_name: '솔라넷(주)', quantity: 400, capacity_kw: 240, unit_price_wp: 404, unit_price_ea: 242400, supply_amount: 96960000, vat_amount: 9696000, total_amount: 106656000, tax_invoice_date: '2026-04-30', tax_invoice_email: 'tax@solarnet.co.kr', erp_closed: true, erp_closed_date: '2026-04-30', status: 'active' },
  { sale_id: 'sale-2604-017-1', outbound_id: 'ob-2604-017-1', order_id: 'ord-2604-017', customer_id: 'ptn-hanbit', customer_name: '한빛에너지', quantity: 2200, capacity_kw: 1276, unit_price_wp: 398, unit_price_ea: 230840, supply_amount: 507848000, vat_amount: 50784800, total_amount: 558632800, status: 'active' },
];

const saleListItems = sales.map((sale) => {
  const outbound = outbounds.find((item) => item.outbound_id === sale.outbound_id);
  const order = orders.find((item) => item.order_id === sale.order_id);
  return { ...sale, outbound_date: outbound?.outbound_date, order_date: order?.order_date, order_number: order?.order_number, company_id: outbound?.company_id, product_id: outbound?.product_id, product_name: outbound?.product_name, product_code: outbound?.product_code, spec_wp: outbound?.spec_wp, site_name: outbound?.site_name, sale };
});

const receipts = [
  { receipt_id: 'rcp-2604-018', customer_id: 'ptn-solarnet', customer_name: '솔라넷(주)', receipt_date: '2026-04-30', amount: 106656000, bank_account: '하나 123-456', memo: '목업 수금', matched_total: 106656000, remaining: 0 },
  { receipt_id: 'rcp-2604-green', customer_id: 'ptn-green', customer_name: '그린파워', receipt_date: '2026-04-21', amount: 80000000, bank_account: '신한 456-789', memo: '일부 수금', matched_total: 0, remaining: 80000000 },
];

const receiptMatches = [
  { match_id: 'match-2604-018', receipt_id: 'rcp-2604-018', outbound_id: 'ob-2604-018-1', sale_id: 'sale-2604-018-1', matched_amount: 106656000, outbound_date: '2026-04-29', site_name: '충북 음성 ESS', product_name: 'LON-X600 Hi-MO 7' },
];

const declarations = [
  { declaration_id: 'dec-1204-04', declaration_number: 'IL-25-1204-04', bl_id: 'bl-260412', bl_number: 'BL-26-0412', company_id: 'company-topsolar', company_name: '탑솔라', declaration_date: '2026-04-30', arrival_date: '2026-05-02', hs_code: '8541.43', customs_office: '인천세관', port: '인천항', memo: '목업 면장' },
];

const costDetails = [
  { cost_id: 'cost-1204-04-1', declaration_id: 'dec-1204-04', product_id: 'prd-jko-n620', product_name: 'JKO-N620 N-type TOPCon', product_code: 'JKO-N620', spec_wp: 620, quantity: 8800, capacity_kw: 5456, exchange_rate: 1364.2, fob_unit_usd: 0.116, fob_total_usd: 632896, fob_wp_krw: 158.25, cif_total_krw: 928400000, cif_unit_usd: 0.124, cif_total_usd: 680532, cif_wp_krw: 170.16, tariff_rate: 0, tariff_amount: 0, vat_amount: 92840000, customs_fee: 1100000, incidental_cost: 5200000, landed_total_krw: 934700000, landed_wp_krw: 171.31, memo: '목업 원가' },
];

const expenses = [
  { expense_id: 'exp-lc-260405', bl_id: 'bl-260412', bl_number: 'BL-26-0412', month: '2026-04', company_id: 'company-topsolar', company_name: '탑솔라', expense_type: 'lc_fee', amount: 2200000, vat: 220000, total: 2420000, vendor: '하나은행', memo: 'LC 개설 수수료 목업' },
  { expense_id: 'exp-truck-260429', outbound_id: 'ob-2604-018-1', month: '2026-04', company_id: 'company-topsolar', company_name: '탑솔라', expense_type: 'transport', amount: 620000, vat: 62000, total: 682000, vendor: '동해운송', vehicle_type: '25t', destination: '충북 음성', memo: '출고 운송 목업' },
];

const limitChanges = [
  { limit_change_id: 'limit-2604-hana', bank_id: 'bank-hana', bank_name: '하나은행', change_date: '2026-04-01', previous_limit: 3800000, new_limit: 4500000, reason: '상반기 수입 물량 확대' },
];

const notes = [
  { note_id: 'note-pr19', company_id: 'company-topsolar', title: 'PR19 디자인 검토', body: '목업 로그인 모드에서는 실제 DB에 접근하지 않습니다.', target_type: 'system', target_id: 'dev-mock', created_at: nowIso, updated_at: nowIso },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function endpointId(pathname: string, collection: string): string | null {
  const prefix = `/api/v1/${collection}/`;
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length).split('/')[0]);
}

function queryValue(url: URL, body: MockRow, key: string): string | undefined {
  const fromQuery = url.searchParams.get(key);
  if (fromQuery) return fromQuery;
  const fromBody = body[key];
  return typeof fromBody === 'string' && fromBody ? fromBody : undefined;
}

function filterRows<T extends CompanyScoped>(rows: T[], url: URL, body: MockRow): T[] {
  const exactFilters = ['company_id', 'manufacturer_id', 'product_id', 'po_id', 'lc_id', 'bank_id', 'bl_id', 'declaration_id', 'outbound_id', 'order_id', 'receipt_id', 'customer_id', 'status', 'inbound_type'];
  return rows.filter((row) => exactFilters.every((key) => {
    const expected = queryValue(url, body, key);
    if (!expected || expected === 'all') return true;
    const actual = row[key];
    return actual == null || String(actual) === expected;
  }));
}

function inventoryResponse() {
  const items = productStocks.map((stock) => {
    const product = products.find((item) => item.product_id === stock.product_id)!;
    const physicalKw = stock.physical_ea * product.spec_wp / 1000;
    const reservedKw = stock.reserved_ea * product.spec_wp / 1000;
    const incomingKw = stock.incoming_ea * product.spec_wp / 1000;
    const availableKw = Math.max(0, physicalKw - reservedKw);
    return {
      company_id: 'company-topsolar',
      company_name: '탑솔라',
      product_id: product.product_id,
      product_code: product.product_code,
      product_name: product.product_name,
      manufacturer_name: product.manufacturer_name,
      spec_wp: product.spec_wp,
      module_width_mm: product.module_width_mm,
      module_height_mm: product.module_height_mm,
      physical_kw: physicalKw,
      reserved_kw: reservedKw,
      allocated_kw: reservedKw,
      available_kw: availableKw,
      incoming_kw: incomingKw,
      incoming_reserved_kw: Math.min(incomingKw, reservedKw * 0.35),
      available_incoming_kw: Math.max(0, incomingKw - reservedKw * 0.35),
      total_secured_kw: availableKw + incomingKw,
      long_term_status: stock.long_term_status,
      latest_arrival: stock.latest_arrival,
      latest_lc_open: stock.latest_lc_open,
    };
  });
  return {
    items,
    summary: {
      total_physical_kw: items.reduce((sum, item) => sum + item.physical_kw, 0),
      total_available_kw: items.reduce((sum, item) => sum + item.available_kw, 0),
      total_incoming_kw: items.reduce((sum, item) => sum + item.incoming_kw, 0),
      total_secured_kw: items.reduce((sum, item) => sum + item.total_secured_kw, 0),
    },
    calculated_at: nowIso,
  };
}

function customerAnalysisResponse() {
  const items = [
    { customer_id: 'ptn-solarnet', customer_name: '솔라넷(주)', total_sales_krw: 398000000, total_collected_krw: 398000000, outstanding_krw: 0, outstanding_count: 0, oldest_outstanding_days: 0, avg_payment_days: 18, avg_margin_rate: 13.2, total_margin_krw: 52500000, avg_deposit_rate: 0, status: 'normal' },
    { customer_id: 'ptn-hanbit', customer_name: '한빛에너지', total_sales_krw: 558632800, total_collected_krw: 0, outstanding_krw: 558632800, outstanding_count: 1, oldest_outstanding_days: 34, avg_payment_days: null, avg_margin_rate: 11.8, total_margin_krw: 66000000, avg_deposit_rate: 0, status: 'warning' },
    { customer_id: 'ptn-green', customer_name: '그린파워', total_sales_krw: 227000000, total_collected_krw: 80000000, outstanding_krw: 147000000, outstanding_count: 2, oldest_outstanding_days: 67, avg_payment_days: 61, avg_margin_rate: 8.5, total_margin_krw: 19295000, avg_deposit_rate: 0, status: 'overdue' },
  ];
  return {
    items,
    summary: {
      total_sales_krw: items.reduce((sum, item) => sum + item.total_sales_krw, 0),
      total_collected_krw: items.reduce((sum, item) => sum + item.total_collected_krw, 0),
      total_outstanding_krw: items.reduce((sum, item) => sum + item.outstanding_krw, 0),
      total_margin_krw: items.reduce((sum, item) => sum + Number(item.total_margin_krw ?? 0), 0),
      overall_margin_rate: 11.6,
    },
  };
}

function lcLimitTimelineResponse() {
  return {
    bank_summaries: [
      { bank_name: '하나은행', limit: 4500000, used: 1840000, available: 2660000, usage_rate: 40.9 },
      { bank_name: '신한은행', limit: 3200000, used: 2420000, available: 780000, usage_rate: 75.6 },
      { bank_name: '국민은행', limit: 2800000, used: 0, available: 2800000, usage_rate: 0 },
    ],
    timeline_events: [
      { date: '2026-05-04', bank_name: '하나은행', amount: -1840000, description: 'LC-26-0405 만기' },
      { date: '2026-06-11', bank_name: '신한은행', amount: -2420000, description: 'LC-26-0412 만기' },
    ],
    monthly_projection: [
      { month: '2026-05', projected_available: 1600000 },
      { month: '2026-06', projected_available: -420000 },
      { month: '2026-07', projected_available: 2380000 },
    ],
  };
}

function priceTrendResponse() {
  const periods = ['2026-01', '2026-02', '2026-03', '2026-04'];
  return {
    manufacturers: [
      { name: '진코솔라', data_points: periods.map((period, index) => ({ period, price_usd_wp: [0.121, 0.119, 0.117, 0.116][index] })) },
      { name: 'JA솔라', data_points: periods.map((period, index) => ({ period, price_usd_wp: [0.124, 0.122, 0.120, 0.118][index] })) },
      { name: '트리나솔라', data_points: periods.map((period, index) => ({ period, price_usd_wp: [0.126, 0.123, 0.121, 0.119][index] })) },
      { name: '론지', data_points: periods.map((period, index) => ({ period, price_usd_wp: [0.123, 0.121, 0.117, 0.113][index] })) },
    ],
  };
}

function supplyForecastResponse() {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  return {
    products: inventoryResponse().items.slice(0, 5).map((item) => ({
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      manufacturer_name: item.manufacturer_name,
      spec_wp: item.spec_wp,
      module_width_mm: item.module_width_mm,
      module_height_mm: item.module_height_mm,
      months: months.map((month, index) => ({
        month,
        opening_kw: item.available_kw - index * 320,
        incoming_kw: index === 0 ? item.incoming_kw : 0,
        outgoing_sale_kw: 420 + index * 80,
        outgoing_construction_kw: index % 2 === 0 ? 180 : 80,
        closing_kw: item.available_kw + (index === 0 ? item.incoming_kw : 0) - (600 + index * 120),
        reserved_kw: item.reserved_kw,
        allocated_kw: item.allocated_kw,
        available_kw: Math.max(0, item.available_kw - index * 520),
        insufficient: item.available_kw - index * 520 < 0,
      })),
      unscheduled: { sale_kw: 420, construction_kw: 180, incoming_kw: item.incoming_kw },
    })),
    summary: {
      months: months.map((month, index) => ({
        month,
        total_opening_kw: 76420 - index * 2300,
        total_incoming_kw: index === 0 ? 16980 : 0,
        total_outgoing_kw: 4200 + index * 640,
        total_closing_kw: 89200 - index * 3300,
        total_available_kw: 76420 - index * 2800,
      })),
    },
    calculated_at: nowIso,
  };
}

function turnoverResponse() {
  const inv = inventoryResponse().items;
  const top = inv.slice(0, 6).map((item, index) => ({
    product_id: item.product_id,
    product_code: item.product_code,
    product_name: item.product_name,
    manufacturer_name: item.manufacturer_name,
    spec_wp: item.spec_wp,
    module_width_mm: item.module_width_mm,
    module_height_mm: item.module_height_mm,
    inventory_kw: item.physical_kw,
    inventory_ea: Math.round(item.physical_kw * 1000 / item.spec_wp),
    outbound_kw: 1200 - index * 130,
    outbound_ea: Math.round((1200 - index * 130) * 1000 / item.spec_wp),
    turnover_ratio: 1.8 - index * 0.18,
    dio_days: 210 + index * 24,
  }));
  return {
    window_days: 90,
    total: { inventory_kw: 94820, outbound_kw: 8420, turnover_ratio: 0.36, dio_days: 410 },
    by_manufacturer: manufacturers.slice(0, 5).map((m, index) => ({ manufacturer_id: m.manufacturer_id, manufacturer_name: m.name_kr, inventory_kw: 12000 + index * 3400, outbound_kw: 1600 - index * 120, turnover_ratio: 0.42 - index * 0.03, dio_days: 300 + index * 22 })),
    by_spec_wp: [425, 550, 575, 580, 600, 605, 620, 715].map((spec_wp, index) => ({ spec_wp, inventory_kw: 4400 + index * 820, outbound_kw: 900 - index * 40, turnover_ratio: 0.5 - index * 0.02, dio_days: 250 + index * 15 })),
    matrix: manufacturers.slice(0, 4).flatMap((m, index) => [580, 600, 620].map((spec_wp) => ({ manufacturer_id: m.manufacturer_id, manufacturer_name: m.name_kr, spec_wp, inventory_kw: 1600 + index * 400, outbound_kw: 320 + index * 30, turnover_ratio: 0.44 - index * 0.04 }))),
    top_movers: top.slice(0, 3),
    slow_movers: top.slice(3, 6).reverse(),
    calculated_at: nowIso,
  };
}

function marginAnalysisResponse() {
  const items = saleListItems.map((item) => {
    const quantity = Number(item.quantity ?? 0);
    const specWp = Number(item.spec_wp ?? 0);
    const revenue = Number(item.sale.supply_amount ?? 0);
    const cost = revenue * 0.88;
    return {
      manufacturer_name: String(item.product_code ?? '').split('-')[0],
      product_code: item.product_code,
      product_name: item.product_name,
      spec_wp: specWp,
      total_sold_qty: quantity,
      total_sold_kw: Number(item.capacity_kw ?? 0),
      avg_sale_price_wp: item.unit_price_wp,
      avg_cost_wp: Math.round(Number(item.unit_price_wp ?? 0) * 0.88),
      margin_wp: Math.round(Number(item.unit_price_wp ?? 0) * 0.12),
      margin_rate: 12,
      total_revenue_krw: revenue,
      total_cost_krw: cost,
      total_margin_krw: revenue - cost,
      sale_count: 1,
    };
  });
  return {
    items,
    summary: {
      total_sold_kw: items.reduce((sum, item) => sum + item.total_sold_kw, 0),
      total_revenue_krw: items.reduce((sum, item) => sum + item.total_revenue_krw, 0),
      total_cost_krw: items.reduce((sum, item) => sum + Number(item.total_cost_krw ?? 0), 0),
      total_margin_krw: items.reduce((sum, item) => sum + Number(item.total_margin_krw ?? 0), 0),
      overall_margin_rate: 12,
      cost_basis: 'landed',
    },
  };
}

function searchResponse(body: MockRow) {
  const query = typeof body.query === 'string' ? body.query : '';
  const results = [
    { result_type: 'product', title: 'JKO-N620 · 진코솔라 620W', data: products[0], link: { module: 'inventory', params: { product_id: 'prd-jko-n620' } } },
    { result_type: 'order', title: 'RSV-2604-018 · 솔라넷(주)', data: orders[0], link: { module: 'orders', params: { order_id: 'ord-2604-018' } } },
    { result_type: 'lc', title: 'LC-26-0405 · 하나은행 D-3', data: lcs[0], link: { module: 'banking', params: { lc_id: 'lc-260405' } } },
  ].filter((item) => !query || item.title.toLowerCase().includes(query.toLowerCase()) || query.length < 2);
  return {
    query,
    intent: query ? 'mock_search' : 'recent',
    parsed: { keywords: query ? query.split(/\s+/).filter(Boolean) : [] },
    results,
    warnings: [],
    calculated_at: nowIso,
  };
}

async function readJsonBody(options?: RequestInit): Promise<MockRow> {
  if (!options?.body || typeof options.body !== 'string') return {};
  try {
    const parsed = JSON.parse(options.body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as MockRow : {};
  } catch {
    return {};
  }
}

function collectionRoute<T>(url: URL, body: MockRow, rows: MockRow[], idKey: string, collection: string): T {
  const id = endpointId(url.pathname, collection);
  if (id) {
    return clone((rows.find((row) => row[idKey] === id) ?? {}) as T);
  }
  return clone(filterRows(rows as CompanyScoped[], url, body) as T);
}

function writeRoute<T>(url: URL): T {
  const collection = url.pathname.split('/').filter(Boolean).pop() ?? 'mock';
  const idKey = `${collection.replace(/s$/, '').replace(/-/g, '_')}_id`;
  return clone({ [idKey]: `mock-${collection}-${Date.now()}`, status: 'mock_saved', mock: true } as T);
}

function calcRoute<T>(url: URL, body: MockRow): T {
  switch (url.pathname) {
    case '/api/v1/calc/inventory':
      return clone(inventoryResponse() as T);
    case '/api/v1/calc/customer-analysis':
      return clone(customerAnalysisResponse() as T);
    case '/api/v1/calc/lc-limit-timeline':
      return clone(lcLimitTimelineResponse() as T);
    case '/api/v1/calc/lc-maturity-alert':
      return clone({ alerts: lcs.map((lc) => ({ lc_id: lc.lc_id, lc_number: lc.lc_number, po_number: lc.po_number, bank_name: lc.bank_name, amount_usd: lc.amount_usd, maturity_date: lc.maturity_date, days_remaining: lc.lc_id === 'lc-260405' ? 3 : 41, status: lc.status })) } as T);
    case '/api/v1/calc/price-trend':
      return clone(priceTrendResponse() as T);
    case '/api/v1/calc/supply-forecast':
      return clone(supplyForecastResponse() as T);
    case '/api/v1/calc/inventory-turnover':
      return clone(turnoverResponse() as T);
    case '/api/v1/calc/margin-analysis':
      return clone(marginAnalysisResponse() as T);
    case '/api/v1/calc/search':
      return clone(searchResponse(body) as T);
    case '/api/v1/calc/exchange-compare':
      return clone({ items: costDetails.map((cost) => ({ declaration_number: declarations[0].declaration_number, declaration_date: declarations[0].declaration_date, product_name: cost.product_name, manufacturer_name: '진코솔라', contract_rate: 1364.2, fob_unit_usd: cost.fob_unit_usd, cif_unit_usd: cost.cif_unit_usd, cif_wp_at_contract: cost.cif_wp_krw, cif_wp_at_latest: Number(cost.cif_wp_krw) + 2.4, rate_impact_krw: 13200000 })), latest_rate: 1379.2, latest_rate_source: '목업 최근 면장 환율', calculated_at: nowIso } as T);
    case '/api/v1/calc/outstanding-list':
      return clone({ outstanding_items: [{ outbound_id: 'ob-2604-017-1', outbound_date: '2026-04-27', customer_name: '한빛에너지', site_name: '해남 농촌태양광', product_name: 'JAS-DH580 PERC bifacial', spec_wp: 580, quantity: 2200, total_amount: 558632800, collected_amount: 0, outstanding_amount: 558632800, days_elapsed: 34, status: 'active' }] } as T);
    case '/api/v1/calc/receipt-match-suggest':
      return clone({ receipt_amount: body.receipt_amount ?? 0, suggestions: [{ match_type: 'single', items: [{ outbound_id: 'ob-2604-017-1', match_amount: body.receipt_amount ?? 0 }], total_matched: body.receipt_amount ?? 0, remainder: 0 }], unmatched_amount: 0 } as T);
    case '/api/v1/calc/lc-fee':
      return clone({ opening_fee: 2024000, acceptance_fee: 3480000, total_fee: 5504000, total_fee_krw: 5504000, fee_note: '목업 수수료 계산' } as T);
    case '/api/v1/calc/landed-cost':
      return clone({ declaration_id: body.declaration_id ?? 'dec-1204-04', items: costDetails, summary: { landed_total_krw: 934700000, landed_wp_krw: 171.31 }, calculated_at: nowIso } as T);
    default:
      return clone({ items: [], calculated_at: nowIso } as T);
  }
}

export function isDevMockApiActive(): boolean {
  return isDevMockSessionActive();
}

export async function mockFetchWithAuth<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const url = new URL(path, 'http://solarflow.mock');
  const method = (options?.method ?? 'GET').toUpperCase();
  const body = await readJsonBody(options);

  if (method !== 'GET' && !url.pathname.startsWith('/api/v1/calc') && url.pathname !== '/api/v1/ocr/extract') {
    return writeRoute<T>(url);
  }

  if (url.pathname.startsWith('/api/v1/calc/')) return calcRoute<T>(url, body);
  if (url.pathname === '/api/v1/users/me') return clone(DEV_MOCK_PROFILE as T);
  if (url.pathname === '/api/v1/ocr/health') return clone({ ok: true, mode: 'mock', engine_status: 'ready', warm: true } as T);
  if (url.pathname === '/api/v1/ocr/extract') {
    return clone({
      document_type: 'customs_declaration',
      confidence: 0.91,
      fields: {
        declaration_number: 'IL-25-1204-04',
        bl_number: 'BL-26-0412',
        arrival_date: '2026-05-02',
        exchange_rate: 1364.2,
      },
      line_items: [{ product_code: 'JKO-N620', quantity: 8800, unit_price_usd_wp: 0.116 }],
      raw_text: '목업 OCR 결과입니다. 실제 OCR 서버에 접근하지 않았습니다.',
    } as T);
  }

  if (url.pathname.startsWith('/api/v1/pos/') && url.pathname.endsWith('/lines')) {
    const poId = endpointId(url.pathname, 'pos');
    return clone(poLines.filter((line) => line.po_id === poId) as T);
  }
  if (url.pathname.startsWith('/api/v1/bls/') && url.pathname.endsWith('/lines')) {
    const blId = endpointId(url.pathname, 'bls');
    return clone(blLines.filter((line) => line.bl_id === blId) as T);
  }
  if (url.pathname.startsWith('/api/v1/lcs/') && url.pathname.endsWith('/lines')) {
    const lcId = endpointId(url.pathname, 'lcs');
    return clone(lcLines.filter((line) => line.lc_id === lcId) as T);
  }
  if (url.pathname.startsWith('/api/v1/construction-sites/') && url.pathname.endsWith('/allocations')) {
    const siteId = endpointId(url.pathname, 'construction-sites');
    const site = constructionSites.find((item) => item.site_id === siteId) ?? constructionSites[0];
    return clone({ site, allocations: allocations.filter((item) => item.site_id === siteId) } as T);
  }

  if (url.pathname.startsWith('/api/v1/inventory/allocations/')) {
    return collectionRoute<T>(url, body, allocations, 'alloc_id', 'inventory/allocations');
  }

  const routes: Record<string, { rows: MockRow[]; idKey: string; collection: string }> = {
    '/api/v1/companies': { rows: companies, idKey: 'company_id', collection: 'companies' },
    '/api/v1/manufacturers': { rows: manufacturers, idKey: 'manufacturer_id', collection: 'manufacturers' },
    '/api/v1/products': { rows: products, idKey: 'product_id', collection: 'products' },
    '/api/v1/partners': { rows: partners, idKey: 'partner_id', collection: 'partners' },
    '/api/v1/warehouses': { rows: warehouses, idKey: 'warehouse_id', collection: 'warehouses' },
    '/api/v1/banks': { rows: banks, idKey: 'bank_id', collection: 'banks' },
    '/api/v1/pos': { rows: purchaseOrders, idKey: 'po_id', collection: 'pos' },
    '/api/v1/lcs': { rows: lcs, idKey: 'lc_id', collection: 'lcs' },
    '/api/v1/tts': { rows: tts, idKey: 'tt_id', collection: 'tts' },
    '/api/v1/price-histories': { rows: priceHistories(), idKey: 'price_history_id', collection: 'price-histories' },
    '/api/v1/bls': { rows: bls, idKey: 'bl_id', collection: 'bls' },
    '/api/v1/inventory/allocations': { rows: allocations, idKey: 'alloc_id', collection: 'inventory/allocations' },
    '/api/v1/orders': { rows: orders, idKey: 'order_id', collection: 'orders' },
    '/api/v1/outbounds': { rows: outbounds.map((outbound) => ({ ...outbound, sale: sales.find((sale) => sale.outbound_id === outbound.outbound_id) })), idKey: 'outbound_id', collection: 'outbounds' },
    '/api/v1/sales': { rows: saleListItems, idKey: 'sale_id', collection: 'sales' },
    '/api/v1/receipts': { rows: receipts, idKey: 'receipt_id', collection: 'receipts' },
    '/api/v1/receipt-matches': { rows: receiptMatches, idKey: 'match_id', collection: 'receipt-matches' },
    '/api/v1/declarations': { rows: declarations, idKey: 'declaration_id', collection: 'declarations' },
    '/api/v1/cost-details': { rows: costDetails, idKey: 'cost_id', collection: 'cost-details' },
    '/api/v1/expenses': { rows: expenses, idKey: 'expense_id', collection: 'expenses' },
    '/api/v1/construction-sites': { rows: constructionSites, idKey: 'site_id', collection: 'construction-sites' },
    '/api/v1/limit-changes': { rows: limitChanges, idKey: 'limit_change_id', collection: 'limit-changes' },
    '/api/v1/notes': { rows: notes, idKey: 'note_id', collection: 'notes' },
    '/api/v1/module-demand-forecasts': { rows: moduleDemandForecasts(), idKey: 'forecast_id', collection: 'module-demand-forecasts' },
    '/api/v1/attachments': { rows: [], idKey: 'attachment_id', collection: 'attachments' },
  };

  const route = routes[url.pathname];
  if (route) return collectionRoute<T>(url, body, route.rows, route.idKey, route.collection);

  return clone([] as T);
}

export async function mockFetchBlobWithAuth(): Promise<Response> {
  const blob = new Blob(['SolarFlow dev mock mode: no live export was requested.'], { type: 'text/plain;charset=utf-8' });
  return new Response(blob, {
    status: 200,
    headers: { 'content-type': 'text/plain;charset=utf-8' },
  });
}

function priceHistories(): MockRow[] {
  return products.flatMap((product, productIndex) => ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'].map((date, index) => ({
    price_history_id: `ph-${product.product_id}-${index}`,
    product_id: product.product_id,
    product_name: product.product_name,
    spec_wp: product.spec_wp,
    manufacturer_id: product.manufacturer_id,
    manufacturer_name: product.manufacturer_name,
    manufacturers: { name_kr: product.manufacturer_name },
    change_date: date,
    previous_price: 410 - productIndex * 2 - index * 4,
    new_price: 406 - productIndex * 2 - index * 4,
    reason: '목업 단가 추이',
    related_po_id: purchaseOrders[productIndex % purchaseOrders.length]?.po_id,
  })));
}

function moduleDemandForecasts(): MockRow[] {
  return [
    { forecast_id: 'forecast-yeonggwang-05', company_id: 'company-topsolar', site_id: 'site-yeonggwang', site_name: '영광 갈동 태양광', demand_month: '2026-05', demand_type: 'construction', manufacturer_id: 'mfg-jko', spec_wp: 620, module_width_mm: 1134, module_height_mm: 2465, required_kw: 1800, status: 'confirmed', notes: '목업 공사 수요', created_at: nowIso, updated_at: nowIso },
    { forecast_id: 'forecast-dangjin-06', company_id: 'company-topsolar', site_id: 'site-dangjin', site_name: '당진 물류센터 지붕', demand_month: '2026-06', demand_type: 'construction', manufacturer_id: 'mfg-trn', spec_wp: 605, module_width_mm: 1134, module_height_mm: 2384, required_kw: 1452, status: 'planned', notes: '목업 공사 수요', created_at: nowIso, updated_at: nowIso },
  ];
}
