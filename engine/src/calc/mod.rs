pub mod inventory;
pub mod landed_cost;
pub mod lc_schedule;

pub mod margin;
pub mod forecast;
pub mod order_risk;
pub mod price_forecast;

pub mod receipt_match;
pub mod search;
pub mod turnover;

use uuid::Uuid;

/// 단일 `company_id` 또는 다중 `company_ids` 요청을 단일 Vec 으로 정규화.
/// 호출 측 핸들러가 검증을 마쳤다고 가정 — 빈 Vec 반환 시 SQL 의 ANY()
/// 가 0행 매칭으로 떨어진다.
pub fn resolve_company_ids(ids: Option<&[Uuid]>, single: Option<Uuid>) -> Vec<Uuid> {
    match (ids, single) {
        (Some(v), _) if !v.is_empty() => v.to_vec(),
        (_, Some(id)) => vec![id],
        _ => Vec::new(),
    }
}
