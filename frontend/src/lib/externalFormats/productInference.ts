// 품번 코드에서 제조사·wattage 자동 추론 (D-056).
//
// 외부 양식 변환 시 마스터에 없는 품번을 자동 등록할 때 사용.
// 추론 성공 → 정상 manufacturer/wattage 채워서 신규 등록.
// 추론 실패 → 사용자 확인 (또는 추론 없이 NULL 등록).
//
// 룰은 코드 hardcoded — 새 시리즈가 나오면 룰 추가 PR 필요.
// admin GUI 로 옮기려면 product_naming_rules 테이블 도입.

export interface ManufacturerLite {
  manufacturer_id: string;
  name_kr: string;
  name_en?: string;
  short_name?: string | null;
}

export interface InferredProduct {
  manufacturerHint: string;     // 룰의 제조사 후보 (한글 or 영문 키워드)
  wattageW: number | null;      // 추출된 wattage (단위 W). null=추출 실패
  ruleId: string;               // 디버깅·테스트용 룰 식별자
}

interface InferenceRule {
  id: string;
  pattern: RegExp;
  manufacturerKeyword: string;
  wattageGroup: number;
}

// 룰 정의. 정규화된 품번(영숫자 대문자) 기준이 아니라 원본 코드 기준.
// 추가 시 더 구체적인 패턴을 위에 둘 것 (먼저 매치되는 룰이 채택됨).
const RULES: InferenceRule[] = [
  // Trina Solar — TSM-720NEG21C.20K, TSM-710NEG21C.20K
  { id: 'trina_tsm', pattern: /^TSM[\s-]*(\d{3})/i, manufacturerKeyword: 'Trina', wattageGroup: 1 },
  // LONGi — LR7-72HYD-645M, LR7-72HGD-615M, LR8-66HYD-650M
  { id: 'longi_lr', pattern: /^LR[78][\s-]*\d+H[YGSM]D[\s-]*(\d{3})/i, manufacturerKeyword: 'LONGi', wattageGroup: 1 },
  // JinkoSolar — JKM635N-78HL4-BDV-S, JKM640N-78HL4-BDV-S1
  { id: 'jinko_jkm', pattern: /^JKM[\s-]*(\d{3})/i, manufacturerKeyword: 'Jinko', wattageGroup: 1 },
  // Risen — RSM156-9-640BNDG-30, RSM156-640BNDG-30
  { id: 'risen_rsm', pattern: /^RSM[\s-]*\d+[\s-]+(?:\d+[\s-]+)?(\d{3})/i, manufacturerKeyword: 'Risen', wattageGroup: 1 },
  // Hanwha Q-cells — Q.PEAK 등 (HA prefix는 모호 — 우선순위 낮음)
  { id: 'hanwha_qcell', pattern: /^Q[.\s-]*PEAK[\s-]*\w*[\s-]+(\d{3})/i, manufacturerKeyword: 'Hanwha', wattageGroup: 1 },
];

// HA prefix 같은 모호한 패턴은 wattage만 추출하고 manufacturer 미정.
// 사용자가 미리보기에서 매핑 선택.
const WATTAGE_ONLY_RULES: InferenceRule[] = [
  // HA640AE-NDE00 — wattage 만 추출
  { id: 'unknown_ha', pattern: /^HA[\s-]*(\d{3})/i, manufacturerKeyword: '', wattageGroup: 1 },
];

export function inferProduct(rawCode: string): InferredProduct | null {
  const code = String(rawCode ?? '').trim();
  if (!code) return null;

  for (const r of RULES) {
    const m = r.pattern.exec(code);
    if (m) {
      const w = parseInt(m[r.wattageGroup], 10);
      return {
        manufacturerHint: r.manufacturerKeyword,
        wattageW: Number.isFinite(w) && w > 0 ? w : null,
        ruleId: r.id,
      };
    }
  }
  for (const r of WATTAGE_ONLY_RULES) {
    const m = r.pattern.exec(code);
    if (m) {
      const w = parseInt(m[r.wattageGroup], 10);
      return {
        manufacturerHint: '',
        wattageW: Number.isFinite(w) && w > 0 ? w : null,
        ruleId: r.id,
      };
    }
  }

  return null;
}

// 추론된 manufacturer 키워드를 마스터 목록과 매칭하여 manufacturer_id 결정.
// 한글명·영문명·약칭 어느 한쪽이라도 keyword 를 substring 포함하면 매치.
export function resolveManufacturerId(
  hint: string,
  manufacturers: ManufacturerLite[],
): string | null {
  if (!hint) return null;
  const k = hint.toLowerCase();
  for (const m of manufacturers) {
    const fields = [m.name_kr, m.name_en ?? '', m.short_name ?? ''];
    for (const f of fields) {
      if (f && f.toLowerCase().includes(k)) return m.manufacturer_id;
    }
  }
  return null;
}
