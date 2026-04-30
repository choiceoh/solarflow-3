// SolarFlow 3.0 — B 화면군 추가 (대시보드 · 출고/판매 · 수금 · L/C 한도 · 매출 분석)
// 모든 데이터는 SF_DATA의 통합 엔티티에서 derive — 화면 간 숫자 일치 보장.
/* global React, I, ShellB, TileB, CardB, RailBlock, FilterChips, FilterButton */

const _D = () => window.SF_DATA;
const fmtKw = (kw) => kw >= 1000 ? `${(kw/1000).toFixed(2)} MW` : `${Math.round(kw).toLocaleString()} kW`;
const fmtKrwEok = (n) => (n / 100000000).toFixed(2);
const fmtKrwEokFix = (n, d=2) => (n / 100000000).toFixed(d);
const fmtUsdM = (n) => n.toFixed(2);
const stageMapOB = {
  pending:  { l: '대기',     c: 'var(--ink-3)' },
  planned:  { l: '계획',     c: 'var(--info)' },
  ready:    { l: '상차준비', c: 'var(--solar-3)' },
  loading:  { l: '상차중',   c: 'var(--solar-3)' },
  enroute:  { l: '운송중',   c: 'var(--pos)' },
  delivered:{ l: '인도완료', c: 'var(--ink-2)' },
};

// ════════════════════════════════════════════════════════════
// 6. 대시보드 — ScreenDash_B
// ════════════════════════════════════════════════════════════
function ScreenDash_B() {
  const D = _D();
  const k = D.kpis2;
  const todayObCount = D.obs.filter(o => D.daysFrom(o.dlvr) === 0).length;
  const todayObKw = D.obs.filter(o => D.daysFrom(o.dlvr) === 0).reduce((s, o) => s + o.kw, 0);
  const lcMaturityNear = D.lcs.filter(l => {
    const d = D.daysFrom(l.maturity);
    return d >= 0 && d <= 7 && l.status !== 'closed';
  }).sort((a, b) => D.daysFrom(a.maturity) - D.daysFrom(b.maturity));

  const rightRail = (
    <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="알림" count={String(D.alerts.length)}>
        {D.alerts.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <span className="dot" style={{ marginTop: 6, background: a.sev === 'warn' ? 'var(--warn)' : a.sev === 'neg' ? 'var(--neg)' : 'var(--info)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.005em', lineHeight: 1.4 }}>{a.msg}</div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-4)', marginTop: 2 }}>{a.t}</div>
            </div>
          </div>
        ))}
      </RailBlock>

      <RailBlock title="환율 · 시세" count="14:42 KST">
        {[
          { l: 'USD/KRW',  v: '1,773.4',  d: '+0.06%', up: true },
          { l: 'CNY/KRW',  v: '244.18',   d: '−0.12%', up: false },
          { l: '폴리실리콘', v: '34.20', d: '+0.40',  up: true },
          { l: 'JKO 주가',v: '$28.84',   d: '−1.42%', up: false },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{r.l}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span className="mono tnum" style={{ fontSize: 11.5, color: 'var(--ink)', fontWeight: 600 }}>{r.v}</span>
              <span className="mono tnum" style={{ fontSize: 10, color: r.up ? 'var(--pos)' : 'var(--neg)', minWidth: 48, textAlign: 'right' }}>{r.d}</span>
            </span>
          </div>
        ))}
      </RailBlock>

      <RailBlock title="최근 활동" count={String(D.activity.length)} last>
        {D.activity.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--line)' : 'none', fontSize: 11 }}>
            <span className="mono tnum" style={{ color: 'var(--ink-3)', minWidth: 36 }}>{r.t}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--ink-2)' }}>{r.action} · <span className="mono" style={{ color: 'var(--ink-3)' }}>{r.target}</span></div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.meta}</div>
            </div>
          </div>
        ))}
      </RailBlock>
    </aside>
  );

  return (
    <ShellB
      active="dash"
      title="대시보드"
      breadcrumb="홈 / 대시보드"
      rightRail={rightRail}
      actions={<button className="btn"><I.Download size={13} />주간 리포트</button>}
    >
      <div className="dark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <TileB lbl="가용재고"     v={k.avail.mw.toFixed(2)} u="MW"  sub={`${k.avail.ea.toLocaleString()}장 · ${D.products.length} SKU`} tone="solar" delta="+2.4%" spark={[68,70,71,72,73,74,75,75,76,76,76,76]} />
          <TileB lbl="이번 달 매출" v={k.rev.mtd.toFixed(1)}  u="억"  sub={`MTD · 목표 ${k.rev.target.toFixed(0)}억 (${k.rev.achievement.toFixed(1)}%)`} tone="pos"   delta="+18.2%" spark={[18,22,25,28,30,33,35,37,39,41,42,42]} />
          <TileB lbl="L/C 사용중"   v={k.lc.used.toFixed(2)}  u="M$" sub={`${k.lc.count}건 · 한도 ${k.lc.pct.toFixed(1)}%`} tone="warn"  delta={`${k.lc.pct.toFixed(1)}%`} />
          <TileB lbl="수금 대기"    v={fmtKrwEok(k.ar.total)} u="억" sub={`${k.ar.count}건 · 연체 ${k.ar.overdueCnt}건`} tone="info"  delta={`${k.ar.overdueCnt}건 연체`} />
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
          <CardB
            title="제조사별 단가 추이"
            sub="12주 · KRW/Wp"
            right={<FilterChips value="all" onChange={() => {}} options={[
              { key: 'all', label: '전체' }, { key: '4w', label: '4주' }, { key: '12w', label: '12주' }, { key: '52w', label: '52주' },
            ]} />}
            padded
          >
            <PriceTrendChart />
          </CardB>

          <CardB title="오늘의 작업 큐" sub={`${todayObCount + lcMaturityNear.length + 2}건 · 박지훈`} padded>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {(() => {
                const items = [];
                D.bls.filter(b => D.daysFrom(b.eta) === 1).forEach(b => {
                  items.push({ t: '09:00', tag: '입항', d: b.vessel, m: `${b.qty.toLocaleString()}장 · ${b.kw.toLocaleString()} kW · ${b.port} ${b.id}`, sev: 'pos' });
                });
                lcMaturityNear.slice(0, 1).forEach(l => {
                  const dleft = D.daysFrom(l.maturity);
                  items.push({ t: '11:30', tag: 'L/C 만기', d: l.no, m: `USD ${l.usd.toFixed(2)}M · ${D.bankBy[l.bank].bank.replace('은행','')} · D${dleft >= 0 ? '−'+dleft : '+'+(-dleft)}`, sev: 'warn' });
                });
                items.push({ t: '14:00', tag: '결재', d: '수입대금 결재', m: '6건 · USD 4.12M · 박지훈', sev: 'cur' });
                items.push({ t: '16:00', tag: '면장', d: '인천세관', m: '5건 도착 · IL-25-1204-04 외', sev: 'info' });
                return items;
              })().map((r, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '46px 64px 1fr',
                  columnGap: 12, alignItems: 'start',
                  padding: '12px 0',
                  borderTop: i ? '1px solid var(--line)' : 'none',
                }}>
                  <span className="mono tnum" style={{ color: 'var(--solar-3)', fontWeight: 600, fontSize: 12, lineHeight: '18px' }}>{r.t}</span>
                  <span className="mono" style={{
                    fontSize: 9.5, letterSpacing: '0.06em', fontWeight: 600,
                    height: 18, lineHeight: '18px', textAlign: 'center',
                    borderRadius: 2, padding: '0 6px',
                    background: r.sev === 'cur' ? 'rgba(245,184,0,0.18)'
                              : r.sev === 'warn' ? 'rgba(168,101,24,0.20)'
                              : r.sev === 'info' ? 'rgba(31,95,135,0.18)'
                                                 : 'rgba(44,122,62,0.18)',
                    color: r.sev === 'cur' ? 'var(--solar-3)'
                         : r.sev === 'warn' ? 'var(--warn)'
                         : r.sev === 'info' ? 'var(--info)'
                                            : 'var(--pos)',
                  }}>{r.tag}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--ink)', fontSize: 12.5, fontWeight: 500, lineHeight: '18px', letterSpacing: '-0.005em' }}>{r.d}</div>
                    <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 10.5, marginTop: 2, lineHeight: 1.4 }}>{r.m}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardB>
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
          <CardB title="제조사별 가용재고" sub="MW · 점유율" padded>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {D.availByMfg.map((r, i) => {
                const totalMw = D.availByMfg.reduce((s, x) => s + x.mw, 0);
                const pct = (r.mw / totalMw) * 100;
                const max = D.availByMfg[0].mw;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{r.name}</span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span className="mono tnum" style={{ fontSize: 11.5, fontWeight: 600 }}>{r.mw.toFixed(2)}</span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', minWidth: 40, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${(r.mw / max) * 100}%`, height: '100%', background: i === 0 ? 'var(--solar-3)' : 'var(--ink-3)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardB>

          <CardB title="월별 매출 · 매입" sub="2026 · 단위 억원" padded>
            <RevExpenseChart />
          </CardB>
        </div>
      </div>
    </ShellB>
  );
}

function PriceTrendChart() {
  const D = _D();
  const series = [
    { k: 'JKO', label: 'JinkoSolar', color: 'var(--solar-3)', data: D.priceTrend.JKO },
    { k: 'JAS', label: 'JA Solar',   color: 'var(--info)',    data: D.priceTrend.JAS },
    { k: 'TRN', label: 'Trina',      color: 'var(--neg)',     data: D.priceTrend.TRN },
    { k: 'LON', label: 'LONGi',      color: 'var(--ink-3)',   data: D.priceTrend.LON },
  ];
  const W = 720, H = 200, pad = { l: 36, r: 12, t: 14, b: 22 };
  const all = series.flatMap(s => s.data);
  const min = Math.floor(Math.min(...all) / 5) * 5;
  const max = Math.ceil(Math.max(...all) / 5) * 5;
  const x = (i) => pad.l + (i / 11) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const yy = pad.t + p * (H - pad.t - pad.b);
          const v = Math.round(max - p * (max - min));
          return (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} stroke="var(--line)" strokeDasharray={p === 0 || p === 1 ? '' : '2 4'} />
              <text x={pad.l - 6} y={yy + 3} fontSize="9" fontFamily="var(--mono)" fill="var(--ink-4)" textAnchor="end">{v}</text>
            </g>
          );
        })}
        {[0, 4, 8, 11].map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="9" fontFamily="var(--mono)" fill="var(--ink-4)" textAnchor="middle">{`W-${11 - i}`}</text>
        ))}
        {series.map(s => (
          <polyline
            key={s.k}
            fill="none"
            stroke={s.color}
            strokeWidth={s.k === 'JKO' ? 2 : 1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
        {series.map(s => (
          <circle key={s.k} cx={x(11)} cy={y(s.data[11])} r="2.5" fill={s.color} />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {series.map(s => (
          <span key={s.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-2)' }}>
            <span style={{ width: 10, height: 2, background: s.color, borderRadius: 1 }} />
            {s.label}
            <span className="mono tnum" style={{ color: 'var(--ink-3)', marginLeft: 2 }}>{s.data[s.data.length - 1]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RevExpenseChart() {
  const D = _D();
  const months = D.monthly.map(m => m.m.slice(5) + '월');
  const rev = D.monthly.map(m => m.rev);
  const exp = D.monthly.map(m => m.cogs);
  const W = 580, H = 220, pad = { l: 36, r: 12, t: 14, b: 28 };
  const max = Math.ceil(Math.max(...rev, ...exp) / 10) * 10 + 10;
  const x = (i) => pad.l + (i + 0.5) * ((W - pad.l - pad.r) / months.length);
  const bw = ((W - pad.l - pad.r) / months.length) * 0.32;
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {[0, 0.5, 1].map((p, i) => {
          const yy = pad.t + p * (H - pad.t - pad.b);
          const v = Math.round(max - p * max);
          return (
            <g key={i}>
              <line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} stroke="var(--line)" strokeDasharray={p === 0 || p === 1 ? '' : '2 4'} />
              <text x={pad.l - 6} y={yy + 3} fontSize="9" fontFamily="var(--mono)" fill="var(--ink-4)" textAnchor="end">{v}</text>
            </g>
          );
        })}
        {months.map((m, i) => (
          <g key={i}>
            <rect x={x(i) - bw - 1} y={y(rev[i])} width={bw} height={(H - pad.t - pad.b) * (rev[i] / max)} fill={i === months.length - 1 ? 'var(--solar-2)' : 'var(--solar-3)'} />
            <rect x={x(i) + 1} y={y(exp[i])} width={bw} height={(H - pad.t - pad.b) * (exp[i] / max)} fill="var(--ink-3)" opacity="0.5" />
            <text x={x(i)} y={H - 8} fontSize="10" fontFamily="var(--mono)" fill="var(--ink-3)" textAnchor="middle">{m}</text>
            <text x={x(i)} y={y(rev[i]) - 4} fontSize="9.5" fontFamily="var(--mono)" fill="var(--ink-2)" fontWeight="600" textAnchor="middle">{rev[i].toFixed(1)}</text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 11, color: 'var(--ink-2)' }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 10, height: 8, background: 'var(--solar-3)' }} />매출</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ width: 10, height: 8, background: 'var(--ink-3)', opacity: 0.5 }} />매입</span>
        <span style={{ marginLeft: 'auto', color: 'var(--ink-4)' }} className="mono">{months[months.length-1]}은 MTD 진행중</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 7. 출고/판매 — ScreenOB_B
// ════════════════════════════════════════════════════════════
function ScreenOB_B() {
  const D = _D();
  const [obFilter, setObFilter] = React.useState('all');
  const obs = D.obs;
  const todayObs = obs.filter(o => D.daysFrom(o.dlvr) === 0);
  const todayKw  = todayObs.reduce((s, o) => s + o.kw, 0);
  const weekObs  = obs.filter(o => { const d = D.daysFrom(o.dlvr); return d >= 0 && d <= 6; });
  const weekKw   = weekObs.reduce((s, o) => s + o.kw, 0);
  const weekQty  = weekObs.reduce((s, o) => s + o.qty, 0);
  const noTruck  = obs.filter(o => o.truck === '—').length;
  const enroute  = obs.filter(o => o.stage === 'enroute').length;
  const ready    = obs.filter(o => o.stage === 'ready' || o.stage === 'loading').length;

  const filtered = obs.filter(o => {
    if (obFilter === 'all') return true;
    if (obFilter === 'today') return D.daysFrom(o.dlvr) === 0;
    if (obFilter === 'enroute') return o.stage === 'enroute';
    if (obFilter === 'pending') return o.truck === '—';
    return true;
  });

  const rightRail = (
    <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="이번 주 출고" count={`${weekObs.length}건`}>
        <div className="bignum" style={{ fontSize: 26, color: 'var(--solar-3)' }}>{(weekKw/1000).toFixed(2)} <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>MW</span></div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{weekQty.toLocaleString()}장 · {new Set(weekObs.map(o=>o.sku)).size} SKU · {new Set(weekObs.map(o=>o.cust)).size} 거래처</div>
      </RailBlock>

      <RailBlock title="배차 현황">
        {[
          { l: '확정',   v: obs.length - noTruck },
          { l: '미배차', v: noTruck,  t: 'warn' },
          { l: '운송중', v: enroute,  t: 'info' },
          { l: '상차',   v: ready,    t: 'pos' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{r.l}</span>
            <span className="mono tnum" style={{ fontWeight: 600, color: r.t === 'pos' ? 'var(--pos)' : r.t === 'warn' ? 'var(--warn)' : r.t === 'info' ? 'var(--info)' : 'var(--ink-2)' }}>{r.v}</span>
          </div>
        ))}
      </RailBlock>

      <RailBlock title="창고 잔량" count="MW" last>
        {D.warehouses.map((w, i) => {
          const pct = (w.used / w.cap) * 100;
          return (
            <div key={i} style={{ padding: '6px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{w.name}</span>
                <span className="mono tnum" style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 600 }}>{w.used.toFixed(2)} MW</span>
              </div>
              <div style={{ height: 3, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct > 75 ? 'var(--warn)' : 'var(--ink-3)' }} />
              </div>
            </div>
          );
        })}
      </RailBlock>
    </aside>
  );

  return (
    <ShellB
      active="ob"
      title="출고 / 판매"
      breadcrumb="판매 / 출고 관리"
      rightRail={rightRail}
      actions={
        <>
          <button className="btn"><I.Download size={13} />출고대장</button>
          <button className="btn primary"><I.Plus size={13} />출고 등록</button>
        </>
      }
    >
      <div className="dark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <TileB lbl="이번주 출고"   v={(weekKw/1000).toFixed(2)} u="MW" sub={`${weekObs.length}건 · ${weekQty.toLocaleString()}장`} tone="solar" />
          <TileB lbl="오늘 출고"     v={String(todayObs.length)} u="건" sub={`${(todayKw/1000).toFixed(2)} MW · ${todayObs.reduce((s,o)=>s+o.qty,0).toLocaleString()}장`} tone="pos" />
          <TileB lbl="미배차"        v={String(noTruck)} u="건" sub={noTruck > 0 ? `${obs.find(o=>o.truck==='—')?.id || ''} · ${obs.find(o=>o.truck==='—')?.site || ''}` : '전건 배차완료'} tone={noTruck > 0 ? 'warn' : 'pos'} />
          <TileB lbl="평균 리드타임" v="2.4" u="일" sub="수주 → 출고" tone="info" delta="−0.6" />
        </div>

        <div style={{ height: 12 }} />

        <CardB
          title="출고 일정"
          sub={`총 ${filtered.length}건${obFilter !== 'all' ? ` · ${obs.length}건 중` : ''}`}
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FilterChips
                value={obFilter}
                onChange={setObFilter}
                options={[
                  { key: 'all',     label: '전체',   count: obs.length },
                  { key: 'today',   label: '오늘',   count: todayObs.length },
                  { key: 'enroute', label: '운송중', count: enroute },
                  { key: 'pending', label: '미배차', count: noTruck },
                ]}
              />
              <div className="vr" style={{ height: 16 }} />
              <FilterButton items={[
                { label: '거래처', options: ['전체', ...new Set(obs.map(o => D.custBy[o.cust]?.name || o.cust))] },
                { label: '창고',   options: ['전체', ...D.warehouses.map(w => w.name)] },
                { label: '출고일', options: ['전체','오늘','이번주','다음주','이번달'] },
              ]} />
            </div>
          }
        >
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" /></th>
                <th>출고 번호</th>
                <th>수주 ↔ 거래처</th>
                <th>현장</th>
                <th>품번</th>
                <th className="num">수량</th>
                <th className="num">kW</th>
                <th>배차</th>
                <th>납기</th>
                <th>진행</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const s = stageMapOB[r.stage];
                const dleft = D.daysFrom(r.dlvr);
                const cust = D.custBy[r.cust]?.name || r.cust;
                return (
                  <tr key={i}>
                    <td><input type="checkbox" /></td>
                    <td className="mono" style={{ fontWeight: 600 }}>{r.id}</td>
                    <td>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{r.so}</div>
                      <div style={{ fontWeight: 500 }}>{cust}</div>
                    </td>
                    <td>{r.site}</td>
                    <td className="mono">{r.sku}</td>
                    <td className="num mono tnum">{r.qty.toLocaleString()}</td>
                    <td className="num mono tnum" style={{ fontWeight: 600 }}>{r.kw.toLocaleString()}</td>
                    <td className="mono" style={{ fontSize: 11, color: r.truck === '—' ? 'var(--warn)' : 'var(--ink-2)' }}>{r.truck}</td>
                    <td className="mono">
                      {r.dlvr.slice(5)}
                      {dleft <= 6 && <span style={{ marginLeft: 6, color: dleft === 0 ? 'var(--solar-3)' : 'var(--ink-3)', fontWeight: 600 }}>{dleft === 0 ? 'D-day' : `D−${dleft}`}</span>}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500 }}>
                        <span className="dot" style={{ background: s.c }} />
                        <span style={{ color: s.c }}>{s.l}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardB>
      </div>
    </ShellB>
  );
}

// ════════════════════════════════════════════════════════════
// 8. 수금 관리 — ScreenAR_B
// ════════════════════════════════════════════════════════════
function ScreenAR_B() {
  const D = _D();
  const [arFilter, setArFilter] = React.useState('all');
  const ars = D.ars;
  const arTotal = ars.reduce((s, a) => s + (a.amt - (a.pay || 0)), 0);
  const arOver  = ars.filter(a => a.status === 'overdue');
  const arOverAmt = arOver.reduce((s, a) => s + a.amt - (a.pay||0), 0);
  const partial = ars.filter(a => a.status === 'partial').length;
  const normal  = ars.filter(a => a.status === 'normal').length;
  const weekDue = ars.filter(a => { const d = D.daysFrom(a.due); return d >= 0 && d <= 6; });
  const weekDueAmt = weekDue.reduce((s, a) => s + a.amt - (a.pay||0), 0);

  const filtered = ars.filter(a => {
    if (arFilter === 'all') return true;
    if (arFilter === 'overdue') return a.status === 'overdue';
    if (arFilter === 'partial') return a.status === 'partial';
    if (arFilter === 'normal')  return a.status === 'normal';
    return true;
  });

  const fmt = (n) => '₩' + n.toLocaleString();

  const rightRail = (
    <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="채권 합계" count={`${ars.length}건`}>
        <div className="bignum" style={{ fontSize: 26, color: 'var(--solar-3)' }}>{fmtKrwEok(arTotal)} <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>억</span></div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>평균 D+12 · 회수율 89.2%</div>
      </RailBlock>

      <RailBlock title="에이징" count="단위 백만원">
        {(() => {
          const total = D.arAging.reduce((s, b) => s + b.v, 0) || 1;
          const colors = ['var(--pos)', 'var(--warn)', 'var(--neg)', 'var(--ink-3)'];
          return D.arAging.map((r, i) => {
            const pct = (r.v / total) * 100;
            return (
              <div key={i} style={{ padding: '6px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{r.l}</span>
                  <span className="mono tnum" style={{ fontSize: 11, fontWeight: 600 }}>{Math.round(r.v/1000000).toLocaleString()}</span>
                </div>
                <div style={{ height: 3, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: colors[i] }} />
                </div>
              </div>
            );
          });
        })()}
      </RailBlock>

      <RailBlock title="이번 주 결제 예정" count={`${weekDue.length}건`} last>
        {weekDue.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--line)' : 'none', fontSize: 11.5 }}>
            <span className="mono tnum" style={{ color: 'var(--solar-3)', fontWeight: 600, minWidth: 36 }}>{r.due.slice(5)}</span>
            <span style={{ flex: 1, color: 'var(--ink-2)' }}>{D.custBy[r.cust]?.name || r.cust}</span>
            <span className="mono tnum" style={{ fontWeight: 600 }}>{fmtKrwEok(r.amt - (r.pay||0))}억</span>
          </div>
        ))}
      </RailBlock>
    </aside>
  );

  return (
    <ShellB
      active="ar"
      title="수금 관리"
      breadcrumb="판매 / 매출채권"
      rightRail={rightRail}
      actions={
        <>
          <button className="btn"><I.Download size={13} />채권대장</button>
          <button className="btn primary"><I.Mail size={13} />입금 확인</button>
        </>
      }
    >
      <div className="dark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <TileB lbl="총 채권"     v={fmtKrwEok(arTotal)}   u="억" sub={`${ars.length}건 · 평균 D+12`} tone="solar" />
          <TileB lbl="이번주 회수" v={fmtKrwEok(weekDueAmt)} u="억" sub={`${weekDue.length}건 · ${((weekDueAmt/arTotal)*100).toFixed(0)}% 비중`} tone="pos"   delta={`+${weekDue.length}건`} />
          <TileB lbl="연체"        v={fmtKrwEok(arOverAmt)}  u="억" sub={`${arOver.length}건 · 평균 D+11`} tone="neg"   delta={`+${arOver.length}건`} />
          <TileB lbl="회수율"      v="89.2"  u="%"   sub="3개월 이동평균" tone="info"  delta="+1.4%" spark={[85,86,86,87,87,88,88,88,89,89,89,89]} />
        </div>

        <div style={{ height: 12 }} />

        <CardB
          title="채권 목록"
          sub={`총 ${filtered.length}건 · ${fmtKrwEok(filtered.reduce((s,a)=>s+a.amt-(a.pay||0),0))}억`}
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FilterChips
                value={arFilter}
                onChange={setArFilter}
                options={[
                  { key: 'all',     label: '전체',     count: ars.length },
                  { key: 'normal',  label: '정상',     count: normal },
                  { key: 'partial', label: '부분입금', count: partial },
                  { key: 'overdue', label: '연체',     count: arOver.length },
                ]}
              />
              <div className="vr" style={{ height: 16 }} />
              <FilterButton items={[
                { label: '거래처', options: ['전체', ...D.customers.map(c => c.name)] },
                { label: '기간',   options: ['전체','이번주','이번달','지난달','이번분기'] },
                { label: '금액',   options: ['전체','1억 미만','1–3억','3–5억','5억 이상'] },
              ]} />
            </div>
          }
        >
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" /></th>
                <th>채권 번호</th>
                <th>거래처</th>
                <th>인보이스</th>
                <th className="num">청구액</th>
                <th className="num">입금액</th>
                <th>결제예정일</th>
                <th className="num">D-day</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const dleft = D.daysFrom(r.due);
                const cust = D.custBy[r.cust]?.name || r.cust;
                return (
                  <tr key={i}>
                    <td><input type="checkbox" /></td>
                    <td className="mono" style={{ fontWeight: 600 }}>{r.id}</td>
                    <td style={{ fontWeight: 500 }}>{cust}</td>
                    <td className="mono">{r.inv}</td>
                    <td className="num mono tnum" style={{ fontWeight: 600 }}>{fmt(r.amt)}</td>
                    <td className="num mono tnum" style={{ color: r.pay > 0 ? 'var(--pos)' : 'var(--ink-4)' }}>{r.pay > 0 ? fmt(r.pay) : '—'}</td>
                    <td className="mono">{r.due}</td>
                    <td className="num mono tnum" style={{ color: dleft < 0 ? 'var(--neg)' : dleft <= 3 ? 'var(--solar-3)' : 'var(--ink-3)', fontWeight: 600 }}>
                      {dleft < 0 ? `D+${-dleft}` : dleft === 0 ? 'D-day' : `D−${dleft}`}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500,
                        color: r.status === 'overdue' ? 'var(--neg)' : r.status === 'partial' ? 'var(--solar-3)' : 'var(--pos)' }}>
                        <span className="dot" style={{ background: 'currentColor' }} />
                        {r.status === 'overdue' ? '연체' : r.status === 'partial' ? '부분입금' : '정상'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardB>
      </div>
    </ShellB>
  );
}

// ════════════════════════════════════════════════════════════
// 9. L/C 한도 현황 — ScreenBank_B
// ════════════════════════════════════════════════════════════
function ScreenBank_B() {
  const D = _D();
  const [bnkFilter, setBnkFilter] = React.useState('all');
  const banks = D.bankUsage;
  const totalLimit = banks.reduce((s, b) => s + b.total, 0);
  const totalUsed  = banks.reduce((s, b) => s + b.used, 0);
  const totalFree  = totalLimit - totalUsed;
  const totalPct   = (totalUsed / totalLimit) * 100;
  const totalLcs   = banks.reduce((s, b) => s + b.lcs, 0);
  const avgRate    = banks.reduce((s, b) => s + b.rate * b.total, 0) / totalLimit;

  const filtered = banks.filter(b => bnkFilter === 'all' || b.type === bnkFilter);

  const lcMaturity = D.lcs.filter(l => l.status !== 'closed').map(l => ({
    no: l.no, bank: D.bankBy[l.bank].bank.replace('은행','').replace('KEB',''),
    amt: '$' + l.usd.toFixed(2) + 'M',
    d: D.daysFrom(l.maturity),
  })).filter(l => l.d >= 0).sort((a, b) => a.d - b.d).slice(0, 5);

  const usedSegments = banks.filter(b => b.used > 0).map(b => ({
    pct: (b.used / totalLimit) * 100,
    color: b.type === 'main' ? 'var(--solar-3)' : b.type === 'sub' ? 'var(--info)' : 'var(--warn)',
    label: b.bank,
  }));

  const rightRail = (
    <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="총 한도 사용률" count="14:42 KST">
        <div className="bignum" style={{ fontSize: 32, color: 'var(--solar-3)' }}>{totalPct.toFixed(1)}<span style={{ fontSize: 14, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>%</span></div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>${totalUsed.toFixed(2)}M / ${totalLimit.toFixed(2)}M · {totalLcs}건 진행</div>
        <div style={{ marginTop: 12, height: 6, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
          {usedSegments.map((s, i) => <div key={i} style={{ width: `${s.pct}%`, background: s.color }} title={s.label} />)}
          <div style={{ flex: 1, background: 'var(--bg-2)' }} />
        </div>
      </RailBlock>

      <RailBlock title="만기 임박" count={`${lcMaturity.length}건`}>
        {lcMaturity.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--line)' : 'none', fontSize: 11.5, alignItems: 'center' }}>
            <span className="mono tnum" style={{ color: r.d <= 7 ? 'var(--neg)' : 'var(--ink-3)', fontWeight: 600, minWidth: 38 }}>D−{r.d}</span>
            <span className="mono" style={{ flex: 1, color: 'var(--ink-2)' }}>{r.no}</span>
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{r.bank}</span>
            <span className="mono tnum" style={{ fontWeight: 600, minWidth: 56, textAlign: 'right' }}>{r.amt}</span>
          </div>
        ))}
      </RailBlock>

      <RailBlock title="한도 협의 메모" last>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          하나 한도 <strong>$2M 증액</strong> 협의 중 (5월 갱신).
          국민 한도 활성화는 8월 이후 권장.
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 6 }}>박지훈 · 04-22</div>
      </RailBlock>
    </aside>
  );

  return (
    <ShellB
      active="bnk"
      title="L/C 한도 현황"
      breadcrumb="현황 / 은행 한도"
      rightRail={rightRail}
      actions={
        <>
          <button className="btn"><I.Download size={13} />여신 리포트</button>
          <button className="btn primary"><I.Plus size={13} />한도 협의 등록</button>
        </>
      }
    >
      <div className="dark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <TileB lbl="총 한도"      v={totalLimit.toFixed(2)} u="M$" sub={`${banks.length}개 은행`} tone="ink" />
          <TileB lbl="사용중"       v={totalUsed.toFixed(2)} u="M$" sub={`${totalLcs}건 · ${totalPct.toFixed(1)}%`} tone="warn" delta={`+${(totalUsed*0.07).toFixed(2)}M`} spark={[6.8,7.0,7.2,7.4,7.6,7.8,8.0,8.1,8.2,8.3,8.4,totalUsed]} />
          <TileB lbl="가용"         v={totalFree.toFixed(2)} u="M$" sub="추가 개설 가능" tone="solar" />
          <TileB lbl="평균 적용금리" v={avgRate.toFixed(2)} u="%" sub="USD · 한도 가중평균" tone="info" />
        </div>

        <div style={{ height: 12 }} />

        <CardB
          title="은행별 한도"
          sub={`총 ${filtered.length}개 은행 · 단위 M$`}
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FilterChips
                value={bnkFilter}
                onChange={setBnkFilter}
                options={[
                  { key: 'all',     label: '전체',   count: banks.length },
                  { key: 'main',    label: '주거래', count: banks.filter(b=>b.type==='main').length },
                  { key: 'sub',     label: '부거래', count: banks.filter(b=>b.type==='sub').length },
                  { key: 'standby', label: '대기',   count: banks.filter(b=>b.type==='standby').length },
                ]}
              />
              <div className="vr" style={{ height: 16 }} />
              <FilterButton items={[
                { label: '계약만기', options: ['전체','3개월 이내','6개월 이내','1년 이내'] },
                { label: '금리',     options: ['전체','4.5% 미만','4.5–5.0%','5.0% 이상'] },
              ]} />
            </div>
          }
        >
          <table className="grid">
            <thead>
              <tr>
                <th>은행</th>
                <th>지점 · 담당자</th>
                <th className="num">한도</th>
                <th className="num">사용중</th>
                <th className="num">가용</th>
                <th>사용률</th>
                <th className="num">건수</th>
                <th className="num">금리</th>
                <th>계약 만기</th>
                <th>구분</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => {
                const pct = (b.used / b.total) * 100;
                const free = b.total - b.used;
                const tone = pct > 80 ? 'var(--neg)' : pct > 60 ? 'var(--warn)' : pct > 0 ? 'var(--solar-3)' : 'var(--ink-3)';
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{b.bank}</td>
                    <td>
                      <div style={{ fontSize: 12 }}>{b.contact}</div>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{b.officer}</div>
                    </td>
                    <td className="num mono tnum" style={{ fontWeight: 600 }}>{b.total.toFixed(2)}</td>
                    <td className="num mono tnum" style={{ color: tone, fontWeight: 600 }}>{b.used.toFixed(2)}</td>
                    <td className="num mono tnum" style={{ color: free > 0 ? 'var(--pos)' : 'var(--ink-4)' }}>{free.toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: tone }} />
                        </div>
                        <span className="mono tnum" style={{ fontSize: 10.5, color: tone, fontWeight: 600, minWidth: 38, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="num mono tnum">{b.lcs}</td>
                    <td className="num mono tnum">{b.rate.toFixed(2)}%</td>
                    <td className="mono">{b.contract}</td>
                    <td>
                      <span className="mono" style={{
                        fontSize: 9.5, padding: '2px 7px', borderRadius: 2, fontWeight: 600,
                        background: b.type === 'main' ? 'rgba(245,184,0,0.18)' : b.type === 'sub' ? 'rgba(31,95,135,0.16)' : 'var(--bg-2)',
                        color:      b.type === 'main' ? 'var(--solar-3)'      : b.type === 'sub' ? 'var(--info)'         : 'var(--ink-3)',
                      }}>{b.type === 'main' ? '주거래' : b.type === 'sub' ? '부거래' : '대기'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardB>
      </div>
    </ShellB>
  );
}

// ════════════════════════════════════════════════════════════
// 10. 매출 분석 — ScreenAna_B
// ════════════════════════════════════════════════════════════
function ScreenAna_B() {
  const D = _D();
  const [period, setPeriod] = React.useState('mtd');
  const m = D.monthly[D.monthly.length - 1];
  const target = D.target202604;
  const achievement = (m.rev / target) * 100;
  const remain = target - m.rev;
  const gp = m.rev - m.cogs;
  const gpPct = (gp / m.rev) * 100;

  const totalRev = D.revByCustomer.reduce((s, c) => s + c.rev, 0);
  // 거래처별 비중
  const custWithPct = D.revByCustomer.map(c => ({ ...c, pct: (c.rev / totalRev) * 100 }));

  const totalRevByMfg = D.revByMfg.reduce((s, x) => s + x.rev, 0);
  const mfgWithPct = D.revByMfg.map(x => ({ ...x, pct: (x.rev / totalRevByMfg) * 100 }));

  const rightRail = (
    <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="목표 달성률" count="2026 4월">
        <div className="bignum" style={{ fontSize: 30, color: 'var(--solar-3)' }}>{achievement.toFixed(1)}<span style={{ fontSize: 14, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>%</span></div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{m.rev.toFixed(1)}억 / {target.toFixed(1)}억 · D-4 잔여 {remain.toFixed(1)}억</div>
        <div style={{ marginTop: 12, position: 'relative', height: 8, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${achievement}%`, height: '100%', background: 'var(--solar-3)' }} />
          <div style={{ position: 'absolute', left: `${achievement}%`, top: -3, bottom: -3, width: 2, background: 'var(--ink)' }} />
        </div>
      </RailBlock>

      <RailBlock title="상위 거래처" count="MTD">
        {custWithPct.slice(0, 5).map((r, i) => (
          <div key={i} style={{ padding: '6px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{r.name}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span className="mono tnum" style={{ fontSize: 11, fontWeight: 600 }}>{r.rev.toFixed(1)}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', minWidth: 28, textAlign: 'right' }}>{r.pct.toFixed(0)}%</span>
              </span>
            </div>
            <div style={{ height: 3, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${r.pct}%`, height: '100%', background: i === 0 ? 'var(--solar-3)' : 'var(--ink-3)' }} />
            </div>
          </div>
        ))}
      </RailBlock>

      <RailBlock title="평균 마진" count="MTD" last>
        <div className="bignum" style={{ fontSize: 24 }}>{gpPct.toFixed(1)}<span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>%</span></div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--neg)', marginTop: 2 }}>−0.8%p vs 전월</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.55 }}>
          단가 하락(−5.7%) 대비<br />판가 조정 시차 발생.
        </div>
      </RailBlock>
    </aside>
  );

  return (
    <ShellB
      active="an"
      title="매출 분석"
      breadcrumb="현황 / 매출 분석"
      rightRail={rightRail}
      actions={
        <>
          <button className="btn"><I.Download size={13} />엑셀 내보내기</button>
          <button className="btn primary"><I.Mail size={13} />임원 리포트</button>
        </>
      }
    >
      <div className="dark-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <FilterChips
            value={period}
            onChange={setPeriod}
            options={[
              { key: 'mtd', label: 'MTD' },
              { key: 'qtd', label: 'QTD' },
              { key: 'ytd', label: 'YTD' },
              { key: 't12', label: '최근 12개월' },
            ]}
          />
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.04em' }}>
            2026-04-01 ~ 2026-04-26 · 26 영업일
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <TileB lbl="매출"       v={m.rev.toFixed(1)}  u="억"  sub={`목표 ${target.toFixed(0)}억 · ${achievement.toFixed(1)}%`} tone="solar" delta="+18.2%" spark={[18,22,25,28,30,33,35,37,39,41,42,m.rev]} />
          <TileB lbl="매출원가"   v={m.cogs.toFixed(1)} u="억"  sub="원자재 + 운임"     tone="ink"   delta="+19.4%" />
          <TileB lbl="매출총이익" v={gp.toFixed(2)}     u="억"  sub={`GP · ${gpPct.toFixed(1)}%`} tone="pos"   delta="−0.8%p" />
          <TileB lbl="kW 단가"    v="385" u="원/W" sub="평균 판가 · −2.1%" tone="warn"  delta="−2.1%" spark={[412,408,405,402,400,398,395,392,390,388,386,385]} />
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
          <CardB title="월별 매출 · 매입 · 마진" sub="2026 · 단위 억원" padded>
            <RevExpenseChart />
          </CardB>

          <CardB title="제조사별 판매 비중" sub="MTD" padded>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mfgWithPct.map((r, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{r.name}</span>
                    <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span className="mono tnum" style={{ fontSize: 11.5, fontWeight: 600 }}>{r.rev.toFixed(1)}억</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', minWidth: 32, textAlign: 'right' }}>{r.pct.toFixed(0)}%</span>
                      <span className="mono tnum" style={{ fontSize: 10.5, color: r.gp > 11 ? 'var(--pos)' : 'var(--warn)', minWidth: 56, textAlign: 'right', fontWeight: 600 }}>GP {r.gp.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${r.pct}%`, height: '100%', background: i === 0 ? 'var(--solar-3)' : 'var(--ink-3)' }} />
                  </div>
                </div>
              ))}
            </div>
          </CardB>
        </div>

        <div style={{ height: 12 }} />

        <CardB title="거래처별 매출" sub={`MTD · 상위 ${custWithPct.length}개사`}>
          <table className="grid">
            <thead>
              <tr>
                <th>거래처</th>
                <th>주요 품목</th>
                <th className="num">건수</th>
                <th className="num">수량</th>
                <th className="num">매출</th>
                <th className="num">GP%</th>
                <th>비중</th>
              </tr>
            </thead>
            <tbody>
              {custWithPct.map((r, i) => {
                // 주요 품목: 해당 거래처의 첫 SO sku
                const so = D.sos.find(s => s.cust === r.code);
                const sku = so ? so.sku : '—';
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td className="mono">{sku}</td>
                    <td className="num mono tnum">{r.n}</td>
                    <td className="num mono tnum">{r.qty.toLocaleString()}</td>
                    <td className="num mono tnum" style={{ fontWeight: 600 }}>{r.rev.toFixed(2)}억</td>
                    <td className="num mono tnum" style={{ color: r.gp > 11 ? 'var(--pos)' : r.gp > 9 ? 'var(--ink-2)' : 'var(--warn)', fontWeight: 600 }}>{r.gp.toFixed(1)}%</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden', maxWidth: 120 }}>
                          <div style={{ width: `${r.pct}%`, height: '100%', background: i === 0 ? 'var(--solar-3)' : 'var(--ink-3)' }} />
                        </div>
                        <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-3)', minWidth: 36, textAlign: 'right' }}>{r.pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardB>
      </div>
    </ShellB>
  );
}

window.ScreenDash_B  = ScreenDash_B;
window.ScreenOB_B    = ScreenOB_B;
window.ScreenAR_B    = ScreenAR_B;
window.ScreenBank_B  = ScreenBank_B;
window.ScreenAna_B   = ScreenAna_B;
