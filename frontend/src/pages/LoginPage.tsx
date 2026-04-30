import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="sf-login-shell">
      <section className="sf-login-left">
        <div className="flex items-center gap-2.5">
          <span className="sf-solar-mark" aria-hidden />
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
            오늘 <strong className="font-bold text-[var(--sf-ink)]">예약 28건</strong>과{' '}
            <strong className="font-bold text-[var(--sf-ink)]">입항 4척</strong>이 처리를 기다리고 있어요.
          </p>
          <LoginForm />
          <div className="mt-5 flex items-center gap-2 rounded bg-[var(--sf-bg-2)] px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--sf-pos)] shadow-[0_0_0_3px_rgb(44_122_62_/_0.15)]" />
            <div className="sf-mono flex-1 text-[10.5px] text-[var(--sf-ink-2)]">API 8.4ms · DB 12.1ms · 엔진 3.2ms</div>
            <span className="sf-mono text-[10px] text-[var(--sf-ink-4)]">Last sync 14:42</span>
          </div>
        </div>

        <div className="sf-mono text-[10px] text-[var(--sf-ink-4)]">v3.0.0 · command center</div>
      </section>

      <section className="sf-login-right">
        <div className="relative flex items-center justify-between">
          <span className="sf-mono flex items-center gap-2 text-[10px] font-semibold text-[var(--sf-solar)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--sf-solar)] shadow-[0_0_0_3px_rgb(245_184_0_/_0.20)]" />
            LIVE · 2026-04-30 KST
          </span>
          <span className="sf-mono text-[9.5px] text-[var(--sf-dark-ink-3)]">SOLARFLOW · CMD CENTER</span>
        </div>

        <div className="sf-dark-kpi-grid">
          {[
            ['가용재고', '76.42', 'MW', '+2.4%'],
            ['예약 대기', '28', '건', '14.82 MW · 6보류'],
            ['L/C 사용', '8.42', 'M$', '70.2% · 11건'],
            ['USD/KRW', '1,773.4', '', '+0.06%'],
          ].map(([label, value, unit, detail]) => (
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
          <div className="sf-eyebrow mb-2 text-[var(--sf-dark-ink-3)]">오늘의 작업 큐 · 4건</div>
          <div className="min-h-0 flex-1">
            {[
              ['09:00', '입항', 'COSCO SHANGHAI 042E', '8,800장 · 5,456 kW · 인천 1창고'],
              ['11:30', 'L/C 만기', 'LC-26-0405', 'USD 1.84M · 하나은행 · 결재 대기'],
              ['14:00', '결재', '수입대금 결재', '6건 · USD 4.12M · 박지훈 결재'],
              ['16:00', '면장', '인천세관', '5건 도착 · IL-25-1204-04 외 4건'],
            ].map(([time, tag, title, meta], index) => (
              <div
                key={`${time}-${tag}`}
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
                {index === 1 ? null : null}
              </div>
            ))}
          </div>
        </div>

        <div className="sf-mono border-t border-white/10 pt-3 text-[10px] text-[var(--sf-dark-ink-3)]">
          JKO <span className="text-[var(--sf-dark-ink)]">$28.84</span>
          <span className="ml-1 text-[#e09a8b]">-1.42</span>
          <span className="mx-2 text-white/15">│</span>
          폴리실리콘 <span className="text-[var(--sf-dark-ink)]">34.20</span>
          <span className="ml-1 text-[#92e0a4]">+0.40</span>
          <span className="mx-2 text-white/15">│</span>
          SCFI <span className="text-[var(--sf-dark-ink)]">1,284</span>
          <span className="ml-1 text-[#92e0a4]">-2.10</span>
        </div>
      </section>
    </div>
  );
}
