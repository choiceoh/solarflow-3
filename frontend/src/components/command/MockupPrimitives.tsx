import { useEffect, useRef, useState, type ReactNode } from 'react';

type Tone = 'solar' | 'ink' | 'info' | 'warn' | 'pos' | 'neg';

export function Sparkline({
  data,
  w = 80,
  h = 24,
  color = 'var(--solar)',
  area = false,
}: {
  data?: number[];
  w?: number;
  h?: number;
  color?: string;
  area?: boolean;
}) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / Math.max(data.length - 1, 1)) * (w - 2) + 1,
    h - 1 - ((v - min) / range) * (h - 3),
  ]);
  const line = pts.map((p) => `${p[0]},${p[1]}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      {area && <polyline points={`1,${h} ${line} ${w - 1},${h}`} fill={color} fillOpacity={0.13} stroke="none" />}
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function Bars({ data, w = 80, h = 24, color = 'var(--solar)' }: { data?: number[]; w?: number; h?: number; color?: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const bw = (w - data.length) / data.length;
  return (
    <svg width={w} height={h} style={{ display: 'inline-block' }}>
      {data.map((v, i) => {
        const bh = (v / max) * (h - 2);
        return <rect key={`${v}-${i}`} x={i * (bw + 1)} y={h - bh} width={bw} height={bh} fill={color} />;
      })}
    </svg>
  );
}

export function TileB({
  lbl,
  v,
  u,
  sub,
  tone = 'ink',
  spark,
  delta,
}: {
  lbl: string;
  v: string;
  u?: string;
  sub?: string;
  tone?: Tone;
  spark?: number[];
  delta?: string;
}) {
  const color =
    tone === 'solar' ? 'var(--solar-2)' :
    tone === 'pos' ? 'var(--pos)' :
    tone === 'warn' ? 'var(--warn)' :
    tone === 'info' ? 'var(--info)' :
    tone === 'neg' ? 'var(--neg)' :
    'var(--ink-3)';
  return (
    <div className="card hover" style={{ padding: '12px 14px 14px', minWidth: 0, position: 'relative', overflow: 'hidden', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="dot" style={{ background: color }} />
        <span className="eyebrow">{lbl}</span>
        {delta ? (
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: delta.startsWith('-') || delta.startsWith('−') ? 'var(--neg)' : 'var(--pos)', fontWeight: 600 }}>{delta}</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
        <span className="bignum" style={{ fontSize: 26 }}>{v}</span>
        {u ? <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>{u}</span> : null}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, paddingRight: spark ? 72 : 0 }}>
        {sub}
      </div>
      {spark ? (
        <div style={{ position: 'absolute', right: 10, bottom: 10, opacity: 0.6 }}>
          <Sparkline data={spark} w={64} h={20} color={color} area />
        </div>
      ) : null}
    </div>
  );
}

export function CardB({
  title,
  sub,
  right,
  children,
  padded = false,
  flex,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  flex?: boolean;
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, flex: flex ? 1 : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0, minHeight: 44 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.005em', color: 'var(--ink)' }}>{title}</div>
          {sub ? <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div> : null}
        </div>
        <div style={{ flex: 1 }} />
        {right}
      </div>
      <div style={{ padding: padded ? 14 : 0, minHeight: 0, flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

export function RailBlock({
  title,
  accent,
  count,
  children,
  last,
}: {
  title: string;
  accent?: string;
  count?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div style={{ padding: '14px 14px', borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="eyebrow">{title}</div>
        {count != null ? <span className="mono tnum" style={{ fontSize: 10.5, color: accent || 'var(--ink-3)', fontWeight: 600 }}>{count}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; count?: number }[];
  value: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="tabs" style={{ border: 'none' }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            className={`tab${active ? ' active' : ''}`}
            onClick={() => onChange?.(o.key)}
            style={{ padding: '5px 10px' }}
            type="button"
          >
            {o.label}
            {o.count != null ? (
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginLeft: 5 }}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type FilterItem = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
};

const isAllValue = (v: string) => !v || v === 'all';

export function FilterButton({ items }: { items: FilterItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const activeCount = items.filter((it) => !isAllValue(it.value)).length;
  const reset = () => items.forEach((it) => { if (!it.disabled && !isAllValue(it.value)) it.onChange(''); });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        type="button"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 28, padding: '0 10px',
          background: activeCount > 0 ? 'var(--bg-2)' : 'var(--surface)',
          border: `1px solid ${open ? 'var(--solar-3)' : 'var(--line)'}`,
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
        {activeCount > 0 ? (
          <span className="mono tnum" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 16, height: 16, padding: '0 4px',
            background: 'var(--solar-3)', color: '#fff',
            borderRadius: 8, fontSize: 9.5, fontWeight: 700,
          }}>{activeCount}</span>
        ) : null}
      </button>
      {open ? (
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
              onClick={reset}
              type="button"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--ink-3)', fontFamily: 'inherit',
                fontSize: 11, padding: 0,
              }}
            >초기화</button>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 360, overflowY: 'auto' }}>
            {items.map((it) => {
              const allActive = isAllValue(it.value);
              return (
                <div key={it.label} style={{ opacity: it.disabled ? 0.5 : 1 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600, marginBottom: 6, letterSpacing: '-0.005em' }}>{it.label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <FilterChip label="전체" active={allActive} disabled={it.disabled} onClick={() => it.onChange('')} />
                    {it.options.map((o) => (
                      <FilterChip
                        key={o.value}
                        label={o.label}
                        active={!allActive && it.value === o.value}
                        disabled={it.disabled}
                        onClick={() => it.onChange(o.value)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '8px 14px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setOpen(false)}
              type="button"
              style={{
                padding: '6px 12px', background: 'var(--ink)', color: '#fff',
                border: 'none', borderRadius: 3,
                fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer', letterSpacing: '-0.005em',
              }}
            >닫기</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({ label, active, disabled, onClick }: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: '4px 9px',
        background: active ? 'var(--ink)' : 'var(--bg-2)',
        border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
        borderRadius: 3,
        fontFamily: 'inherit',
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        color: active ? '#fff' : 'var(--ink-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '-0.005em',
      }}
    >{label}</button>
  );
}
