// SolarFlow 3.0 — 통합 엔티티 (Single Source of Truth)
// 모든 화면이 이 데이터를 derive해서 KPI/합계/에이징을 계산함.
// 거래처·은행·L/C·B/L·P/O·SO·OB·AR이 외래키로 연결되어 있음.

(() => {
  const today = new Date('2026-04-26');

  // 1) 거래처 마스터
  const customers = [
    { code: 'C001', name: '한화큐셀',         tier: 'A', credit: 800000000, contact: '서울 영등포', officer: '김민호 부장', terms: 'NET 30' },
    { code: 'C002', name: '동양솔라(주)',     tier: 'A', credit: 500000000, contact: '광주 서구',   officer: '박정현 차장', terms: 'NET 30' },
    { code: 'C003', name: 'SK에코플랜트',     tier: 'A', credit: 700000000, contact: '서울 종로',   officer: '이수민 차장', terms: 'NET 45' },
    { code: 'C004', name: '경동나비엔',       tier: 'B', credit: 300000000, contact: '서울 강남',   officer: '정상혁 과장', terms: 'NET 30' },
    { code: 'C005', name: '제이앤에너지',     tier: 'B', credit: 200000000, contact: '대전 유성',   officer: '한지영 과장', terms: 'NET 30' },
    { code: 'C006', name: '대한그린파워',     tier: 'B', credit: 200000000, contact: '광주 광산',   officer: '서재호 과장', terms: 'NET 30' },
    { code: 'C007', name: '에코그린에너지',   tier: 'B', credit: 200000000, contact: '청주 흥덕',   officer: '문현경 대리', terms: 'NET 45' },
    { code: 'C008', name: '서울SI',           tier: 'C', credit: 150000000, contact: '서울 마포',   officer: '강태준 대리', terms: 'NET 30' },
  ];
  const custBy = Object.fromEntries(customers.map(c => [c.code, c]));

  // 2) 은행 한도 마스터 (M$ 단위)
  const banks = [
    { code: 'B01', bank: 'KEB하나은행',  total: 7.5, lcs: 6, contact: '강남지점',   officer: '김영민 차장', rate: 4.8, type: 'main',    contract: '2026-12-31' },
    { code: 'B02', bank: '신한은행',      total: 4.5, lcs: 3, contact: '여의도지점', officer: '이수진 과장', rate: 4.6, type: 'sub',     contract: '2026-09-30' },
    { code: 'B03', bank: '우리은행',      total: 2.0, lcs: 2, contact: '강서지점',   officer: '박정호 차장', rate: 4.9, type: 'sub',     contract: '2026-06-30' },
    { code: 'B04', bank: 'KB국민은행',    total: 1.0, lcs: 0, contact: '본점',        officer: '—',          rate: 5.0, type: 'standby', contract: '2027-03-31' },
  ];
  const bankBy = Object.fromEntries(banks.map(b => [b.code, b]));

  // 3) L/C — 진행중인 신용장
  // util은 PO/BL 진행에 따라 계산. usd = M$
  const lcs = [
    { no: 'LC-26-0405', bank: 'B01', mfg: 'TRN', usd: 1.84, krw: 1775.2, opened: '2026-03-04', maturity: '2026-04-29', util: 100, status: 'shipping' },
    { no: 'LC-26-0411', bank: 'B02', mfg: 'JAS', usd: 0.97, krw: 1772.8, opened: '2026-03-11', maturity: '2026-05-08', util: 64,  status: 'shipping' },
    { no: 'LC-26-0412', bank: 'B01', mfg: 'JKO', usd: 1.28, krw: 1773.4, opened: '2026-03-12', maturity: '2026-05-03', util: 92,  status: 'shipping' },
    { no: 'LC-26-0418', bank: 'B01', mfg: 'JKO', usd: 1.28, krw: 1773.4, opened: '2026-03-18', maturity: '2026-07-18', util: 88,  status: 'open' },
    { no: 'LC-26-0388', bank: 'B03', mfg: 'LON', usd: 0.61, krw: 1768.4, opened: '2026-02-22', maturity: '2026-06-22', util: 45,  status: 'shipping' },
    { no: 'LC-26-0398', bank: 'B02', mfg: 'JAS', usd: 0.62, krw: 1770.1, opened: '2026-03-01', maturity: '2026-05-12', util: 78,  status: 'shipping' },
    { no: 'LC-26-0420', bank: 'B01', mfg: 'JKO', usd: 0.55, krw: 1773.4, opened: '2026-04-05', maturity: '2026-08-04', util: 22,  status: 'open' },
    { no: 'LC-26-0421', bank: 'B02', mfg: 'LON', usd: 0.59, krw: 1772.8, opened: '2026-04-12', maturity: '2026-08-12', util: 18,  status: 'open' },
    { no: 'LC-26-0419', bank: 'B03', mfg: 'TRN', usd: 0.68, krw: 1770.1, opened: '2026-04-08', maturity: '2026-08-08', util: 30,  status: 'open' },
    { no: 'LC-26-0422', bank: 'B01', mfg: 'JAS', usd: 0.42, krw: 1773.4, opened: '2026-04-18', maturity: '2026-08-18', util: 0,   status: 'open' },
    { no: 'LC-26-0423', bank: 'B02', mfg: 'JKO', usd: 0.18, krw: 1772.8, opened: '2026-04-22', maturity: '2026-08-22', util: 0,   status: 'open' },
  ];

  // 4) B/L — 입항 진행
  const bls = [
    { id: 'BL-26-0412', vessel: 'COSCO SHANGHAI 042E', mfg: 'JKO', sku: 'JKO-N620',   qty: 8800,  kw: 5456, eta: '2026-04-27', stage: 'inbound',  port: '인천', lc: 'LC-26-0412' },
    { id: 'BL-26-0408', vessel: 'EVER GIVEN 218W',     mfg: 'TRN', sku: 'TRN-V605',   qty: 5200,  kw: 3146, eta: '2026-04-29', stage: 'transit',  port: '인천', lc: 'LC-26-0405' },
    { id: 'BL-26-0405', vessel: 'MSC GULSUN 401E',     mfg: 'JAS', sku: 'JAS-DH580',  qty: 4400,  kw: 2552, eta: '2026-05-03', stage: 'transit',  port: '인천', lc: 'LC-26-0411' },
    { id: 'BL-26-0419', vessel: 'HMM ALGECIRAS 12W',   mfg: 'JKO', sku: 'JKO-N580',   qty: 12200, kw: 7076, eta: '2026-05-08', stage: 'loading',  port: '평택', lc: 'LC-26-0418' },
    { id: 'BL-26-0341', vessel: 'COSCO YANTIAN 041E',  mfg: 'LON', sku: 'LON-X600',   qty: 6400,  kw: 3840, eta: '2026-04-25', stage: 'cleared',  port: '인천', lc: 'LC-26-0388' },
  ];

  // 5) P/O — 발주
  // 단가 USD/Wp · USD = qty * wp * unit
  const wpBy = { 'JKO-N620': 620, 'JKO-N580': 580, 'JAS-DH580': 580, 'JAS-N610': 610, 'TRN-V605': 605, 'TRN-V550': 550, 'LON-X600': 600, 'LON-X575': 575, 'CSI-T715': 715, 'HNW-Q425': 425 };
  const pos = [
    { id: 'PO-26-0418', mfg: 'JKO', sku: 'JKO-N580',  qty: 2200,  unit: 0.205, etd: '2026-05-04', eta: '2026-05-21', stage: 'lc-pending',  lc: '',           bl: '' },
    { id: 'PO-26-0417', mfg: 'JAS', sku: 'JAS-DH580', qty: 4400,  unit: 0.198, etd: '2026-04-22', eta: '2026-05-12', stage: 'lc-opened',   lc: 'LC-26-0411', bl: 'BL-26-0405' },
    { id: 'PO-26-0416', mfg: 'JKO', sku: 'JKO-N620',  qty: 8800,  unit: 0.221, etd: '2026-04-12', eta: '2026-04-27', stage: 'in-transit',  lc: 'LC-26-0412', bl: 'BL-26-0412' },
    { id: 'PO-26-0415', mfg: 'TRN', sku: 'TRN-V605',  qty: 5200,  unit: 0.211, etd: '2026-04-14', eta: '2026-04-29', stage: 'in-transit',  lc: 'LC-26-0405', bl: 'BL-26-0408' },
    { id: 'PO-26-0414', mfg: 'LON', sku: 'LON-X600',  qty: 6400,  unit: 0.193, etd: '2026-04-08', eta: '2026-04-25', stage: 'cleared',     lc: 'LC-26-0388', bl: 'BL-26-0341' },
    { id: 'PO-26-0413', mfg: 'JKO', sku: 'JKO-N580',  qty: 12200, unit: 0.201, etd: '2026-04-22', eta: '2026-05-08', stage: 'lc-opened',   lc: 'LC-26-0418', bl: 'BL-26-0419' },
    { id: 'PO-26-0412', mfg: 'JAS', sku: 'JAS-N610',  qty: 1800,  unit: 0.218, etd: '2026-05-08', eta: '2026-05-26', stage: 'draft',       lc: '',           bl: '' },
    { id: 'PO-26-0411', mfg: 'CSI', sku: 'CSI-T715',  qty: 2400,  unit: 0.243, etd: '2026-05-12', eta: '2026-06-02', stage: 'draft',       lc: '',           bl: '' },
  ];

  // 6) SO — 수주
  // KRW/Wp 평균 단가
  const sos = [
    { id: 'SO-26-0418', cust: 'C001', site: '서산 7MW',     sku: 'JKO-N580',  qty: 1500, unit: 412, dlvr: '2026-04-28', stage: 'shipping',  margin: 12.7 },
    { id: 'SO-26-0417', cust: 'C002', site: '나주 1단지',   sku: 'JKO-N580',  qty: 1200, unit: 408, dlvr: '2026-04-28', stage: 'ready',     margin: 12.4 },
    { id: 'SO-26-0416', cust: 'C003', site: '의령 영농형',  sku: 'LON-X600',  qty: 1500, unit: 405, dlvr: '2026-04-29', stage: 'shipping',  margin: 11.9 },
    { id: 'SO-26-0415', cust: 'C004', site: '예산 발전소',  sku: 'JAS-DH580', qty: 880,  unit: 398, dlvr: '2026-04-30', stage: 'planned',   margin: 9.5 },
    { id: 'SO-26-0414', cust: 'C005', site: '진안 1.5MW',  sku: 'JKO-N580',  qty: 480,  unit: 416, dlvr: '2026-05-02', stage: 'planned',   margin: 10.9 },
    { id: 'SO-26-0413', cust: 'C007', site: '청양 발전소',  sku: 'LON-X600',  qty: 300,  unit: 410, dlvr: '2026-05-04', stage: 'pending',   margin: 10.8 },
    { id: 'SO-26-0412', cust: 'C006', site: '광주 옥상',    sku: 'TRN-V605',  qty: 980,  unit: 392, dlvr: '2026-05-06', stage: 'planned',   margin: 8.3 },
    { id: 'SO-26-0411', cust: 'C008', site: '마포 SI',     sku: 'JAS-DH580', qty: 580,  unit: 404, dlvr: '2026-05-10', stage: 'pending',   margin: 10.1 },
  ];

  // 7) OB — 출고
  // 차량/창고/출고일 정보
  const obs = sos.filter(s => ['shipping','ready','planned'].includes(s.stage)).map(s => {
    const truckMap = {
      'SO-26-0418': '12 가 1284', 'SO-26-0417': '14 사 5519', 'SO-26-0416': '24 라 0182',
      'SO-26-0415': '07 마 9930', 'SO-26-0414': '32 거 7741', 'SO-26-0412': '—',
    };
    const stageMap = { shipping: 'enroute', ready: 'ready', planned: 'planned' };
    return {
      id: 'OB-' + s.id.slice(3), so: s.id, cust: s.cust, site: s.site,
      sku: s.sku, qty: s.qty, kw: Math.round(s.qty * (wpBy[s.sku] || 580) / 1000),
      truck: truckMap[s.id] || '—', dlvr: s.dlvr,
      stage: stageMap[s.stage] || 'planned',
    };
  });

  // 8) AR — 매출채권 (출고 완료 → 인보이스 발행)
  // 매월 8일 만기 가정. 일부는 연체/부분입금.
  const ars = [
    { id: 'AR-26-0312', cust: 'C001', inv: 'IV-26-0418', amt: 358200000, due: '2026-04-30', status: 'normal',  pay: 0 },
    { id: 'AR-26-0309', cust: 'C002', inv: 'IV-26-0412', amt: 286400000, due: '2026-04-28', status: 'normal',  pay: 0 },
    { id: 'AR-26-0305', cust: 'C003', inv: 'IV-26-0408', amt: 412800000, due: '2026-05-02', status: 'normal',  pay: 0 },
    { id: 'AR-26-0298', cust: 'C004', inv: 'IV-26-0402', amt: 198600000, due: '2026-04-22', status: 'overdue', pay: 0 },
    { id: 'AR-26-0294', cust: 'C005', inv: 'IV-26-0398', amt: 124200000, due: '2026-04-18', status: 'overdue', pay: 0 },
    { id: 'AR-26-0288', cust: 'C006', inv: 'IV-26-0394', amt: 96400000,  due: '2026-04-12', status: 'overdue', pay: 0 },
    { id: 'AR-26-0282', cust: 'C007', inv: 'IV-26-0388', amt: 184000000, due: '2026-05-08', status: 'partial', pay: 60000000 },
    { id: 'AR-26-0276', cust: 'C008', inv: 'IV-26-0382', amt: 142800000, due: '2026-05-12', status: 'normal',  pay: 0 },
  ];

  // 9) 창고
  const warehouses = [
    { code: 'W01', name: '인천 1창고', cap: 30, used: 24.10 },
    { code: 'W02', name: '인천 2창고', cap: 30, used: 18.62 },
    { code: 'W03', name: '평택창고',   cap: 27, used: 11.04 },
    { code: 'W04', name: '부산창고',   cap: 22, used: 4.82 },
  ];

  // 10) 월별 매출/매입 (억 단위) — 매출분석 화면의 차트
  const monthly = [
    { m: '2026-01', rev: 38.2, cogs: 29.4 },
    { m: '2026-02', rev: 41.8, cogs: 31.6 },
    { m: '2026-03', rev: 47.4, cogs: 34.8 },
    { m: '2026-04', rev: 42.8, cogs: 37.9 },  // MTD
  ];
  const target202604 = 50.0;

  // ─── Derived helpers ─────────────────────────────────────
  const D = window.SF_DATA;

  // 일자 차이
  const daysFrom = (yyyymmdd) => {
    const d = new Date(yyyymmdd);
    return Math.round((d - today) / 86400000);
  };

  // L/C 사용 합계 (M$)
  const lcUsedTotal = lcs.filter(l => l.status !== 'closed').reduce((s, l) => s + l.usd * (l.util / 100), 0);
  const lcTotalLimit = banks.reduce((s, b) => s + b.total, 0);
  // 은행별 사용량 (M$) — LC.bank로 group + util%
  const bankUsage = banks.map(b => {
    const used = lcs.filter(l => l.bank === b.code && l.status !== 'closed').reduce((s, l) => s + l.usd * (l.util / 100), 0);
    const lcs_n = lcs.filter(l => l.bank === b.code && l.status !== 'closed').length;
    return { ...b, used, lcs: lcs_n };
  });

  // AR 합계 / 에이징
  const arTotal = ars.reduce((s, a) => s + (a.amt - (a.pay || 0)), 0);
  const arOverdue = ars.filter(a => a.status === 'overdue').reduce((s, a) => s + a.amt, 0);
  const arAging = (() => {
    const buckets = [{ l: '0–30일', v: 0 }, { l: '31–60일', v: 0 }, { l: '61–90일', v: 0 }, { l: '90+일', v: 0 }];
    ars.forEach(a => {
      const d = daysFrom(a.due);
      // d > 0 = 미만기 (0–30 bucket), d < 0 = 연체일수
      const overdueDays = Math.max(0, -d);
      const idx = overdueDays <= 30 ? 0 : overdueDays <= 60 ? 1 : overdueDays <= 90 ? 2 : 3;
      buckets[idx].v += (a.amt - (a.pay || 0));
    });
    return buckets;
  })();

  // 가용재고 합계 (kW)
  const availTotalKw = D.products.reduce((s, p) => s + p.avail * p.wp / 1000, 0);
  const availTotalEa = D.products.reduce((s, p) => s + p.avail, 0);
  const physTotalKw  = D.products.reduce((s, p) => s + p.phys * p.wp / 1000, 0);
  const incTotalKw   = D.products.reduce((s, p) => s + p.inc * p.wp / 1000, 0);

  // 사이드바 카운트
  const counts = {
    inv: D.products.length,
    po: pos.filter(p => p.stage !== 'cleared').length,
    lc: lcs.filter(l => l.status !== 'closed').length,
    bl: bls.filter(b => b.stage !== 'cleared').length,
    so: sos.filter(s => !['shipping','cleared'].includes(s.stage) && s.stage !== 'closed').length,
    ob: obs.length,
    ar: ars.length,
  };

  // 거래처별 매출 집계 (MTD)
  const revByCustomer = customers.map(c => {
    const own = sos.filter(s => s.cust === c.code);
    const rev = own.reduce((s, o) => s + o.qty * (wpBy[o.sku] || 580) * o.unit / 100000000, 0); // 억
    const qty = own.reduce((s, o) => s + o.qty, 0);
    const gp = own.length > 0 ? own.reduce((s, o) => s + o.margin, 0) / own.length : 0;
    return { code: c.code, name: c.name, n: own.length, qty, rev, gp };
  }).filter(r => r.n > 0).sort((a, b) => b.rev - a.rev);

  // 제조사별 가용재고
  const availByMfg = D.manufacturers.map(m => {
    const own = D.products.filter(p => p.mfg === m.code);
    const ea = own.reduce((s, p) => s + p.avail, 0);
    const kw = own.reduce((s, p) => s + p.avail * p.wp / 1000, 0);
    return { code: m.code, name: m.name, ea, kw, mw: kw / 1000 };
  }).filter(r => r.ea > 0).sort((a, b) => b.kw - a.kw);

  // 제조사별 판매 비중 (MTD)
  const revByMfg = D.manufacturers.map(m => {
    const skus = D.products.filter(p => p.mfg === m.code).map(p => p.code);
    const own = sos.filter(s => skus.includes(s.sku));
    const rev = own.reduce((s, o) => s + o.qty * (wpBy[o.sku] || 580) * o.unit / 100000000, 0);
    const gp = own.length > 0 ? own.reduce((s, o) => s + o.margin, 0) / own.length : 0;
    return { code: m.code, name: m.name, rev, gp };
  }).filter(r => r.rev > 0).sort((a, b) => b.rev - a.rev);

  const totalRevMtd = monthly[monthly.length - 1].rev;
  const totalCogsMtd = monthly[monthly.length - 1].cogs;
  const grossProfit = totalRevMtd - totalCogsMtd;
  const grossMargin = (grossProfit / totalRevMtd) * 100;

  // KPI 종합
  const kpis2 = {
    avail: { kw: availTotalKw, ea: availTotalEa, mw: availTotalKw / 1000 },
    rev: { mtd: totalRevMtd, target: target202604, achievement: (totalRevMtd / target202604) * 100 },
    lc: { used: lcUsedTotal, total: lcTotalLimit, pct: (lcUsedTotal / lcTotalLimit) * 100, count: counts.lc },
    ar: { total: arTotal, overdue: arOverdue, count: ars.length, overdueCnt: ars.filter(a => a.status === 'overdue').length },
    margin: { gp: grossProfit, pct: grossMargin },
  };

  // 이번주 출고 합계
  const thisWeekOb = obs.filter(o => {
    const d = daysFrom(o.dlvr);
    return d >= 0 && d <= 6;
  });

  // 통합 export
  Object.assign(D, {
    today,
    customers, custBy,
    banks, bankBy,
    lcs, bls, pos, sos, obs, ars,
    warehouses, monthly, wpBy,
    counts, kpis2,
    bankUsage, arAging, availByMfg, revByMfg, revByCustomer,
    thisWeekOb,
    target202604,
    daysFrom,
  });
})();
