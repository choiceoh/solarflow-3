// 매출 자동 등록 다이얼로그 (D-057).
//
// 출고 일괄 등록 완료 직후 호출됨.
// - 입력: 변환 결과의 source_payload 매출 정보 + 출고 import 응답의 imported_ids
// - 처리: 거래처(partners) fuzzy 매칭 → 모호 후보 사용자 확인 → 신규 자동 등록
//        → POST /api/v1/import/sales 로 매출 일괄 등록.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import type { PartnerAlias } from '@/types/aliases';
import type { ImportResult, ParsedRow } from '@/types/excel';
import {
  autoRegisterPartner, fetchPartnerAliases, learnPartnerAlias,
} from '@/lib/externalFormats/autoRegister';
import { findPartnerMatch } from '@/lib/externalFormats/matching';
import type { PartnerLite, PartnerMatchResult } from '@/lib/externalFormats/matching';

interface Props {
  open: boolean;
  // 변환 결과의 valid 행만 (출고 import 에 실제 전송된 행) — submitImport 직전 필터링한 것을 그대로
  outboundRows: ParsedRow[];
  // 출고 import 응답의 imported_ids — outboundRows 와 같은 길이 / 순서
  importedOutboundIds: string[];
  // partners 마스터
  partners: PartnerLite[];
  onClose: () => void;
  onCompleted: (saleResult: ImportResult) => void;
}

interface SaleSeed {
  outboundId: string;
  rawCustomer: string;
  unitPriceWp: number | null;
  supplyAmount: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  match?: PartnerMatchResult;
}

export default function SaleAutoRegisterDialog({
  open, outboundRows, importedOutboundIds, partners, onClose, onCompleted,
}: Props) {
  const [partnerAliases, setPartnerAliases] = useState<PartnerAlias[]>([]);
  const [seeds, setSeeds] = useState<SaleSeed[]>([]);
  const [resolvedPartners, setResolvedPartners] = useState<PartnerLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 1) 거래처 alias 사전 fetch + 매출 시드 빌드
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const aliases = await fetchPartnerAliases();
      if (cancelled) return;
      setPartnerAliases(aliases);
      const built = buildSeeds(outboundRows, importedOutboundIds, partners, aliases);
      setSeeds(built);
    })();
    return () => { cancelled = true; };
  }, [open, outboundRows, importedOutboundIds, partners]);

  const fuzzyByRaw = useMemo(() => {
    const map = new Map<string, SaleSeed[]>();
    for (const s of seeds) {
      if (s.match?.level !== 'fuzzy') continue;
      const arr = map.get(s.rawCustomer) ?? [];
      arr.push(s);
      map.set(s.rawCustomer, arr);
    }
    return map;
  }, [seeds]);

  const newPartnerNames = useMemo(() => {
    const set = new Set<string>();
    for (const s of seeds) {
      if (s.match?.level === 'none' && s.rawCustomer) set.add(s.rawCustomer);
    }
    return Array.from(set);
  }, [seeds]);

  const seedsValid = seeds.filter((s) => s.match?.level === 'exact');
  const totalActions = fuzzyByRaw.size + newPartnerNames.length;
  const canSubmit = totalActions === 0 && seedsValid.length > 0;

  const resolveFuzzy = useCallback(async (rawCustomer: string, candidate: PartnerLite | null) => {
    setBusy(true);
    try {
      let canonical: PartnerLite | null = candidate;
      if (!canonical) {
        canonical = await autoRegisterPartner(rawCustomer);
        setResolvedPartners((prev) => [...prev, canonical!]);
      } else {
        await learnPartnerAlias(canonical.partner_id, rawCustomer);
      }
      setSeeds((prev) => prev.map((s) => {
        if (s.rawCustomer !== rawCustomer) return s;
        return {
          ...s,
          match: { level: 'exact', matched: canonical!, normalizedKey: s.match?.normalizedKey ?? '' },
        };
      }));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '거래처 매핑 실패');
    } finally {
      setBusy(false);
    }
  }, []);

  const autoRegisterAll = useCallback(async () => {
    setBusy(true);
    try {
      const created: PartnerLite[] = [];
      for (const name of newPartnerNames) {
        try {
          const p = await autoRegisterPartner(name);
          created.push(p);
        } catch (e) {
          notify.error(`${name} 자동 등록 실패: ${e instanceof Error ? e.message : ''}`);
        }
      }
      setResolvedPartners((prev) => [...prev, ...created]);
      setSeeds((prev) => prev.map((s) => {
        if (s.match?.level !== 'none') return s;
        const found = created.find((c) => c.partner_name === s.rawCustomer);
        if (!found) return s;
        return { ...s, match: { level: 'exact', matched: found, normalizedKey: s.match.normalizedKey } };
      }));
    } finally {
      setBusy(false);
    }
  }, [newPartnerNames]);

  const submitSales = useCallback(async () => {
    setSubmitting(true);
    try {
      const rows = seedsValid
        .filter((s) => s.unitPriceWp && s.unitPriceWp > 0)
        .map((s) => ({
          outbound_id: s.outboundId,
          customer_name: s.match?.matched?.partner_name ?? s.rawCustomer,
          unit_price_wp: s.unitPriceWp,
        }));
      if (rows.length === 0) {
        notify.error('등록할 매출 행이 없습니다 (단가 누락)');
        setSubmitting(false);
        return;
      }
      const result = await fetchWithAuth<ImportResult>('/api/v1/import/sales', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      onCompleted(result);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '매출 일괄 등록 실패');
    } finally {
      setSubmitting(false);
    }
  }, [seedsValid, onCompleted]);

  const skipSales = useCallback(() => onClose(), [onClose]);

  if (!open) return null;

  const seedsWithPrice = seeds.filter((s) => s.unitPriceWp && s.unitPriceWp > 0).length;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            매출 자동 등록
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            출고 등록이 완료되었습니다. 변환된 매출 정보를 같이 등록할까요?
          </p>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded px-2 py-1 font-medium" style={{ background: 'var(--sf-info-bg)', color: 'var(--sf-info)' }}>
            매출 정보 {seedsWithPrice}/{seeds.length}건
          </span>
          {fuzzyByRaw.size > 0 && (
            <span className="flex items-center gap-1 rounded px-2 py-1 font-medium" style={{ background: 'var(--sf-warn-bg)', color: 'var(--sf-warn)' }}>
              <AlertTriangle className="h-3 w-3" />
              거래처 유사 후보 {fuzzyByRaw.size}건
            </span>
          )}
          {newPartnerNames.length > 0 && (
            <span className="flex items-center gap-1 rounded px-2 py-1 font-medium" style={{ background: 'var(--sf-info-bg)', color: 'var(--sf-info)' }}>
              <Plus className="h-3 w-3" />
              신규 거래처 {newPartnerNames.length}건
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {totalActions === 0 && seedsValid.length > 0 && (
            <div className="rounded border border-[var(--line)] bg-[var(--sf-pos-bg)] p-3 text-[12px]" style={{ color: 'var(--sf-pos)' }}>
              <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
              모든 거래처가 매핑되었습니다. 매출 일괄 등록을 진행하세요.
            </div>
          )}

          {fuzzyByRaw.size > 0 && (
            <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-3">
              <div className="mb-2 text-sm font-semibold">거래처 유사 후보 ({fuzzyByRaw.size}건)</div>
              <div className="space-y-2">
                {Array.from(fuzzyByRaw.entries()).map(([raw, group]) => {
                  const sample = group[0];
                  const candidates = sample.match?.candidates ?? [];
                  return (
                    <div key={raw} className="flex flex-wrap items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] p-2">
                      <span className="text-[12px]">
                        <span className="text-[var(--ink-3)]">원본:</span>{' '}
                        <span className="font-semibold text-[var(--ink)]">{raw}</span>
                      </span>
                      <span className="text-[var(--ink-3)] text-[11px]">→</span>
                      {candidates.map((c) => (
                        <Button
                          key={c.partner_id}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={busy}
                          onClick={() => resolveFuzzy(raw, c)}
                        >
                          {c.partner_name} 동일
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        disabled={busy}
                        onClick={() => resolveFuzzy(raw, null)}
                      >
                        <Plus className="h-3 w-3" /> 신규 등록
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {newPartnerNames.length > 0 && (
            <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-3">
              <div className="mb-2 text-sm font-semibold">신규 거래처 자동 등록 대기</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {newPartnerNames.map((n) => (
                  <span key={n} className="sf-pill ghost text-[11px]">{n}</span>
                ))}
              </div>
              <Button size="sm" onClick={autoRegisterAll} disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                일괄 자동 등록 (customer 유형)
              </Button>
            </div>
          )}

          {seedsWithPrice < seeds.length && (
            <p className="text-[11px] text-[var(--ink-3)]">
              ※ {seeds.length - seedsWithPrice}건은 단가 정보가 없어 매출 등록 대상에서 제외됩니다.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={skipSales} disabled={submitting}>
            매출 등록 건너뛰기
          </Button>
          <Button type="button" onClick={submitSales} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            매출 일괄 등록 ({seedsValid.filter((s) => s.unitPriceWp && s.unitPriceWp > 0).length}건)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// outboundRows 와 imported_ids 를 짝 지어 매출 시드 만들기.
function buildSeeds(
  outboundRows: ParsedRow[],
  importedIds: string[],
  partners: PartnerLite[],
  aliases: PartnerAlias[],
): SaleSeed[] {
  const seeds: SaleSeed[] = [];
  const len = Math.min(outboundRows.length, importedIds.length);
  for (let i = 0; i < len; i += 1) {
    const row = outboundRows[i];
    const sp = (row.data['source_payload'] as Record<string, unknown> | undefined) ?? {};
    const rawCustomer = String(sp['customer_name'] ?? '').trim();
    if (!rawCustomer) continue;
    const seed: SaleSeed = {
      outboundId: importedIds[i],
      rawCustomer,
      unitPriceWp: numOrNull(sp['unit_price_wp']),
      supplyAmount: numOrNull(sp['supply_amount']),
      vatAmount: numOrNull(sp['vat_amount']),
      totalAmount: numOrNull(sp['total_amount']),
      match: findPartnerMatch(rawCustomer, partners, aliases),
    };
    seeds.push(seed);
  }
  return seeds;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
