/// 마진/이익률 분석 + 거래처 분석 + 단가 추이
/// 비유: "경영분석실" — 판매 수익성, 거래처 건전성, 단가 변동을 분석

use chrono::{NaiveDate, Utc};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::model::margin::*;

// === 공개 단위 함수 (테스트용) ===

/// 마진율 계산
pub fn calc_margin_rate(sale_wp: f64, cost_wp: f64) -> f64 {
    if sale_wp <= 0.0 { return 0.0; }
    ((sale_wp - cost_wp) / sale_wp * 10000.0).round() / 100.0
}

/// 미수금 status 판별
pub fn outstanding_status(days: i64) -> String {
    if days <= 30 { "normal".to_string() }
    else if days <= 60 { "warning".to_string() }
    else { "overdue".to_string() }
}

// === SQL 행 타입 ===

#[derive(sqlx::FromRow)]
struct SaleAggRow {
    product_id: Uuid,
    product_code: String,
    product_name: String,
    spec_wp: i32,
    module_width_mm: i32,
    module_height_mm: i32,
    manufacturer_name: String,
    total_qty: Option<i64>,
    total_kw: Option<f64>,
    total_revenue: Option<f64>,
    sale_count: Option<i64>,
    avg_sale_price_wp: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct CostAvgRow {
    product_id: Uuid,
    avg_wp: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct CustomerSaleRow {
    customer_id: Uuid,
    partner_name: String,
    total_sales: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct CustomerCollectedRow {
    customer_id: Uuid,
    total_collected: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct OutstandingRow {
    customer_id: Uuid,
    remaining: Option<f64>,
    days_elapsed: Option<i32>,
}

/// 거래처별 이익 집계용: landed cost 보유 매출분의 매출·원가 합
#[derive(sqlx::FromRow)]
struct CustomerCostAggRow {
    customer_id: Uuid,
    revenue_covered: Option<f64>,
    cost_covered: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct CustomerDepositRow {
    customer_id: Uuid,
    avg_deposit_rate: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct PurchaseTrendRow {
    product_id: Uuid,
    product_name: String,
    spec_wp: i32,
    manufacturer_name: String,
    period: Option<String>,
    avg_usd_wp: Option<f64>,
    avg_krw_wp: Option<f64>,
    avg_exchange_rate: Option<f64>,
    volume_kw: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct SaleTrendRow {
    product_id: Uuid,
    period: Option<String>,
    avg_sale_wp: Option<f64>,
}

// === API 1: 마진 분석 ===

pub async fn calculate_margin(pool: &PgPool, req: &MarginAnalysisRequest) -> Result<MarginAnalysisResponse, sqlx::Error> {
    let company_id = req.company_id.unwrap();
    let date_from: Option<NaiveDate> = req.date_from.as_ref().and_then(|s| s.parse().ok());
    let date_to: Option<NaiveDate> = req.date_to.as_ref().and_then(|s| s.parse().ok());

    let sales = sqlx::query_as::<_, SaleAggRow>(
        r#"
        SELECT o.product_id, p.product_code, p.product_name, p.spec_wp,
               p.module_width_mm, p.module_height_mm, m.name_kr as manufacturer_name,
               SUM(o.quantity)::bigint as total_qty,
               SUM(o.capacity_kw)::float8 as total_kw,
               SUM(s.supply_amount)::float8 as total_revenue,
               COUNT(s.sale_id)::bigint as sale_count,
               CASE WHEN SUM(o.quantity * p.spec_wp) > 0
                 THEN SUM(s.supply_amount)::float8 / SUM(o.quantity * p.spec_wp)
                 ELSE 0 END as avg_sale_price_wp
        FROM sales s
        JOIN outbounds o ON s.outbound_id = o.outbound_id
        JOIN products p ON o.product_id = p.product_id
        JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
        WHERE o.company_id = $1 AND o.status = 'active'
          AND ($2::uuid IS NULL OR p.manufacturer_id = $2)
          AND ($3::uuid IS NULL OR o.product_id = $3)
          AND ($4::date IS NULL OR o.outbound_date >= $4)
          AND ($5::date IS NULL OR o.outbound_date <= $5)
        GROUP BY o.product_id, p.product_code, p.product_name, p.spec_wp,
                 p.module_width_mm, p.module_height_mm, m.name_kr
        ORDER BY m.name_kr, p.module_width_mm, p.module_height_mm, p.spec_wp
        "#,
    )
    .bind(company_id).bind(req.manufacturer_id).bind(req.product_id)
    .bind(date_from).bind(date_to)
    .fetch_all(pool).await?;

    // 원가 조회 (cost_basis에 따라)
    let cost_map = if req.cost_basis == "landed" {
        fetch_cost_avg(pool, company_id, req.product_id, "landed").await?
    } else {
        fetch_cost_avg(pool, company_id, req.product_id, "cif").await?
    };

    let mut items: Vec<MarginItem> = Vec::new();
    let mut sum_revenue = 0.0;
    let mut sum_cost = 0.0;
    let mut sum_kw = 0.0;

    for s in &sales {
        let avg_sale = s.avg_sale_price_wp.unwrap_or(0.0);
        let avg_cost = cost_map.get(&s.product_id).copied();
        let revenue = s.total_revenue.unwrap_or(0.0);
        let qty = s.total_qty.unwrap_or(0);
        let kw = s.total_kw.unwrap_or(0.0);
        let total_wp = qty as f64 * s.spec_wp as f64;

        let (margin_wp, margin_rate, total_cost, total_margin) = match avg_cost {
            Some(c) => {
                let mw = avg_sale - c;
                let mr = calc_margin_rate(avg_sale, c);
                let tc = c * total_wp;
                let tm = revenue - tc;
                (Some(round2(mw)), Some(mr), Some(round2(tc)), Some(round2(tm)))
            }
            None => (None, None, None, None),
        };

        sum_revenue += revenue;
        if let Some(tc) = total_cost { sum_cost += tc; }
        sum_kw += kw;

        items.push(MarginItem {
            manufacturer_name: s.manufacturer_name.clone(),
            product_code: s.product_code.clone(),
            product_name: s.product_name.clone(),
            spec_wp: s.spec_wp, module_width_mm: s.module_width_mm, module_height_mm: s.module_height_mm,
            total_sold_qty: qty, total_sold_kw: round2(kw),
            avg_sale_price_wp: round2(avg_sale),
            avg_cost_wp: avg_cost.map(round2), margin_wp, margin_rate,
            total_revenue_krw: round2(revenue), total_cost_krw: total_cost, total_margin_krw: total_margin,
            cost_basis: req.cost_basis.clone(), sale_count: s.sale_count.unwrap_or(0),
        });
    }

    let total_margin = sum_revenue - sum_cost;
    let overall_rate = if sum_revenue > 0.0 { (total_margin / sum_revenue * 10000.0).round() / 100.0 } else { 0.0 };

    Ok(MarginAnalysisResponse {
        items,
        summary: MarginSummary {
            total_sold_kw: round2(sum_kw), total_revenue_krw: round2(sum_revenue),
            total_cost_krw: round2(sum_cost), total_margin_krw: round2(total_margin),
            overall_margin_rate: overall_rate, cost_basis: req.cost_basis.clone(),
        },
        calculated_at: Utc::now(),
    })
}

// === API 2: 거래처 분석 ===

pub async fn analyze_customers(pool: &PgPool, req: &CustomerAnalysisRequest) -> Result<CustomerAnalysisResponse, sqlx::Error> {
    let company_id = req.company_id.unwrap();
    let date_from: Option<NaiveDate> = req.date_from.as_ref().and_then(|s| s.parse().ok());
    let date_to: Option<NaiveDate> = req.date_to.as_ref().and_then(|s| s.parse().ok());

    let sales = sqlx::query_as::<_, CustomerSaleRow>(
        r#"
        SELECT s.customer_id, ptr.partner_name, SUM(s.total_amount)::float8 as total_sales
        FROM sales s
        JOIN partners ptr ON s.customer_id = ptr.partner_id
        JOIN outbounds o ON s.outbound_id = o.outbound_id
        WHERE o.company_id = $1 AND o.status = 'active'
          AND ($2::uuid IS NULL OR s.customer_id = $2)
          AND ($3::date IS NULL OR o.outbound_date >= $3)
          AND ($4::date IS NULL OR o.outbound_date <= $4)
        GROUP BY s.customer_id, ptr.partner_name
        "#,
    )
    .bind(company_id).bind(req.customer_id).bind(date_from).bind(date_to)
    .fetch_all(pool).await?;

    let collected_rows = sqlx::query_as::<_, CustomerCollectedRow>(
        r#"
        SELECT r.customer_id, COALESCE(SUM(rm.matched_amount), 0)::float8 as total_collected
        FROM receipts r JOIN receipt_matches rm ON r.receipt_id = rm.receipt_id
        WHERE ($1::uuid IS NULL OR r.customer_id = $1)
        GROUP BY r.customer_id
        "#,
    )
    .bind(req.customer_id).fetch_all(pool).await?;

    let collected_map: HashMap<Uuid, f64> = collected_rows.into_iter()
        .map(|r| (r.customer_id, r.total_collected.unwrap_or(0.0))).collect();

    let outstanding_rows = sqlx::query_as::<_, OutstandingRow>(
        r#"
        SELECT s.customer_id,
               (s.total_amount - COALESCE((SELECT SUM(rm2.matched_amount) FROM receipt_matches rm2 WHERE rm2.outbound_id = o.outbound_id), 0))::float8 as remaining,
               (CURRENT_DATE - o.outbound_date)::int as days_elapsed
        FROM sales s JOIN outbounds o ON s.outbound_id = o.outbound_id
        WHERE o.company_id = $1 AND o.status = 'active'
          AND s.total_amount > COALESCE((SELECT SUM(rm3.matched_amount) FROM receipt_matches rm3 WHERE rm3.outbound_id = o.outbound_id), 0)
        "#,
    )
    .bind(company_id).fetch_all(pool).await?;

    // 거래처별 미수금 집계
    let mut outstanding_map: HashMap<Uuid, (i64, i64)> = HashMap::new(); // (count, max_days)
    for r in &outstanding_rows {
        let entry = outstanding_map.entry(r.customer_id).or_insert((0, 0));
        entry.0 += 1;
        entry.1 = entry.1.max(r.days_elapsed.unwrap_or(0) as i64);
    }

    let deposit_rows = sqlx::query_as::<_, CustomerDepositRow>(
        "SELECT ord.customer_id, AVG(ord.deposit_rate)::float8 as avg_deposit_rate FROM orders ord WHERE ord.company_id = $1 AND ord.deposit_rate IS NOT NULL GROUP BY ord.customer_id"
    ).bind(company_id).fetch_all(pool).await?;
    let deposit_map: HashMap<Uuid, f64> = deposit_rows.into_iter()
        .filter_map(|r| r.avg_deposit_rate.map(|d| (r.customer_id, round2(d)))).collect();

    // === 거래처별 이익 계산 ===
    // 원가 기준: req.cost_basis ("landed" 기본 | "cif")
    // 방법: 제품별 평균 원가(avg_wp_krw)를 미리 계산한 뒤,
    //       각 매출을 (수량 × spec_wp × avg_wp_krw) = 매출원가로 변환.
    //       원가 이력이 있는 매출분만 커버. 없는 제품은 이익 계산 제외.
    let cost_col = if req.cost_basis == "cif" { "cd.cif_wp_krw" } else { "cd.landed_wp_krw" };
    let margin_sql = format!(
        r#"
        WITH cost_avg AS (
            SELECT cd.product_id,
                   SUM({cost_col} * cd.quantity)::float8 / NULLIF(SUM(cd.quantity), 0) AS avg_wp_krw
            FROM cost_details cd
            JOIN import_declarations id ON cd.declaration_id = id.declaration_id
            WHERE id.company_id = $1 AND {cost_col} IS NOT NULL
            GROUP BY cd.product_id
        )
        SELECT s.customer_id,
               SUM(CASE WHEN ca.avg_wp_krw IS NOT NULL THEN s.supply_amount ELSE 0 END)::float8 AS revenue_covered,
               SUM(CASE WHEN ca.avg_wp_krw IS NOT NULL
                        THEN o.quantity::float8 * p.spec_wp::float8 * ca.avg_wp_krw
                        ELSE 0 END)::float8 AS cost_covered
        FROM sales s
        JOIN outbounds o ON s.outbound_id = o.outbound_id
        JOIN products p ON o.product_id = p.product_id
        LEFT JOIN cost_avg ca ON ca.product_id = o.product_id
        WHERE o.company_id = $1 AND o.status = 'active'
          AND ($2::uuid IS NULL OR s.customer_id = $2)
          AND ($3::date IS NULL OR o.outbound_date >= $3)
          AND ($4::date IS NULL OR o.outbound_date <= $4)
        GROUP BY s.customer_id
        "#
    );
    let margin_rows = sqlx::query_as::<_, CustomerCostAggRow>(&margin_sql)
        .bind(company_id).bind(req.customer_id).bind(date_from).bind(date_to)
        .fetch_all(pool).await?;
    let margin_map: HashMap<Uuid, (f64, f64)> = margin_rows.into_iter()
        .map(|r| (r.customer_id, (r.revenue_covered.unwrap_or(0.0), r.cost_covered.unwrap_or(0.0))))
        .collect();

    let mut items: Vec<CustomerItem> = Vec::new();
    let mut sum_sales = 0.0;
    let mut sum_collected = 0.0;
    let mut sum_margin = 0.0;
    let mut sum_revenue_covered = 0.0;

    for s in &sales {
        let total_sales = s.total_sales.unwrap_or(0.0);
        let total_collected = *collected_map.get(&s.customer_id).unwrap_or(&0.0);
        let outstanding = total_sales - total_collected;
        let (out_count, oldest_days) = *outstanding_map.get(&s.customer_id).unwrap_or(&(0, 0));
        let status = outstanding_status(oldest_days);

        // 이익: 원가 커버 매출분에서 계산. 커버 매출 0 → None
        let (margin_rate, margin_krw) = match margin_map.get(&s.customer_id) {
            Some(&(rev_cov, cost_cov)) if rev_cov > 0.0 => {
                let m = rev_cov - cost_cov;
                let rate = (m / rev_cov * 10000.0).round() / 100.0;
                sum_margin += m;
                sum_revenue_covered += rev_cov;
                (Some(rate), Some(round2(m)))
            }
            _ => (None, None),
        };

        sum_sales += total_sales;
        sum_collected += total_collected;

        items.push(CustomerItem {
            customer_id: s.customer_id, customer_name: s.partner_name.clone(),
            total_sales_krw: round2(total_sales), total_collected_krw: round2(total_collected),
            outstanding_krw: round2(outstanding.max(0.0)), outstanding_count: out_count,
            oldest_outstanding_days: oldest_days, avg_payment_days: None,
            avg_margin_rate: margin_rate,
            total_margin_krw: margin_krw,
            avg_deposit_rate: deposit_map.get(&s.customer_id).copied(),
            status,
        });
    }

    let overall_margin_rate = if sum_revenue_covered > 0.0 {
        (sum_margin / sum_revenue_covered * 10000.0).round() / 100.0
    } else { 0.0 };

    Ok(CustomerAnalysisResponse {
        items,
        summary: CustomerSummary {
            total_sales_krw: round2(sum_sales), total_collected_krw: round2(sum_collected),
            total_outstanding_krw: round2((sum_sales - sum_collected).max(0.0)),
            total_margin_krw: round2(sum_margin),
            overall_margin_rate,
        },
        calculated_at: Utc::now(),
    })
}

// === API 3: 단가 추이 ===

pub async fn calculate_price_trend(pool: &PgPool, req: &PriceTrendRequest) -> Result<PriceTrendResponse, sqlx::Error> {
    let company_id = req.company_id.unwrap();
    let period_type = &req.period;

    let purchase_rows = sqlx::query_as::<_, PurchaseTrendRow>(
        r#"
        SELECT p.product_id, p.product_name, p.spec_wp, m.name_kr as manufacturer_name,
               CASE WHEN $1 = 'quarterly' THEN TO_CHAR(id.declaration_date, 'YYYY-"Q"Q')
                    ELSE TO_CHAR(id.declaration_date, 'YYYY-MM') END as period,
               CASE WHEN SUM(cd.quantity * p.spec_wp) > 0
                 THEN SUM(cd.fob_total_usd)::float8 / SUM(cd.quantity * p.spec_wp) ELSE 0 END as avg_usd_wp,
               CASE WHEN SUM(cd.quantity) > 0
                 THEN SUM(cd.cif_wp_krw * cd.quantity)::float8 / SUM(cd.quantity) ELSE 0 END as avg_krw_wp,
               CASE WHEN SUM(cd.quantity) > 0
                 THEN SUM(cd.exchange_rate * cd.quantity)::float8 / SUM(cd.quantity) ELSE 0 END as avg_exchange_rate,
               SUM(cd.capacity_kw)::float8 as volume_kw
        FROM cost_details cd
        JOIN import_declarations id ON cd.declaration_id = id.declaration_id
        JOIN products p ON cd.product_id = p.product_id
        JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
        WHERE id.company_id = $2
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
          AND ($4::uuid IS NULL OR cd.product_id = $4)
        GROUP BY p.product_id, p.product_name, p.spec_wp, m.name_kr, period
        ORDER BY m.name_kr, p.spec_wp, period
        "#,
    )
    .bind(period_type).bind(company_id).bind(req.manufacturer_id).bind(req.product_id)
    .fetch_all(pool).await?;

    let sale_rows = sqlx::query_as::<_, SaleTrendRow>(
        r#"
        SELECT o.product_id,
               CASE WHEN $1 = 'quarterly' THEN TO_CHAR(o.outbound_date, 'YYYY-"Q"Q')
                    ELSE TO_CHAR(o.outbound_date, 'YYYY-MM') END as period,
               CASE WHEN SUM(o.quantity * p.spec_wp) > 0
                 THEN SUM(s.supply_amount)::float8 / SUM(o.quantity * p.spec_wp) ELSE 0 END as avg_sale_wp
        FROM sales s JOIN outbounds o ON s.outbound_id = o.outbound_id
        JOIN products p ON o.product_id = p.product_id
        WHERE o.company_id = $2 AND o.status = 'active'
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
          AND ($4::uuid IS NULL OR o.product_id = $4)
        GROUP BY o.product_id, period
        "#,
    )
    .bind(period_type).bind(company_id).bind(req.manufacturer_id).bind(req.product_id)
    .fetch_all(pool).await?;

    // 판매 단가 맵: (product_id, period) -> avg_sale_wp
    let sale_map: HashMap<(Uuid, String), f64> = sale_rows.into_iter()
        .filter_map(|r| r.period.map(|p| ((r.product_id, p), r.avg_sale_wp.unwrap_or(0.0))))
        .collect();

    // 품번별 그룹화
    let mut product_map: HashMap<Uuid, (String, String, i32, Vec<TrendDataPoint>)> = HashMap::new();

    for r in &purchase_rows {
        let period = r.period.clone().unwrap_or_default();
        let sale_wp = sale_map.get(&(r.product_id, period.clone())).copied();

        let entry = product_map.entry(r.product_id).or_insert_with(|| {
            (r.manufacturer_name.clone(), r.product_name.clone(), r.spec_wp, Vec::new())
        });

        entry.3.push(TrendDataPoint {
            period,
            avg_purchase_price_usd_wp: r.avg_usd_wp.map(round2),
            avg_purchase_price_krw_wp: r.avg_krw_wp.map(round2),
            avg_sale_price_krw_wp: sale_wp.map(round2),
            exchange_rate: r.avg_exchange_rate.map(round2),
            volume_kw: r.volume_kw.map(round2),
        });
    }

    let trends: Vec<TrendProduct> = product_map.into_values()
        .map(|(mfg, name, wp, pts)| TrendProduct {
            manufacturer_name: mfg, product_name: name, spec_wp: wp, data_points: pts,
        })
        .collect();

    Ok(PriceTrendResponse { trends, calculated_at: Utc::now() })
}

// === 헬퍼 ===

async fn fetch_cost_avg(pool: &PgPool, company_id: Uuid, product_id: Option<Uuid>, basis: &str) -> Result<HashMap<Uuid, f64>, sqlx::Error> {
    let col = if basis == "landed" { "cd.landed_wp_krw" } else { "cd.cif_wp_krw" };
    let sql = format!(
        r#"
        SELECT cd.product_id,
               CASE WHEN SUM(cd.quantity) > 0
                 THEN SUM({col} * cd.quantity)::float8 / SUM(cd.quantity)
                 ELSE 0 END as avg_wp
        FROM cost_details cd
        JOIN import_declarations id ON cd.declaration_id = id.declaration_id
        WHERE id.company_id = $1
          AND ($2::uuid IS NULL OR cd.product_id = $2)
          AND {col} IS NOT NULL
        GROUP BY cd.product_id
        "#
    );
    let rows = sqlx::query_as::<_, CostAvgRow>(&sql)
        .bind(company_id).bind(product_id)
        .fetch_all(pool).await?;
    Ok(rows.into_iter().filter_map(|r| r.avg_wp.map(|v| (r.product_id, v))).collect())
}

fn round2(v: f64) -> f64 { (v * 100.0).round() / 100.0 }
