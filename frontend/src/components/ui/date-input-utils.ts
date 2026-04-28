/** 8자리/축약 형식을 YYYY-MM-DD로 정규화 */
export function normDate(v: string): string {
  if (!v) return v;
  const digits = v.replace(/\D/g, '');
  if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return v;
}
