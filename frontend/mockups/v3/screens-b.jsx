// SolarFlow 3.0 — B 화면군 (가용재고 · P/O · L/C · B/L · 수주)
// 모두 ShellB 사용. 공통 토큰: TileB, CardB, RailBlock, RailRow.
/* global React, I, ShellB, Sparkline, Bars */

// ════════════════════════════════════════════════════════════
// 공통 빌딩 블록
// ════════════════════════════════════════════════════════════

function TileB({ lbl, v, u, sub, tone, spark, delta }) {
  const c =
    tone === 'solar' ? 'var(--solar-2)' :
    tone === 'warn'  ? 'var(--warn)' :
    tone === 'info'  ? 'var(--info)' :
    tone === 'pos'   ? 'var(--pos)' :
    tone === 'neg'   ? 'var(--neg)' : 'var(--ink-3)';
  return (
    <div className="card" style={{ padding: '12px 14px 14px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="dot" style={{ background: c }} />
        <span className="eyebrow">{lbl}</span>
        {delta && <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: delta.startsWith('-') || delta.startsWith('−') ? 'var(--neg)' : 'var(--pos)', fontWeight: 600 }}>{delta}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
        <span className="bignum" style={{ fontSize: 26 }}>{v}</span>
        {u && <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>{u}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{sub}</div>
      {spark && (
        <div style={{ position: 'absolute', right: 10, bottom: 10, opacity: 0.6 }}>
          <Sparkline data={spark} w={64} h={20} color={c} area />
        </div>
      )}
    </div>
  );
}

function CardB({ title, sub, right, children, padded = false, flex }) {
  return (
    <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', flex }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--line)', gap: 12, minHeight: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.005em' }}>{title}</span>
          {sub && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{sub}</span>}
        </div>
        <div style={{ flex: 1 }} />
        {right}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: padded ? 14 : 0, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function RailBlock({ title, accent, count, children, last }) {
  return (
    <div style={{ padding: '14px 14px', borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="eyebrow">{title}</span>
        {count != null && <span className="mono tnum" style={{ fontSize: 10.5, color: accent || 'var(--ink-3)', fontWeight: 600 }}>{count}</span>}
      </div>
      {children}
    </div>
  );
}

// 통합 필터 버튼 — 단일 [필터 ⚲] 버튼을 누르면 모든 필터가 패널에서 펼쳐짐.
// items: [{ label, options: ['전체', ...] }]
function FilterButton({ items }) {
  const [open, setOpen] = React.useState(false);
  // 각 필터의 선택 인덱스 (0 = 전체)
  const [vals, setVals] = React.useState(() => items.map(() => 0));
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const activeCount = vals.filter((v) => v !== 0).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 28, padding: '0 10px',
          background: activeCount > 0 ? 'var(--bg-2)' : 'var(--surface)',
          border: '1px solid ' + (open ? 'var(--solar-3)' : 'var(--line)'),
          borderRadius: 4,
          fontFamily: 'inherit',
          fontSize: 11.5, fontWeight: 600,
          color: 'var(--ink)',
          cursor: 'pointer',
          letterSpacing: '-0.005em',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" style={{ color: 'var(--ink-3)' }}>
          <path d="M2 3 H12 L8.5 7.5 V11.5 L5.5 12.5 V7.5 Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <span>필터</span>
        {activeCount > 0 && (
          <span className="mono tnum" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 16, height: 16, padding: '0 4px',
            background: 'var(--solar-3)', color: '#fff',
            borderRadius: 8, fontSize: 9.5, fontWeight: 700,
          }}>{activeCount}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30,
          width: 280, background: 'var(--surface)',
          border: '1px solid var(--line)', borderRadius: 6,
          boxShadow: '0 12px 32px rgba(28,25,23,0.12), 0 2px 6px rgba(28,25,23,0.06)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderBottom: '1px solid var(--line)',
          }}>
            <span className="eyebrow" style={{ color: 'var(--ink-2)' }}>필터 · {items.length}</span>
            <button
              onClick={() => setVals(items.map(() => 0))}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--ink-3)', fontFamily: 'inherit',
                fontSize: 11, padding: 0,
              }}
            >초기화</button>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.map((it, i) => (
              <div key={i}>
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600, marginBottom: 6, letterSpacing: '-0.005em' }}>{it.label}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {it.options.map((o, j) => {
                    const active = vals[i] === j;
                    return (
                      <button
                        key={j}
                        onClick={() => setVals((vs) => vs.map((v, k) => k === i ? j : v))}
                        style={{
                          padding: '4px 9px',
                          background: active ? 'var(--ink)' : 'var(--bg-2)',
                          border: '1px solid ' + (active ? 'var(--ink)' : 'var(--line)'),
                          borderRadius: 3,
                          fontFamily: 'inherit',
                          fontSize: 11,
                          fontWeight: active ? 600 : 500,
                          color: active ? '#fff' : 'var(--ink-2)',
                          cursor: 'pointer',
                          letterSpacing: '-0.005em',
                        }}
                      >{o}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '8px 14px', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: '6px 12px', background: 'var(--ink)', color: '#fff',
                border: 'none', borderRadius: 3,
                fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer', letterSpacing: '-0.005em',
              }}
            >적용</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 공통 드롭다운 필터 — 클릭하면 메뉴가 떨어짐. 적용 시 라벨 갱신.
function DropFilter({ label, options }) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(0); // 0 = 전체
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isAll = selected === 0;
  const display = isAll ? `전 ${label}` : options[selected];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 26, padding: '0 9px',
          background: isAll ? 'var(--surface)' : 'var(--bg-2)',
          border: '1px solid ' + (open ? 'var(--solar-3)' : 'var(--line)'),
          borderRadius: 4,
          fontFamily: 'inherit',
          fontSize: 11.5,
          fontWeight: isAll ? 500 : 600,
          color: isAll ? 'var(--ink-2)' : 'var(--ink)',
          cursor: 'pointer',
          letterSpacing: '-0.005em',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: 'var(--ink-4)', fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--line-2)' }}>·</span>
        <span>{isAll ? '전체' : options[selected]}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" style={{ marginLeft: 2, color: 'var(--ink-4)' }}>
          <path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 20,
          minWidth: 160, background: 'var(--surface)',
          border: '1px solid var(--line)', borderRadius: 4,
          boxShadow: '0 8px 24px rgba(28,25,23,0.10), 0 2px 4px rgba(28,25,23,0.06)',
          padding: 4,
          maxHeight: 280, overflowY: 'auto',
        }}>
          {options.map((o, i) => {
            const active = i === selected;
            return (
              <button
                key={i}
                onClick={() => { setSelected(i); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                  padding: '6px 10px',
                  background: active ? 'var(--bg-2)' : 'transparent',
                  border: 'none', borderRadius: 3,
                  fontFamily: 'inherit', fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--ink)' : 'var(--ink-2)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>{i === 0 ? '전체' : o}</span>
                {active && (
                  <svg width="11" height="11" viewBox="0 0 12 12" style={{ color: 'var(--solar-3)' }}>
                    <path d="M2.5 6 L5 8.5 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 공통 필터칩 — 카드 헤더용. options: [{key, label, count}]
function FilterChips({ options, value, onChange }) {
  return (
    <div className="tabs" style={{ border: 'none' }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            className={'tab' + (active ? ' active' : '')}
            onClick={() => onChange && onChange(o.key)}
            style={{ padding: '5px 10px' }}
          >
            {o.label}
            {o.count != null && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginLeft: 5 }}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 1. 가용재고 — ScreenInv_B (메인 진입 화면)
// ════════════════════════════════════════════════════════════
function ScreenInv_B() {
  const D = window.SF_DATA;
  const [tab, setTab] = React.useState('avail');

  const rightRail = (
    <aside className="dark-scroll" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="시장 시세" count="14:42 KST">
        {[
          { l: 'USD/KRW', v: '1,773.4', d: '+0.06%', up: true },
          { l: 'CNY/KRW', v: '244.18',  d: '−0.12%', up: false },
          { l: 'JKO 주가',v: '$28.84',  d: '−1.42%', up: false },
          { l: '폴리실리콘 ¥/kg', v: '34.20', d: '+0.40%', up: true },
        ].map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', fontSize: 11.5 }}>
            <span style={{ color: 'var(--ink-2)' }}>{m.l}</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span className="mono tnum" style={{ fontWeight: 500 }}>{m.v}</span>
              <span className="mono tnum" style={{ fontSize: 10, color: m.up ? 'var(--pos)' : 'var(--neg)', minWidth: 50, textAlign: 'right' }}>{m.d}</span>
            </div>
          </div>
        ))}
      </RailBlock>

      <RailBlock title="운송 중 선박" count="4" accent="var(--solar-3)">
        {D.incoming.map((v, i) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: i < D.incoming.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>{v.mfg}</span>
              <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--solar-3)', fontWeight: 600 }}>입항 {v.eta}</span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{v.bl}</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{v.qty.toLocaleString()}장 · {(v.kw / 1000).toFixed(2)} MW</div>
          </div>
        ))}
      </RailBlock>

      <RailBlock title="최근 예약" count={D.allocations.length} last>
        {D.allocations.slice(0, 6).map((a, i) => (
          <div key={i} style={{ padding: '7px 0', borderBottom: i < 5 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{a.id}</span>
              <span className={'pill ' + (a.status === 'hold' ? 'info' : 'warn')}>{a.status === 'hold' ? '보류' : '대기'}</span>
            </div>
            <div style={{ marginTop: 2, color: 'var(--ink-2)', fontSize: 12 }}>{a.customer}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{a.product} · {a.qty.toLocaleString()}장</div>
          </div>
        ))}
      </RailBlock>
    </aside>
  );

  return (
    <ShellB
      active="inv"
      title="가용재고"
      breadcrumb="홈 / 재고"
      actions={<>
        <button className="btn xs ghost"><I.Filter size={12} /> 필터</button>
        <button className="btn xs solar"><I.Plus size={12} /> 빠른 등록</button>
      </>}
      rightRail={rightRail}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          <TileB lbl="가용"      v="76.42" u="MW" sub="134,200장 · 6개 창고" tone="solar" delta="+2.4%" spark={[62,64,66,68,71,72,73,74,75,76,76,76]} />
          <TileB lbl="실재고"    v="89.22" u="MW" sub="156,400장"            tone="ink"   spark={[82,83,85,84,86,87,88,87,88,89,89,89]} />
          <TileB lbl="미착품"    v="18.37" u="MW" sub="운송 중 4척 · 30,600장" tone="info"  spark={[22,21,19,18,16,14,18,18,18,18,18,18]} />
          <TileB lbl="예약 차감" v="14.82" u="MW" sub="28건 · 6건 보류"      tone="warn"  delta="+1.2%" spark={[10,11,12,11,12,13,14,14,14,14,15,15]} />
        </div>

        {/* Inventory table */}
        <CardB
          title="재고 현황"
          sub="제조사 × 품번 · 단위 MW"
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FilterChips
                value={tab}
                onChange={setTab}
                options={[
                  { key: 'avail',     label: '가용',      count: 10 },
                  { key: 'physical',  label: '실재고',    count: 10 },
                  { key: 'incoming',  label: '미착',      count: 4 },
                  { key: 'forecast',  label: '수급 전망' },
                ]}
              />
              <div className="vr" style={{ height: 16 }} />
              <FilterButton items={[
                { label: '제조사', options: ['전체','JinkoSolar','LONGi','Trina','JA Solar','Canadian Solar'] },
                { label: '규격',   options: ['전체','620W','610W','600W','590W'] },
                { label: '창고',   options: ['전체','인천 1창고','인천 2창고','평택창고','부산창고'] },
              ]} />
            </div>
          }
        >
          <table className="grid">
            <thead>
              <tr>
                <th>제조사</th>
                <th>품번</th>
                <th>규격</th>
                <th className="num">가용 (MW)</th>
                <th className="num">실재고</th>
                <th className="num">미착</th>
                <th className="num">예약</th>
                <th>충당률</th>
                <th className="num">단가 ₩/Wp</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {D.products.map(p => {
                const mfg = D.manufacturers.find(m => m.code === p.mfg);
                const trend = D.priceTrend[p.mfg] || D.priceTrend.JKO;
                const cur = trend[trend.length - 1];
                const ratio = p.phys > 0 ? (p.avail / p.phys * 100) : 0;
                const availMW  = (p.avail * p.wp / 1000000);
                const physMW   = (p.phys * p.wp / 1000000);
                const incMW    = (p.inc   * p.wp / 1000000);
                const allocMW  = (p.alloc * p.wp / 1000000);
                return (
                  <tr key={p.code} className="zebra">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11 }}>{mfg.country}</span>
                        <span style={{ fontWeight: 500 }}>{mfg.name}</span>
                      </div>
                    </td>
                    <td><span className="mono" style={{ fontSize: 11.5, fontWeight: 500 }}>{p.code}</span></td>
                    <td className="mono" style={{ fontSize: 11 }}>{p.wp}Wp</td>
                    <td className="num strong" style={{ color: availMW === 0 ? 'var(--neg)' : 'var(--ink)' }}>{availMW.toFixed(2)}</td>
                    <td className="num">{physMW.toFixed(2)}</td>
                    <td className="num" style={{ color: incMW > 0 ? 'var(--info)' : 'var(--ink-4)' }}>{incMW > 0 ? incMW.toFixed(2) : '—'}</td>
                    <td className="num" style={{ color: allocMW > 0 ? 'var(--warn)' : 'var(--ink-4)' }}>{allocMW > 0 ? allocMW.toFixed(2) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 64, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, ratio)}%`, height: '100%', background: ratio === 0 ? 'var(--neg)' : ratio < 40 ? 'var(--warn)' : 'var(--solar-2)' }} />
                        </div>
                        <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-3)', minWidth: 28, textAlign: 'right' }}>{Math.round(ratio)}%</span>
                      </div>
                    </td>
                    <td className="num"><span className="mono">{cur}</span></td>
                    <td><button className="btn xs">예약</button></td>
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
// 2. P/O 발주
// ════════════════════════════════════════════════════════════
function ScreenPO_B() {
  const [poFilter, setPoFilter] = React.useState('all');
  const rows = [
    { id: 'PO-26-0042', mfg: 'JinkoSolar',     sku: 'JKO-N620',  qty: 8800,  kw: 5456, unit: 0.244, total: 1331584, dlvr: '2026-05-18', status: 'in_lc',   stage: 4 },
    { id: 'PO-26-0041', mfg: 'Trina Solar',    sku: 'TRN-V605',  qty: 5200,  kw: 3146, unit: 0.249, total: 783354,  dlvr: '2026-05-22', status: 'in_lc',   stage: 3 },
    { id: 'PO-26-0040', mfg: 'JA Solar',       sku: 'JAS-DH580', qty: 4400,  kw: 2552, unit: 0.241, total: 615032,  dlvr: '2026-06-04', status: 'lc_open', stage: 2 },
    { id: 'PO-26-0039', mfg: 'JinkoSolar',     sku: 'JKO-N620',  qty: 12200, kw: 7564, unit: 0.243, total: 1838052, dlvr: '2026-06-12', status: 'lc_open', stage: 2 },
    { id: 'PO-26-0038', mfg: 'LONGi',          sku: 'LON-X600',  qty: 6000,  kw: 3600, unit: 0.247, total: 889200,  dlvr: '2026-06-22', status: 'draft',   stage: 1 },
    { id: 'PO-26-0037', mfg: 'JinkoSolar',     sku: 'JKO-N580',  qty: 4800,  kw: 2784, unit: 0.245, total: 682080,  dlvr: '2026-07-02', status: 'draft',   stage: 1 },
    { id: 'PO-26-0036', mfg: 'Canadian Solar', sku: 'CSI-T715',  qty: 2800,  kw: 2002, unit: 0.252, total: 504504,  dlvr: '2026-05-30', status: 'in_lc',   stage: 3 },
    { id: 'PO-26-0035', mfg: 'JA Solar',       sku: 'JAS-N610',  qty: 3200,  kw: 1952, unit: 0.247, total: 482144,  dlvr: '2026-06-15', status: 'received',stage: 5 },
  ];
  const stages = ['작성', '결재', 'L/C', '선적', '통관', '입고'];
  const statusPill = s =>
    s === 'draft'    ? <span className="pill ghost">작성</span> :
    s === 'lc_open'  ? <span className="pill solar">L/C</span> :
    s === 'in_lc'    ? <span className="pill info">운송중</span> :
                       <span className="pill pos">입고완료</span>;

  const rightRail = (
    <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="선택 항목" count="PO-26-0042">
        <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.005em' }}>JinkoSolar</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>JKO-N620 · 8,800 ea · 5,456 kW</div>
        <div className="bignum" style={{ fontSize: 22, marginTop: 8, color: 'var(--solar-3)' }}>$1,331,584</div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[['인코텀즈', 'CIF Incheon'], ['L/C', 'LC-26-0405'], ['B/L', 'BL-26-0412'], ['입항', 'D-1 (04-27)']].map(([k, v], i) => (
            <div key={i}>
              <div className="eyebrow">{k}</div>
              <div style={{ marginTop: 2, color: 'var(--ink-2)', fontSize: 12, fontFamily: i >= 1 ? 'var(--mono)' : 'inherit' }}>{v}</div>
            </div>
          ))}
        </div>
      </RailBlock>

      <RailBlock title="진행 이력">
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 4, top: 4, bottom: 4, width: 1, background: 'var(--line-2)' }} />
          {[
            ['04-08', 'P/O 발행', '박지훈', 'done'],
            ['04-12', '내부 결재', '대표이사', 'done'],
            ['04-15', 'L/C 개설', 'LC-26-0405', 'done'],
            ['04-21', 'B/L 수령', 'BL-26-0412', 'done'],
            ['04-26', '면장 진행', '인천세관', 'cur'],
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', position: 'relative', paddingLeft: 14 }}>
              <span className="dot" style={{
                background: r[3] === 'cur' ? 'var(--solar-2)' : 'var(--pos)',
                position: 'absolute', left: 1, top: 9,
                boxShadow: r[3] === 'cur' ? '0 0 0 3px rgba(245,184,0,0.18)' : 'none',
              }} />
              <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-3)', minWidth: 36 }}>{r[0]}</span>
              <div style={{ flex: 1, fontSize: 11.5 }}>
                <div style={{ color: 'var(--ink-2)' }}>{r[1]}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{r[2]}</div>
              </div>
            </div>
          ))}
        </div>
      </RailBlock>

      <RailBlock title="JKO · 12주 단가" last>
        <Sparkline data={[418, 416, 412, 408, 406, 402, 400, 398, 394, 392, 388, 384]} w={210} h={42} color="var(--solar-2)" area />
        <div className="mono tnum" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>현재 <span style={{ color: 'var(--ink)', fontWeight: 600 }}>384</span> ₩/Wp</span>
          <span style={{ color: 'var(--neg)', fontWeight: 600 }}>−8.1%</span>
        </div>
      </RailBlock>
    </aside>
  );

  return (
    <ShellB
      active="po"
      title="P/O 발주 관리"
      breadcrumb="홈 / 구매 / P/O"
      actions={<>
        <button className="btn xs ghost">내보내기</button>
        <button className="btn xs solar"><I.Plus size={12} /> 신규 P/O</button>
      </>}
      rightRail={rightRail}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          <TileB lbl="진행 P/O"      v="8"    u="건" sub="36.6 MW · $7.13M"  tone="solar" />
          <TileB lbl="L/C 개설"      v="4"    u="건" sub="$3.32M"            tone="info"  spark={[2,2,3,3,3,4,4,4,4,4,4,4]} />
          <TileB lbl="운송중"        v="3"    u="건" sub="15.5 MW · D-1~12"   tone="warn" />
          <TileB lbl="평균 리드타임" v="38.4" u="일" sub="JKO 32 · TRN 41"   tone="pos"   delta="−2.1d" spark={[44,43,42,41,40,40,39,39,38,38,38,38]} />
        </div>

        <CardB
          title="발주서"
          sub="활성 8건 · 마지막 업데이트 14:42"
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FilterChips
                value={poFilter}
                onChange={setPoFilter}
                options={[
                  { key: 'all',     label: '전체',     count: 8 },
                  { key: 'active',  label: '진행중',   count: 5 },
                  { key: 'done',    label: '입고완료', count: 1 },
                  { key: 'cancel',  label: '취소',     count: 0 },
                ]}
              />
              <div className="vr" style={{ height: 16 }} />
              <FilterButton items={[
                { label: '제조사', options: ['전체','JinkoSolar','LONGi','Trina','JA Solar'] },
                { label: '단계',   options: ['전체','발주','L/C 개설','선적','통관','입고'] },
                { label: '납기',   options: ['전체','이번주','다음주','이번달','지연'] },
              ]} />
            </div>
          }
        >
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" /></th>
                <th>P/O 번호</th>
                <th>제조사 · 품번</th>
                <th className="num">수량</th>
                <th className="num">kW</th>
                <th className="num">$/Wp</th>
                <th className="num">금액 USD</th>
                <th>진행 단계</th>
                <th>납기</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="zebra">
                  <td><input type="checkbox" /></td>
                  <td><span className="mono strong" style={{ fontSize: 11.5, fontWeight: 600 }}>{r.id}</span></td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{r.mfg}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{r.sku}</span>
                    </div>
                  </td>
                  <td className="num">{r.qty.toLocaleString()}</td>
                  <td className="num strong">{r.kw.toLocaleString()}</td>
                  <td className="num">{r.unit.toFixed(3)}</td>
                  <td className="num strong">{r.total.toLocaleString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, alignItems: 'center', minWidth: 170 }}>
                      {stages.map((s, i) => (
                        <div key={i} title={s} style={{
                          flex: 1, height: 4, minWidth: 10,
                          background: i < r.stage
                            ? (i === r.stage - 1 ? 'var(--solar-2)' : 'var(--solar)')
                            : 'var(--line)',
                          borderRadius: 1,
                        }} />
                      ))}
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 6, minWidth: 42 }}>{stages[r.stage - 1]}</span>
                    </div>
                  </td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{r.dlvr}</span></td>
                  <td>{statusPill(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardB>
      </div>
    </ShellB>
  );
}

// ════════════════════════════════════════════════════════════
// 3. L/C 개설 · 한도 관리
// ════════════════════════════════════════════════════════════
function ScreenLC_B() {
  const [lcFilter, setLcFilter] = React.useState('all');
  const lcs = [
    { id: 'LC-26-0405', bank: '하나은행',  bnf: 'JinkoSolar Co Ltd', amt: 1331584, exp: '2026-05-30', util: 100, status: 'utilized', d: -3 },
    { id: 'LC-26-0412', bank: '하나은행',  bnf: 'JinkoSolar Co Ltd', amt: 1838052, exp: '2026-07-12', util: 0,   status: 'open' },
    { id: 'LC-26-0408', bank: '신한은행',  bnf: 'Trina Solar',       amt: 783354,  exp: '2026-06-22', util: 60,  status: 'partial' },
    { id: 'LC-26-0411', bank: '신한은행',  bnf: 'JA Solar',          amt: 615032,  exp: '2026-07-04', util: 0,   status: 'open' },
    { id: 'LC-26-0399', bank: 'KEB하나',   bnf: 'LONGi Green',       amt: 1042000, exp: '2026-05-08', util: 100, status: 'closed',   d: -12 },
    { id: 'LC-26-0402', bank: '신한은행',  bnf: 'Canadian Solar',    amt: 504504,  exp: '2026-06-30', util: 0,   status: 'open',     d: -30 },
  ];

  const rightRail = (
    <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="은행 한도 · USD M">
        {[
          { b: '하나은행', limit: 7.5, used: 5.42, lcs: 6 },
          { b: '신한은행', limit: 4.5, used: 3.00, lcs: 5 },
        ].map((g, i) => {
          const pct = g.used / g.limit * 100;
          return (
            <div key={i} style={{ marginBottom: i === 0 ? 14 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, fontSize: 12.5 }}>{g.b}</span>
                <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 10.5 }}>{g.lcs}건</span>
              </div>
              <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct > 70 ? 'var(--solar-2)' : 'var(--solar)' }} />
              </div>
              <div className="mono tnum" style={{ fontSize: 10.5, marginTop: 4, color: 'var(--ink-3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{g.used.toFixed(2)} / {g.limit.toFixed(2)} M$</span>
                <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{Math.round(pct)}%</span>
              </div>
            </div>
          );
        })}
      </RailBlock>

      <RailBlock title="만기 30일 이내" count="4" accent="var(--neg)">
        {[
          ['LC-26-0405', 'D-3',  '$1.33M', 'neg'],
          ['LC-26-0399', 'D-12', '$1.04M', 'warn'],
          ['LC-26-0408', 'D-26', '$0.78M', 'warn'],
          ['LC-26-0402', 'D-30', '$0.50M', 'warn'],
        ].map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'baseline', padding: '7px 0', borderBottom: i < 3 ? '1px solid var(--line)' : 'none', fontSize: 11.5 }}>
            <span className="mono" style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{r[0]}</span>
            <span className="mono tnum" style={{ color: r[3] === 'neg' ? 'var(--neg)' : 'var(--warn)', fontWeight: 600, minWidth: 38, textAlign: 'right' }}>{r[1]}</span>
            <span className="mono tnum" style={{ color: 'var(--ink-3)', minWidth: 50, textAlign: 'right' }}>{r[2]}</span>
          </div>
        ))}
      </RailBlock>

      <RailBlock title="USD/KRW · 30일" last>
        <Sparkline data={[1762, 1764, 1768, 1770, 1772, 1771, 1773, 1773, 1772, 1773]} w={210} h={42} color="var(--solar-2)" area />
        <div className="mono tnum" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>현재 <span style={{ color: 'var(--ink)', fontWeight: 600 }}>1,773.4</span></span>
          <span style={{ color: 'var(--pos)', fontWeight: 600 }}>+0.6%</span>
        </div>
      </RailBlock>
    </aside>
  );

  return (
    <ShellB
      active="lc"
      title="L/C 개설 · 한도"
      breadcrumb="홈 / 구매 / L/C"
      actions={<button className="btn xs solar"><I.Plus size={12} /> L/C 개설</button>}
      rightRail={rightRail}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          <TileB lbl="총 한도"     v="12.00" u="M$" sub="하나 7.5 / 신한 4.5"   tone="ink" />
          <TileB lbl="사용중"      v="8.42"  u="M$" sub="11건 진행"              tone="warn"  delta="70.2%" spark={[5,6,6,7,7,8,8,8,8,8,8,8]} />
          <TileB lbl="가용 한도"   v="3.58"  u="M$" sub="추가 개설 가능"        tone="solar" />
          <TileB lbl="만기 30일내" v="4"     u="건" sub="$4.96M"                tone="neg" />
        </div>

        <CardB
          title="L/C 목록"
          sub="활성 11건"
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FilterChips
                value={lcFilter}
                onChange={setLcFilter}
                options={[
                  { key: 'all',       label: '전체',     count: 11 },
                  { key: 'utilized',  label: '활용중',   count: 8 },
                  { key: 'pending',   label: '개설대기', count: 2 },
                  { key: 'expiring',  label: '만기임박', count: 4 },
                ]}
              />
              <div className="vr" style={{ height: 16 }} />
              <FilterButton items={[
                { label: '은행', options: ['전체','하나은행','신한은행','국민은행','우리은행'] },
                { label: '통화', options: ['전체','USD','CNY','EUR'] },
              ]} />
            </div>
          }
        >
          <table className="grid">
            <thead>
              <tr>
                <th>L/C 번호</th>
                <th>은행</th>
                <th>수익자</th>
                <th className="num">금액 USD</th>
                <th>활용률</th>
                <th>만기일</th>
                <th className="num">D-day</th>
                <th>상태</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {lcs.map(l => (
                <tr key={l.id} className="zebra">
                  <td><span className="mono strong" style={{ fontWeight: 600, fontSize: 11.5 }}>{l.id}</span></td>
                  <td>{l.bank}</td>
                  <td>{l.bnf}</td>
                  <td className="num strong">{l.amt.toLocaleString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 130 }}>
                      <div style={{ flex: 1, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${l.util}%`, height: '100%', background: l.util === 100 ? 'var(--ink-3)' : l.util === 0 ? 'var(--info)' : 'var(--solar-2)' }} />
                      </div>
                      <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-3)', minWidth: 28, textAlign: 'right' }}>{l.util}%</span>
                    </div>
                  </td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{l.exp}</span></td>
                  <td className="num">
                    {l.d != null
                      ? <span className="mono" style={{ color: l.d >= -7 ? 'var(--neg)' : 'var(--warn)', fontWeight: 600 }}>D{l.d}</span>
                      : <span className="dim">—</span>}
                  </td>
                  <td>
                    {l.status === 'open'      ? <span className="pill info">개설</span> :
                     l.status === 'partial'   ? <span className="pill solar">일부사용</span> :
                     l.status === 'utilized'  ? <span className="pill warn">전액사용</span> :
                                                <span className="pill ghost">종료</span>}
                  </td>
                  <td><button className="btn xs">상세</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardB>
      </div>
    </ShellB>
  );
}

// ════════════════════════════════════════════════════════════
// 4. B/L · 입고 진행
// ════════════════════════════════════════════════════════════
function ScreenBL_B() {
  const [blFilter, setBlFilter] = React.useState('all');
  const shipments = [
    { id: 'BL-26-0412', vsl: 'COSCO SHANGHAI 042E',    port: '인천', eta: '2026-04-27', d: -1,  qty: 8800,  kw: 5456, sku: 'JKO-N620',  stage: 'customs', cn: '검사 대기' },
    { id: 'BL-26-0408', vsl: 'OOCL TOKYO 1124W',        port: '평택', eta: '2026-04-29', d: -3,  qty: 5200,  kw: 3146, sku: 'TRN-V605',  stage: 'arrived', cn: '하역 중' },
    { id: 'BL-26-0405', vsl: 'EVERGREEN ETHER 088E',    port: '인천', eta: '2026-05-03', d: -7,  qty: 4400,  kw: 2552, sku: 'JAS-DH580', stage: 'sailing', cn: '항해 중' },
    { id: 'BL-26-0419', vsl: 'COSCO QINGDAO 052E',      port: '부산', eta: '2026-05-08', d: -12, qty: 12200, kw: 7564, sku: 'JKO-N620',  stage: 'sailing', cn: '항해 중' },
  ];
  const stagePill = s =>
    s === 'sailing' ? <span className="pill info">항해중</span> :
    s === 'arrived' ? <span className="pill solar">입항</span> :
    s === 'customs' ? <span className="pill warn">통관중</span> :
                      <span className="pill pos">통관완료</span>;

  const rightRail = (
    <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="창고 가용 공간">
        {[
          { w: '인천 1창고', cap: 80, used: 62 },
          { w: '인천 2창고', cap: 60, used: 28 },
          { w: '평택',       cap: 40, used: 35 },
          { w: '부산',       cap: 50, used: 18 },
          { w: '광양',       cap: 30, used: 11 },
          { w: '울산',       cap: 30, used: 24 },
        ].map((w, i, arr) => {
          const pct = w.used / w.cap * 100;
          return (
            <div key={i} style={{ marginBottom: i < arr.length - 1 ? 9 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11.5 }}>
                <span style={{ color: 'var(--ink-2)' }}>{w.w}</span>
                <span className="mono tnum" style={{ color: 'var(--ink-3)' }}>{w.used}/{w.cap} MW</span>
              </div>
              <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? 'var(--neg)' : pct > 70 ? 'var(--solar-2)' : 'var(--solar)' }} />
              </div>
            </div>
          );
        })}
      </RailBlock>

      <RailBlock title="면장 진행" last>
        {[
          ['IL-25-1204-04', 'JKO-N620 8,800 ea', '인천세관 · 검사대기', 'warn'],
          ['IL-25-1204-03', 'TRN-V605 5,200 ea', '평택세관 · 통관완료', 'pos'],
        ].map((r, i, arr) => (
          <div key={i} style={{ padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="mono strong" style={{ fontSize: 11, fontWeight: 600 }}>{r[0]}</span>
              <span className={'pill ' + r[3]}>{r[3] === 'pos' ? '완료' : '진행'}</span>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 3 }}>{r[1]}</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1 }}>{r[2]}</div>
          </div>
        ))}
      </RailBlock>
    </aside>
  );

  // Timeline geometry
  const TL_DAYS = 16; // -1 to -16
  const dayToPct = d => ((-d) / TL_DAYS) * 100;

  return (
    <ShellB
      active="bl"
      title="B/L · 입고 진행"
      breadcrumb="홈 / 구매 / B/L"
      actions={<button className="btn xs solar"><I.Plus size={12} /> B/L 등록</button>}
      rightRail={rightRail}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          <TileB lbl="운송중 물량" v="18.37" u="MW" sub="선박 4척 · 30,600장"     tone="info" />
          <TileB lbl="다음 입항"   v="D-1"   u=""   sub="COSCO 042E · 인천"        tone="solar" />
          <TileB lbl="통관중"      v="1"     u="건" sub="JKO-N620 8,800장"         tone="warn" />
          <TileB lbl="SCFI 운임"   v="1,284" u=""   sub="−2.1% 전주대비"           tone="pos" delta="−2.1%" spark={[1320,1316,1310,1306,1300,1295,1290,1289,1287,1286,1284,1284]} />
        </div>

        {/* Timeline */}
        <CardB title="입항 일정" sub="다음 16일">
          <div style={{ position: 'relative', height: 80, padding: '20px 16px 18px' }}>
            {/* baseline */}
            <div style={{ position: 'absolute', left: 16, right: 16, top: 40, height: 1, background: 'var(--line-2)' }} />
            {/* tick marks */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
              const dates = ['04-26', '04-30', '05-04', '05-08', '05-12'];
              return (
                <div key={i} style={{ position: 'absolute', left: `calc(${p} * (100% - 32px) + 16px)`, top: 36, height: 8, width: 1, background: 'var(--line-2)' }}>
                  <span className="mono" style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 9.5, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{dates[i]}</span>
                </div>
              );
            })}
            {/* shipment markers */}
            {shipments.map(s => {
              const pos = dayToPct(s.d);
              const c = s.stage === 'customs' ? 'var(--solar-2)' : s.stage === 'arrived' ? 'var(--solar)' : 'var(--info)';
              return (
                <div key={s.id} style={{ position: 'absolute', left: `calc(${pos / 100} * (100% - 32px) + 16px)`, top: 32, transform: 'translateX(-50%)' }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '2px solid var(--surface)', boxShadow: '0 0 0 1px ' + c }} />
                  <span className="mono strong" style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: 'var(--ink-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>D{s.d}</span>
                </div>
              );
            })}
          </div>
        </CardB>

        <div style={{ height: 12 }} />

        <CardB
          title="선적 목록"
          sub="총 4척"
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FilterChips
                value={blFilter}
                onChange={setBlFilter}
                options={[
                  { key: 'all',     label: '전체',   count: 4 },
                  { key: 'sailing', label: '항해중', count: 2 },
                  { key: 'arrived', label: '입항',   count: 1 },
                  { key: 'customs', label: '통관',   count: 1 },
                ]}
              />
              <div className="vr" style={{ height: 16 }} />
              <FilterButton items={[
                { label: '항구',   options: ['전체','인천','평택','부산','광양'] },
                { label: '선사',   options: ['전체','COSCO','MSC','Maersk','HMM','ONE'] },
                { label: '제조사', options: ['전체','JinkoSolar','LONGi','Trina','JA Solar'] },
              ]} />
            </div>
          }
        >
          <table className="grid">
            <thead>
              <tr>
                <th>B/L</th>
                <th>선박</th>
                <th>항구</th>
                <th>ETA</th>
                <th className="num">D-day</th>
                <th>품번</th>
                <th className="num">수량</th>
                <th className="num">kW</th>
                <th>단계</th>
                <th>면장</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(s => (
                <tr key={s.id} className="zebra">
                  <td><span className="mono strong" style={{ fontWeight: 600, fontSize: 11.5 }}>{s.id}</span></td>
                  <td><span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{s.vsl}</span></td>
                  <td>{s.port}</td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{s.eta}</span></td>
                  <td className="num"><span className="mono" style={{ color: s.d >= -3 ? 'var(--solar-3)' : 'var(--ink-3)', fontWeight: 600 }}>D{s.d}</span></td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{s.sku}</span></td>
                  <td className="num">{s.qty.toLocaleString()}</td>
                  <td className="num strong">{s.kw.toLocaleString()}</td>
                  <td>{stagePill(s.stage)}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{s.cn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardB>
      </div>
    </ShellB>
  );
}

// ════════════════════════════════════════════════════════════
// 5. 수주 관리
// ════════════════════════════════════════════════════════════
function ScreenSO_B() {
  const [soFilter, setSoFilter] = React.useState('all');
  const orders = [
    { id: 'SO-26-0218', cust: '솔라넷(주)',   sku: 'LON-X600',  qty: 1800, kw: 1080, price: 412, total: 444960000,  dlvr: '2026-05-04', status: 'confirmed', margin: 12.4 },
    { id: 'SO-26-0217', cust: '한빛에너지',   sku: 'JAS-DH580', qty: 2200, kw: 1276, price: 405, total: 516780000,  dlvr: '2026-05-06', status: 'confirmed', margin: 11.0 },
    { id: 'SO-26-0216', cust: '동방솔라',     sku: 'JKO-N620',  qty: 1400, kw: 868,  price: 398, total: 345464000,  dlvr: '2026-05-12', status: 'hold',      margin: 9.2  },
    { id: 'SO-26-0215', cust: '에이펙스EPC', sku: 'TRN-V605',  qty: 2400, kw: 1452, price: 415, total: 602580000,  dlvr: '2026-05-09', status: 'pending',   margin: 13.1 },
    { id: 'SO-26-0214', cust: '그린파워',     sku: 'JKO-N580',  qty: 1600, kw: 928,  price: 398, total: 369344000,  dlvr: '2026-05-15', status: 'hold',      margin: 8.4  },
    { id: 'SO-26-0213', cust: '솔라코리아',   sku: 'CSI-T715',  qty: 800,  kw: 572,  price: 421, total: 240812000,  dlvr: '2026-05-18', status: 'pending',   margin: 10.6 },
    { id: 'SO-26-0212', cust: '뉴썬에너지',   sku: 'LON-X600',  qty: 3200, kw: 1920, price: 410, total: 787200000,  dlvr: '2026-05-22', status: 'confirmed', margin: 12.8 },
    { id: 'SO-26-0211', cust: '한국태양광',   sku: 'JKO-N620',  qty: 5400, kw: 3348, price: 401, total: 1342548000, dlvr: '2026-05-25', status: 'pending',   margin: 11.7 },
  ];
  const statusPill = s =>
    s === 'confirmed' ? <span className="pill pos">확정</span> :
    s === 'pending'   ? <span className="pill solar">검토</span> :
                        <span className="pill warn">보류</span>;

  const rightRail = (
    <aside style={{ background: 'var(--surface)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
      <RailBlock title="주간 출고 · 다음 4주">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64, marginBottom: 6 }}>
          {[3.2, 4.8, 6.1, 4.2].map((v, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span className="mono tnum" style={{ fontSize: 10, color: 'var(--ink-2)', fontWeight: 600 }}>{v}</span>
              <div style={{ width: '100%', height: `${v / 7 * 44}px`, background: i === 1 ? 'var(--solar-2)' : 'var(--solar)', borderRadius: '2px 2px 0 0' }} />
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-4)' }}>W{18 + i}</span>
            </div>
          ))}
        </div>
        <div className="mono tnum" style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', borderTop: '1px solid var(--line)', paddingTop: 6 }}>
          합계 <span style={{ color: 'var(--ink)', fontWeight: 600 }}>18.3</span> MW · 22건
        </div>
      </RailBlock>

      <RailBlock title="거래처 TOP 5 · 월간" last>
        {[
          ['뉴썬에너지',   5120, 100],
          ['한국태양광',   3348, 65],
          ['에이펙스EPC', 2880, 56],
          ['한빛에너지',   1276, 25],
          ['솔라넷(주)',   1080, 21],
        ].map((r, i, arr) => (
          <div key={i} style={{ padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11.5 }}>
              <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{r[0]}</span>
              <span className="mono tnum" style={{ fontWeight: 600 }}>{r[1].toLocaleString()} kW</span>
            </div>
            <div style={{ height: 3, background: 'var(--line)', marginTop: 5, borderRadius: 1.5, overflow: 'hidden' }}>
              <div style={{ width: `${r[2]}%`, height: '100%', background: i === 0 ? 'var(--solar-2)' : 'var(--solar)' }} />
            </div>
          </div>
        ))}
      </RailBlock>
    </aside>
  );

  return (
    <ShellB
      active="so"
      title="수주 관리"
      breadcrumb="홈 / 판매 / S/O"
      actions={<>
        <button className="btn xs ghost">내보내기</button>
        <button className="btn xs solar"><I.Plus size={12} /> 수주 등록</button>
      </>}
      rightRail={rightRail}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          <TileB lbl="진행 수주"  v="22"   u="건"     sub="14.82 MW"                  tone="solar" />
          <TileB lbl="확정"       v="12"   u="건"     sub="8.64 MW · 3.46B₩"          tone="pos" />
          <TileB lbl="평균 단가"  v="408"  u="₩/Wp"   sub="JKO 401 · TRN 415"        tone="info"  delta="+1.2%" spark={[395,398,400,402,403,405,406,407,408,408,408,408]} />
          <TileB lbl="평균 마진"  v="11.4" u="%"      sub="목표 12.0% 대비 −0.6pp"   tone="warn"  delta="−0.8pp" spark={[12.6,12.4,12.2,12.0,11.8,11.6,11.5,11.4,11.4,11.4,11.4,11.4]} />
        </div>

        <CardB
          title="수주 목록"
          sub="활성 22건"
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FilterChips
                value={soFilter}
                onChange={setSoFilter}
                options={[
                  { key: 'all',       label: '전체', count: 22 },
                  { key: 'confirmed', label: '확정', count: 12 },
                  { key: 'review',    label: '검토', count: 8 },
                  { key: 'hold',      label: '보류', count: 2 },
                ]}
              />
              <div className="vr" style={{ height: 16 }} />
              <FilterButton items={[
                { label: '거래처', options: ['전체','솔라넷(주)','한국에너지','그린파워','동양EPC'] },
                { label: '제조사', options: ['전체','JinkoSolar','LONGi','Trina','JA Solar'] },
                { label: '납기', options: ['전체','이번주','다음주','이번달'] },
              ]} />
            </div>
          }
        >
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" /></th>
                <th>수주 번호</th>
                <th>거래처</th>
                <th>품번</th>
                <th className="num">수량</th>
                <th className="num">kW</th>
                <th className="num">₩/Wp</th>
                <th className="num">금액</th>
                <th className="num">마진</th>
                <th>납기</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="zebra">
                  <td><input type="checkbox" /></td>
                  <td><span className="mono strong" style={{ fontWeight: 600, fontSize: 11.5 }}>{o.id}</span></td>
                  <td style={{ fontWeight: 500 }}>{o.cust}</td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{o.sku}</span></td>
                  <td className="num">{o.qty.toLocaleString()}</td>
                  <td className="num strong">{o.kw.toLocaleString()}</td>
                  <td className="num">{o.price}</td>
                  <td className="num strong">{(o.total / 1000000).toFixed(1)}M</td>
                  <td className="num">
                    <span className="mono" style={{ color: o.margin >= 12 ? 'var(--pos)' : o.margin >= 10 ? 'var(--solar-3)' : 'var(--neg)', fontWeight: 600 }}>{o.margin.toFixed(1)}%</span>
                  </td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{o.dlvr}</span></td>
                  <td>{statusPill(o.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardB>
      </div>
    </ShellB>
  );
}

window.ScreenInv_B = ScreenInv_B;
window.ScreenPO_B  = ScreenPO_B;
window.ScreenLC_B  = ScreenLC_B;
window.ScreenBL_B  = ScreenBL_B;
window.ScreenSO_B  = ScreenSO_B;
window.TileB = TileB;
window.CardB = CardB;
window.RailBlock = RailBlock;
window.FilterChips = FilterChips;
window.FilterButton = FilterButton;
window.DropFilter = DropFilter;
