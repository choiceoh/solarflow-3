// SolarFlow 3.0 — Login screens (3 variants)
/* global React, I, Logo */

function LoginA() {
  return (
    <div className="frame" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg)' }}>
      {/* ─── LEFT — Login form ─────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '40px 56px', justifyContent: 'space-between', position: 'relative' }}>
        {/* logo block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo.A size={28} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.012em' }}>SolarFlow <span style={{ color: 'var(--solar-3)' }}>1.0</span></div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2, letterSpacing: '0.02em' }}>탑솔라 · 태양광 모듈 관리 OS</div>
          </div>
        </div>

        {/* center — form */}
        <div style={{ maxWidth: 360 }}>
          <div className="eyebrow" style={{ color: 'var(--solar-3)', fontSize: 10 }}>로그인 · LOGIN</div>
          <h1 style={{ fontSize: 32, margin: '8px 0 6px', letterSpacing: '-0.025em', fontWeight: 700, lineHeight: 1.05 }}>
            다시 만나요.
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 24px', lineHeight: 1.5 }}>
            오늘 <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>예약 28건</strong>과 <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>입항 4척</strong>이<br />
            처리를 기다리고 있어요.
          </p>

          <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="eyebrow" style={{ color: 'var(--ink-3)' }}>이메일</label>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', display: 'flex' }}><I.Mail size={14} /></span>
                <input className="field" defaultValue="park.jh@topsolar.kr" style={{ width: '100%', paddingLeft: 36, height: 38 }} />
              </div>
            </div>
            <div>
              <label className="eyebrow" style={{ color: 'var(--ink-3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>비밀번호</span>
                <a href="#" style={{ color: 'var(--solar-3)', textDecoration: 'none', textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--sans)', fontSize: 11 }}>잊으셨나요?</a>
              </label>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', display: 'flex' }}><I.Lock size={14} /></span>
                <input className="field" type="password" defaultValue="••••••••••" style={{ width: '100%', paddingLeft: 36, paddingRight: 36, height: 38 }} />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', cursor: 'pointer', display: 'flex' }}><I.Eye size={14} /></span>
              </div>
            </div>
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              <input type="checkbox" defaultChecked /> 이 기기에서 로그인 상태 유지
            </label>
            <button type="button" className="btn primary" style={{ height: 40, justifyContent: 'center', fontSize: 13, fontWeight: 600, marginTop: 6 }}>
              로그인 →
            </button>
          </form>

          <div style={{ marginTop: 18, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="dot" style={{ background: 'var(--pos)', boxShadow: '0 0 0 3px rgba(44,122,62,0.15)' }} />
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>API 8.4ms · DB 12.1ms · 엔진 3.2ms</div>
            </div>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>Last sync 14:42</span>
          </div>
        </div>

        {/* footer */}
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.02em' }}>
          <span>v1.0.0 · build 4f77c06</span>
        </div>
      </div>

      {/* ─── RIGHT — Live dashboard panel ──────────── */}
      <div style={{
        background: 'var(--dark)', color: 'var(--dark-ink)',
        padding: 36, display: 'flex', flexDirection: 'column', gap: 18,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* warm gradient */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 90% 10%, rgba(245,184,0,0.16), transparent 60%)', pointerEvents: 'none' }} />
        {/* hairline grid */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5, pointerEvents: 'none' }}>
          <defs>
            <pattern id="lgrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#lgrid)" />
        </svg>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--solar)', letterSpacing: '0.18em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="dot" style={{ background: 'var(--solar)', boxShadow: '0 0 0 3px rgba(245,184,0,0.20)' }} />
            LIVE · 2026-04-26 14:42 KST
          </span>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--dark-ink-3)', letterSpacing: '0.1em' }}>SOLARFLOW · CMD CENTER</span>
        </div>

        {/* KPI grid */}
        <div style={{
          position: 'relative',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
          background: 'rgba(255,255,255,0.07)',
          padding: 1, borderRadius: 4,
        }}>
          {[
            { l: '가용재고',  v: '76.42',   u: 'MW',  d: '+2.4%',  up: true },
            { l: '예약 대기', v: '28',      u: '건',  d: '14.82 MW · 6보류' },
            { l: 'L/C 사용',  v: '8.42',    u: 'M$',  d: '70.2% · 11건' },
            { l: 'USD/KRW',   v: '1,773.4', u: '',    d: '+0.06%', up: true },
          ].map((k, i) => (
            <div key={i} style={{ background: 'var(--dark)', padding: '14px 16px' }}>
              <div className="eyebrow" style={{ color: 'var(--dark-ink-3)' }}>{k.l}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 6 }}>
                <span className="bignum" style={{ fontSize: 24, color: 'var(--solar)' }}>{k.v}</span>
                {k.u && <span className="mono" style={{ fontSize: 11, color: 'var(--dark-ink-3)', fontWeight: 500 }}>{k.u}</span>}
              </div>
              <div className="mono" style={{ fontSize: 10, color: k.up != null ? (k.up ? '#92e0a4' : '#e09a8b') : 'var(--dark-ink-2)', marginTop: 3 }}>
                {k.d}
              </div>
            </div>
          ))}
        </div>

        {/* Today queue */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="eyebrow" style={{ color: 'var(--dark-ink-3)', marginBottom: 8 }}>오늘의 작업 큐 · 4건</div>
          <div style={{ flex: 1 }}>
            {[
              { t: '09:00', tag: '입항',     d: 'COSCO SHANGHAI 042E', m: '8,800장 · 5,456 kW · 인천 1창고', pri: 'pos' },
              { t: '11:30', tag: 'L/C 만기', d: 'LC-26-0405',          m: 'USD 1.84M · 하나은행 · 결재 대기', pri: 'warn' },
              { t: '14:00', tag: '결재',     d: '수입대금 결재',        m: '6건 · USD 4.12M · 박지훈 결재', pri: 'cur' },
              { t: '16:00', tag: '면장',     d: '인천세관',             m: '5건 도착 · IL-25-1204-04 외 4건', pri: 'info' },
            ].map((r, i, arr) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '46px 56px 1fr',
                columnGap: 14, alignItems: 'start',
                padding: '11px 0',
                borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <span className="mono tnum" style={{ color: 'var(--solar)', fontWeight: 600, fontSize: 12, lineHeight: '18px' }}>{r.t}</span>
                <span className="mono" style={{
                  fontSize: 9.5, letterSpacing: '0.08em', fontWeight: 600,
                  height: 18, lineHeight: '18px', textAlign: 'center',
                  borderRadius: 2, padding: '0 6px',
                  background: r.pri === 'cur' ? 'rgba(245,184,0,0.18)' :
                              r.pri === 'warn' ? 'rgba(168,101,24,0.22)' :
                              r.pri === 'info' ? 'rgba(31,95,135,0.22)' :
                                                 'rgba(44,122,62,0.20)',
                  color: r.pri === 'cur' ? 'var(--solar)' :
                         r.pri === 'warn' ? '#f5c97a' :
                         r.pri === 'info' ? '#9bc8e0' :
                                            '#92e0a4',
                }}>{r.tag}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--dark-ink)', fontSize: 12.5, fontWeight: 500, lineHeight: '18px' }}>{r.d}</div>
                  <div className="mono" style={{ color: 'var(--dark-ink-3)', fontSize: 10.5, marginTop: 3, lineHeight: 1.4 }}>{r.m}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* footer ticker */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--dark-ink-3)', letterSpacing: '0.04em' }}>
            JKO <span style={{ color: 'var(--dark-ink)' }}>$28.84</span>
            <span style={{ color: '#e09a8b', marginLeft: 4 }}>−1.42</span>
            <span style={{ margin: '0 10px', color: 'rgba(255,255,255,0.15)' }}>│</span>
            폴리실리콘 <span style={{ color: 'var(--dark-ink)' }}>34.20</span>
            <span style={{ color: '#92e0a4', marginLeft: 4 }}>+0.40</span>
            <span style={{ margin: '0 10px', color: 'rgba(255,255,255,0.15)' }}>│</span>
            SCFI <span style={{ color: 'var(--dark-ink)' }}>1,284</span>
            <span style={{ color: '#92e0a4', marginLeft: 4 }}>−2.10</span>
          </div>
          <span className="mono" style={{ fontSize: 10, color: 'var(--solar)', letterSpacing: '0.06em' }}>● Available</span>
        </div>
      </div>
    </div>
  );
}

function LoginB() {
  // Command Center: centered card on warm gradient + brand-strong
  return (
    <div className="frame" style={{ background: 'linear-gradient(135deg, #fff8e0 0%, #fbfaf7 50%, #ffe9c2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative' }}>
      {/* faint grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.4 }}>
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <div style={{ width: 380, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 8, boxShadow: '0 24px 60px -20px rgba(60,40,10,0.18), 0 4px 12px -4px rgba(60,40,10,0.08)', overflow: 'hidden', position: 'relative' }}>
        {/* Header band */}
        <div style={{ background: 'var(--ink)', padding: '20px 24px', color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo.B size={32} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>SolarFlow</div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--solar)', letterSpacing: '0.08em' }}>탑솔라 · v3.0</div>
          </div>
          <div style={{ flex: 1 }} />
          <span className="pill solar" style={{ background: 'rgba(245,184,0,0.18)', color: 'var(--solar)' }}>LIVE</span>
        </div>

        <div style={{ padding: 28 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em' }}>로그인</h1>
          <p style={{ margin: '4px 0 20px', fontSize: 12, color: 'var(--ink-3)' }}>탑솔라 임직원 계정으로 접속하세요.</p>

          <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>이메일</label>
              <input className="field" defaultValue="park.jh@topsolar.kr" style={{ width: '100%', height: 38, marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
                <span>비밀번호</span>
                <a style={{ color: 'var(--solar-3)', textDecoration: 'none' }}>잊으셨나요?</a>
              </label>
              <input className="field" type="password" defaultValue="••••••••••" style={{ width: '100%', height: 38, marginTop: 4 }} />
            </div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: 'var(--ink-3)' }}>
              <input type="checkbox" defaultChecked /> 로그인 유지 (이 기기)
            </label>
            <button type="button" className="btn solar" style={{ height: 40, justifyContent: 'center', fontSize: 13, fontWeight: 600, marginTop: 4 }}>로그인 →</button>
          </form>

          <div style={{ marginTop: 18, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 4, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span className="dot" style={{ background: 'var(--pos)', marginTop: 5 }} />
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 500 }}>All systems normal</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>API 8.4ms · DB 12.1ms · 엔진 3.2ms</div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-4)' }}>
          <span className="mono">v3.0.142</span>
          <span>© 탑솔라(주)</span>
        </div>
      </div>
    </div>
  );
}

function LoginC() {
  // Editorial: big hero number, login card on right
  return (
    <div className="frame" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', background: 'var(--surface)' }}>
      {/* Left — editorial hero */}
      <div style={{ padding: '48px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', borderRight: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo.C size={28} />
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>SolarFlow</div>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>· 탑솔라 v3.0</span>
        </div>

        <div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--solar-3)', letterSpacing: '0.16em', fontWeight: 600 }}>이번 달 · 2026년 4월</div>
          <h1 style={{ margin: '8px 0 0', fontSize: 56, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1, color: 'var(--ink)' }}>
            <span className="mono tnum" style={{ color: 'var(--solar-3)' }}>76.42</span>
            <span style={{ fontSize: 32, color: 'var(--ink-3)', fontWeight: 500, marginLeft: 8 }}>MW</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-2)', maxWidth: 460, lineHeight: 1.45 }}>
            현재 가용재고 · 134,200장의 모듈이 6개 창고에서 다음 수주를 기다리고 있습니다.
          </p>

          <div style={{ display: 'flex', gap: 0, marginTop: 28, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            {[
              { l: '오늘 입항', v: '1', u: '척', s: 'COSCO 042E' },
              { l: '결재 대기', v: '6', u: '건', s: '4.2억' },
              { l: 'L/C 만기 D-7', v: '2', u: '건', s: '3.12 M$' },
              { l: '월누적 매출', v: '4.28', u: '십억원', s: '+18.2%' },
            ].map((m, i) => (
              <div key={i} style={{ flex: 1, paddingRight: 16, borderRight: i < 3 ? '1px solid var(--line)' : 'none', paddingLeft: i > 0 ? 16 : 0 }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>{m.l}</div>
                <div className="mono tnum" style={{ fontSize: 22, fontWeight: 600, marginTop: 4, letterSpacing: '-0.015em' }}>
                  {m.v} <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>{m.u}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>{m.s}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>v3.0.142 · 빌드 4f77c06 · API api.topworks.ltd</div>
      </div>

      {/* Right — minimal login */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: 'var(--bg-2)' }}>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.015em' }}>로그인</h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '4px 0 24px' }}>탑솔라 계정으로 계속하세요</p>

          <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="field" defaultValue="park.jh@topsolar.kr" style={{ height: 40 }} />
            <input className="field" type="password" defaultValue="••••••••••" style={{ height: 40 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink-3)' }}>
              <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" defaultChecked /> 기억하기</label>
              <a style={{ color: 'var(--solar-3)' }}>비밀번호 재설정</a>
            </div>
            <button type="button" className="btn primary" style={{ height: 42, justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>로그인</button>
          </form>

          <div style={{ marginTop: 24, fontSize: 10.5, color: 'var(--ink-4)', textAlign: 'center' }}>
            <span className="mono" style={{ color: 'var(--pos)' }}>● 시스템 정상</span> · 최근 접속 14:21
          </div>
        </div>
      </div>
    </div>
  );
}

window.LoginA = LoginA;
window.LoginB = LoginB;
window.LoginC = LoginC;
