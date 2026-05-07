import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calculator, Plus, Trash2, Save, Printer, RefreshCw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/api';
import type { Partner } from '@/types/masters';

// QuoteBuilderPage — D-126 통합 견적 빌더 (BARO 전용).
//
// PR2 Phase 1 스코프 (DB migration 없이 빠르게):
//   - 거래처 선택 → 단가표(partner_price_book) + 품번 정보 prefill
//   - 라인 추가/삭제, 수량·단가 수동 조정, 합계 즉시 계산
//   - LocalStorage 에 draft 자동 저장 (partner_id 별 1슬롯)
//   - "인쇄/PDF" 버튼 → window.print() (브라우저 PDF 저장)
//
// PR2.5 로 분리:
//   - DB 저장 (baro_quotes 테이블 마이그레이션 필요)
//   - 카톡/SMS/이메일 발송 (외부 API 키)
//   - 마진 표시 (BARO 평균 매입원가 통합)
//   - 회신 추적 (sent_at / replied_at)

interface PartnerPriceRow {
  price_id: string;
  partner_id: string;
  product_id: string;
  unit_price_wp: number;
  discount_pct: number;
  effective_from: string;
  effective_to: string | null;
}

interface ProductLite {
  product_id: string;
  product_code: string;
  product_name: string;
  spec_wp: number;
  manufacturer_id: string;
  available_stock?: number | null;
  is_active: boolean;
}

interface QuoteLine {
  line_no: number;
  product_id: string;
  product_name: string;
  product_code: string;
  spec_wp: number;
  quantity: number;
  unit_price_krw: number;
}

interface QuoteDraft {
  partner_id: string;
  lines: QuoteLine[];
  valid_until: string;
  notes: string;
  saved_at: string;
}

const DRAFT_KEY_PREFIX = 'baro.quote-draft.';
const VAT_RATE = 0.1;

function formatKrw(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toLocaleString('ko-KR');
}

function loadDraft(partnerId: string): QuoteDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY_PREFIX + partnerId);
    if (!raw) return null;
    return JSON.parse(raw) as QuoteDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: QuoteDraft) {
  try {
    window.localStorage.setItem(DRAFT_KEY_PREFIX + draft.partner_id, JSON.stringify(draft));
  } catch {
    // noop — 용량 초과 / privacy mode
  }
}

function clearDraft(partnerId: string) {
  try {
    window.localStorage.removeItem(DRAFT_KEY_PREFIX + partnerId);
  } catch {
    // noop
  }
}

export default function QuoteBuilderPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const partnerId = searchParams.get('partner_id') ?? '';

  if (!partnerId) {
    return (
      <PartnerPicker
        onPick={(p) => setSearchParams({ partner_id: p.partner_id })}
      />
    );
  }
  return (
    <Builder
      partnerId={partnerId}
      onClear={() => setSearchParams(new URLSearchParams())}
    />
  );
}

// ---------- Picker (cockpit 과 같은 패턴) ----------

function PartnerPicker({ onPick }: { onPick: (p: Partner) => void }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const list = await fetchWithAuth<Partner[]>('/api/v1/partners/');
        if (alive) setPartners(list);
      } catch (e) {
        console.error('[견적빌더 picker 로드 실패]', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const customers = partners.filter(
      (p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'),
    );
    if (!q) return customers.slice(0, 50);
    return customers.filter((p) => p.partner_name.toLowerCase().includes(q)).slice(0, 50);
  }, [partners, query]);

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        <h1 className="text-base font-semibold">견적 빌더</h1>
        <span className="text-xs text-muted-foreground">
          거래처를 선택하면 거래처 단가표가 자동으로 로드됩니다.
        </span>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="거래처명 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>
      <div className="flex-1 overflow-auto rounded-md border bg-card">
        {loading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {query ? '일치하는 거래처가 없습니다' : '활성 고객 거래처가 없습니다'}
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((p) => (
              <li key={p.partner_id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40"
                >
                  <span className="font-medium">{p.partner_name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {p.partner_type === 'both' ? '겸용' : '고객'}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------- Builder ----------

function Builder({ partnerId, onClear }: { partnerId: string; onClear: () => void }) {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [prices, setPrices] = useState<PartnerPriceRow[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 견적 헤더
  const [validUntil, setValidUntil] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<QuoteLine[]>([]);

  // 라인 추가 picker
  const [pickerQuery, setPickerQuery] = useState('');

  // 마운트 시 데이터 로드 + draft 복원
  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const [partnerData, priceData, productData] = await Promise.all([
          fetchWithAuth<Partner>(`/api/v1/partners/${encodeURIComponent(partnerId)}`),
          fetchWithAuth<PartnerPriceRow[]>(
            `/api/v1/partner-prices/?partner_id=${encodeURIComponent(partnerId)}`,
          ),
          fetchWithAuth<ProductLite[]>('/api/v1/products/'),
        ]);
        if (!alive) return;
        // Single partner endpoint returns array in some shapes
        const p = Array.isArray(partnerData) ? partnerData[0] : partnerData;
        setPartner(p ?? null);
        setPrices(priceData ?? []);
        setProducts((productData ?? []).filter((x) => x.is_active));
        // draft 복원
        const draft = loadDraft(partnerId);
        if (draft) {
          setLines(draft.lines);
          setValidUntil(draft.valid_until);
          setNotes(draft.notes);
        }
      } catch (e) {
        if (!alive) return;
        console.error('[견적빌더 로드 실패]', e);
        setError(e instanceof Error ? e.message : '데이터 로드 실패');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [partnerId]);

  // 자동 draft 저장 — 라인/notes/valid_until 변경 시
  useEffect(() => {
    if (!partner) return;
    if (lines.length === 0 && notes === '') return;
    saveDraft({
      partner_id: partnerId,
      lines,
      valid_until: validUntil,
      notes,
      saved_at: new Date().toISOString(),
    });
  }, [partnerId, partner, lines, notes, validUntil]);

  // 단가표 + 품번 join 으로 picker 후보 생성
  const pickerCandidates = useMemo(() => {
    const productMap = new Map(products.map((p) => [p.product_id, p]));
    const today = new Date().toISOString().slice(0, 10);
    const validPrices = prices.filter((p) => {
      if (p.effective_from > today) return false;
      if (p.effective_to && p.effective_to < today) return false;
      return true;
    });
    const rows = validPrices
      .map((price) => {
        const product = productMap.get(price.product_id);
        if (!product) return null;
        const unitPriceKrw = price.unit_price_wp * product.spec_wp;
        return {
          price_id: price.price_id,
          product_id: product.product_id,
          product_code: product.product_code,
          product_name: product.product_name,
          spec_wp: product.spec_wp,
          available_stock: product.available_stock ?? null,
          unit_price_krw: unitPriceKrw,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return rows.slice(0, 50);
    return rows.filter((r) =>
      `${r.product_code} ${r.product_name}`.toLowerCase().includes(q),
    ).slice(0, 50);
  }, [prices, products, pickerQuery]);

  const addLine = useCallback(
    (cand: (typeof pickerCandidates)[number]) => {
      setLines((prev) => {
        // 이미 있는 SKU 면 수량 +1
        const idx = prev.findIndex((l) => l.product_id === cand.product_id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
          return next;
        }
        return [
          ...prev,
          {
            line_no: prev.length + 1,
            product_id: cand.product_id,
            product_code: cand.product_code,
            product_name: cand.product_name,
            spec_wp: cand.spec_wp,
            quantity: 1,
            unit_price_krw: cand.unit_price_krw,
          },
        ];
      });
    },
    [],
  );

  const updateLine = useCallback((line_no: number, patch: Partial<QuoteLine>) => {
    setLines((prev) => prev.map((l) => (l.line_no === line_no ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((line_no: number) => {
    setLines((prev) =>
      prev.filter((l) => l.line_no !== line_no).map((l, i) => ({ ...l, line_no: i + 1 })),
    );
  }, []);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + l.quantity * l.unit_price_krw, 0);
    const vat = Math.round(subtotal * VAT_RATE);
    const grand = subtotal + vat;
    const totalQty = lines.reduce((a, l) => a + l.quantity, 0);
    const totalKw = lines.reduce((a, l) => a + (l.quantity * l.spec_wp) / 1000, 0);
    return { subtotal, vat, grand, totalQty, totalKw };
  }, [lines]);

  // 초기화 — 두 번 클릭 패턴(첫 클릭: armed=true, 두 번째: 실제 비움). 5초 후 자동 disarm.
  const [resetArmed, setResetArmed] = useState(false);
  useEffect(() => {
    if (!resetArmed) return;
    const t = window.setTimeout(() => setResetArmed(false), 5000);
    return () => window.clearTimeout(t);
  }, [resetArmed]);
  const reset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    setLines([]);
    setNotes('');
    clearDraft(partnerId);
    setResetArmed(false);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        견적 빌더 불러오는 중...
      </div>
    );
  }
  if (error || !partner) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>{error || '거래처를 찾을 수 없습니다'}</span>
        <Button size="sm" variant="outline" onClick={onClear}>
          거래처 다시 선택
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      {/* 헤더 (인쇄 시에도 보임) */}
      <div className="flex items-center justify-between print:items-start">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary print:hidden" />
            <h1 className="text-base font-semibold">견적서 — {partner.partner_name}</h1>
          </div>
          <div className="text-[11px] text-muted-foreground">
            유효기한: {validUntil} · 라인 {lines.length}건 · {totals.totalQty}장 · {totals.totalKw.toFixed(2)}kW
          </div>
        </div>
        <div className="flex items-center gap-1.5 print:hidden">
          <Button size="sm" variant="ghost" onClick={onClear}>
            거래처 변경
          </Button>
          <Button
            size="sm"
            variant={resetArmed ? 'destructive' : 'outline'}
            onClick={reset}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {resetArmed ? '한 번 더 클릭' : '초기화'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1 h-3.5 w-3.5" /> 인쇄/PDF
          </Button>
        </div>
      </div>

      {/* 메인 2단 — 좌:라인편집, 우:SKU picker */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[2fr_1fr] print:grid-cols-1">
        {/* 좌측: 라인 + 합계 */}
        <section className="flex min-h-0 flex-col gap-2 rounded-md border bg-card p-3">
          <div className="grid grid-cols-2 gap-3 print:grid-cols-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">유효기한</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="h-8 text-xs print:border-none print:bg-transparent"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">담당자 비고</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="결제조건·납기 등"
                className="h-8 text-xs print:border-none print:bg-transparent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-[10px] text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-normal">#</th>
                  <th className="py-1 text-left font-normal">품번 / 모델</th>
                  <th className="py-1 text-right font-normal">spec_wp</th>
                  <th className="py-1 text-right font-normal">수량</th>
                  <th className="py-1 text-right font-normal">단가(원)</th>
                  <th className="py-1 text-right font-normal">금액</th>
                  <th className="w-6 py-1 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      우측에서 SKU 를 추가하세요
                    </td>
                  </tr>
                ) : (
                  lines.map((l) => (
                    <tr key={l.line_no} className="border-t">
                      <td className="py-1 align-top text-muted-foreground">{l.line_no}</td>
                      <td className="py-1">
                        <div className="font-medium">{l.product_name}</div>
                        <div className="text-[10px] text-muted-foreground">{l.product_code}</div>
                      </td>
                      <td className="py-1 text-right tabular-nums">{l.spec_wp}</td>
                      <td className="py-1 text-right tabular-nums">
                        <Input
                          type="number"
                          min="1"
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.line_no, { quantity: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="h-7 w-16 text-right text-xs print:border-none print:bg-transparent"
                        />
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        <Input
                          type="number"
                          min="0"
                          step="100"
                          value={l.unit_price_krw}
                          onChange={(e) =>
                            updateLine(l.line_no, { unit_price_krw: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="h-7 w-24 text-right text-xs print:border-none print:bg-transparent"
                        />
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {formatKrw(l.quantity * l.unit_price_krw)}
                      </td>
                      <td className="py-1 print:hidden">
                        <button
                          type="button"
                          onClick={() => removeLine(l.line_no)}
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                          aria-label="라인 삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="border-t-2 text-[11px]">
                <tr>
                  <td colSpan={5} className="py-1 text-right font-medium text-muted-foreground">
                    공급가액
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatKrw(totals.subtotal)}원</td>
                  <td className="print:hidden" />
                </tr>
                <tr>
                  <td colSpan={5} className="py-1 text-right font-medium text-muted-foreground">
                    부가세 (10%)
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatKrw(totals.vat)}원</td>
                  <td className="print:hidden" />
                </tr>
                <tr>
                  <td colSpan={5} className="py-1.5 text-right font-semibold">
                    합계
                  </td>
                  <td className="py-1.5 text-right text-sm font-semibold tabular-nums">
                    {formatKrw(totals.grand)}원
                  </td>
                  <td className="print:hidden" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between text-[10px] text-muted-foreground print:hidden">
            <span>
              <Save className="-mt-0.5 mr-1 inline h-3 w-3" />
              로컬 자동저장 (이 브라우저)
            </span>
            <span>VAT 10% 가산 / 단가는 거래처 단가표 prefill, 수동 조정 가능</span>
          </div>
        </section>

        {/* 우측: SKU picker */}
        <section className="flex min-h-0 flex-col gap-2 rounded-md border bg-card p-3 print:hidden">
          <div className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">SKU 추가</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {pickerCandidates.length}개 후보
            </Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="품번/모델명 검색..."
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex-1 overflow-auto">
            {pickerCandidates.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                {prices.length === 0
                  ? '이 거래처의 단가표가 비어 있습니다 — 마스터에서 단가를 등록하세요'
                  : '검색 결과 없음'}
              </p>
            ) : (
              <ul className="divide-y">
                {pickerCandidates.map((c) => (
                  <li key={c.product_id}>
                    <button
                      type="button"
                      onClick={() => addLine(c)}
                      className="flex w-full items-start justify-between gap-2 px-2 py-2 text-left hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{c.product_name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {c.product_code} · {c.spec_wp}W
                          {c.available_stock != null ? ` · 재고 ${c.available_stock}` : ''}
                        </div>
                      </div>
                      <div className="text-right text-[11px] tabular-nums">
                        <div className="font-medium">{formatKrw(c.unit_price_krw)}원</div>
                        <div className="text-[9px] text-muted-foreground">/장</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              <RefreshCw className="-mt-0.5 mr-1 inline h-3 w-3" />
              partner_price_book 기반
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
