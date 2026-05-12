/// LC 수수료 계산 + 한도 복원 타임라인 + 만기 알림
/// 비유: "LC 관리실" — 수수료 예상, 한도 잔여, 만기 임박 알림

use chrono::{Datelike, NaiveDate, Utc};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::calc::resolve_company_ids;
use crate::model::lc_schedule::*;

// === 수수료 계산 공개 함수 ===

/// 개설수수료 계산
pub fn calc_opening_fee(amount_usd: f64, rate: f64, exchange_rate: f64) -> f64 {
    (amount_usd * rate * exchange_rate * 100.0).round() / 100.0
}

/// 인수수수료 계산
pub fn calc_acceptance_fee(amount_usd: f64, rate: f64, days: i32, exchange_rate: f64) -> f64 {
    (amount_usd * rate * (days as f64 / 360.0) * exchange_rate * 100.0).round() / 100.0
}

/// 한도 복원 계산
pub fn calc_restoration(limit: f64, used: f64, restorations: &[f64]) -> (f64, Vec<f64>) {
    let mut available = limit - used;
    let mut cumulative: Vec<f64> = Vec::new();
    for amt in restorations {
        available += amt;
        cumulative.push((available * 100.0).round() / 100.0);
    }
    ((limit - used).max(0.0), cumulative)
}

/// severity 판별
pub fn severity(days_remaining: i64) -> String {
    if days_remaining <= 3 { "critical".to_string() } else { "warning".to_string() }
}

// === SQL 행 타입 ===

#[derive(sqlx::FromRow)]
struct LcRow {
    lc_id: Uuid,
    lc_number: Option<String>,
    po_number: Option<String>,
    bank_name: String,
    company_name: String,
    company_id: Uuid,
    amount_usd: f64,
    open_date: Option<NaiveDate>,
    usance_days: Option<i32>,
    maturity_date: Option<NaiveDate>,
    status: String,
    opening_fee_rate: Option<f64>,
    acceptance_fee_rate: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct ExchangeRateRow { exchange_rate: f64 }

#[derive(sqlx::FromRow)]
struct BankRow {
    bank_id: Uuid,
    bank_name: String,
    lc_limit_usd: f64,
    used_usd: f64,
}

#[derive(sqlx::FromRow)]
struct EventRow {
    lc_number: Option<String>,
    amount_usd: f64,
    maturity_date: Option<NaiveDate>,
    bank_id: Uuid,
    po_number: Option<String>,
}

#[derive(sqlx::FromRow)]
struct AlertRow {
    lc_id: Uuid,
    lc_number: Option<String>,
    bank_name: String,
    company_name: String,
    amount_usd: f64,
    maturity_date: Option<NaiveDate>,
    po_number: Option<String>,
}

// === API 1: LC 수수료 ===

pub async fn calculate_lc_fees(pool: &PgPool, req: &LcFeeRequest) -> Result<LcFeeResponse, sqlx::Error> {
    let rows = sqlx::query_as::<_, LcRow>(
        r#"
        SELECT lc.lc_id, lc.lc_number, po.po_number, b.bank_name,
               c.company_name, c.company_id,
               lc.amount_usd::float8 as amount_usd, lc.open_date,
               lc.usance_days, lc.maturity_date, lc.status,
               b.opening_fee_rate::float8 as opening_fee_rate,
               b.acceptance_fee_rate::float8 as acceptance_fee_rate
        FROM lc_records lc
        JOIN banks b ON lc.bank_id = b.bank_id
        JOIN companies c ON lc.company_id = c.company_id
        LEFT JOIN purchase_orders po ON lc.po_id = po.po_id
        WHERE (
          ($1::uuid IS NOT NULL AND lc.lc_id = $1)
          OR ($1::uuid IS NULL AND lc.company_id = $2)
        )
        ORDER BY lc.maturity_date ASC
        "#,
    )
    .bind(req.lc_id)
    .bind(req.company_id)
    .fetch_all(pool)
    .await?;

    let today = Utc::now().date_naive();
    let mut items: Vec<LcFeeItem> = Vec::new();

    for r in &rows {
        // status 필터
        if let Some(ref filter) = req.status_filter {
            if !filter.contains(&r.status) { continue; }
        }

        let usance = r.usance_days.unwrap_or(90);
        let days_to_maturity = r.maturity_date.map(|d| (d - today).num_days()).unwrap_or(0);

        // 환율 조회: B/L 우선 -> 최근 면장
        let exchange_rate = fetch_exchange_rate(pool, r.lc_id, r.company_id).await?;

        let opening_rate = r.opening_fee_rate.unwrap_or(0.0);
        let acceptance_rate = r.acceptance_fee_rate.unwrap_or(0.0);
        let opening_fee_krw = calc_opening_fee(r.amount_usd, opening_rate, exchange_rate);
        let acceptance_fee_krw = calc_acceptance_fee(r.amount_usd, acceptance_rate, usance, exchange_rate);
        let total = opening_fee_krw + acceptance_fee_krw;

        items.push(LcFeeItem {
            lc_id: r.lc_id,
            lc_number: r.lc_number.clone(),
            po_number: r.po_number.clone(),
            bank_name: r.bank_name.clone(),
            company_name: r.company_name.clone(),
            amount_usd: r.amount_usd,
            open_date: r.open_date.map(|d| d.to_string()),
            usance_days: usance,
            maturity_date: r.maturity_date.map(|d| d.to_string()),
            days_to_maturity,
            status: r.status.clone(),
            exchange_rate,
            opening_fee: FeeDetail { rate: opening_rate, amount_krw: opening_fee_krw },
            acceptance_fee: AcceptanceFeeDetail {
                rate: acceptance_rate, days: usance, amount_krw: acceptance_fee_krw,
                formula: format!("{} x {} x {}/360 x {}", r.amount_usd, acceptance_rate, usance, exchange_rate),
            },
            total_fee_krw: total,
        });
    }

    let summary = LcFeeSummary {
        total_lc_amount_usd: items.iter().map(|i| i.amount_usd).sum(),
        total_opening_fee_krw: items.iter().map(|i| i.opening_fee.amount_krw).sum(),
        total_acceptance_fee_krw: items.iter().map(|i| i.acceptance_fee.amount_krw).sum(),
        total_fee_krw: items.iter().map(|i| i.total_fee_krw).sum(),
    };

    Ok(LcFeeResponse {
        items, summary,
        fee_note: "요율 기반 자동 계산 예상 금액. 실제 은행 청구 금액과 차이 가능.".to_string(),
        calculated_at: Utc::now(),
    })
}

// === API 2: 한도 복원 타임라인 ===

pub async fn calculate_limit_timeline(pool: &PgPool, req: &LcLimitTimelineRequest) -> Result<LcLimitTimelineResponse, sqlx::Error> {
    let company_ids = resolve_company_ids(req.company_ids.as_deref(), req.company_id);
    let months = req.months_ahead;

    let bank_rows = sqlx::query_as::<_, BankRow>(
        r#"
        SELECT b.bank_id, b.bank_name, b.lc_limit_usd::float8 as lc_limit_usd,
               COALESCE(SUM(CASE WHEN lc.status IN ('opened', 'docs_received')
                           THEN lc.amount_usd ELSE 0 END), 0)::float8 as used_usd
        FROM banks b
        LEFT JOIN lc_records lc ON lc.bank_id = b.bank_id
        WHERE b.is_active = true
          AND b.company_id = ANY($1::uuid[])
        GROUP BY b.bank_id, b.bank_name, b.lc_limit_usd
        "#,
    )
    .bind(&company_ids)
    .fetch_all(pool)
    .await?;

    let events = sqlx::query_as::<_, EventRow>(
        r#"
        SELECT lc.lc_number, lc.amount_usd::float8 as amount_usd,
               lc.maturity_date, lc.bank_id, po.po_number
        FROM lc_records lc
        LEFT JOIN purchase_orders po ON lc.po_id = po.po_id
        WHERE lc.status IN ('opened', 'docs_received')
          AND lc.maturity_date > CURRENT_DATE
          AND lc.maturity_date <= CURRENT_DATE + INTERVAL '1 month' * $1
          AND lc.company_id = ANY($2::uuid[])
        ORDER BY lc.maturity_date ASC
        "#,
    )
    .bind(months)
    .bind(&company_ids)
    .fetch_all(pool)
    .await?;

    // bank_id → bank_name 룩업 (timeline_events 의 bank_name 채우기 용)
    let bank_name_by_id: HashMap<Uuid, String> = bank_rows
        .iter()
        .map(|b| (b.bank_id, b.bank_name.clone()))
        .collect();

    // bank_summaries: 은행 한도 현재 사용량 스냅샷
    let bank_summaries: Vec<BankSummary> = bank_rows
        .iter()
        .map(|br| {
            let available = (br.lc_limit_usd - br.used_usd).max(0.0);
            let usage_rate = if br.lc_limit_usd > 0.0 {
                (br.used_usd / br.lc_limit_usd * 1000.0).round() / 10.0
            } else {
                0.0
            };
            BankSummary {
                bank_name: br.bank_name.clone(),
                limit: br.lc_limit_usd,
                used: br.used_usd,
                available: (available * 100.0).round() / 100.0,
                usage_rate,
            }
        })
        .collect();

    // timeline_events: 모든 은행의 만기(=한도 복원) 이벤트 평탄화
    // amount 부호: 만기 → 한도가 amount 만큼 복원되므로 양수
    let timeline_events: Vec<TimelineEvent> = events
        .iter()
        .map(|e| {
            let bank_name = bank_name_by_id
                .get(&e.bank_id)
                .cloned()
                .unwrap_or_default();
            let description = match (&e.lc_number, &e.po_number) {
                (Some(lc), _) => format!("{lc} 만기"),
                (None, Some(po)) => format!("PO {po} LC 만기"),
                _ => "LC 만기".to_string(),
            };
            TimelineEvent {
                date: e.maturity_date.map(|d| d.to_string()).unwrap_or_default(),
                bank_name,
                amount: e.amount_usd,
                description,
            }
        })
        .collect();

    // monthly_projection: 월별 누적 가용한도 예측
    let today = Utc::now().date_naive();
    let total_limit: f64 = bank_summaries.iter().map(|b| b.limit).sum();
    let total_used: f64 = bank_summaries.iter().map(|b| b.used).sum();
    let total_available = (total_limit - total_used).max(0.0);

    let mut monthly_projection: Vec<MonthlyProjection> = Vec::new();
    let mut cum = total_available;
    for m in 0..months {
        let target = add_months(today, m);
        let month_str = format!("{:04}-{:02}", target.year(), target.month());
        let month_restoration: f64 = events
            .iter()
            .filter(|e| {
                e.maturity_date
                    .map(|d| format!("{:04}-{:02}", d.year(), d.month()) == month_str)
                    .unwrap_or(false)
            })
            .map(|e| e.amount_usd)
            .sum();
        cum += month_restoration;
        monthly_projection.push(MonthlyProjection {
            month: month_str,
            projected_available: (cum * 100.0).round() / 100.0,
        });
    }

    Ok(LcLimitTimelineResponse {
        bank_summaries,
        timeline_events,
        monthly_projection,
        calculated_at: Utc::now(),
    })
}

// === API 3: 만기 알림 ===

pub async fn get_maturity_alerts(pool: &PgPool, req: &LcMaturityAlertRequest) -> Result<LcMaturityAlertResponse, sqlx::Error> {
    let company_ids = resolve_company_ids(req.company_ids.as_deref(), req.company_id);
    let days = req.days_ahead;
    let today = Utc::now().date_naive();

    let rows = sqlx::query_as::<_, AlertRow>(
        r#"
        SELECT lc.lc_id, lc.lc_number, lc.amount_usd::float8 as amount_usd,
               lc.maturity_date, b.bank_name, c.company_name, po.po_number
        FROM lc_records lc
        JOIN banks b ON lc.bank_id = b.bank_id
        JOIN companies c ON lc.company_id = c.company_id
        LEFT JOIN purchase_orders po ON lc.po_id = po.po_id
        WHERE lc.status IN ('opened', 'docs_received')
          AND lc.maturity_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'
          AND lc.company_id = ANY($2::uuid[])
        ORDER BY lc.maturity_date ASC
        "#,
    )
    .bind(days)
    .bind(&company_ids)
    .fetch_all(pool)
    .await?;

    let alerts: Vec<MaturityAlert> = rows.iter().map(|r| {
        let days_remaining = r.maturity_date.map(|d| (d - today).num_days()).unwrap_or(0);
        MaturityAlert {
            lc_id: r.lc_id,
            lc_number: r.lc_number.clone(),
            bank_name: r.bank_name.clone(),
            company_name: r.company_name.clone(),
            amount_usd: r.amount_usd,
            maturity_date: r.maturity_date.map(|d| d.to_string()).unwrap_or_default(),
            days_remaining,
            po_number: r.po_number.clone(),
            severity: severity(days_remaining),
        }
    }).collect();

    let count = alerts.len();
    Ok(LcMaturityAlertResponse { alerts, count, calculated_at: Utc::now() })
}

// === 헬퍼 ===

async fn fetch_exchange_rate(pool: &PgPool, lc_id: Uuid, company_id: Uuid) -> Result<f64, sqlx::Error> {
    // 1순위: B/L 환율
    let bl = sqlx::query_as::<_, ExchangeRateRow>(
        "SELECT bl.exchange_rate::float8 as exchange_rate FROM bl_shipments bl WHERE bl.lc_id = $1 AND bl.exchange_rate IS NOT NULL LIMIT 1"
    ).bind(lc_id).fetch_optional(pool).await?;

    if let Some(r) = bl { return Ok(r.exchange_rate); }

    // 2순위: 최근 면장
    let cd = sqlx::query_as::<_, ExchangeRateRow>(
        "SELECT cd.exchange_rate::float8 as exchange_rate FROM cost_details cd JOIN import_declarations id ON cd.declaration_id = id.declaration_id WHERE id.company_id = $1 ORDER BY id.declaration_date DESC LIMIT 1"
    ).bind(company_id).fetch_optional(pool).await?;

    Ok(cd.map(|r| r.exchange_rate).unwrap_or(0.0))
}

fn add_months(date: NaiveDate, months: i32) -> NaiveDate {
    let total_months = date.year() * 12 + date.month() as i32 - 1 + months;
    let y = total_months / 12;
    let m = (total_months % 12 + 1) as u32;
    NaiveDate::from_ymd_opt(y, m, 1).unwrap_or(date)
}
