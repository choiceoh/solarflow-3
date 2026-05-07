import { useMemo, useState } from 'react';
import { Zap, Calculator, Search, Info } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

// InverterGuidePage — D-130 인버터 호환 가이드 (BARO 전용).
//
// PR6 Phase 1 frontend-only 정적 참조 페이지.
// BARO 영업이 시공업체에게 모듈+인버터 묶음 견적을 만들 때 "이 모듈 N장에 적합한
// 인버터 모델?" 을 30초 안에 답할 수 있도록 한 화면 가이드.
//
// PR6.5 분리 (별도 D-NNN, 신규 backend 필요):
//   - products.product_kind 컬럼 추가 마이그레이션 (module / inverter / package)
//   - 실제 인버터 SKU 마스터 등록 + CRUD 페이지
//   - 모듈+인버터 패키지 SKU 테이블 (자주 나가는 조합)
//   - QuoteBuilder 통합 (자동 인버터 추천 라인 추가)
//   - DB의 인버터 카탈로그 + 본 페이지 fallback 통합

// ---------- 정적 카탈로그 ----------

interface InverterModel {
  manufacturer: string;
  model: string;
  rated_power_kw: number;
  max_input_kw: number; // 모듈 측 권장 최대 (오버사이징 한도)
  mppt_channels: number;
  voltage_range_v: [number, number]; // MPPT 전압 범위
  phase: '1P' | '3P';
  use_case: '주거' | '상업' | '발전소';
  notes?: string;
}

const INVERTER_CATALOG: InverterModel[] = [
  // 주거용 1상 5~10kW
  {
    manufacturer: 'Sungrow',
    model: 'SG5K-D',
    rated_power_kw: 5.0,
    max_input_kw: 7.5,
    mppt_channels: 2,
    voltage_range_v: [80, 600],
    phase: '1P',
    use_case: '주거',
  },
  {
    manufacturer: 'Sungrow',
    model: 'SG10RT',
    rated_power_kw: 10.0,
    max_input_kw: 13.0,
    mppt_channels: 2,
    voltage_range_v: [180, 1000],
    phase: '3P',
    use_case: '주거',
  },
  {
    manufacturer: 'Huawei',
    model: 'SUN2000-5KTL-L1',
    rated_power_kw: 5.0,
    max_input_kw: 7.5,
    mppt_channels: 2,
    voltage_range_v: [90, 560],
    phase: '1P',
    use_case: '주거',
  },
  {
    manufacturer: 'GoodWe',
    model: 'GW10K-DT',
    rated_power_kw: 10.0,
    max_input_kw: 13.0,
    mppt_channels: 2,
    voltage_range_v: [180, 1000],
    phase: '3P',
    use_case: '주거',
  },
  // 상업용 3상 25~50kW
  {
    manufacturer: 'Sungrow',
    model: 'SG33CX',
    rated_power_kw: 33.0,
    max_input_kw: 49.5,
    mppt_channels: 3,
    voltage_range_v: [200, 1000],
    phase: '3P',
    use_case: '상업',
    notes: '소규모 상업·산단 표준',
  },
  {
    manufacturer: 'Sungrow',
    model: 'SG50CX',
    rated_power_kw: 50.0,
    max_input_kw: 75.0,
    mppt_channels: 5,
    voltage_range_v: [200, 1000],
    phase: '3P',
    use_case: '상업',
  },
  {
    manufacturer: 'Huawei',
    model: 'SUN2000-50KTL-M3',
    rated_power_kw: 50.0,
    max_input_kw: 75.0,
    mppt_channels: 4,
    voltage_range_v: [200, 1000],
    phase: '3P',
    use_case: '상업',
  },
  {
    manufacturer: 'GoodWe',
    model: 'GW50KS-MT',
    rated_power_kw: 50.0,
    max_input_kw: 75.0,
    mppt_channels: 4,
    voltage_range_v: [200, 1000],
    phase: '3P',
    use_case: '상업',
  },
  // 발전소용 100kW+
  {
    manufacturer: 'Sungrow',
    model: 'SG110CX',
    rated_power_kw: 110.0,
    max_input_kw: 165.0,
    mppt_channels: 9,
    voltage_range_v: [200, 1000],
    phase: '3P',
    use_case: '발전소',
    notes: '대형 옥상·지상',
  },
  {
    manufacturer: 'Huawei',
    model: 'SUN2000-100KTL-M1',
    rated_power_kw: 100.0,
    max_input_kw: 150.0,
    mppt_channels: 10,
    voltage_range_v: [200, 1000],
    phase: '3P',
    use_case: '발전소',
  },
];

const USE_CASE_TONE: Record<InverterModel['use_case'], string> = {
  주거: 'border-blue-200 bg-blue-50/50',
  상업: 'border-green-200 bg-green-50/50',
  발전소: 'border-amber-200 bg-amber-50/50',
};

// ---------- 페이지 ----------

export default function InverterGuidePage() {
  const [moduleCount, setModuleCount] = useState<string>('');
  const [moduleSpecWp, setModuleSpecWp] = useState<string>('635');
  const [filter, setFilter] = useState('');
  const [useCase, setUseCase] = useState<'all' | InverterModel['use_case']>('all');

  const totalKw = useMemo(() => {
    const n = Number(moduleCount);
    const w = Number(moduleSpecWp);
    if (!Number.isFinite(n) || !Number.isFinite(w) || n <= 0 || w <= 0) return null;
    return (n * w) / 1000;
  }, [moduleCount, moduleSpecWp]);

  // 추천 로직: 입력 kW 가 인버터 rated 이상 max_input 이하 — 적정 오버사이징(1.0~1.3)
  // 더 정확한 매칭은 PR6.5 에서 전압·MPPT 채널 상세 기반.
  const recommended = useMemo(() => {
    if (totalKw == null) return null;
    return INVERTER_CATALOG.filter((inv) => {
      const ratio = totalKw / inv.rated_power_kw;
      return ratio >= 1.0 && ratio <= 1.3;
    }).sort((a, b) => a.rated_power_kw - b.rated_power_kw);
  }, [totalKw]);

  const filteredList = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return INVERTER_CATALOG.filter((inv) => {
      if (useCase !== 'all' && inv.use_case !== useCase) return false;
      if (!f) return true;
      return `${inv.manufacturer} ${inv.model}`.toLowerCase().includes(f);
    });
  }, [filter, useCase]);

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h1 className="text-base font-semibold">인버터 호환 가이드</h1>
        <span className="text-xs text-muted-foreground">
          모듈 수량/규격 입력 → 적정 인버터 추천. 시공업체 견적 보조용 정적 카탈로그.
        </span>
      </div>

      {/* 안내 배너 — Phase 1 한정 */}
      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span>
          PR6 Phase 1 — 정적 카탈로그 (Sungrow / Huawei / GoodWe 주력 모델 10종).
          실제 인버터 SKU 등록·재고 연동·견적 빌더 통합은 PR6.5 (DB 마이그레이션 동반).
        </span>
      </div>

      {/* 용량 계산기 */}
      <section className="rounded-md border bg-card p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-sm font-semibold">용량 계산기</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">모듈 수량 (장)</Label>
            <Input
              type="number"
              min="1"
              value={moduleCount}
              onChange={(e) => setModuleCount(e.target.value)}
              placeholder="예: 30"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">모듈 spec_wp (W)</Label>
            <Input
              type="number"
              min="1"
              value={moduleSpecWp}
              onChange={(e) => setModuleSpecWp(e.target.value)}
              placeholder="예: 635"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">총 용량</Label>
            <div className="flex h-8 items-center rounded border bg-muted/30 px-2 text-sm font-semibold tabular-nums">
              {totalKw != null ? `${totalKw.toFixed(2)} kW` : '—'}
            </div>
          </div>
        </div>

        {totalKw != null && (
          <div className="mt-3">
            <div className="mb-1.5 text-xs font-medium">
              추천 인버터 ({recommended?.length ?? 0}개) — 오버사이징 1.0 ~ 1.3 범위
            </div>
            {recommended && recommended.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {recommended.map((inv) => {
                  const ratio = totalKw / inv.rated_power_kw;
                  return (
                    <div
                      key={`${inv.manufacturer}-${inv.model}`}
                      className={`rounded-md border px-2.5 py-2 text-xs ${USE_CASE_TONE[inv.use_case]}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{inv.manufacturer}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {inv.use_case}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-[11px]">{inv.model}</div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{inv.rated_power_kw}kW · {inv.phase} · {inv.mppt_channels}MPPT</span>
                        <span className="font-medium tabular-nums">×{ratio.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {totalKw < 5
                  ? '용량이 너무 작아 표준 카탈로그 범위 밖입니다 (5kW 미만)'
                  : '카탈로그 범위 밖 — 직접 제조사 문의 필요'}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 전체 카탈로그 */}
      <section className="flex min-h-0 flex-1 flex-col rounded-md border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">전체 카탈로그</h2>
          <Badge variant="outline" className="text-[10px]">
            {filteredList.length}개
          </Badge>
          <div className="ml-auto flex items-center gap-1.5">
            {(['all', '주거', '상업', '발전소'] as const).map((uc) => (
              <button
                key={uc}
                type="button"
                onClick={() => setUseCase(uc)}
                data-active={useCase === uc}
                className="rounded border px-2 py-0.5 text-[11px] data-[active=true]:border-primary data-[active=true]:bg-primary/10"
              >
                {uc === 'all' ? '전체' : uc}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="제조사/모델 검색..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-1.5 px-2 text-left font-normal">제조사 / 모델</th>
                <th className="py-1.5 px-2 text-right font-normal">정격</th>
                <th className="py-1.5 px-2 text-right font-normal">최대 입력</th>
                <th className="py-1.5 px-2 text-center font-normal">상</th>
                <th className="py-1.5 px-2 text-center font-normal">MPPT</th>
                <th className="py-1.5 px-2 text-left font-normal">전압</th>
                <th className="py-1.5 px-2 text-left font-normal">용도</th>
                <th className="py-1.5 px-2 text-left font-normal">비고</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    조건에 맞는 인버터가 없습니다
                  </td>
                </tr>
              ) : (
                filteredList.map((inv) => (
                  <tr key={`${inv.manufacturer}-${inv.model}`} className="border-t">
                    <td className="py-1.5 px-2">
                      <div className="font-medium">{inv.manufacturer}</div>
                      <div className="text-[10px] text-muted-foreground">{inv.model}</div>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{inv.rated_power_kw}kW</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{inv.max_input_kw}kW</td>
                    <td className="py-1.5 px-2 text-center">{inv.phase}</td>
                    <td className="py-1.5 px-2 text-center tabular-nums">{inv.mppt_channels}</td>
                    <td className="py-1.5 px-2 text-[10px] text-muted-foreground">
                      {inv.voltage_range_v[0]}–{inv.voltage_range_v[1]}V
                    </td>
                    <td className="py-1.5 px-2">
                      <Badge variant="outline" className="text-[10px]">
                        {inv.use_case}
                      </Badge>
                    </td>
                    <td className="py-1.5 px-2 text-[10px] text-muted-foreground">{inv.notes ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
