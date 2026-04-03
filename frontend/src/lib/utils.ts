import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- 포맷 유틸 ---

export function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function formatUSD(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatKRW(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

export function formatPercent(n: number): string {
  return `${n.toFixed(2)}%`;
}

export function formatDate(d: string): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

export function formatWp(n: number): string {
  return `${n}Wp`;
}

export function formatKw(n: number): string {
  return `${n.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}kW`;
}

export function formatMW(n: number): string {
  return `${(n / 1000).toFixed(1)}MW`;
}

export function formatSize(w: number, h: number): string {
  return `${w} x ${h} mm`;
}
