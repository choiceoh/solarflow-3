// Shared data + icons + small components for SolarFlow variants
/* global React */

window.SF_DATA = {
  manufacturers: [
    { code: 'JKO', name: 'JinkoSolar', country: '🇨🇳' },
    { code: 'JAS', name: 'JA Solar', country: '🇨🇳' },
    { code: 'TRN', name: 'Trina Solar', country: '🇨🇳' },
    { code: 'LON', name: 'LONGi', country: '🇨🇳' },
    { code: 'CSI', name: 'Canadian Solar', country: '🇨🇳' },
    { code: 'HNW', name: 'Hanwha Q.Cells', country: '🇰🇷' },
    { code: 'HYD', name: 'Hyundai Energy', country: '🇰🇷' },
  ],
  // avail/phys/inc/alloc are EA counts; wp = watt per module
  products: [
    { code: 'JKO-N620', mfg: 'JKO', wp: 620, dim: '2465×1134', tech: 'N-type TOPCon', avail: 24800, phys: 28200, inc: 8800, alloc: 3400 },
    { code: 'JKO-N580', mfg: 'JKO', wp: 580, dim: '2278×1134', tech: 'N-type TOPCon', avail: 18400, phys: 21000, inc: 0, alloc: 2600 },
    { code: 'JAS-DH580', mfg: 'JAS', wp: 580, dim: '2278×1134', tech: 'PERC bifacial', avail: 16200, phys: 17100, inc: 4400, alloc: 900 },
    { code: 'JAS-N610', mfg: 'JAS', wp: 610, dim: '2382×1134', tech: 'N-type', avail: 9800, phys: 12200, inc: 0, alloc: 2400 },
    { code: 'TRN-V605', mfg: 'TRN', wp: 605, dim: '2384×1134', tech: 'Vertex N', avail: 12400, phys: 14800, inc: 5200, alloc: 2400 },
    { code: 'TRN-V550', mfg: 'TRN', wp: 550, dim: '2278×1134', tech: 'Vertex S', avail: 0, phys: 1800, inc: 0, alloc: 1800 },
    { code: 'LON-X600', mfg: 'LON', wp: 600, dim: '2382×1134', tech: 'Hi-MO 7', avail: 22600, phys: 23800, inc: 0, alloc: 1200 },
    { code: 'LON-X575', mfg: 'LON', wp: 575, dim: '2278×1134', tech: 'Hi-MO 6', avail: 1800, phys: 4200, inc: 0, alloc: 2400 },
    { code: 'CSI-T715', mfg: 'CSI', wp: 715, dim: '2384×1303', tech: 'TOPHiKu', avail: 6200, phys: 8200, inc: 0, alloc: 2000 },
    { code: 'HNW-Q425', mfg: 'HNW', wp: 425, dim: '1879×1045', tech: 'Q.PEAK DUO', avail: 2000, phys: 4900, inc: 0, alloc: 2900 },
  ],
  priceTrend: {
    JKO: [410, 408, 405, 402, 400, 398, 395, 392, 390, 388, 386, 384],
    JAS: [415, 414, 412, 408, 405, 402, 400, 398, 394, 392, 390, 388],
    TRN: [422, 420, 418, 416, 414, 410, 408, 404, 402, 400, 399, 398],
    LON: [418, 416, 414, 412, 408, 406, 404, 402, 400, 398, 397, 396],
  },
  alerts: [
    { sev: 'neg', msg: 'TRN-V550 가용 0kW · 미착품 없음 · 4월 28일 출고예정 2건 충당 불가', t: '5분 전' },
    { sev: 'warn', msg: 'LC-26-0405 만기 D-3 · USD 1.84M · 결재 대기 중', t: '14분 전' },
    { sev: 'warn', msg: 'JKO 단가 12주 -6.3% · 평균단가 재계산 권장', t: '32분 전' },
    { sev: 'info', msg: 'COSCO SHANGHAI 042E 입항 임박 · 인천항 D-1 · 8,800ea', t: '1시간 전' },
  ],
  activity: [
    { t: '14:38', action: '예약 등록', target: 'RSV-2604-018', meta: '솔라넷(주) · LON-X600 1,800ea · 박지훈' },
    { t: '14:31', action: '면장 도착', target: 'IL-25-1204-04', meta: 'JKO-N620 8,800ea · 인천세관' },
    { t: '14:17', action: 'L/C 개설', target: 'LC-26-0412', meta: 'JinkoSolar · USD 2.42M · 김현우' },
    { t: '14:02', action: '예약 확정', target: 'RSV-2604-014', meta: '한빛에너지 · JAS-DH580 2,200ea' },
    { t: '13:48', action: '단가 갱신', target: 'TRN', meta: '12개 품목 · 평균 -1.2%' },
    { t: '13:30', action: '입고 완료', target: 'BL-26-0341', meta: 'COSCO 041E · LON-X600 6,400ea' },
    { t: '13:14', action: '예약 보류', target: 'RSV-2604-009', meta: '동방솔라 · 신용한도 검토 필요' },
  ],
  incoming: [
    { mfg: 'JinkoSolar', bl: 'BL-26-0412', eta: 'D-1', qty: 8800, kw: 5456 },
    { mfg: 'Trina Solar', bl: 'BL-26-0408', eta: 'D-3', qty: 5200, kw: 3146 },
    { mfg: 'JA Solar', bl: 'BL-26-0405', eta: 'D-7', qty: 4400, kw: 2552 },
    { mfg: 'JinkoSolar', bl: 'BL-26-0419', eta: 'D-12', qty: 12200, kw: 7564 },
  ],
  allocations: [
    { id: 'RSV-2604-018', customer: '솔라넷(주)', product: 'LON-X600', qty: 1800, kw: 1080, status: 'pending', date: '04-26' },
    { id: 'RSV-2604-017', customer: '한빛에너지', product: 'JAS-DH580', qty: 2200, kw: 1276, status: 'pending', date: '04-26' },
    { id: 'RSV-2604-014', customer: '동방솔라', product: 'JKO-N620', qty: 1400, kw: 868, status: 'hold', date: '04-26' },
    { id: 'RSV-2604-012', customer: '에이펙스EPC', product: 'TRN-V605', qty: 2400, kw: 1452, status: 'pending', date: '04-25' },
    { id: 'RSV-2604-009', customer: '그린파워', product: 'JKO-N580', qty: 1600, kw: 928, status: 'hold', date: '04-25' },
    { id: 'RSV-2604-006', customer: '솔라코리아', product: 'CSI-T715', qty: 800, kw: 572, status: 'pending', date: '04-25' },
  ],
};

// Inline icons (12-16px, 1.5 stroke)
const mkIcon = (paths) => ({ size = 14, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {paths}
  </svg>
);

window.I = {
  Search: mkIcon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  Bell: mkIcon(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></>),
  Plus: mkIcon(<><path d="M12 5v14M5 12h14" /></>),
  Filter: mkIcon(<><path d="M3 5h18l-7 9v6l-4-2v-4z" /></>),
  Caret: mkIcon(<><path d="m6 9 6 6 6-6" /></>),
  Mail: mkIcon(<><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="m3 7 9 6 9-6" /></>),
  Lock: mkIcon(<><rect x="4" y="11" width="16" height="10" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  Box: mkIcon(<><path d="M3 7 12 3l9 4v10l-9 4-9-4z" /><path d="m3 7 9 4 9-4M12 11v10" /></>),
  Cart: mkIcon(<><path d="M3 4h2l2 12h12l2-8H6" /><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /></>),
  Bank: mkIcon(<><path d="M3 9 12 4l9 5v2H3z" /><path d="M5 11v7M9 11v7M15 11v7M19 11v7M3 20h18" /></>),
  Truck: mkIcon(<><rect x="2" y="7" width="11" height="9" /><path d="M13 10h5l3 3v3h-8z" /><circle cx="6" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /></>),
  Doc: mkIcon(<><path d="M5 3h9l5 5v13H5z" /><path d="M14 3v5h5M8 13h8M8 17h6" /></>),
  Wallet: mkIcon(<><rect x="3" y="6" width="18" height="13" rx="1.5" /><path d="M16 12h5M3 9h14V5H3" /></>),
  Chart: mkIcon(<><path d="M3 3v18h18" /><path d="m7 14 3-3 4 4 5-7" /></>),
  Db: mkIcon(<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>),
  Cog: mkIcon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M22 12h-3M5 12H2M19 5l-2 2M7 17l-2 2M19 19l-2-2M7 7 5 5" /></>),
  Eye: mkIcon(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  Download: mkIcon(<><path d="M12 4v12m0 0-5-5m5 5 5-5M4 20h16" /></>),
};

// Logo variants
window.Logo = {
  A: ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="3" fill="#F5B800" />
      <path d="M6 7h12M6 12h12M6 17h12" stroke="#1a1612" strokeWidth="1.5" />
      <circle cx="9" cy="7" r="1.5" fill="#1a1612" />
      <circle cx="15" cy="12" r="1.5" fill="#1a1612" />
      <circle cx="11" cy="17" r="1.5" fill="#1a1612" />
    </svg>
  ),
  B: ({ size = 24 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="15" fill="#1a1612" />
      <circle cx="16" cy="16" r="6" fill="#F5B800" />
      <g stroke="#F5B800" strokeWidth="1.5" strokeLinecap="round">
        <path d="M16 4v3M16 25v3M28 16h-3M7 16H4M24 8l-2 2M10 22l-2 2M24 24l-2-2M10 10 8 8" />
      </g>
    </svg>
  ),
  C: ({ size = 22 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M2 18 12 4l10 14H2z" fill="#F5B800" />
      <path d="M7 18 12 11l5 7" fill="#1a1612" />
      <circle cx="12" cy="20" r="1.5" fill="#1a1612" />
    </svg>
  ),
};

// Sparkline
window.Sparkline = function Sparkline({ data, w = 80, h = 24, color = '#F5B800', area = false }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * (w - 2) + 1,
    h - 1 - ((v - min) / range) * (h - 3),
  ]);
  const line = pts.map(p => `${p[0]},${p[1]}`).join(' ');
  const fill = area ? `M ${pts[0][0]},${h} L ${line.replace(/,/g, ' ').split(' ').reduce((acc, _, i, arr) => i % 2 === 0 ? acc + ` L ${arr[i]},${arr[i+1]}` : acc, '')} L ${pts[pts.length-1][0]},${h} Z` : '';
  return (
    <svg width={w} height={h} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      {area && <polyline points={`1,${h} ${line} ${w-1},${h}`} fill={color} fillOpacity={0.13} stroke="none" />}
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
};

window.Bars = function Bars({ data, w = 80, h = 24, color = '#F5B800' }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const bw = (w - data.length) / data.length;
  return (
    <svg width={w} height={h} style={{ display: 'inline-block' }}>
      {data.map((v, i) => {
        const bh = (v / max) * (h - 2);
        return <rect key={i} x={i * (bw + 1)} y={h - bh} width={bw} height={bh} fill={color} />;
      })}
    </svg>
  );
};
