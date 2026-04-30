import { ChevronDown } from 'lucide-react';
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
    <div className="card hover" style={{ padding: '12px 14px 14px', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
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

export function DropFilter({ label, options }: { label: string; options: string[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isAll = selected === 0;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 26,
          padding: '0 9px',
          background: isAll ? 'var(--surface)' : 'var(--bg-2)',
          border: `1px solid ${open ? 'var(--solar-3)' : 'var(--line)'}`,
          borderRadius: 4,
          fontFamily: 'inherit',
          fontSize: 11.5,
          fontWeight: isAll ? 500 : 600,
          color: isAll ? 'var(--ink-2)' : 'var(--ink)',
          cursor: 'pointer',
          letterSpacing: 0,
          whiteSpace: 'nowrap',
        }}
        type="button"
      >
        <span style={{ color: 'var(--ink-4)', fontSize: 10, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--line-2)' }}>·</span>
        <span>{isAll ? '전체' : options[selected]}</span>
        <ChevronDown className="h-3 w-3 text-[var(--ink-4)]" />
      </button>
      {open ? (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          zIndex: 20,
          minWidth: 160,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 4,
          boxShadow: '0 8px 24px rgba(28,25,23,0.10), 0 2px 4px rgba(28,25,23,0.06)',
          padding: 4,
          maxHeight: 280,
          overflowY: 'auto',
        }}>
          {options.map((o, i) => {
            const active = i === selected;
            return (
              <button
                key={o}
                onClick={() => { setSelected(i); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '6px 10px',
                  background: active ? 'var(--bg-2)' : 'transparent',
                  border: 'none',
                  borderRadius: 3,
                  fontFamily: 'inherit',
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--ink)' : 'var(--ink-2)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                type="button"
              >
                <span>{i === 0 ? '전체' : o}</span>
                {active ? <span style={{ color: 'var(--solar-3)' }}>✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function FilterButton({ items }: { items: { label: string; options: string[] }[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {items.map((item) => (
        <DropFilter key={item.label} label={item.label} options={item.options} />
      ))}
    </div>
  );
}
