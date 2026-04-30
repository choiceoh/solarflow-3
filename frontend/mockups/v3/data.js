// SolarFlow 3.0 — mock data for solar module distribution
window.SF_DATA = (() => {
  const manufacturers = [
    { code: 'JKO', name: 'JinkoSolar', country: '🇨🇳' },
    { code: 'JAS', name: 'JA Solar', country: '🇨🇳' },
    { code: 'TRN', name: 'Trina Solar', country: '🇨🇳' },
    { code: 'LON', name: 'LONGi', country: '🇨🇳' },
    { code: 'HSE', name: 'Hyundai Energy', country: '🇰🇷' },
    { code: 'QCL', name: 'Q-Cells', country: '🇰🇷' },
  ];

  const products = [
    { code: 'JKM-580N-72HL4', mfg: 'JKO', wp: 580, dim: '2278×1134', tech: 'TOPCon', avail: 18420, phys: 22100, inc: 6800, alloc: 3680 },
    { code: 'JKM-575N-72HL4', mfg: 'JKO', wp: 575, dim: '2278×1134', tech: 'TOPCon', avail: 12080, phys: 14300, inc: 0, alloc: 2220 },
    { code: 'JAM72D40-580',   mfg: 'JAS', wp: 580, dim: '2278×1134', tech: 'TOPCon', avail: 9640,  phys: 11800, inc: 4200, alloc: 2160 },
    { code: 'JAM72D40-590',   mfg: 'JAS', wp: 590, dim: '2278×1134', tech: 'TOPCon', avail: 4220,  phys: 4220,  inc: 8800, alloc: 0 },
    { code: 'TSM-NEG21C.20',  mfg: 'TRN', wp: 605, dim: '2384×1134', tech: 'TOPCon', avail: 7820,  phys: 9100,  inc: 0,    alloc: 1280 },
    { code: 'TSM-DE21',       mfg: 'TRN', wp: 595, dim: '2278×1134', tech: 'TOPCon', avail: 0,     phys: 480,   inc: 12200, alloc: 480 },
    { code: 'LR5-72HTH-580M', mfg: 'LON', wp: 580, dim: '2278×1134', tech: 'HPBC',   avail: 14200, phys: 16000, inc: 3400, alloc: 1800 },
    { code: 'LR5-72HTH-585M', mfg: 'LON', wp: 585, dim: '2278×1134', tech: 'HPBC',   avail: 6320,  phys: 7100,  inc: 0,    alloc: 780 },
    { code: 'HiE-S480VG',     mfg: 'HSE', wp: 480, dim: '2094×1038', tech: 'PERC',   avail: 2040,  phys: 2040,  inc: 0,    alloc: 0 },
    { code: 'Q.PEAK-G11-455', mfg: 'QCL', wp: 455, dim: '2094×1038', tech: 'Q.ANTUM', avail: 1620, phys: 1980, inc: 0,    alloc: 360 },
  ];

  const allocations = [
    { id: 'A-2604-018', product: 'JKM-580N-72HL4', mfg: 'JKO', qty: 1200, kw: 696, customer: '동양솔라(주)', site: '나주 태양광 1단지', purpose: 'sale', status: 'pending', date: '04-26' },
    { id: 'A-2604-017', product: 'JAM72D40-580',   mfg: 'JAS', qty: 880,  kw: 510, customer: '경동나비엔', site: '예산 발전소', purpose: 'sale', status: 'pending', date: '04-26' },
    { id: 'A-2604-016', product: 'LR5-72HTH-580M', mfg: 'LON', qty: 1500, kw: 870, customer: 'SK에코플랜트', site: '의령 영농형', purpose: 'sale', status: 'pending', date: '04-25' },
    { id: 'A-2604-015', product: 'TSM-NEG21C.20',  mfg: 'TRN', qty: 640,  kw: 387, customer: '한화큐셀', site: '서산 7MW', purpose: 'sale', status: 'hold', date: '04-25' },
    { id: 'A-2604-014', product: 'JKM-580N-72HL4', mfg: 'JKO', qty: 480,  kw: 278, customer: '제이앤에너지', site: '진안 1.5MW', purpose: 'other', status: 'pending', date: '04-24' },
    { id: 'A-2604-013', product: 'TSM-DE21',       mfg: 'TRN', qty: 480,  kw: 285, customer: '대한그린파워', site: '광주 옥상', purpose: 'sale', status: 'hold', date: '04-23' },
    { id: 'A-2604-012', product: 'JKM-575N-72HL4', mfg: 'JKO', qty: 720,  kw: 414, customer: '동양솔라(주)', site: '함평 영농형 2호', purpose: 'sale', status: 'pending', date: '04-22' },
    { id: 'A-2604-011', product: 'LR5-72HTH-580M', mfg: 'LON', qty: 300,  kw: 174, customer: '에코그린에너지', site: '청양 발전소', purpose: 'sale', status: 'pending', date: '04-22' },
  ];

  // Recent inbound, LC, sales for command-center variant
  const incoming = [
    { vessel: 'COSCO SHANGHAI 042E', bl: 'COSU6128445A', eta: '05-08', mfg: 'JAS', qty: 8800, kw: 5192, status: 'in-transit' },
    { vessel: 'EVER GIVEN 218W',     bl: 'EVGN0218445B', eta: '05-12', mfg: 'TRN', qty: 12200, kw: 7259, status: 'loading' },
    { vessel: 'MSC GULSUN 401E',     bl: 'MEDU40118765', eta: '05-15', mfg: 'JKO', qty: 6800, kw: 3944, status: 'in-transit' },
    { vessel: 'HMM ALGECIRAS 12W',   bl: 'HMMU0012445C', eta: '05-21', mfg: 'LON', qty: 3400, kw: 1972, status: 'booked' },
  ];

  const lcOpen = [
    { no: 'LC-26-0418', bank: 'KEB하나', mfg: 'JinkoSolar', usd: 1280400, krw: 1773.4, maturity: '2026-07-18', daysLeft: 79, util: 92 },
    { no: 'LC-26-0411', bank: '신한', mfg: 'JA Solar', usd: 968200, krw: 1772.8, maturity: '2026-07-11', daysLeft: 72, util: 64 },
    { no: 'LC-26-0405', bank: 'KEB하나', mfg: 'Trina Solar', usd: 1842500, krw: 1775.2, maturity: '2026-08-04', daysLeft: 96, util: 100 },
    { no: 'LC-26-0322', bank: '우리', mfg: 'LONGi', usd: 612800, krw: 1768.4, maturity: '2026-06-22', daysLeft: 53, util: 45 },
  ];

  // KPI top strip
  const kpis = {
    totalAvail: { kw: 76420, ea: 134200, dPct: +2.4 },
    physical:   { kw: 89220, ea: 156400 },
    incoming:   { kw: 18367, ea: 31200 },
    allocPending:{ count: 28, kw: 14820 },
    allocHold:  { count: 6, kw: 1840 },
    lcOpen:     { count: 11, usd: 8.42 },  // M
    revMtd:     { krw: 4.28, dPct: +18.2 },  // 십억
    margin:     { pct: 11.4, dPct: -0.8 },
  };

  // 12-week price trend (KRW/Wp) by mfg
  const priceTrend = {
    JKO: [410, 408, 405, 402, 400, 398, 395, 392, 390, 388, 386, 384],
    JAS: [415, 414, 412, 410, 407, 404, 402, 400, 397, 394, 391, 388],
    TRN: [422, 420, 418, 416, 414, 411, 408, 406, 404, 402, 400, 398],
    LON: [418, 417, 415, 413, 411, 408, 406, 404, 402, 400, 398, 396],
  };

  // Activity log
  const activity = [
    { t: '14:42', user: 'park.jh', action: '예약 등록', target: 'A-2604-018', meta: '동양솔라 · 1,200ea' },
    { t: '14:21', user: 'kim.sm', action: 'L/C 개설',  target: 'LC-26-0421', meta: 'KEB하나 · USD 642K' },
    { t: '13:58', user: 'lee.dh', action: 'B/L 등록',  target: 'COSU6128445A', meta: 'JinkoSolar · 8,800ea' },
    { t: '13:30', user: 'park.jh', action: '수주 확정', target: 'SO-26-0418', meta: '한화큐셀 · 0.87 MW' },
    { t: '12:14', user: 'choi.h', action: '면장 입력', target: 'CD-26-0411', meta: 'Trina · KRW 3.27억' },
    { t: '11:42', user: 'system', action: '환율 갱신', target: 'USD/KRW', meta: '1,772.4 → 1,773.4' },
    { t: '10:58', user: 'kim.sm', action: '결재 상신', target: 'AP-26-0118', meta: '수입대금 결재' },
    { t: '10:12', user: 'park.jh', action: '배정 보류', target: 'A-2604-015', meta: 'TSM-NEG21C 640ea' },
  ];

  const alerts = [
    { sev: 'warn', msg: 'JAM72D40-590 가용재고 0 — 입고 대기 8,800ea', t: '5분 전' },
    { sev: 'warn', msg: 'LC-26-0405 한도 100% 도달', t: '24분 전' },
    { sev: 'info', msg: 'COSCO SHANGHAI 042E ETA 임박 (D-8)', t: '1시간 전' },
    { sev: 'neg',  msg: 'TRN 단가 5주 연속 하락 (-5.7%)', t: '오늘' },
  ];

  const fmt = {
    kw: (n) => n >= 1000 ? `${(n/1000).toFixed(2)} MW` : `${Math.round(n).toLocaleString()} kW`,
    ea: (n) => n.toLocaleString() + ' ea',
    krw: (n) => `₩${n.toLocaleString()}`,
    pct: (n) => (n>=0?'+':'') + n.toFixed(1) + '%',
  };

  return { manufacturers, products, allocations, incoming, lcOpen, kpis, priceTrend, activity, alerts, fmt };
})();
