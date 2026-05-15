/// 마진/이익률 분석 + 거래처 분석 + 단가 추이
/// 비유: "경영분석실" — 판매 수익성, 거래처 건전성, 단가 변동을 분석
use chrono::{NaiveDate, Utc};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::calc::resolve_company_ids;
use crate::model::margin::*;

// === 공개 단위 함수 (테스트용) ===

/// 마진율 계산
pub fn calc_margin_rate(sale_wp: f64, cost_wp: f64) -> f64 {
    if sale_wp <= 0.0 {
        return 0.0;
    }
    ((sale_wp - cost_wp) / sale_wp * 10000.0).round() / 100.0
}

/// 원가 연결률 계산
pub fn calc_cost_coverage_rate(total_revenue: f64, cost_covered_revenue: f64) -> f64 {
    if total_revenue <= 0.0 {
        return 0.0;
    }
    (cost_covered_revenue / total_revenue * 10000.0).round() / 100.0
}

/// 원가 연결 매출 기준 전체 이익률 계산
pub fn calc_covered_margin_rate(cost_covered_revenue: f64, total_cost: f64) -> f64 {
    if cost_covered_revenue <= 0.0 {
        return 0.0;
    }
    ((cost_covered_revenue - total_cost) / cost_covered_revenue * 10000.0).round() / 100.0
}

/// 미수금 status 판별
pub fn outstanding_status(days: i64) -> String {
    if days <= 30 {
        "normal".to_string()
    } else if days <= 60 {
        "warning".to_string()
    } else {
        "overdue".to_string()
    }
}

// === SQL 행 타입 ===

#[derive(sqlx::FromRow)]
struct SaleAggRow {
    product_id: Uuid,
    product_code: String,
    product_name: String,
    spec_wp: i32,
    module_width_mm: Option<i32>,
    module_height_mm: Option<i32>,
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

pub async fn calculate_margin(
    pool: &PgPool,
    req: &MarginAnalysisRequest,
) -> Result<MarginAnalysisResponse, sqlx::Error> {
    let company_ids = resolve_company_ids(req.company_ids.as_deref(), req.company_id);
    let date_from: Option<NaiveDate> = req.date_from.as_ref().and_then(|s| s.parse().ok());
    let date_to: Option<NaiveDate> = req.date_to.as_ref().and_then(|s| s.parse().ok());

    let sales = sqlx::query_as::<_, SaleAggRow>(
        r#"
        SELECT o.product_id, p.product_code, p.product_name, p.spec_wp,
               p.module_width_mm, p.module_height_mm, m.name_kr as manufacturer_name,
               SUM(o.quantity)::bigint as total_qty,
               -- 분모는 products.spec_wp 기준으로 직접 계산. outbounds.capacity_kw 에는
               -- 자동 등록 product(wattage_kw NULL) + 마이그 098/099/100 split 행 등에서
               -- NULL 이 섞여 들어가 SUM 결과가 ~1/4 까지 deflate 되는 케이스 확인 (예:
               -- 론지 247행 중 144행 NULL → 평균단가 4배 부풀림, 2026-05-12).
               SUM(o.quantity::float8 * COALESCE(p.spec_wp, 0)::float8) / 1000.0 as total_kw,
               SUM(s.supply_amount)::float8 as total_revenue,
               COUNT(s.sale_id)::bigint as sale_count,
               CASE WHEN SUM(o.quantity * p.spec_wp) > 0
                 THEN SUM(s.supply_amount)::float8 / SUM(o.quantity * p.spec_wp)
                 ELSE 0 END as avg_sale_price_wp
        FROM sales s
        JOIN outbounds o ON s.outbound_id = o.outbound_id
        JOIN products p ON o.product_id = p.product_id
        JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
        WHERE o.company_id = ANY($1::uuid[]) AND o.status = 'active'
          AND COALESCE(s.status, 'active') <> 'cancelled'
          -- 매출 분석 = 상품판매(+무상 스페어) 만. 공사사용/유지관리/폐기 등 자체 사용분은
          -- 매출이 아닌 자체 비용이므로 마진 분석 대상이 아님.
          AND o.usage_category IN ('sale', 'sale_spare')
          AND ($2::uuid IS NULL OR p.manufacturer_id = $2)
          AND ($3::uuid IS NULL OR o.product_id = $3)
          AND ($4::uuid IS NULL OR s.customer_id = $4)
          AND ($5::date IS NULL OR o.outbound_date >= $5)
          AND ($6::date IS NULL OR o.outbound_date <= $6)
        GROUP BY o.product_id, p.product_code, p.product_name, p.spec_wp,
                 p.module_width_mm, p.module_height_mm, m.name_kr
        ORDER BY m.name_kr, p.module_width_mm, p.module_height_mm, p.spec_wp
        "#,
    )
    .bind(&company_ids)
    .bind(req.manufacturer_id)
    .bind(req.product_id)
    .bind(req.customer_id)
    .bind(date_from)
    .bind(date_to)
    .fetch_all(pool)
    .await?;

    // 원가 조회 (cost_basis에 따라)
    // D-064 PR 30: 'fifo' — ERP fifo_matches (PR 26) 직접 사용. 가장 정확.
    let cost_map = match req.cost_basis.as_str() {
        "fifo" => fetch_cost_avg_fifo(pool, &company_ids, req.product_id).await?,
        "landed" => fetch_cost_avg(pool, &company_ids, req.product_id, "landed").await?,
        _ => fetch_cost_avg(pool, &company_ids, req.product_id, "cif").await?,
    };

    let mut items: Vec<MarginItem> = Vec::new();
    let mut sum_revenue = 0.0;
    let mut sum_cost_covered_revenue = 0.0;
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
                (
                    Some(round2(mw)),
                    Some(mr),
                    Some(round2(tc)),
                    Some(round2(tm)),
                )
            }
            None => (None, None, None, None),
        };

        sum_revenue += revenue;
        if let Some(tc) = total_cost {
            sum_cost += tc;
            sum_cost_covered_revenue += revenue;
        }
        sum_kw += kw;

        items.push(MarginItem {
            manufacturer_name: s.manufacturer_name.clone(),
            product_code: s.product_code.clone(),
            product_name: s.product_name.clone(),
            spec_wp: s.spec_wp,
            module_width_mm: s.module_width_mm,
            module_height_mm: s.module_height_mm,
            total_sold_qty: qty,
            total_sold_kw: round2(kw),
            avg_sale_price_wp: round2(avg_sale),
            avg_cost_wp: avg_cost.map(round2),
            margin_wp,
            margin_rate,
            total_revenue_krw: round2(revenue),
            total_cost_krw: total_cost,
            total_margin_krw: total_margin,
            cost_covered_revenue_krw: if total_cost.is_some() {
                round2(revenue)
            } else {
                0.0
            },
            cost_missing_revenue_krw: if total_cost.is_some() {
                0.0
            } else {
                round2(revenue)
            },
            cost_basis: req.cost_basis.clone(),
            sale_count: s.sale_count.unwrap_or(0),
        });
    }

    let total_margin = sum_cost_covered_revenue - sum_cost;
    let overall_rate = calc_covered_margin_rate(sum_cost_covered_revenue, sum_cost);
    let missing_revenue = (sum_revenue - sum_cost_covered_revenue).max(0.0);
    let coverage_rate = calc_cost_coverage_rate(sum_revenue, sum_cost_covered_revenue);

    let trend24 = fetch_monthly_margin_trend(
        pool,
        &company_ids,
        req.manufacturer_id,
        req.product_id,
        req.customer_id,
    )
    .await?;

    Ok(MarginAnalysisResponse {
        items,
        summary: MarginSummary {
            total_sold_kw: round2(sum_kw),
            total_revenue_krw: round2(sum_revenue),
            total_cost_krw: round2(sum_cost),
            total_margin_krw: round2(total_margin),
            overall_margin_rate: overall_rate,
            cost_covered_revenue_krw: round2(sum_cost_covered_revenue),
            cost_missing_revenue_krw: round2(missing_revenue),
            cost_coverage_rate: coverage_rate,
            cost_basis: req.cost_basis.clone(),
        },
        trend24,
        calculated_at: Utc::now(),
    })
}

// === API 2: 거래처 분석 ===

pub async fn analyze_customers(
    pool: &PgPool,
    req: &CustomerAnalysisRequest,
) -> Result<CustomerAnalysisResponse, sqlx::Error> {
    let company_ids = resolve_company_ids(req.company_ids.as_deref(), req.company_id);
    let date_from: Option<NaiveDate> = req.date_from.as_ref().and_then(|s| s.parse().ok());
    let date_to: Option<NaiveDate> = req.date_to.as_ref().and_then(|s| s.parse().ok());

    let sales = sqlx::query_as::<_, CustomerSaleRow>(
        r#"
        SELECT s.customer_id, ptr.partner_name, SUM(s.total_amount)::float8 as total_sales
        FROM sales s
        JOIN partners ptr ON s.customer_id = ptr.partner_id
        JOIN outbounds o ON s.outbound_id = o.outbound_id
        WHERE o.company_id = ANY($1::uuid[]) AND o.status = 'active'
          AND COALESCE(s.status, 'active') <> 'cancelled'
          -- 거래처 분석 = 외부 판매 (상품판매+스페어) 만. 자체 EPC(공사사용) 등은 매출 아님.
          AND o.usage_category IN ('sale', 'sale_spare')
          AND ($2::uuid IS NULL OR s.customer_id = $2)
          AND ($3::date IS NULL OR o.outbound_date >= $3)
          AND ($4::date IS NULL OR o.outbound_date <= $4)
        GROUP BY s.customer_id, ptr.partner_name
        "#,
    )
    .bind(&company_ids)
    .bind(req.customer_id)
    .bind(date_from)
    .bind(date_to)
    .fetch_all(pool)
    .await?;

    // receipt_matches 는 두 가지 경로로 sale 에 연결된다:
    //   1) 매뉴얼 매칭: rm.outbound_id 채움 (rm.sale_id NULL)
    //   2) 출고/판매 화면 bulk 수금완료: rm.sale_id 채움 (rm.outbound_id NULL)
    // 단일 JOIN 의 OR 조건은 planner 가 인덱스를 선택할 수 없어 1초+ slow query 가 됨
    // (2026-05-12 운영 로그 sqlx slow_threshold 위반). 두 경로를 CTE 의 UNION ALL 로 분리하면
    // (sale_id) / (outbound_id) 인덱스를 각각 활용해 동등 의미를 빠르게 계산할 수 있다.
    let collected_rows = sqlx::query_as::<_, CustomerCollectedRow>(
        r#"
        WITH scoped_sales AS (
            SELECT s.sale_id, s.outbound_id, s.customer_id
            FROM sales s
            JOIN outbounds o ON s.outbound_id = o.outbound_id
            WHERE o.company_id = ANY($1::uuid[]) AND o.status = 'active'
              AND COALESCE(s.status, 'active') <> 'cancelled'
              AND o.usage_category IN ('sale', 'sale_spare')
              AND ($2::uuid IS NULL OR s.customer_id = $2)
              AND ($3::date IS NULL OR o.outbound_date >= $3)
              AND ($4::date IS NULL OR o.outbound_date <= $4)
        ),
        direct_matches AS (
            SELECT ss.sale_id, SUM(rm.matched_amount)::float8 AS amt
            FROM scoped_sales ss
            JOIN receipt_matches rm ON rm.sale_id = ss.sale_id
            GROUP BY ss.sale_id
        ),
        outbound_matches AS (
            SELECT ss.sale_id, SUM(rm.matched_amount)::float8 AS amt
            FROM scoped_sales ss
            JOIN receipt_matches rm
              ON rm.outbound_id = ss.outbound_id AND rm.sale_id IS NULL
            GROUP BY ss.sale_id
        ),
        per_sale AS (
            SELECT sale_id, SUM(amt) AS amt FROM (
                SELECT * FROM direct_matches
                UNION ALL
                SELECT * FROM outbound_matches
            ) u
            GROUP BY sale_id
        )
        SELECT ss.customer_id, SUM(per_sale.amt)::float8 AS total_collected
        FROM scoped_sales ss
        JOIN per_sale ON per_sale.sale_id = ss.sale_id
        GROUP BY ss.customer_id
        "#,
    )
    .bind(&company_ids)
    .bind(req.customer_id)
    .bind(date_from)
    .bind(date_to)
    .fetch_all(pool)
    .await?;

    let collected_map: HashMap<Uuid, f64> = collected_rows
        .into_iter()
        .map(|r| (r.customer_id, r.total_collected.unwrap_or(0.0)))
        .collect();

    // 미수금 판정: total_amount > 누적 수금액 → sale_id 단위 1행.
    // 원본은 correlated subquery + OR 로 planner 가 nested loop seq scan 으로 떨어졌음
    // (운영 elapsed=1.28s). CTE 로 sale_id 별 수금 합계를 한 번 계산해 LEFT JOIN.
    let outstanding_rows = sqlx::query_as::<_, OutstandingRow>(
        r#"
        WITH scoped_sales AS (
            SELECT s.sale_id, s.outbound_id, s.customer_id, s.total_amount, o.outbound_date
            FROM sales s
            JOIN outbounds o ON s.outbound_id = o.outbound_id
            WHERE o.company_id = ANY($1::uuid[]) AND o.status = 'active'
              AND COALESCE(s.status, 'active') <> 'cancelled'
              AND o.usage_category IN ('sale', 'sale_spare')
              AND ($2::uuid IS NULL OR s.customer_id = $2)
              AND ($3::date IS NULL OR o.outbound_date >= $3)
              AND ($4::date IS NULL OR o.outbound_date <= $4)
        ),
        direct_matches AS (
            SELECT ss.sale_id, SUM(rm.matched_amount)::float8 AS amt
            FROM scoped_sales ss
            JOIN receipt_matches rm ON rm.sale_id = ss.sale_id
            GROUP BY ss.sale_id
        ),
        outbound_matches AS (
            SELECT ss.sale_id, SUM(rm.matched_amount)::float8 AS amt
            FROM scoped_sales ss
            JOIN receipt_matches rm
              ON rm.outbound_id = ss.outbound_id AND rm.sale_id IS NULL
            GROUP BY ss.sale_id
        ),
        per_sale AS (
            SELECT sale_id, SUM(amt)::float8 AS collected FROM (
                SELECT * FROM direct_matches
                UNION ALL
                SELECT * FROM outbound_matches
            ) u
            GROUP BY sale_id
        )
        SELECT ss.customer_id,
               (CURRENT_DATE - ss.outbound_date)::int AS days_elapsed
        FROM scoped_sales ss
        LEFT JOIN per_sale ON per_sale.sale_id = ss.sale_id
        WHERE ss.total_amount > COALESCE(per_sale.collected, 0)
        "#,
    )
    .bind(&company_ids).bind(req.customer_id).bind(date_from).bind(date_to)
    .fetch_all(pool).await?;

    // 거래처별 미수금 집계
    let mut outstanding_map: HashMap<Uuid, (i64, i64)> = HashMap::new(); // (count, max_days)
    for r in &outstanding_rows {
        let entry = outstanding_map.entry(r.customer_id).or_insert((0, 0));
        entry.0 += 1;
        entry.1 = entry.1.max(r.days_elapsed.unwrap_or(0) as i64);
    }

    let deposit_rows = sqlx::query_as::<_, CustomerDepositRow>(
        "SELECT ord.customer_id, AVG(ord.deposit_rate)::float8 as avg_deposit_rate FROM orders ord WHERE ord.company_id = ANY($1::uuid[]) AND ord.deposit_rate IS NOT NULL GROUP BY ord.customer_id"
    ).bind(&company_ids).fetch_all(pool).await?;
    let deposit_map: HashMap<Uuid, f64> = deposit_rows
        .into_iter()
        .filter_map(|r| r.avg_deposit_rate.map(|d| (r.customer_id, round2(d))))
        .collect();

    // === 거래처별 이익 계산 ===
    // 원가 기준: req.cost_basis ("landed" 기본 | "cif")
    // 방법: 제품별 평균 원가(avg_wp_krw)를 미리 계산한 뒤,
    //       각 매출을 (수량 × spec_wp × avg_wp_krw) = 매출원가로 변환.
    //       원가 이력이 있는 매출분만 커버. 없는 제품은 이익 계산 제외.
    let margin_sql = if req.cost_basis == "fifo" {
        r#"
        WITH fifo_cost AS (
            SELECT fm.outbound_id, SUM(fm.cost_amount)::float8 AS cost_covered
            FROM fifo_matches fm
            JOIN outbounds o ON fm.outbound_id = o.outbound_id
            WHERE o.company_id = ANY($1::uuid[])
              AND fm.cost_amount IS NOT NULL
              AND fm.usage_category_raw IN ('상품판매', '상품판매(스페어)')
            GROUP BY fm.outbound_id
        )
        SELECT s.customer_id,
               SUM(CASE WHEN fc.cost_covered IS NOT NULL THEN s.supply_amount ELSE 0 END)::float8 AS revenue_covered,
               SUM(COALESCE(fc.cost_covered, 0))::float8 AS cost_covered
        FROM sales s
        JOIN outbounds o ON s.outbound_id = o.outbound_id
        LEFT JOIN fifo_cost fc ON fc.outbound_id = o.outbound_id
        WHERE o.company_id = ANY($1::uuid[]) AND o.status = 'active'
          AND COALESCE(s.status, 'active') <> 'cancelled'
          AND o.usage_category IN ('sale', 'sale_spare')
          AND ($2::uuid IS NULL OR s.customer_id = $2)
          AND ($3::date IS NULL OR o.outbound_date >= $3)
          AND ($4::date IS NULL OR o.outbound_date <= $4)
        GROUP BY s.customer_id
        "#.to_string()
    } else {
        let cost_col = if req.cost_basis == "cif" {
            "cd.cif_wp_krw"
        } else {
            "cd.landed_wp_krw"
        };
        format!(
            r#"
        WITH cd_cost AS (
            SELECT cd.product_id,
                   SUM({cost_col} * cd.quantity)::float8 / NULLIF(SUM(cd.quantity), 0) AS avg_wp_krw
            FROM cost_details cd
            JOIN import_declarations decl ON cd.declaration_id = decl.declaration_id
            WHERE decl.company_id = ANY($1::uuid[]) AND {cost_col} IS NOT NULL
            GROUP BY cd.product_id
        ),
        bl_cost AS (
            SELECT bli.product_id,
                   SUM(bli.quantity::float8 * COALESCE(
                       bli.unit_price_usd_wp * bl.exchange_rate,
                       bli.unit_price_krw_wp
                   ))::float8 / NULLIF(SUM(bli.quantity), 0) AS avg_wp_krw
            FROM bl_line_items bli
            JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
            WHERE bl.status IN ('completed', 'erp_done')
              AND bl.company_id = ANY($1::uuid[])
              AND (bli.unit_price_usd_wp IS NOT NULL OR bli.unit_price_krw_wp IS NOT NULL)
            GROUP BY bli.product_id
        ),
        cost_avg AS (
            SELECT COALESCE(cd.product_id, bl.product_id) AS product_id,
                   COALESCE(cd.avg_wp_krw, bl.avg_wp_krw) AS avg_wp_krw
            FROM cd_cost cd
            FULL OUTER JOIN bl_cost bl ON bl.product_id = cd.product_id
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
        WHERE o.company_id = ANY($1::uuid[]) AND o.status = 'active'
          AND COALESCE(s.status, 'active') <> 'cancelled'
          AND o.usage_category IN ('sale', 'sale_spare')
          AND ($2::uuid IS NULL OR s.customer_id = $2)
          AND ($3::date IS NULL OR o.outbound_date >= $3)
          AND ($4::date IS NULL OR o.outbound_date <= $4)
        GROUP BY s.customer_id
        "#
        )
    };
    let margin_rows = sqlx::query_as::<_, CustomerCostAggRow>(&margin_sql)
        .bind(&company_ids)
        .bind(req.customer_id)
        .bind(date_from)
        .bind(date_to)
        .fetch_all(pool)
        .await?;
    let margin_map: HashMap<Uuid, (f64, f64)> = margin_rows
        .into_iter()
        .map(|r| {
            (
                r.customer_id,
                (
                    r.revenue_covered.unwrap_or(0.0),
                    r.cost_covered.unwrap_or(0.0),
                ),
            )
        })
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
            customer_id: s.customer_id,
            customer_name: s.partner_name.clone(),
            total_sales_krw: round2(total_sales),
            total_collected_krw: round2(total_collected),
            outstanding_krw: round2(outstanding.max(0.0)),
            outstanding_count: out_count,
            oldest_outstanding_days: oldest_days,
            avg_payment_days: None,
            avg_margin_rate: margin_rate,
            total_margin_krw: margin_krw,
            avg_deposit_rate: deposit_map.get(&s.customer_id).copied(),
            status,
        });
    }

    let overall_margin_rate = if sum_sales > 0.0 {
        (sum_margin / sum_sales * 10000.0).round() / 100.0
    } else {
        0.0
    };

    Ok(CustomerAnalysisResponse {
        items,
        summary: CustomerSummary {
            total_sales_krw: round2(sum_sales),
            total_collected_krw: round2(sum_collected),
            total_outstanding_krw: round2((sum_sales - sum_collected).max(0.0)),
            total_margin_krw: round2(sum_margin),
            overall_margin_rate,
        },
        calculated_at: Utc::now(),
    })
}

// === API 3: 단가 추이 ===

pub async fn calculate_price_trend(
    pool: &PgPool,
    req: &PriceTrendRequest,
) -> Result<PriceTrendResponse, sqlx::Error> {
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
          AND COALESCE(s.status, 'active') <> 'cancelled'
          AND o.usage_category IN ('sale', 'sale_spare')
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
          AND ($4::uuid IS NULL OR o.product_id = $4)
        GROUP BY o.product_id, period
        "#,
    )
    .bind(period_type).bind(company_id).bind(req.manufacturer_id).bind(req.product_id)
    .fetch_all(pool).await?;

    // 판매 단가 맵: (product_id, period) -> avg_sale_wp
    let sale_map: HashMap<(Uuid, String), f64> = sale_rows
        .into_iter()
        .filter_map(|r| {
            r.period
                .map(|p| ((r.product_id, p), r.avg_sale_wp.unwrap_or(0.0)))
        })
        .collect();

    // 품번별 그룹화
    let mut product_map: HashMap<Uuid, (String, String, i32, Vec<TrendDataPoint>)> = HashMap::new();

    for r in &purchase_rows {
        let period = r.period.clone().unwrap_or_default();
        let sale_wp = sale_map.get(&(r.product_id, period.clone())).copied();

        let entry = product_map.entry(r.product_id).or_insert_with(|| {
            (
                r.manufacturer_name.clone(),
                r.product_name.clone(),
                r.spec_wp,
                Vec::new(),
            )
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

    let trends: Vec<TrendProduct> = product_map
        .into_values()
        .map(|(mfg, name, wp, pts)| TrendProduct {
            manufacturer_name: mfg,
            product_name: name,
            spec_wp: wp,
            data_points: pts,
        })
        .collect();

    Ok(PriceTrendResponse {
        trends,
        calculated_at: Utc::now(),
    })
}

// === 헬퍼 ===

#[derive(sqlx::FromRow)]
struct MarginTrendRow {
    month: String,
    revenue: f64,
    cost: f64,
}

/// 24개월 월별 마진 추이 — fifo + 부대비용 기준, 인사이트 라인차트 / KPI sparkline 공통 소스.
///
/// outbound_cost CTE 는 출고 단위로 fifo_matches.cost_amount + BL 부대비용 분배를 합산.
/// 그 출고에 매칭된 sales.supply_amount 만 covered_revenue 에 합산하므로 summary.overall_margin_rate
/// 와 같은 분모/분자 정의 (원가가 연결된 매출 분만 본다) 를 유지한다.
async fn fetch_monthly_margin_trend(
    pool: &PgPool,
    company_ids: &[Uuid],
    manufacturer_id: Option<Uuid>,
    product_id: Option<Uuid>,
    customer_id: Option<Uuid>,
) -> Result<Vec<crate::model::margin::MarginTrendPoint>, sqlx::Error> {
    let sql = r#"
    WITH bl_expense AS (
      SELECT ie.bl_id, SUM(ie.amount)::float8 AS total_expense
      FROM incidental_expenses ie
      WHERE ie.bl_id IS NOT NULL
      GROUP BY ie.bl_id
    ),
    bl_capacity AS (
      SELECT idecl.bl_id, SUM(idecl.capacity_kw * 1000)::float8 AS total_wp
      FROM import_declarations idecl
      WHERE idecl.bl_id IS NOT NULL AND idecl.capacity_kw IS NOT NULL
      GROUP BY idecl.bl_id
    ),
    bl_expense_per_wp AS (
      SELECT be.bl_id,
             CASE WHEN bc.total_wp > 0 THEN be.total_expense / bc.total_wp ELSE 0 END AS expense_per_wp
      FROM bl_expense be
      JOIN bl_capacity bc ON bc.bl_id = be.bl_id
    ),
    outbound_cost AS (
      SELECT fm.outbound_id,
             SUM(fm.cost_amount + fm.allocated_qty * p.spec_wp * COALESCE(bew.expense_per_wp, 0))::float8 AS cost
      FROM fifo_matches fm
      JOIN products p ON fm.product_id = p.product_id
      LEFT JOIN import_declarations idecl ON fm.declaration_id = idecl.declaration_id
      LEFT JOIN bl_expense_per_wp bew ON bew.bl_id = idecl.bl_id
      WHERE fm.cost_amount IS NOT NULL AND fm.allocated_qty IS NOT NULL AND fm.allocated_qty > 0
        AND fm.usage_category_raw IN ('상품판매', '상품판매(스페어)')
        AND fm.outbound_id IS NOT NULL
      GROUP BY fm.outbound_id
    ),
    month_grid AS (
      SELECT to_char(d::date, 'YYYY-MM') AS month
      FROM generate_series(
        date_trunc('month', now())::date - interval '23 months',
        date_trunc('month', now())::date,
        interval '1 month'
      ) d
    ),
    monthly AS (
      SELECT to_char(o.outbound_date, 'YYYY-MM') AS month,
             COALESCE(SUM(s.supply_amount) FILTER (WHERE oc.cost IS NOT NULL), 0)::float8 AS covered_revenue,
             COALESCE(SUM(oc.cost), 0)::float8 AS total_cost
      FROM sales s
      JOIN outbounds o ON s.outbound_id = o.outbound_id
      JOIN products p ON o.product_id = p.product_id
      LEFT JOIN outbound_cost oc ON oc.outbound_id = s.outbound_id
      WHERE o.company_id = ANY($1::uuid[]) AND o.status = 'active'
        AND COALESCE(s.status, 'active') <> 'cancelled'
        AND o.usage_category IN ('sale', 'sale_spare')
        AND o.outbound_date IS NOT NULL
        AND ($2::uuid IS NULL OR p.manufacturer_id = $2)
        AND ($3::uuid IS NULL OR o.product_id = $3)
        AND ($4::uuid IS NULL OR s.customer_id = $4)
      GROUP BY 1
    )
    SELECT mg.month,
           COALESCE(m.covered_revenue, 0)::float8 AS revenue,
           COALESCE(m.total_cost, 0)::float8 AS cost
    FROM month_grid mg
    LEFT JOIN monthly m ON m.month = mg.month
    ORDER BY mg.month
    "#;

    let rows = sqlx::query_as::<_, MarginTrendRow>(sql)
        .bind(company_ids)
        .bind(manufacturer_id)
        .bind(product_id)
        .bind(customer_id)
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let margin_rate = if r.revenue > 0.0 {
                ((r.revenue - r.cost) / r.revenue * 10000.0).round() / 100.0
            } else {
                0.0
            };
            crate::model::margin::MarginTrendPoint {
                month: r.month,
                revenue_krw: round2(r.revenue),
                cost_krw: round2(r.cost),
                margin_rate,
            }
        })
        .collect())
}

/// D-064 PR 30: ERP fifo_matches 기반 품번별 가중평균 원가(₩/Wp).
/// FIFO 매칭이 실제 입고 LOT ↔ 출고 배분 결과라 cost_details/BL 추정치보다 정확.
/// allocated_qty × spec_wp 로 분모, cost_amount + 부대비용 분배 합으로 분자.
///
/// ERP fifo_matches.cost_amount 에는 부대비용(incidental_expenses) 이 빠져있어,
/// BL 단위 부대비용을 BL 전체 용량 비례로 Wp 단가화한 뒤 (landed_cost.rs 와 동일한 분배식)
/// 매칭 행 Wp 만큼 더해 마진을 보정한다. 국내매입/기초재고 (declaration_id NULL) 는
/// LEFT JOIN 으로 expense_per_wp 가 0 처리되어 영향 없음.
async fn fetch_cost_avg_fifo(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
) -> Result<HashMap<Uuid, f64>, sqlx::Error> {
    // 매출 분석용 원가 = 상품판매(+스페어) 매칭만. usage_category_raw 가 ERP 한글 (상품판매/공사사용/유지관리/잔여재고 등) 로 들어옴.
    // 공사사용(자체 EPC) cost 가 매출 매칭에 합산되면 매출 < 원가 → -38% 음수 마진 사고 (2026-05-12).
    let sql = r#"
    WITH bl_expense AS (
      SELECT ie.bl_id, SUM(ie.amount)::float8 AS total_expense
      FROM incidental_expenses ie
      WHERE ie.bl_id IS NOT NULL
      GROUP BY ie.bl_id
    ),
    bl_capacity AS (
      SELECT idecl.bl_id, SUM(idecl.capacity_kw * 1000)::float8 AS total_wp
      FROM import_declarations idecl
      WHERE idecl.bl_id IS NOT NULL
        AND idecl.capacity_kw IS NOT NULL
      GROUP BY idecl.bl_id
    ),
    bl_expense_per_wp AS (
      SELECT be.bl_id,
             CASE WHEN bc.total_wp > 0 THEN be.total_expense / bc.total_wp ELSE 0 END AS expense_per_wp
      FROM bl_expense be
      JOIN bl_capacity bc ON bc.bl_id = be.bl_id
    )
    SELECT fm.product_id,
           CASE WHEN SUM(fm.allocated_qty * p.spec_wp) > 0
             THEN (
               SUM(fm.cost_amount)::float8
               + SUM(fm.allocated_qty * p.spec_wp * COALESCE(bew.expense_per_wp, 0))::float8
             ) / SUM(fm.allocated_qty * p.spec_wp)::float8
             ELSE NULL END AS avg_wp
    FROM fifo_matches fm
    JOIN products p ON fm.product_id = p.product_id
    LEFT JOIN outbounds o ON fm.outbound_id = o.outbound_id
    LEFT JOIN import_declarations idecl ON fm.declaration_id = idecl.declaration_id
    LEFT JOIN bl_expense_per_wp bew ON bew.bl_id = idecl.bl_id
    WHERE fm.allocated_qty IS NOT NULL AND fm.allocated_qty > 0
      AND fm.cost_amount IS NOT NULL
      AND fm.usage_category_raw IN ('상품판매', '상품판매(스페어)')
      AND ($2::uuid IS NULL OR fm.product_id = $2)
      AND (o.company_id IS NULL OR o.company_id = ANY($1::uuid[]))
    GROUP BY fm.product_id
    "#;
    let rows = sqlx::query_as::<_, CostAvgRow>(sql)
        .bind(company_ids)
        .bind(product_id)
        .fetch_all(pool)
        .await?;
    Ok(rows
        .into_iter()
        .filter_map(|r| r.avg_wp.map(|v| (r.product_id, v)))
        .collect())
}

async fn fetch_cost_avg(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    basis: &str,
) -> Result<HashMap<Uuid, f64>, sqlx::Error> {
    let col = if basis == "landed" {
        "cd.landed_wp_krw"
    } else {
        "cd.cif_wp_krw"
    };
    // D-031: FIFO 건별 원가 매칭 전까지 품번별 입고 수량 가중평균 원가를 사용한다.
    // 1순위: 수입면장 기반 원가 (cost_details — 관세/부대비용 포함 확정원가)
    let sql = format!(
        r#"
        WITH cd_cost AS (
          SELECT cd.product_id,
                 CASE WHEN SUM(cd.quantity) > 0
                   THEN SUM({col} * cd.quantity)::float8 / SUM(cd.quantity)
                   ELSE NULL END AS avg_wp
          FROM cost_details cd
          JOIN import_declarations decl ON cd.declaration_id = decl.declaration_id
          WHERE decl.company_id = ANY($1::uuid[])
            AND ($2::uuid IS NULL OR cd.product_id = $2)
            AND {col} IS NOT NULL
          GROUP BY cd.product_id
        ),
        -- 2순위: BL 입고 단가 기반 원가 (수입면장 미입력 시 BL unit_price 사용)
        bl_cost AS (
          SELECT bli.product_id,
                 CASE WHEN SUM(bli.quantity) > 0
                   THEN SUM(
                     bli.quantity::float8 * COALESCE(
                       bli.unit_price_usd_wp * bl.exchange_rate,
                       bli.unit_price_krw_wp
                     )
                   )::float8 / SUM(bli.quantity)
                   ELSE NULL END AS avg_wp
          FROM bl_line_items bli
          JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
          WHERE bl.status IN ('completed', 'erp_done')
            AND bl.company_id = ANY($1::uuid[])
            AND ($2::uuid IS NULL OR bli.product_id = $2)
            AND (bli.unit_price_usd_wp IS NOT NULL OR bli.unit_price_krw_wp IS NOT NULL)
          GROUP BY bli.product_id
        )
        SELECT COALESCE(cd.product_id, bl.product_id) AS product_id,
               COALESCE(cd.avg_wp, bl.avg_wp) AS avg_wp
        FROM cd_cost cd
        FULL OUTER JOIN bl_cost bl ON bl.product_id = cd.product_id
        "#
    );
    let rows = sqlx::query_as::<_, CostAvgRow>(&sql)
        .bind(company_ids)
        .bind(product_id)
        .fetch_all(pool)
        .await?;
    Ok(rows
        .into_iter()
        .filter_map(|r| r.avg_wp.map(|v| (r.product_id, v)))
        .collect())
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
