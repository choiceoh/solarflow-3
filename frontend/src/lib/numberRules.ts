export type PricePerWpMode = 'cents' | 'dollar';

export function parseNumericInput(value: string | number | null | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export function parseDecimalInput(value: string, maxDecimals = 4): string {
  const cleaned = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, maxDecimals)}`;
}

export function formatIntegerInput(value: string | number | null | undefined): string {
  const raw = String(value ?? '').replace(/[^0-9]/g, '');
  if (!raw) return '';
  return Number(raw).toLocaleString('ko-KR');
}

export function formatDecimalPlain(value: number, minDigits = 2, maxDigits = 4): string {
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString('en-US', {
    useGrouping: false,
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });
}

export function usdWpToDisplayPrice(
  valueUsdWp: number | null | undefined,
  mode: PricePerWpMode = 'cents',
): string {
  if (valueUsdWp == null || !Number.isFinite(valueUsdWp) || valueUsdWp <= 0) return '';
  return mode === 'cents'
    ? formatDecimalPlain(valueUsdWp * 100, 2, 4)
    : formatDecimalPlain(valueUsdWp, 4, 6);
}

export function displayPriceToUsdWp(
  displayValue: string | number | null | undefined,
  mode: PricePerWpMode = 'cents',
): number | undefined {
  const parsed = parseNumericInput(displayValue);
  if (parsed == null || parsed <= 0) return undefined;
  return mode === 'cents' ? parsed / 100 : parsed;
}

export function unitUsdEaToDisplayPrice(
  unitUsdEa: number | null | undefined,
  specWp: number | null | undefined,
  mode: PricePerWpMode = 'cents',
): string {
  if (unitUsdEa == null || !Number.isFinite(unitUsdEa) || unitUsdEa <= 0 || !specWp || specWp <= 0) return '';
  return usdWpToDisplayPrice(unitUsdEa / specWp, mode);
}

export function calcWpLineAmountUsd(
  quantityEa: number,
  specWp: number,
  displayPrice: string | number | null | undefined,
  mode: PricePerWpMode = 'cents',
): number {
  const priceUsdWp = displayPriceToUsdWp(displayPrice, mode);
  if (!quantityEa || !specWp || !priceUsdWp) return 0;
  return quantityEa * specWp * priceUsdWp;
}

export function formatCapacityFromKw(kw: number | null | undefined): string {
  if (kw == null || !Number.isFinite(kw)) return '-';
  if (Math.abs(kw) >= 1000) {
    return `${(kw / 1000).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MW`;
  }
  return `${kw.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW`;
}
