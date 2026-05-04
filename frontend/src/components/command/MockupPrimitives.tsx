import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
  // 단일 포인트는 polyline 으로 안 보이므로 양 끝 동일 값으로 평행선 처리.
  const series = data.length === 1 ? [data[0]!, data[0]!] : data;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min;
  // range === 0: 스냅샷 메트릭 (시계열 없음) — 가운데 평행선으로 그린다.
  const yOf = range > 0
    ? (v: number) => h - 1 - ((v - min) / range) * (h - 3)
    : () => h / 2;
  const pts = series.map((v, i) => [
    (i / Math.max(series.length - 1, 1)) * (w - 2) + 1,
    yOf(v),
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
  headerless = false,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  flex?: boolean;
  headerless?: boolean;
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, flex: flex ? 1 : undefined }}>
      {!headerless ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0, minHeight: 44 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 220, flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em', color: 'var(--ink)' }}>{title}</div>
            {sub ? <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div> : null}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            {right}
          </div>
        </div>
      ) : null}
      <div style={{ padding: padded ? 14 : 0, minHeight: 0, flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

export function CommandTopLine({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  const [titleTarget, setTitleTarget] = useState<HTMLElement | null>(() => (
    typeof document === 'undefined' ? null : document.getElementById('sf-command-title-slot')
  ));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setTitleTarget(document.getElementById('sf-command-title-slot'));
  }, []);

  const copy = (
    <div className="sf-command-topline-copy">
      <div className="sf-command-topline-title">{title}</div>
      {sub ? <div className="sf-command-topline-sub">{sub}</div> : null}
    </div>
  );

  if (titleTarget) {
    return (
      <>
        {createPortal(copy, titleTarget)}
        {right ? (
          <div className="sf-command-control-strip">
            <div className="sf-command-topline-actions">{right}</div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="sf-command-topline">
      {copy}
      <div className="sf-command-topline-actions">{right}</div>
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
            style={{ padding: 'var(--sf-filter-chip-padding, 5px 10px)' }}
            type="button"
          >
            {o.label}
            {o.count != null ? (
              <span className="mono" style={{ fontSize: 10, color: 'inherit', marginLeft: 5 }}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type DateRangeValue = { start: string; end: string } | null;

export type FilterItem =
  | {
      kind?: 'select';
      label: string;
      value: string;
      onChange: (next: string) => void;
      options: { value: string; label: string }[];
      disabled?: boolean;
    }
  | {
      kind: 'date_range';
      label: string;
      value: DateRangeValue;
      onChange: (next: DateRangeValue) => void;
      // 빠른 선택 프리셋 (이번 달, 지난 달, 최근 7일 등). 미지정 시 기본 프리셋 사용.
      presets?: { label: string; range: () => { start: string; end: string } }[];
      disabled?: boolean;
    };

const isAllValue = (v: string) => !v || v === 'all';

const isItemActive = (it: FilterItem) =>
  it.kind === 'date_range' ? it.value !== null : !isAllValue(it.value);

const resetItem = (it: FilterItem) => {
  if (it.disabled) return;
  if (it.kind === 'date_range') {
    if (it.value !== null) it.onChange(null);
  } else if (!isAllValue(it.value)) {
    it.onChange('');
  }
};

// YYYY-MM-DD 로컬 날짜 포맷 (UTC 변환 없이 사용자 시간대 기준).
const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const defaultDateRangePresets: NonNullable<Extract<FilterItem, { kind: 'date_range' }>['presets']> = [
  {
    label: '이번 달',
    range: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: ymd(start), end: ymd(end) };
    },
  },
  {
    label: '지난 달',
    range: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: ymd(start), end: ymd(end) };
    },
  },
  {
    label: '최근 7일',
    range: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6);
      return { start: ymd(start), end: ymd(end) };
    },
  },
  {
    label: '최근 30일',
    range: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 29);
      return { start: ymd(start), end: ymd(end) };
    },
  },
  {
    label: '올해',
    range: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return { start: ymd(start), end: ymd(end) };
    },
  },
];

export function FilterButton({ items }: { items: FilterItem[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // 패널 위치는 fixed 좌표로 계산 — 부모 .sf-card-controls 의 overflow:hidden 으로
  // 잘리는 것을 회피하기 위해 document.body 로 portal.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const PANEL_W = 280;
      const MARGIN = 8;
      // 우측 정렬 우선 (트리거 우측 = 패널 우측). 좌측으로 넘치면 좌측 정렬로 폴백.
      let left = rect.right - PANEL_W;
      if (left < MARGIN) left = rect.left;
      // 우측 뷰포트 클램프
      if (left + PANEL_W > window.innerWidth - MARGIN) {
        left = window.innerWidth - PANEL_W - MARGIN;
      }
      if (left < MARGIN) left = MARGIN;
      setPos({ top: rect.bottom + 6, left });
    };
    updatePos();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  const activeCount = items.filter(isItemActive).length;
  const reset = () => items.forEach(resetItem);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        type="button"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          height: 24, padding: '0 8px',
          background: activeCount > 0 ? 'var(--bg-2)' : 'var(--surface)',
          border: `1px solid ${open ? 'var(--solar-3)' : 'var(--line)'}`,
          borderRadius: 6,
          fontFamily: 'inherit',
          fontSize: 12, fontWeight: 500,
          color: 'var(--ink)',
          cursor: 'pointer',
          letterSpacing: '-0.005em',
          boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
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
      {open && pos ? createPortal(
        <div ref={panelRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000,
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
            {items.map((it) => (
              <div key={it.label} style={{ opacity: it.disabled ? 0.5 : 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600, marginBottom: 6, letterSpacing: '-0.005em' }}>{it.label}</div>
                {it.kind === 'date_range' ? (
                  <DateRangePicker item={it} />
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <FilterChip label="전체" active={isAllValue(it.value)} disabled={it.disabled} onClick={() => it.onChange('')} />
                    {it.options.map((o) => (
                      <FilterChip
                        key={o.value}
                        label={o.label}
                        active={!isAllValue(it.value) && it.value === o.value}
                        disabled={it.disabled}
                        onClick={() => it.onChange(o.value)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
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
        </div>,
        document.body,
      ) : null}
    </>
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

function DateRangePicker({ item }: { item: Extract<FilterItem, { kind: 'date_range' }> }) {
  const presets = item.presets ?? defaultDateRangePresets;
  const start = item.value?.start ?? '';
  const end = item.value?.end ?? '';
  const matchedPreset = item.value
    ? presets.find((p) => {
        const r = p.range();
        return r.start === item.value!.start && r.end === item.value!.end;
      })
    : null;

  const commit = (next: { start: string; end: string }) => {
    if (item.disabled) return;
    if (!next.start || !next.end) return;
    // start 가 end 보다 늦으면 자동으로 swap — UX 친화적.
    const ordered = next.start > next.end ? { start: next.end, end: next.start } : next;
    item.onChange(ordered);
  };

  const inputStyle = {
    flex: 1,
    minWidth: 0,
    padding: '4px 6px',
    border: '1px solid var(--line)',
    borderRadius: 3,
    fontFamily: 'inherit',
    fontSize: 11,
    color: 'var(--ink)',
    background: 'var(--surface)',
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <FilterChip label="전체" active={item.value === null} disabled={item.disabled} onClick={() => item.onChange(null)} />
        {presets.map((p) => (
          <FilterChip
            key={p.label}
            label={p.label}
            active={matchedPreset?.label === p.label}
            disabled={item.disabled}
            onClick={() => commit(p.range())}
          />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="date"
          value={start}
          disabled={item.disabled}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) {
              if (!end) item.onChange(null);
              return;
            }
            commit({ start: next, end: end || next });
          }}
          style={inputStyle}
        />
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>~</span>
        <input
          type="date"
          value={end}
          disabled={item.disabled}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) {
              if (!start) item.onChange(null);
              return;
            }
            commit({ start: start || next, end: next });
          }}
          style={inputStyle}
        />
      </div>
    </div>
  );
}
