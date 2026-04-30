// SolarFlow 3.0 — Shell B (Command Center)
// 다크 사이드바 + 메인 + 우측 레일. 모든 페이지 공통.
/* global React, I, Logo */

function SideNavB({ active = 'inv' }) {
  const groups = [
    { sec: '', items: [
      { k: 'inv',  i: 'Box',   l: '가용재고',  n: 28 },
      { k: 'dash', i: 'Chart', l: '대시보드' },
    ]},
    { sec: '구매', items: [
      { k: 'po', i: 'Cart',  l: 'P/O 발주', n: 8 },
      { k: 'lc', i: 'Bank',  l: 'L/C 개설', n: 11 },
      { k: 'bl', i: 'Truck', l: 'B/L 입고', n: 4 },
    ]},
    { sec: '판매', items: [
      { k: 'so', i: 'Doc',    l: '수주 관리', n: 22 },
      { k: 'ob', i: 'Truck',  l: '출고/판매' },
      { k: 'ar', i: 'Wallet', l: '수금 관리', n: 8 },
    ]},
    { sec: '현황', items: [
      { k: 'bnk', i: 'Bank',  l: 'L/C 한도' },
      { k: 'an',  i: 'Chart', l: '매출 분석' },
    ]},
    { sec: '도구', items: [
      { k: 'mas', i: 'Db',     l: '마스터' },
      { k: 'sr',  i: 'Search', l: '검색' },
      { k: 'st',  i: 'Cog',    l: '설정' },
    ]},
  ];

  return (
    <aside className="dark-scroll" style={{
      background: 'var(--dark)', color: 'var(--dark-ink)',
      display: 'flex', flexDirection: 'column', minHeight: 0,
      width: 212, flexShrink: 0,
    }}>
      {/* Logo block */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid var(--dark-line)' }}>
        <Logo.B size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.012em', lineHeight: 1.1 }}>SolarFlow</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--solar)', letterSpacing: '0.08em', fontWeight: 600, marginTop: 2 }}>v3.0 · TOPSOLAR</div>
        </div>
      </div>

      {/* Company switcher */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--dark-line)' }}>
        <div className="eyebrow" style={{ color: 'var(--dark-ink-3)', marginBottom: 6 }}>법인</div>
        <button style={{
          width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 4,
          color: 'var(--dark-ink)', fontSize: 12, fontWeight: 500,
          fontFamily: 'inherit', cursor: 'pointer',
          transition: 'background var(--dur) var(--ease-out)',
        }}>
          <span>탑솔라(주)</span>
          <I.Caret size={12} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 12 }}>
            {g.sec && (
              <div className="mono" style={{
                fontSize: 9, color: 'var(--dark-ink-3)',
                letterSpacing: '0.14em', fontWeight: 600,
                padding: '8px 10px 5px',
              }}>{g.sec}</div>
            )}
            {g.items.map(it => {
              const Ico = I[it.i] || I.Box;
              const isAct = active === it.k;
              return (
                <div key={it.k} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '7px 10px',
                  background: isAct ? 'var(--solar)' : 'transparent',
                  color: isAct ? 'var(--dark)' : 'var(--dark-ink-2)',
                  borderRadius: 4,
                  fontSize: 12.5,
                  fontWeight: isAct ? 600 : 500,
                  marginBottom: 1,
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
                }}>
                  <Ico size={14} />
                  <span style={{ flex: 1, letterSpacing: '-0.005em' }}>{it.l}</span>
                  {it.n != null && (
                    <span className="mono tnum" style={{
                      fontSize: 10,
                      color: isAct ? 'var(--dark)' : 'var(--dark-ink-3)',
                      fontWeight: 600,
                      minWidth: 16, textAlign: 'right',
                    }}>{it.n}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--dark-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 4,
          background: 'var(--solar)', color: 'var(--dark)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 12,
          flexShrink: 0,
        }}>박</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.005em' }}>박지훈</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--dark-ink-3)', marginTop: 1 }}>운영팀 · 관리자</div>
        </div>
        <button style={{
          background: 'transparent', border: 'none',
          color: 'var(--dark-ink-3)', cursor: 'pointer',
          padding: 4, display: 'flex', alignItems: 'center',
          borderRadius: 3,
        }}>
          <I.Cog size={14} />
        </button>
      </div>
    </aside>
  );
}

function HeaderB({ title, breadcrumb, actions }) {
  return (
    <div style={{
      height: 56, display: 'flex', alignItems: 'center',
      gap: 16, padding: '0 18px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--surface)',
      flexShrink: 0,
    }}>
      <div style={{ flex: '0 0 auto', minWidth: 0 }}>
        <h1 style={{
          fontSize: 16, fontWeight: 600, margin: 0,
          letterSpacing: '-0.018em', whiteSpace: 'nowrap',
          lineHeight: 1.1,
        }}>{title}</h1>
        <div className="mono" style={{
          fontSize: 10, color: 'var(--ink-3)',
          marginTop: 3, whiteSpace: 'nowrap',
          letterSpacing: '0.02em',
        }}>{breadcrumb} · 계산기준 14:42:08</div>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-2)',
          border: '1px solid transparent',
          borderRadius: 4,
          padding: '5px 10px',
          width: '100%', maxWidth: 420,
          transition: 'border-color var(--dur) var(--ease-out), background var(--dur) var(--ease-out)',
        }}>
          <I.Search size={13} />
          <input
            placeholder="품번, 거래처, B/L, L/C 통합 검색"
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              flex: 1, fontSize: 12, minWidth: 0,
              color: 'var(--ink)',
            }}
          />
          <span className="kbd">⌘K</span>
        </div>
      </div>

      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="btn xs ghost icon" style={{ position: 'relative' }}>
          <I.Bell size={14} />
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--neg)',
            border: '1.5px solid var(--surface)',
          }} />
        </button>
        {actions}
      </div>
    </div>
  );
}

function ShellB({ active, title, breadcrumb, actions, rightRail, children }) {
  return (
    <div className="frame" style={{
      background: 'var(--bg-2)',
      display: 'grid',
      gridTemplateColumns: rightRail ? '212px minmax(0,1fr) 256px' : '212px minmax(0,1fr)',
      gridTemplateRows: '100%',
    }}>
      <SideNavB active={active} />
      <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        <HeaderB title={title} breadcrumb={breadcrumb} actions={actions} />
        {children}
      </section>
      {rightRail}
    </div>
  );
}

window.SideNavB = SideNavB;
window.HeaderB = HeaderB;
window.ShellB = ShellB;
