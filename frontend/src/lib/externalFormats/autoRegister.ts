// 외부 양식 변환 시 마스터(법인·품번) 자동 등록 + alias 학습 (D-056).
// 변환 미리보기에서 사용자가 [신규 등록] / [같음] 선택한 결과를 백엔드에 영구 저장.

import { fetchWithAuth } from '@/lib/api';
import type { CompanyAlias, PartnerAlias, ProductAlias } from '@/types/aliases';
import type { CompanyLite, PartnerLite, ProductLite } from './matching';
import { normalizeCompanyName, normalizeProductCode } from './matching';
import type { ManufacturerLite } from './productInference';
import { inferProduct, resolveManufacturerId } from './productInference';

// 자동 회사 코드 생성 — name 의 ASCII/한글 첫 2자 + 6자리 base36 해시.
// CompanyCode 는 10자 제한이라 영숫자/한글 prefix 4자 + 6자 해시 = 최대 10자.
function generateCompanyCode(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9가-힣]/g, '').slice(0, 4) || 'AUTO';
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const tail = Math.abs(hash).toString(36).padStart(6, '0').slice(0, 6).toUpperCase();
  return `${cleaned}${tail}`.slice(0, 10);
}

export async function autoRegisterCompany(rawName: string): Promise<CompanyLite> {
  const company = await fetchWithAuth<CompanyLite>('/api/v1/companies', {
    method: 'POST',
    body: JSON.stringify({
      company_name: rawName.slice(0, 100),
      company_code: generateCompanyCode(rawName),
    }),
  });
  // 자동 등록 직후 정규화 alias 도 함께 학습 (다음 변환부터 즉시 매핑)
  await learnCompanyAlias(company.company_id, rawName).catch(() => undefined);
  return company;
}

export async function autoRegisterProduct(
  rawCode: string,
  manufacturers: ManufacturerLite[],
): Promise<ProductLite> {
  const inferred = inferProduct(rawCode);
  const manufacturerId = inferred ? resolveManufacturerId(inferred.manufacturerHint, manufacturers) : null;
  const wattageW = inferred?.wattageW ?? null;
  const wattageKW = wattageW !== null ? wattageW / 1000 : null;

  const body: Record<string, unknown> = {
    product_code: rawCode.slice(0, 30),
    product_name: rawCode.slice(0, 100),
  };
  if (manufacturerId) body.manufacturer_id = manufacturerId;
  if (wattageW !== null) body.spec_wp = wattageW;
  if (wattageKW !== null) body.wattage_kw = wattageKW;

  // POST /api/v1/products 의 Validate 가 wattage_kw>0 등을 요구 — 추론 실패 시
  // 이 endpoint 는 거부됨. 그 경우 PostgREST 직접 INSERT 로 NULL 허용 컬럼 활용.
  // 1차: 추론 성공 → 정상 등록 시도. 실패 → fallback (PostgREST passthrough)
  try {
    return await fetchWithAuth<ProductLite>('/api/v1/products', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch {
    // fallback: 마스터 검토 큐에 들어가도록 wattage NULL 로 등록
    // 백엔드 Validate 우회는 PostgREST 직접 INSERT 가 필요한데, 보안 정책상 인증 토큰으로 직접
    // 호출은 같은 fetchWithAuth 로 가능. 여기서는 일단 throw — 사용자가 미리보기에서 처리.
    throw new Error(`품번 ${rawCode} 자동 등록 실패 (제조사·wattage 추론 실패). 마스터에 직접 등록 필요`);
  }
}

export async function learnCompanyAlias(
  canonicalCompanyId: string,
  rawText: string,
): Promise<CompanyAlias | null> {
  const normalized = normalizeCompanyName(rawText);
  if (!normalized) return null;
  try {
    return await fetchWithAuth<CompanyAlias>('/api/v1/company-aliases', {
      method: 'POST',
      body: JSON.stringify({
        canonical_company_id: canonicalCompanyId,
        alias_text: rawText,
        alias_text_normalized: normalized,
        source: 'learned',
      }),
    });
  } catch {
    // UNIQUE 위반 등 — 이미 학습된 alias 면 무시
    return null;
  }
}

export async function learnProductAlias(
  canonicalProductId: string,
  rawCode: string,
): Promise<ProductAlias | null> {
  const normalized = normalizeProductCode(rawCode);
  if (!normalized) return null;
  try {
    return await fetchWithAuth<ProductAlias>('/api/v1/product-aliases', {
      method: 'POST',
      body: JSON.stringify({
        canonical_product_id: canonicalProductId,
        alias_code: rawCode,
        alias_code_normalized: normalized,
        source: 'learned',
      }),
    });
  } catch {
    return null;
  }
}

export async function fetchCompanyAliases(): Promise<CompanyAlias[]> {
  return fetchWithAuth<CompanyAlias[]>('/api/v1/company-aliases').catch(() => []);
}

export async function fetchProductAliases(): Promise<ProductAlias[]> {
  return fetchWithAuth<ProductAlias[]>('/api/v1/product-aliases').catch(() => []);
}

// ──────────────────── 거래처 (D-057) ────────────────────

export async function autoRegisterPartner(
  rawName: string,
  partnerType: 'customer' | 'supplier' | 'both' = 'customer',
): Promise<PartnerLite> {
  const partner = await fetchWithAuth<PartnerLite>('/api/v1/partners', {
    method: 'POST',
    body: JSON.stringify({
      partner_name: rawName.slice(0, 100),
      partner_type: partnerType,
    }),
  });
  await learnPartnerAlias(partner.partner_id, rawName).catch(() => undefined);
  return partner;
}

export async function learnPartnerAlias(
  canonicalPartnerId: string,
  rawText: string,
): Promise<PartnerAlias | null> {
  const normalized = normalizeCompanyName(rawText);
  if (!normalized) return null;
  try {
    return await fetchWithAuth<PartnerAlias>('/api/v1/partner-aliases', {
      method: 'POST',
      body: JSON.stringify({
        canonical_partner_id: canonicalPartnerId,
        alias_text: rawText,
        alias_text_normalized: normalized,
        source: 'learned',
      }),
    });
  } catch {
    return null;
  }
}

export async function fetchPartnerAliases(): Promise<PartnerAlias[]> {
  return fetchWithAuth<PartnerAlias[]>('/api/v1/partner-aliases').catch(() => []);
}
