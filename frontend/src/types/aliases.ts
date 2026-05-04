// 법인·품번 alias 학습 사전 (D-056).
// 외부 양식 변환기가 fuzzy 매칭으로 사용자가 [같음] 선택한 결과를 영구 저장하여
// 다음 변환부터 자동 매핑한다.

export type AliasSource = 'manual' | 'learned' | 'import';

export interface CompanyAlias {
  alias_id: string;
  canonical_company_id: string;
  alias_text: string;
  alias_text_normalized: string;
  source: AliasSource;
  created_at: string;
  created_by?: string;
}

export interface ProductAlias {
  alias_id: string;
  canonical_product_id: string;
  alias_code: string;
  alias_code_normalized: string;
  source: AliasSource;
  created_at: string;
  created_by?: string;
}

export interface CreateCompanyAliasRequest {
  canonical_company_id: string;
  alias_text: string;
  alias_text_normalized: string;
  source?: AliasSource;
}

export interface CreateProductAliasRequest {
  canonical_product_id: string;
  alias_code: string;
  alias_code_normalized: string;
  source?: AliasSource;
}

// 거래처 alias (D-057) — 매출 자동 등록 시 customer_name 매칭에 사용.
export interface PartnerAlias {
  alias_id: string;
  canonical_partner_id: string;
  alias_text: string;
  alias_text_normalized: string;
  source: AliasSource;
  created_at: string;
  created_by?: string;
}

export interface CreatePartnerAliasRequest {
  canonical_partner_id: string;
  alias_text: string;
  alias_text_normalized: string;
  source?: AliasSource;
}
