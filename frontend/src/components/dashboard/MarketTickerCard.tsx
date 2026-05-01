import { useEffect, useState } from 'react';
import { CardB } from '@/components/command/MockupPrimitives';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface FXSnapshot { rate: number; change_pct: number | null; }
interface MetalSnapshot { price_usd: number; change_usd: number | null; }
interface CommoditySnapshot { value: number; change: number; unit: string; }

const fmt = new Intl.NumberFormat('en-US');

interface Row {
  label: string;
  value: string;
  unit?: string;
  change: number | null;
  changeFmt: string;
}

function changeText(change: number | null, suffix = ''): string {
  if (change === null) return '';
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}${suffix}`;
}

export default function MarketTickerCard() {
  const [fx, setFx] = useState<FXSnapshot | null>(null);
  const [silver, setSilver] = useState<MetalSnapshot | null>(null);
  const [poly, setPoly] = useState<CommoditySnapshot | null>(null);
  const [scfi, setScfi] = useState<CommoditySnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const get = <T,>(path: string) =>
      fetch(`${API_BASE_URL}${path}`)
        .then((r) => (r.ok ? r.json() as Promise<T> : Promise.reject(r.status)));
    get<FXSnapshot>('/api/v1/public/fx/usdkrw').then((d) => !cancelled && setFx(d)).catch(() => {});
    get<MetalSnapshot>('/api/v1/public/metals/silver').then((d) => !cancelled && setSilver(d)).catch(() => {});
    get<CommoditySnapshot>('/api/v1/public/polysilicon').then((d) => !cancelled && setPoly(d)).catch(() => {});
    get<CommoditySnapshot>('/api/v1/public/scfi').then((d) => !cancelled && setScfi(d)).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const rows: Row[] = [
    {
      label: 'USD/KRW',
      value: fx ? fmt.format(Math.round(fx.rate * 10) / 10) : '—',
      unit: '원',
      change: fx?.change_pct ?? null,
      changeFmt: changeText(fx?.change_pct ?? null, '%'),
    },
    {
      label: '은',
      value: silver ? `$${silver.price_usd.toFixed(2)}` : '—',
      unit: '/oz',
      change: silver?.change_usd ?? null,
      changeFmt: changeText(silver?.change_usd ?? null),
    },
    {
      label: '폴리실리콘',
      value: poly ? poly.value.toFixed(2) : '—',
      unit: poly?.unit ?? 'USD/kg',
      change: poly?.change ?? null,
      changeFmt: changeText(poly?.change ?? null),
    },
    {
      label: 'SCFI',
      value: scfi ? fmt.format(Math.round(scfi.value)) : '—',
      unit: '',
      change: scfi?.change ?? null,
      changeFmt: changeText(scfi?.change ?? null),
    },
  ];

  return (
    <CardB title="시장 시세" sub="USD/KRW · 원자재 · 운임" padded>
      <div className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const tone = row.change === null
            ? 'text-[var(--ink-4)]'
            : row.change >= 0
              ? 'text-[var(--pos)]'
              : 'text-[var(--neg)]';
          return (
            <div
              key={row.label}
              className="grid grid-cols-[68px_minmax(0,1fr)_64px] items-baseline gap-2"
            >
              <div className="truncate text-xs font-bold">{row.label}</div>
              <div className="mono truncate text-right text-[12px] font-bold">
                {row.value}
                {row.unit ? <span className="ml-1 text-[10px] font-normal text-[var(--ink-3)]">{row.unit}</span> : null}
              </div>
              <div className={`mono text-right text-[10px] font-bold ${tone}`}>
                {row.changeFmt || '—'}
              </div>
            </div>
          );
        })}
      </div>
    </CardB>
  );
}
