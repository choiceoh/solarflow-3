/// 재고 회전율 계산
/// 비유: "재고 건강검진" — 얼마나 빠르게 돌고 있는지 측정
///
/// 공식:
///   turnover_ratio = (outbound_kw / days) * 365 / current_inventory_kw   (회/년)
///   dio_days       = 365 / turnover_ratio                               (평균 재고일수)
///
/// 재고 기준: 현재 물리재고 (입고 completed/erp_done - 출고 active)
/// 출고 기준: 최근 N일 (status='active', outbound_date >= today - N days)

use chrono::Utc;
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::model::turnover::{
    TurnoverByManufacturer, TurnoverByProduct, TurnoverBySpecWp, TurnoverMatrixCell,
    TurnoverRequest, TurnoverResponse, TurnoverTotal,
};

#[derive(sqlx::FromRow)]
struct ProductInfo {
    product_id: Uuid,
    product_code: String,
    product_name: String,
    manufacturer_id: Uuid,
    manufacturer_name: String,
    spec_wp: i32,
    module_width_mm: Option<i32>,
    module_height_mm: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct KwRow {
    product_id: Uuid,
    kw: f64,
}

/// 재고 회전율 계산 진입점
pub async fn calculate_turnover(
    pool: &PgPool,
    req: &TurnoverRequest,
) -> Result<TurnoverResponse, sqlx::Error> {
    let company_id = req.company_id.unwrap();
    // 최소 30일
    let days = req.days.max(30);

    let products = fetch_products(pool, company_id).await?;
    let inventory = fetch_current_inventory_kw(pool, company_id).await?;
    let inventory_ea = fetch_current_inventory_ea(pool, company_id).await?;
    let outbound = fetch_outbound_window(pool, company_id, days).await?;
    let outbound_ea = fetch_outbound_ea_window(pool, company_id, days).await?;

    // 연환산 배수
    let annualize = 365.0_f64 / (days as f64);

    // 품목별 회전율 계산
    let mut products_ratio: Vec<TurnoverByProduct> = Vec::with_capacity(products.len());
    for p in &products {
        let inv_kw = *inventory.get(&p.product_id).unwrap_or(&0.0);
        let inv_ea = *inventory_ea.get(&p.product_id).unwrap_or(&0) as i32;
        let out_kw = *outbound.get(&p.product_id).unwrap_or(&0.0);
        let out_ea = *outbound_ea.get(&p.product_id).unwrap_or(&0) as i32;

        let ratio = if inv_kw > 0.0 {
            (out_kw * annualize) / inv_kw
        } else if out_kw > 0.0 {
            // 재고 없이 출고만 발생: 매우 빠른 회전 (표시상 상한)
            999.0
        } else {
            0.0
        };
        let dio = if ratio > 0.0 { 365.0 / ratio } else { 999.0 };

        products_ratio.push(TurnoverByProduct {
            product_id: p.product_id,
            product_code: p.product_code.clone(),
            product_name: p.product_name.clone(),
            manufacturer_name: p.manufacturer_name.clone(),
            spec_wp: p.spec_wp,
            module_width_mm: p.module_width_mm,
            module_height_mm: p.module_height_mm,
            inventory_kw: inv_kw,
            inventory_ea: inv_ea,
            outbound_kw: out_kw,
            outbound_ea: out_ea,
            turnover_ratio: ratio,
            dio_days: dio,
        });
    }

    // 전체 집계
    let total_inv: f64 = products_ratio.iter().map(|p| p.inventory_kw).sum();
    let total_out: f64 = products_ratio.iter().map(|p| p.outbound_kw).sum();
    let total_ratio = if total_inv > 0.0 {
        (total_out * annualize) / total_inv
    } else {
        0.0
    };
    let total_dio = if total_ratio > 0.0 { 365.0 / total_ratio } else { 999.0 };

    let total = TurnoverTotal {
        inventory_kw: total_inv,
        outbound_kw: total_out,
        turnover_ratio: total_ratio,
        dio_days: total_dio,
    };

    // 제조사별 집계
    let mut by_mfr_map: HashMap<Uuid, (String, f64, f64)> = HashMap::new();
    for p in &products {
        let inv = *inventory.get(&p.product_id).unwrap_or(&0.0);
        let out = *outbound.get(&p.product_id).unwrap_or(&0.0);
        let e = by_mfr_map.entry(p.manufacturer_id).or_insert((p.manufacturer_name.clone(), 0.0, 0.0));
        e.1 += inv;
        e.2 += out;
    }
    let mut by_manufacturer: Vec<TurnoverByManufacturer> = by_mfr_map
        .into_iter()
        .map(|(mid, (name, inv, out))| {
            let r = if inv > 0.0 { (out * annualize) / inv } else { 0.0 };
            let d = if r > 0.0 { 365.0 / r } else { 999.0 };
            TurnoverByManufacturer {
                manufacturer_id: mid,
                manufacturer_name: name,
                inventory_kw: inv,
                outbound_kw: out,
                turnover_ratio: r,
                dio_days: d,
            }
        })
        .collect();
    by_manufacturer.sort_by(|a, b| a.manufacturer_name.cmp(&b.manufacturer_name));

    // 출력(Wp)별 집계
    let mut by_wp_map: HashMap<i32, (f64, f64)> = HashMap::new();
    for p in &products {
        let inv = *inventory.get(&p.product_id).unwrap_or(&0.0);
        let out = *outbound.get(&p.product_id).unwrap_or(&0.0);
        let e = by_wp_map.entry(p.spec_wp).or_insert((0.0, 0.0));
        e.0 += inv;
        e.1 += out;
    }
    let mut by_spec_wp: Vec<TurnoverBySpecWp> = by_wp_map
        .into_iter()
        .map(|(wp, (inv, out))| {
            let r = if inv > 0.0 { (out * annualize) / inv } else { 0.0 };
            let d = if r > 0.0 { 365.0 / r } else { 999.0 };
            TurnoverBySpecWp {
                spec_wp: wp,
                inventory_kw: inv,
                outbound_kw: out,
                turnover_ratio: r,
                dio_days: d,
            }
        })
        .collect();
    by_spec_wp.sort_by(|a, b| a.spec_wp.cmp(&b.spec_wp));

    // 제조사 × 출력 매트릭스
    let mut matrix_map: HashMap<(Uuid, i32), (String, f64, f64)> = HashMap::new();
    for p in &products {
        let inv = *inventory.get(&p.product_id).unwrap_or(&0.0);
        let out = *outbound.get(&p.product_id).unwrap_or(&0.0);
        let e = matrix_map
            .entry((p.manufacturer_id, p.spec_wp))
            .or_insert((p.manufacturer_name.clone(), 0.0, 0.0));
        e.1 += inv;
        e.2 += out;
    }
    let mut matrix: Vec<TurnoverMatrixCell> = matrix_map
        .into_iter()
        .map(|((mid, wp), (name, inv, out))| {
            let r = if inv > 0.0 { (out * annualize) / inv } else { 0.0 };
            TurnoverMatrixCell {
                manufacturer_id: mid,
                manufacturer_name: name,
                spec_wp: wp,
                inventory_kw: inv,
                outbound_kw: out,
                turnover_ratio: r,
            }
        })
        .collect();
    matrix.sort_by(|a, b| {
        a.manufacturer_name
            .cmp(&b.manufacturer_name)
            .then(a.spec_wp.cmp(&b.spec_wp))
    });

    // Top/Bottom movers — 의미 있는 품목만 포함
    // Top: 재고 보유 + 출고 발생 + ratio 999 미만 (즉, 실제 순환 중)
    let mut top_candidates: Vec<TurnoverByProduct> = products_ratio
        .iter()
        .filter(|p| p.inventory_kw > 0.0 && p.outbound_kw > 0.0 && p.turnover_ratio < 999.0)
        .cloned()
        .collect();
    top_candidates.sort_by(|a, b| b.turnover_ratio.partial_cmp(&a.turnover_ratio).unwrap_or(std::cmp::Ordering::Equal));
    let top_movers: Vec<TurnoverByProduct> = top_candidates.into_iter().take(10).collect();

    // Slow: 재고 있음 + 출고 0 또는 매우 느림 (처분 타겟)
    let mut slow_candidates: Vec<TurnoverByProduct> = products_ratio
        .iter()
        .filter(|p| p.inventory_kw > 0.0)
        .cloned()
        .collect();
    // 낮은 회전율 우선 (0이 최상단)
    slow_candidates.sort_by(|a, b| a.turnover_ratio.partial_cmp(&b.turnover_ratio).unwrap_or(std::cmp::Ordering::Equal));
    let slow_movers: Vec<TurnoverByProduct> = slow_candidates.into_iter().take(10).collect();

    Ok(TurnoverResponse {
        window_days: days,
        total,
        by_manufacturer,
        by_spec_wp,
        matrix,
        top_movers,
        slow_movers,
        calculated_at: Utc::now().to_rfc3339(),
    })
}

// === SQL 쿼리 ===

async fn fetch_products(pool: &PgPool, company_id: Uuid) -> Result<Vec<ProductInfo>, sqlx::Error> {
    sqlx::query_as::<_, ProductInfo>(
        r#"
        SELECT DISTINCT p.product_id, p.product_code, p.product_name,
               p.manufacturer_id,
               m.name_kr AS manufacturer_name,
               p.spec_wp, p.module_width_mm, p.module_height_mm
        FROM products p
        JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
        WHERE p.is_active = true
          AND (
            EXISTS (
              SELECT 1 FROM bl_line_items bli
              JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
              WHERE bli.product_id = p.product_id AND bl.company_id = $1
            )
            OR EXISTS (
              SELECT 1 FROM outbounds o
              WHERE o.product_id = p.product_id AND o.company_id = $1
            )
          )
        "#,
    )
    .bind(company_id)
    .fetch_all(pool)
    .await
}

/// 현재 물리재고 (kW) = 입고(completed/erp_done) - 출고(active)
async fn fetch_current_inventory_kw(
    pool: &PgPool,
    company_id: Uuid,
) -> Result<HashMap<Uuid, f64>, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        WITH inbound AS (
          SELECT bli.product_id, COALESCE(SUM(bli.capacity_kw), 0)::float8 AS kw
          FROM bl_line_items bli
          JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
          WHERE bl.status IN ('completed', 'erp_done')
            AND bl.company_id = $1
          GROUP BY bli.product_id
        ),
        outbound AS (
          SELECT o.product_id, COALESCE(SUM(o.capacity_kw), 0)::float8 AS kw
          FROM outbounds o
          WHERE o.status = 'active'
            AND o.company_id = $1
          GROUP BY o.product_id
        )
        SELECT
          COALESCE(i.product_id, o.product_id) AS product_id,
          (COALESCE(i.kw, 0) - COALESCE(o.kw, 0))::float8 AS kw
        FROM inbound i
        FULL OUTER JOIN outbound o ON i.product_id = o.product_id
        "#,
    )
    .bind(company_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (r.product_id, r.kw.max(0.0))).collect())
}

/// 현재 재고 EA = 입고 quantity - 출고 quantity
async fn fetch_current_inventory_ea(
    pool: &PgPool,
    company_id: Uuid,
) -> Result<HashMap<Uuid, i64>, sqlx::Error> {
    #[derive(sqlx::FromRow)]
    struct EaRow {
        product_id: Uuid,
        ea: i64,
    }
    let rows = sqlx::query_as::<_, EaRow>(
        r#"
        WITH inbound AS (
          SELECT bli.product_id, COALESCE(SUM(bli.quantity), 0)::bigint AS ea
          FROM bl_line_items bli
          JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
          WHERE bl.status IN ('completed', 'erp_done')
            AND bl.company_id = $1
          GROUP BY bli.product_id
        ),
        outbound AS (
          SELECT o.product_id, COALESCE(SUM(o.quantity), 0)::bigint AS ea
          FROM outbounds o
          WHERE o.status = 'active'
            AND o.company_id = $1
          GROUP BY o.product_id
        )
        SELECT
          COALESCE(i.product_id, o.product_id) AS product_id,
          (COALESCE(i.ea, 0) - COALESCE(o.ea, 0))::bigint AS ea
        FROM inbound i
        FULL OUTER JOIN outbound o ON i.product_id = o.product_id
        "#,
    )
    .bind(company_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (r.product_id, r.ea.max(0))).collect())
}

/// 최근 N일 출고 합계 (kW)
async fn fetch_outbound_window(
    pool: &PgPool,
    company_id: Uuid,
    days: i32,
) -> Result<HashMap<Uuid, f64>, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT o.product_id, COALESCE(SUM(o.capacity_kw), 0)::float8 AS kw
        FROM outbounds o
        WHERE o.status = 'active'
          AND o.company_id = $1
          AND o.outbound_date >= (CURRENT_DATE - ($2::int) * INTERVAL '1 day')
        GROUP BY o.product_id
        "#,
    )
    .bind(company_id)
    .bind(days)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (r.product_id, r.kw)).collect())
}

/// 최근 N일 출고 EA
async fn fetch_outbound_ea_window(
    pool: &PgPool,
    company_id: Uuid,
    days: i32,
) -> Result<HashMap<Uuid, i64>, sqlx::Error> {
    #[derive(sqlx::FromRow)]
    struct EaRow {
        product_id: Uuid,
        ea: i64,
    }
    let rows = sqlx::query_as::<_, EaRow>(
        r#"
        SELECT o.product_id, COALESCE(SUM(o.quantity), 0)::bigint AS ea
        FROM outbounds o
        WHERE o.status = 'active'
          AND o.company_id = $1
          AND o.outbound_date >= (CURRENT_DATE - ($2::int) * INTERVAL '1 day')
        GROUP BY o.product_id
        "#,
    )
    .bind(company_id)
    .bind(days)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| (r.product_id, r.ea)).collect())
}

