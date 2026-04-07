/// 재고 3단계 집계 + 장기재고 판별
/// 비유: "재고 현황판" — 물리적→가용→총확보량을 한 번에 계산
///
/// 8단계 (D-083 반영 — BL 상태 기반):
/// 1. 물리적 = BL(completed|erp_done) - 출고(active)
/// 2. 예약 (sale/spare/maintenance/other + stock)
/// 3. 배정 (construction/repowering + stock)
/// 4. 가용 = 물리적 - 예약 - 배정
/// 5. 미착품 = BL(shipping|arrived|customs) 라인 합계 — 입고유형 무관
/// 6. 미착품예약 (fulfillment_source=incoming)
/// 7. 가용미착품 = 미착품 - 미착품예약
/// 8. 총확보량 = 가용 + 가용미착품

use chrono::{NaiveDate, Utc};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::model::inventory::{
    InventoryItem, InventoryRequest, InventoryResponse, InventorySummary,
};

/// 품번 기본 정보 (products + manufacturers JOIN)
#[derive(sqlx::FromRow)]
struct ProductInfo {
    product_id: Uuid,
    product_code: String,
    product_name: String,
    manufacturer_name: String,
    spec_wp: i32,
    module_width_mm: i32,
    module_height_mm: i32,
}

/// kW 집계 행
#[derive(sqlx::FromRow)]
struct KwRow {
    product_id: Uuid,
    kw: f64,
}

/// 장기재고 날짜 행
#[derive(sqlx::FromRow)]
struct EarliestRow {
    product_id: Uuid,
    earliest: Option<NaiveDate>,
}

/// kW 맵 타입 (product_id -> kW)
type KwMap = HashMap<Uuid, f64>;

/// kw 집계 헬퍼: KwRow 벡터 -> HashMap
fn kw_rows_to_map(rows: Vec<KwRow>) -> KwMap {
    rows.into_iter().map(|r| (r.product_id, r.kw)).collect()
}

/// 재고 집계 실행
pub async fn calculate_inventory(
    pool: &PgPool,
    req: &InventoryRequest,
) -> Result<InventoryResponse, sqlx::Error> {
    let company_id = req.company_id.unwrap();
    let product_id = req.product_id;
    let manufacturer_id = req.manufacturer_id;

    // 비유: 품번 카탈로그에서 대상 품번 목록을 꺼냄
    let products = fetch_products(pool, company_id, product_id, manufacturer_id).await?;

    // 비유: 각 단계별 수치를 창고에서 가져옴
    let inbound = fetch_inbound(pool, company_id, product_id, manufacturer_id).await?;
    let outbound = fetch_outbound(pool, company_id, product_id, manufacturer_id).await?;
    let reserved = fetch_reserved(pool, company_id, product_id, manufacturer_id).await?;
    let allocated = fetch_allocated(pool, company_id, product_id, manufacturer_id).await?;
    let bl_incoming = fetch_bl_incoming(pool, company_id, product_id, manufacturer_id).await?;
    let incoming_reserved =
        fetch_incoming_reserved(pool, company_id, product_id, manufacturer_id).await?;
    let earliest_arrival =
        fetch_earliest_arrival(pool, company_id, product_id, manufacturer_id).await?;

    let today = Utc::now().date_naive();

    let mut items: Vec<InventoryItem> = Vec::new();

    for p in &products {
        let pid = p.product_id;
        let inbound_kw = *inbound.get(&pid).unwrap_or(&0.0);
        let outbound_kw = *outbound.get(&pid).unwrap_or(&0.0);
        let reserved_kw = *reserved.get(&pid).unwrap_or(&0.0);
        let allocated_kw = *allocated.get(&pid).unwrap_or(&0.0);
        let bl_incoming_kw = *bl_incoming.get(&pid).unwrap_or(&0.0);
        let incoming_reserved_kw = *incoming_reserved.get(&pid).unwrap_or(&0.0);

        // 8단계 계산 (D-083: BL 상태 직접 사용)
        let physical_kw = inbound_kw - outbound_kw;
        let available_kw = physical_kw - reserved_kw - allocated_kw;
        let incoming_kw = bl_incoming_kw.max(0.0);
        let available_incoming_kw = (incoming_kw - incoming_reserved_kw).max(0.0);
        let total_secured_kw = available_kw + available_incoming_kw;

        // 장기재고 판별
        let long_term_status = match earliest_arrival.get(&pid) {
            Some(arrival_date) => {
                let days = (today - *arrival_date).num_days();
                if days <= 180 {
                    "normal".to_string()
                } else if days <= 365 {
                    "warning".to_string()
                } else {
                    "critical".to_string()
                }
            }
            None => "normal".to_string(),
        };

        items.push(InventoryItem {
            product_id: pid,
            product_code: p.product_code.clone(),
            product_name: p.product_name.clone(),
            manufacturer_name: p.manufacturer_name.clone(),
            spec_wp: p.spec_wp,
            module_width_mm: p.module_width_mm,
            module_height_mm: p.module_height_mm,
            physical_kw,
            reserved_kw,
            allocated_kw,
            available_kw,
            incoming_kw,
            incoming_reserved_kw,
            available_incoming_kw,
            total_secured_kw,
            long_term_status,
        });
    }

    // 정렬: 제조사명 -> 모듈크기(width, height) -> 출력(spec_wp)
    items.sort_by(|a, b| {
        a.manufacturer_name
            .cmp(&b.manufacturer_name)
            .then(a.module_width_mm.cmp(&b.module_width_mm))
            .then(a.module_height_mm.cmp(&b.module_height_mm))
            .then(a.spec_wp.cmp(&b.spec_wp))
    });

    // 전체 합계
    let summary = InventorySummary {
        total_physical_kw: items.iter().map(|i| i.physical_kw).sum(),
        total_available_kw: items.iter().map(|i| i.available_kw).sum(),
        total_incoming_kw: items.iter().map(|i| i.incoming_kw).sum(),
        total_secured_kw: items.iter().map(|i| i.total_secured_kw).sum(),
    };

    Ok(InventoryResponse {
        items,
        summary,
        calculated_at: Utc::now(),
    })
}

// === 이하 SQL 쿼리 함수들 (런타임 쿼리 — DATABASE_URL 불필요) ===

/// 대상 품번 목록 조회
async fn fetch_products(
    pool: &PgPool,
    company_id: Uuid,
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<Vec<ProductInfo>, sqlx::Error> {
    sqlx::query_as::<_, ProductInfo>(
        r#"
        SELECT DISTINCT p.product_id, p.product_code, p.product_name,
               m.name_kr as manufacturer_name,
               p.spec_wp, p.module_width_mm, p.module_height_mm
        FROM products p
        JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
        WHERE p.is_active = true
          AND ($1::uuid IS NULL OR p.product_id = $1)
          AND ($2::uuid IS NULL OR p.manufacturer_id = $2)
          AND EXISTS (
            SELECT 1 FROM bl_line_items bli
            JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
            WHERE bli.product_id = p.product_id
              AND bl.company_id = $3
          )
        "#,
    )
    .bind(product_id)
    .bind(manufacturer_id)
    .bind(company_id)
    .fetch_all(pool)
    .await
}

/// 1. 입고 합계 (completed/erp_done)
async fn fetch_inbound(
    pool: &PgPool,
    company_id: Uuid,
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT bli.product_id, COALESCE(SUM(bli.capacity_kw), 0)::float8 as kw
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        JOIN products p ON bli.product_id = p.product_id
        WHERE bl.status IN ('completed', 'erp_done')
          AND bl.company_id = $1
          AND ($2::uuid IS NULL OR bli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY bli.product_id
        "#,
    )
    .bind(company_id)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 1. 출고 합계 (active만)
async fn fetch_outbound(
    pool: &PgPool,
    company_id: Uuid,
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT o.product_id, COALESCE(SUM(o.capacity_kw), 0)::float8 as kw
        FROM outbounds o
        JOIN products p ON o.product_id = p.product_id
        WHERE o.status = 'active'
          AND o.company_id = $1
          AND ($2::uuid IS NULL OR o.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY o.product_id
        "#,
    )
    .bind(company_id)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 2. 예약 (sale/spare/maintenance/other + stock)
async fn fetch_reserved(
    pool: &PgPool,
    company_id: Uuid,
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT ord.product_id,
          COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0)::float8 as kw
        FROM orders ord
        JOIN products p ON ord.product_id = p.product_id
        WHERE ord.status IN ('received', 'partial')
          AND ord.management_category IN ('sale', 'spare', 'maintenance', 'other')
          AND ord.fulfillment_source = 'stock'
          AND ord.company_id = $1
          AND ($2::uuid IS NULL OR ord.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY ord.product_id
        "#,
    )
    .bind(company_id)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 3. 배정 (construction/repowering + stock)
async fn fetch_allocated(
    pool: &PgPool,
    company_id: Uuid,
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT ord.product_id,
          COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0)::float8 as kw
        FROM orders ord
        JOIN products p ON ord.product_id = p.product_id
        WHERE ord.status IN ('received', 'partial')
          AND ord.management_category IN ('construction', 'repowering')
          AND ord.fulfillment_source = 'stock'
          AND ord.company_id = $1
          AND ($2::uuid IS NULL OR ord.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY ord.product_id
        "#,
    )
    .bind(company_id)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 5. 미착품 (D-083) — BL 상태 직접 사용: shipping/arrived/customs
/// 비유: 배가 떠났지만 아직 창고에 물리적으로 안 들어온 것 모두 미착품
async fn fetch_bl_incoming(
    pool: &PgPool,
    company_id: Uuid,
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT bli.product_id, COALESCE(SUM(bli.capacity_kw), 0)::float8 as kw
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        JOIN products p ON bli.product_id = p.product_id
        WHERE bl.status IN ('shipping', 'arrived', 'customs')
          AND bl.company_id = $1
          AND ($2::uuid IS NULL OR bli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY bli.product_id
        "#,
    )
    .bind(company_id)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 6. 미착품 예약 (fulfillment_source=incoming)
async fn fetch_incoming_reserved(
    pool: &PgPool,
    company_id: Uuid,
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT ord.product_id,
          COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0)::float8 as kw
        FROM orders ord
        JOIN products p ON ord.product_id = p.product_id
        WHERE ord.status IN ('received', 'partial')
          AND ord.fulfillment_source = 'incoming'
          AND ord.company_id = $1
          AND ($2::uuid IS NULL OR ord.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY ord.product_id
        "#,
    )
    .bind(company_id)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 장기재고: 최초 입고일 조회
async fn fetch_earliest_arrival(
    pool: &PgPool,
    company_id: Uuid,
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<HashMap<Uuid, NaiveDate>, sqlx::Error> {
    let rows = sqlx::query_as::<_, EarliestRow>(
        r#"
        SELECT bli.product_id, MIN(bl.actual_arrival) as earliest
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        JOIN products p ON bli.product_id = p.product_id
        WHERE bl.status IN ('completed', 'erp_done')
          AND bl.company_id = $1
          AND ($2::uuid IS NULL OR bli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY bli.product_id
        "#,
    )
    .bind(company_id)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .filter_map(|r| r.earliest.map(|d| (r.product_id, d)))
        .collect())
}
