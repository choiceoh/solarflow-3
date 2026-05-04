import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowUpRight, Sun } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import LoginForm from '@/components/auth/LoginForm';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { isDevMockLoginAllowed } from '@/lib/devMockMode';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface LoginStats {
  inventory_available_mw: number | null;
  reservations_pending: number | null;
  lc_active_count: number | null;
  lc_active_total_usd: number | null;
  work_queue: { time: string; tag: string; title: string; meta: string }[];
}

interface FXSnapshot {
  rate: number;
  change_pct: number | null;
  source: string;
  fetched_at: string;
}

interface MetalSnapshot {
  price_usd: number;
  change_usd: number | null;
  symbol: string;
  source: string;
  fetched_at: string;
}

interface CommoditySnapshot {
  value: number;
  change: number;
  unit: string;
  source: string;
  fetched_at: string;
}

const FALLBACK_KPI = {
  inventory_available_mw: 76.42,
  reservations_pending: 28,
  lc_active_count: 11,
  lc_active_total_usd: 8_420_000,
};
const FALLBACK_FX = { rate: 1773.4, change_pct: 0.06 };
const FALLBACK_SILVER = { price_usd: 28.84, change_usd: -1.42 };
const FALLBACK_POLYSILICON = { value: 34.20, change: 0.40 };
const FALLBACK_SCFI = { value: 1284, change: -2.10 };
const FALLBACK_QUEUE: LoginStats['work_queue'] = [
  { time: '09:00', tag: '입항', title: 'COSCO SHANGHAI 042E', meta: '8,800장 · 5,456 kW · 인천 1창고' },
  { time: '11:30', tag: 'L/C 만기', title: 'LC-26-0405', meta: 'USD 1.84M · 하나은행 · 결재 대기' },
  { time: '14:00', tag: '결재', title: '수입대금 결재', meta: '6건 · USD 4.12M · 박지훈 결재' },
  { time: '16:00', tag: '면장', title: '인천세관', meta: '5건 도착 · IL-25-1204-04 외 4건' },
];
const FAMILY_SITES = [
  { label: '탑솔라 업무포털', value: 'module', href: 'https://module.topworks.ltd' },
  { label: '바로 업무포털', value: 'baro', href: 'https://baro.topworks.ltd' },
] as const;

const fmt = new Intl.NumberFormat('en-US');
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const todayKST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const canUseDevMock = isDevMockLoginAllowed();

  const [stats, setStats] = useState<LoginStats | null>(null);
  const [fx, setFx] = useState<FXSnapshot | null>(null);
  const [silver, setSilver] = useState<MetalSnapshot | null>(null);
  const [poly, setPoly] = useState<CommoditySnapshot | null>(null);
  const [scfi, setScfi] = useState<CommoditySnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/v1/public/login-stats`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: LoginStats) => { if (!cancelled) setStats(d); })
      .catch((e) => console.warn('[LoginPage] stats fetch failed:', e));
    fetch(`${API_BASE_URL}/api/v1/public/fx/usdkrw`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: FXSnapshot) => { if (!cancelled) setFx(d); })
      .catch((e) => console.warn('[LoginPage] fx fetch failed:', e));
    fetch(`${API_BASE_URL}/api/v1/public/metals/silver`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MetalSnapshot) => { if (!cancelled) setSilver(d); })
      .catch((e) => console.warn('[LoginPage] silver fetch failed:', e));
    fetch(`${API_BASE_URL}/api/v1/public/polysilicon`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: CommoditySnapshot) => { if (!cancelled) setPoly(d); })
      .catch((e) => console.warn('[LoginPage] polysilicon fetch failed:', e));
    fetch(`${API_BASE_URL}/api/v1/public/scfi`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: CommoditySnapshot) => { if (!cancelled) setScfi(d); })
      .catch((e) => console.warn('[LoginPage] scfi fetch failed:', e));
    return () => { cancelled = true; };
  }, []);

  if (isLoading && !canUseDevMock) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3" style={{ background: 'var(--sf-bg)' }}>
        <span className="sf-solar-mark" aria-hidden>
          <Sun strokeWidth={2.4} />
        </span>
        <LoadingSpinner />
        <p className="sf-mono text-[11px]" style={{ color: 'var(--sf-ink-3)' }}>SolarFlow 시작 중…</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const inventoryMW = stats?.inventory_available_mw ?? FALLBACK_KPI.inventory_available_mw;
  const reservations = stats?.reservations_pending ?? FALLBACK_KPI.reservations_pending;
  const lcCount = stats?.lc_active_count ?? FALLBACK_KPI.lc_active_count;
  const lcTotalUSD = stats?.lc_active_total_usd ?? FALLBACK_KPI.lc_active_total_usd;
  const fxRate = fx?.rate ?? FALLBACK_FX.rate;
  const fxChange = fx?.change_pct ?? FALLBACK_FX.change_pct;
  const silverPrice = silver?.price_usd ?? FALLBACK_SILVER.price_usd;
  const silverChange = silver?.change_usd ?? FALLBACK_SILVER.change_usd;
  const polyValue = poly?.value ?? FALLBACK_POLYSILICON.value;
  const polyChange = poly?.change ?? FALLBACK_POLYSILICON.change;
  const scfiValue = scfi?.value ?? FALLBACK_SCFI.value;
  const scfiChange = scfi?.change ?? FALLBACK_SCFI.change;
  const queue = stats?.work_queue?.length ? stats.work_queue : FALLBACK_QUEUE;

  const kpi = [
    { label: '가용재고', value: inventoryMW.toFixed(2), unit: 'MW', detail: '오늘 기준' },
    { label: '예약 대기', value: String(reservations), unit: '건', detail: '미배정 포함' },
    { label: 'L/C 사용', value: (lcTotalUSD / 1_000_000).toFixed(2), unit: 'M$', detail: `${lcCount}건` },
    { label: 'USD/KRW', value: fmt.format(Math.round(fxRate * 10) / 10), unit: '', detail: fxChange != null ? fmtPct(fxChange) : '실시간' },
  ];
  return (
    <div className="sf-login-shell">
      <section className="sf-login-left">
        <div className="flex items-center gap-2.5">
          <span className="sf-solar-mark" aria-hidden>
            <Sun strokeWidth={2.4} />
          </span>
          <div>
            <div className="text-[15px] font-extrabold leading-none">
              SolarFlow <span className="text-[var(--sf-solar-3)]">3.0</span>
            </div>
            <div className="sf-mono mt-1 text-[10px] text-[var(--sf-ink-3)]">탑솔라 · 태양광 모듈 관리 OS</div>
          </div>
        </div>

        <div className="max-w-[380px]">
          <div className="sf-eyebrow text-[var(--sf-solar-3)]">로그인 · LOGIN</div>
          <h1 className="mt-2 text-[32px] font-extrabold leading-none text-[var(--sf-ink)]">다시 만나요.</h1>
          <p className="mt-2 mb-6 text-[13px] leading-6 text-[var(--sf-ink-3)]">
            오늘 <strong className="font-bold text-[var(--sf-ink)]">예약 {reservations}건</strong>과{' '}
            <strong className="font-bold text-[var(--sf-ink)]">입항 {queue.filter((q) => q.tag === '입항').length || 4}척</strong>이
            처리를 기다리고 있어요.
          </p>
          <LoginForm />
          <div className="mt-5 flex items-center gap-2 rounded bg-[var(--sf-bg-2)] px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--sf-pos)] shadow-[0_0_0_3px_rgb(44_122_62_/_0.15)]" />
            <div className="sf-mono flex-1 text-[10.5px] text-[var(--sf-ink-2)]">API 8.4ms · DB 12.1ms · 엔진 3.2ms</div>
            <span className="sf-mono text-[10px] text-[var(--sf-ink-4)]">Last sync 14:42</span>
          </div>
        </div>

        <div className="sf-login-footer">
          <div className="sf-family-site">
            <div className="sf-eyebrow flex items-center gap-2 text-[var(--sf-ink-3)]">
              <span className="h-px w-5 bg-[var(--sf-line-2)]" aria-hidden />
              패밀리 사이트 · FAMILY SITES
            </div>
            <div className="sf-family-site-list">
              {FAMILY_SITES.map((site) => (
                <a
                  key={site.value}
                  href={site.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sf-family-site-link"
                >
                  <span className="sf-family-site-link-body">
                    <span className="sf-family-site-link-label">{site.label}</span>
                    <span className="sf-mono sf-family-site-link-host">
                      {new URL(site.href).host}
                    </span>
                  </span>
                  <ArrowUpRight className="sf-family-site-link-icon" strokeWidth={2.2} aria-hidden />
                </a>
              ))}
            </div>
          </div>
          <div className="sf-mono text-[10px] text-[var(--sf-ink-4)]">v3.0.0 · command center</div>
        </div>
      </section>

      <section className="sf-login-right">
        <div className="relative flex items-center justify-between">
          <span className="sf-mono flex items-center gap-2 text-[10px] font-semibold text-[var(--sf-solar)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--sf-solar)] shadow-[0_0_0_3px_rgb(245_184_0_/_0.20)]" />
            LIVE · {todayKST()} KST
          </span>
          <span className="sf-mono text-[9.5px] text-[var(--sf-dark-ink-3)]">SOLARFLOW · CMD CENTER</span>
        </div>

        <div className="sf-dark-kpi-grid">
          {kpi.map(({ label, value, unit, detail }) => (
            <div className="sf-dark-kpi" key={label}>
              <div className="sf-eyebrow text-[var(--sf-dark-ink-3)]">{label}</div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <strong>{value}</strong>
                {unit ? <span className="sf-mono text-[11px] text-[var(--sf-dark-ink-3)]">{unit}</span> : null}
              </div>
              <div className="sf-mono mt-1 text-[10px] text-[#92e0a4]">{detail}</div>
            </div>
          ))}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="sf-eyebrow mb-2 text-[var(--sf-dark-ink-3)]">오늘의 작업 큐 · {queue.length}건</div>
          <div className="min-h-0 flex-1">
            {queue.map(({ time, tag, title, meta }) => (
              <div
                key={`${time}-${tag}-${title}`}
                className="grid grid-cols-[46px_64px_minmax(0,1fr)] items-start gap-3 border-b border-white/5 py-3 last:border-b-0"
              >
                <span className="sf-mono text-xs font-bold text-[var(--sf-solar)]">{time}</span>
                <span className="sf-mono rounded-sm bg-[rgb(245_184_0_/_0.16)] px-1.5 py-0.5 text-center text-[9.5px] font-bold text-[var(--sf-solar)]">
                  {tag}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-[var(--sf-dark-ink)]">{title}</div>
                  <div className="sf-mono mt-1 text-[10.5px] text-[var(--sf-dark-ink-3)]">{meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sf-mono border-t border-white/10 pt-3 text-[10px] text-[var(--sf-dark-ink-3)]">
          은 <span className="text-[var(--sf-dark-ink)]">${silverPrice.toFixed(2)}</span>
          <span className={`ml-1 ${silverChange >= 0 ? 'text-[#92e0a4]' : 'text-[#e09a8b]'}`}>
            {silverChange >= 0 ? '+' : ''}{silverChange.toFixed(2)}
          </span>
          <span className="mx-2 text-white/15">│</span>
          폴리실리콘 <span className="text-[var(--sf-dark-ink)]">{polyValue.toFixed(2)}</span>
          <span className={`ml-1 ${polyChange >= 0 ? 'text-[#92e0a4]' : 'text-[#e09a8b]'}`}>
            {polyChange >= 0 ? '+' : ''}{polyChange.toFixed(2)}
          </span>
          <span className="mx-2 text-white/15">│</span>
          SCFI <span className="text-[var(--sf-dark-ink)]">{fmt.format(Math.round(scfiValue))}</span>
          <span className={`ml-1 ${scfiChange >= 0 ? 'text-[#92e0a4]' : 'text-[#e09a8b]'}`}>
            {scfiChange >= 0 ? '+' : ''}{scfiChange.toFixed(2)}
          </span>
        </div>
      </section>
    </div>
  );
}
