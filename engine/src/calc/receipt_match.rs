/// 수금 매칭 자동 추천
/// 비유: "수금 매칭 도우미" — 입금액에 맞는 미수금 조합을 찾아주는 것

use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::model::receipt_match::*;

// === 공개 단위 함수 (테스트용) ===

/// match_rate 계산
pub fn calc_match_rate(matched: f64, target: f64) -> f64 {
    if target <= 0.0 { return 0.0; }
    ((matched / target * 1000.0).round()) / 10.0
}

/// 미수금 status 판별
pub fn outstanding_status(days: i64) -> String {
    if days <= 30 { "normal".to_string() }
    else if days <= 60 { "warning".to_string() }
    else { "overdue".to_string() }
}

/// 단일 정확 매칭: 1건 = target
pub fn find_single_match(items: &[OutstandingItem], target: f64) -> Option<Suggestion> {
    for item in items {
        if (item.outstanding_amount - target).abs() < 0.01 {
            return Some(make_suggestion("single", "단일 건 정확 일치", &[item.clone()], target, target));
        }
    }
    None
}

/// 조합 정확 매칭 (N<=20: 비트마스크, N>20: skip)
pub fn find_exact_matches(items: &[OutstandingItem], target: f64) -> Vec<Suggestion> {
    let n = items.len();
    if n == 0 || n > 20 { return Vec::new(); }

    let mut results: Vec<Suggestion> = Vec::new();
    let limit = 1u32 << n;

    for mask in 1..limit {
        let mut total = 0.0;
        let mut selected: Vec<OutstandingItem> = Vec::new();

        for i in 0..n {
            if mask & (1 << i) != 0 {
                total += items[i].outstanding_amount;
                selected.push(items[i].clone());
                if total > target + 0.01 { break; }
            }
        }

        if (total - target).abs() < 0.01 && selected.len() > 1 {
            results.push(make_suggestion("exact", "정확히 일치하는 조합", &selected, total, target));
            if results.len() >= 3 { break; }
        }
    }
    results
}

/// 근사 매칭: target 이하 최대 조합 (날짜 오래된 순 greedy)
pub fn find_closest_match(items: &[OutstandingItem], target: f64) -> Option<Suggestion> {
    let mut selected: Vec<OutstandingItem> = Vec::new();
    let mut total = 0.0;

    for item in items {
        if total + item.outstanding_amount <= target + 0.01 {
            total += item.outstanding_amount;
            selected.push(item.clone());
        }
    }

    if selected.is_empty() { return None; }
    Some(make_suggestion("closest", "가장 근사한 조합 (날짜순)", &selected, total, target))
}

fn make_suggestion(match_type: &str, desc: &str, items: &[OutstandingItem], total: f64, target: f64) -> Suggestion {
    let remainder = (target - total).max(0.0);
    let match_type_final = if remainder < 0.01 && match_type == "closest" { "exact" } else { match_type };
    Suggestion {
        match_type: match_type_final.to_string(),
        description: desc.to_string(),
        items: items.iter().map(|i| SuggestionItem {
            outbound_id: i.outbound_id,
            outbound_date: i.outbound_date.clone(),
            site_name: i.site_name.clone(),
            product_name: i.product_name.clone(),
            outstanding_amount: i.outstanding_amount,
            match_amount: i.outstanding_amount,
        }).collect(),
        total_matched: r2(total),
        remainder: r2(remainder),
        match_rate: calc_match_rate(total, target),
    }
}

// === SQL 행 타입 ===

#[derive(sqlx::FromRow)]
struct OutstandingRow {
    outbound_id: Uuid,
    outbound_date: Option<chrono::NaiveDate>,
    product_name: String,
    spec_wp: i32,
    quantity: i32,
    site_name: Option<String>,
    customer_name: String,
    total_amount: f64,
    collected_amount: f64,
    outstanding_amount: f64,
    days_elapsed: Option<i32>,
    tax_invoice_date: Option<chrono::NaiveDate>,
}

// === API 1: 미수금 목록 ===

pub async fn get_outstanding_list(pool: &PgPool, req: &OutstandingListRequest) -> Result<OutstandingListResponse, sqlx::Error> {
    let company_id = req.company_id.unwrap();
    let customer_id = req.customer_id.unwrap();

    let rows = sqlx::query_as::<_, OutstandingRow>(
        r#"
        SELECT o.outbound_id, o.outbound_date, p.product_name, p.spec_wp, o.quantity,
               o.site_name, ptr.partner_name as customer_name,
               s.total_amount::float8 as total_amount,
               COALESCE(matched.total_matched, 0)::float8 as collected_amount,
               (s.total_amount - COALESCE(matched.total_matched, 0))::float8 as outstanding_amount,
               (CURRENT_DATE - o.outbound_date)::int as days_elapsed,
               s.tax_invoice_date
        FROM sales s
        JOIN outbounds o ON s.outbound_id = o.outbound_id
        JOIN products p ON o.product_id = p.product_id
        JOIN partners ptr ON s.customer_id = ptr.partner_id
        LEFT JOIN (
            SELECT rm.outbound_id, SUM(rm.matched_amount) as total_matched
            FROM receipt_matches rm GROUP BY rm.outbound_id
        ) matched ON matched.outbound_id = o.outbound_id
        WHERE o.company_id = $1 AND s.customer_id = $2 AND o.status = 'active'
          AND COALESCE(s.status, 'active') <> 'cancelled'
          AND s.total_amount > COALESCE(matched.total_matched, 0)
        ORDER BY o.outbound_date ASC
        LIMIT 50
        "#,
    )
    .bind(company_id).bind(customer_id)
    .fetch_all(pool).await?;

    let customer_name = rows.first().map(|r| r.customer_name.clone()).unwrap_or_default();

    let items: Vec<OutstandingItem> = rows.iter().map(|r| {
        let days = r.days_elapsed.unwrap_or(0) as i64;
        OutstandingItem {
            outbound_id: r.outbound_id,
            outbound_date: r.outbound_date.map(|d| d.to_string()),
            product_name: r.product_name.clone(), spec_wp: r.spec_wp,
            quantity: r.quantity, site_name: r.site_name.clone(),
            total_amount: r.total_amount, collected_amount: r.collected_amount,
            outstanding_amount: r.outstanding_amount, days_elapsed: days,
            tax_invoice_date: r.tax_invoice_date.map(|d| d.to_string()),
            status: outstanding_status(days),
        }
    }).collect();

    let total: f64 = items.iter().map(|i| i.outstanding_amount).sum();
    let count = items.len();

    Ok(OutstandingListResponse {
        customer_id, customer_name, outstanding_items: items,
        total_outstanding: r2(total), outstanding_count: count,
        calculated_at: Utc::now(),
    })
}

// === API 2: 매칭 추천 ===

pub async fn suggest_receipt_match(pool: &PgPool, req: &ReceiptMatchSuggestRequest) -> Result<ReceiptMatchSuggestResponse, sqlx::Error> {
    let target = req.receipt_amount.unwrap();

    // 미수금 목록 재사용
    let list_req = OutstandingListRequest { company_id: req.company_id, customer_id: req.customer_id };
    let list = get_outstanding_list(pool, &list_req).await?;
    let items = &list.outstanding_items;

    let mut suggestions: Vec<Suggestion> = Vec::new();

    // 1. 단일 정확 매칭
    if let Some(s) = find_single_match(items, target) {
        suggestions.push(s);
    }

    // 2. 조합 정확 매칭
    let exact = find_exact_matches(items, target);
    for s in exact {
        if suggestions.len() < 3 { suggestions.push(s); }
    }

    // 3. 근사 매칭 (정확 일치 없으면)
    if suggestions.is_empty() {
        if let Some(s) = find_closest_match(items, target) {
            suggestions.push(s);
        }
    }

    let unmatched = if suggestions.is_empty() { target } else { 0.0 };

    Ok(ReceiptMatchSuggestResponse {
        receipt_amount: target, suggestions,
        unmatched_amount: r2(unmatched),
        calculated_at: Utc::now(),
    })
}

fn r2(v: f64) -> f64 { (v * 100.0).round() / 100.0 }
