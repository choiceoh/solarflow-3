/// 재고 3단계 집계 + 장기재고 판별 (다중 법인 지원)
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
///
/// 다중 법인: 모든 SQL이 company_id ∈ ANY($1)로 한 번에 처리되며,
/// 결과 row는 (company_id, product_id) 쌍별로 분리되어 반환된다.

use chrono::{NaiveDate, Utc};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::model::inventory::{
    InventoryItem, InventoryRequest, InventoryResponse, InventorySummary,
};

/// (법인, 품번) 기본 정보 — products + manufacturers + companies JOIN
#[derive(sqlx::FromRow)]
struct ProductInfo {
    company_id: Uuid,
    company_name: String,
    product_id: Uuid,
    product_code: String,
    product_name: String,
    manufacturer_name: String,
    spec_wp: i32,
    module_width_mm: i32,
    module_height_mm: i32,
}

/// (법인, 품번) 별 kW 집계 행
#[derive(sqlx::FromRow)]
struct KwRow {
    company_id: Uuid,
    product_id: Uuid,
    kw: f64,
}

/// (법인, 품번) 별 날짜 행 (장기재고/최근입고)
#[derive(sqlx::FromRow)]
struct DateRow {
    company_id: Uuid,
    product_id: Uuid,
    date: Option<NaiveDate>,
}

/// (법인, 품번) → kW 맵
type KwMap = HashMap<(Uuid, Uuid), f64>;

fn kw_rows_to_map(rows: Vec<KwRow>) -> KwMap {
    rows.into_iter()
        .map(|r| ((r.company_id, r.product_id), r.kw))
        .collect()
}

fn date_rows_to_map(rows: Vec<DateRow>) -> HashMap<(Uuid, Uuid), NaiveDate> {
    rows.into_iter()
        .filter_map(|r| r.date.map(|d| ((r.company_id, r.product_id), d)))
        .collect()
}

/// 재고 집계 실행 — 단일/다중 법인 통합 진입점
pub async fn calculate_inventory(
    pool: &PgPool,
    req: &InventoryRequest,
) -> Result<InventoryResponse, sqlx::Error> {
    // 단일/다중 입력을 단일 Vec<Uuid>로 정규화
    let company_ids: Vec<Uuid> = match (&req.company_ids, req.company_id) {
        (Some(ids), _) => ids.clone(),
        (None, Some(id)) => vec![id],
        (None, None) => return Ok(empty_response()),
    };
    if company_ids.is_empty() {
        return Ok(empty_response());
    }

    let product_id = req.product_id;
    let manufacturer_id = req.manufacturer_id;

    let products = fetch_products(pool, &company_ids, product_id, manufacturer_id).await?;
    let inbound = fetch_inbound(pool, &company_ids, product_id, manufacturer_id).await?;
    let outbound = fetch_outbound(pool, &company_ids, product_id, manufacturer_id).await?;
    let reserved = fetch_reserved(pool, &company_ids, product_id, manufacturer_id).await?;
    let allocated = fetch_allocated(pool, &company_ids, product_id, manufacturer_id).await?;
    let alloc_stock = fetch_alloc_stock(pool, &company_ids, product_id, manufacturer_id).await?;
    let alloc_incoming = fetch_alloc_incoming(pool, &company_ids, product_id, manufacturer_id).await?;
    let bl_incoming = fetch_bl_incoming(pool, &company_ids, product_id, manufacturer_id).await?;
    let lc_incoming = fetch_lc_incoming(pool, &company_ids, product_id, manufacturer_id).await?;
    let incoming_reserved =
        fetch_incoming_reserved(pool, &company_ids, product_id, manufacturer_id).await?;
    let earliest_arrival =
        fetch_earliest_arrival(pool, &company_ids, product_id, manufacturer_id).await?;
    let latest_arrival =
        fetch_latest_arrival(pool, &company_ids, product_id, manufacturer_id).await?;
    let latest_lc_open =
        fetch_latest_lc_open(pool, &company_ids, product_id, manufacturer_id).await?;

    let today = Utc::now().date_naive();

    let mut items: Vec<InventoryItem> = Vec::new();

    for p in &products {
        let key = (p.company_id, p.product_id);
        let inbound_kw = *inbound.get(&key).unwrap_or(&0.0);
        let outbound_kw = *outbound.get(&key).unwrap_or(&0.0);
        let reserved_kw = *reserved.get(&key).unwrap_or(&0.0);
        let allocated_kw = *allocated.get(&key).unwrap_or(&0.0);
        let alloc_stock_kw = *alloc_stock.get(&key).unwrap_or(&0.0);
        let alloc_incoming_kw = *alloc_incoming.get(&key).unwrap_or(&0.0);
        let bl_incoming_kw = *bl_incoming.get(&key).unwrap_or(&0.0);
        let lc_incoming_kw = *lc_incoming.get(&key).unwrap_or(&0.0);
        let incoming_reserved_kw = *incoming_reserved.get(&key).unwrap_or(&0.0);

        let physical_kw = inbound_kw - outbound_kw;
        let available_kw = (physical_kw - reserved_kw - allocated_kw - alloc_stock_kw).max(0.0);
        let incoming_kw = (bl_incoming_kw + lc_incoming_kw).max(0.0);
        let available_incoming_kw = (incoming_kw - incoming_reserved_kw - alloc_incoming_kw).max(0.0);
        let total_secured_kw = available_kw + available_incoming_kw;

        // D-022: 장기재고는 FIFO 건별 추적 전까지 최초 입고일 기준으로 판별
        let long_term_status = match earliest_arrival.get(&key) {
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
            company_id: p.company_id,
            company_name: p.company_name.clone(),
            product_id: p.product_id,
            product_code: p.product_code.clone(),
            product_name: p.product_name.clone(),
            manufacturer_name: p.manufacturer_name.clone(),
            spec_wp: p.spec_wp,
            module_width_mm: p.module_width_mm,
            module_height_mm: p.module_height_mm,
            physical_kw,
            reserved_kw,
            allocated_kw: allocated_kw + alloc_stock_kw,
            available_kw,
            incoming_kw,
            incoming_reserved_kw,
            available_incoming_kw,
            total_secured_kw,
            long_term_status,
            latest_arrival: latest_arrival.get(&key).copied(),
            latest_lc_open: latest_lc_open.get(&key).copied(),
        });
    }

    // 정렬: 법인명 → 제조사명 → 모듈크기 → 출력
    items.sort_by(|a, b| {
        a.company_name
            .cmp(&b.company_name)
            .then(a.manufacturer_name.cmp(&b.manufacturer_name))
            .then(a.module_width_mm.cmp(&b.module_width_mm))
            .then(a.module_height_mm.cmp(&b.module_height_mm))
            .then(a.spec_wp.cmp(&b.spec_wp))
    });

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

fn empty_response() -> InventoryResponse {
    InventoryResponse {
        items: Vec::new(),
        summary: InventorySummary {
            total_physical_kw: 0.0,
            total_available_kw: 0.0,
            total_incoming_kw: 0.0,
            total_secured_kw: 0.0,
        },
        calculated_at: Utc::now(),
    }
}

// === 이하 SQL 쿼리 함수들 — 모든 company 필터를 ANY($1::uuid[])로 통합 ===

/// 대상 (법인, 품번) 조합 목록 — BL 또는 LC가 존재하는 것만
async fn fetch_products(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<Vec<ProductInfo>, sqlx::Error> {
    sqlx::query_as::<_, ProductInfo>(
        r#"
        SELECT DISTINCT
               c.company_id, c.company_name,
               p.product_id, p.product_code, p.product_name,
               m.name_kr as manufacturer_name,
               p.spec_wp, p.module_width_mm, p.module_height_mm
        FROM products p
        JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
        JOIN companies c ON c.company_id = ANY($3::uuid[])
        WHERE p.is_active = true
          AND ($1::uuid IS NULL OR p.product_id = $1)
          AND ($2::uuid IS NULL OR p.manufacturer_id = $2)
          AND (
            EXISTS (
              SELECT 1 FROM bl_line_items bli
              JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
              WHERE bli.product_id = p.product_id
                AND bl.company_id = c.company_id
            )
            OR
            EXISTS (
              SELECT 1 FROM lc_records lc
              JOIN purchase_orders po ON lc.po_id = po.po_id
              JOIN po_line_items pli ON po.po_id = pli.po_id
              WHERE pli.product_id = p.product_id
                AND lc.company_id = c.company_id
                AND lc.status = 'opened'
            )
          )
        "#,
    )
    .bind(product_id)
    .bind(manufacturer_id)
    .bind(company_ids)
    .fetch_all(pool)
    .await
}

/// 1. 입고 합계 (completed/erp_done)
async fn fetch_inbound(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT bl.company_id, bli.product_id,
               COALESCE(SUM(bli.capacity_kw), 0)::float8 as kw
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        JOIN products p ON bli.product_id = p.product_id
        WHERE bl.status IN ('completed', 'erp_done')
          AND bl.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR bli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY bl.company_id, bli.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 1. 출고 합계 (active만)
async fn fetch_outbound(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT o.company_id, o.product_id,
               COALESCE(SUM(o.capacity_kw), 0)::float8 as kw
        FROM outbounds o
        JOIN products p ON o.product_id = p.product_id
        WHERE o.status = 'active'
          AND o.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR o.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY o.company_id, o.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 2. 예약 (sale/spare/maintenance/other + stock)
async fn fetch_reserved(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT ord.company_id, ord.product_id,
          COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0)::float8 as kw
        FROM orders ord
        JOIN products p ON ord.product_id = p.product_id
        WHERE ord.status IN ('received', 'partial')
          AND ord.management_category IN ('sale', 'spare', 'maintenance', 'other')
          AND ord.fulfillment_source = 'stock'
          AND ord.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR ord.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY ord.company_id, ord.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 3. 배정 (construction/repowering + stock)
async fn fetch_allocated(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT ord.company_id, ord.product_id,
          COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0)::float8 as kw
        FROM orders ord
        JOIN products p ON ord.product_id = p.product_id
        WHERE ord.status IN ('received', 'partial')
          AND ord.management_category IN ('construction', 'repowering')
          AND ord.fulfillment_source = 'stock'
          AND ord.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR ord.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY ord.company_id, ord.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 3-b. inventory_allocations 현재고 예약 (source_type='stock', status='pending')
async fn fetch_alloc_stock(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT ia.company_id, ia.product_id,
          COALESCE(SUM(
            CASE
              WHEN ia.capacity_kw IS NOT NULL THEN ia.capacity_kw
              ELSE ia.quantity::float8 * p.spec_wp::float8 / 1000.0
            END
          ), 0)::float8 AS kw
        FROM inventory_allocations ia
        JOIN products p ON ia.product_id = p.product_id
        WHERE (
                ia.status IN ('pending')
                OR (ia.notes LIKE '[무상스페어]%' AND ia.status NOT IN ('cancelled', 'confirmed'))
              )
          AND ia.source_type = 'stock'
          AND ia.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR ia.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY ia.company_id, ia.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 3-c. inventory_allocations 미착품 예약 (source_type='incoming', status='pending')
async fn fetch_alloc_incoming(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT ia.company_id, ia.product_id,
          COALESCE(SUM(
            CASE
              WHEN ia.capacity_kw IS NOT NULL THEN ia.capacity_kw
              ELSE ia.quantity::float8 * p.spec_wp::float8 / 1000.0
            END
          ), 0)::float8 AS kw
        FROM inventory_allocations ia
        JOIN products p ON ia.product_id = p.product_id
        WHERE (
                ia.status = 'pending'
                OR (ia.notes LIKE '[무상스페어]%' AND ia.status NOT IN ('cancelled', 'confirmed'))
              )
          AND ia.source_type = 'incoming'
          AND ia.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR ia.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY ia.company_id, ia.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 5. 미착품 — L/C 오픈 완료 기준 (BL 운송 중)
async fn fetch_bl_incoming(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT bl.company_id, bli.product_id,
               COALESCE(SUM(bli.capacity_kw), 0)::float8 as kw
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        JOIN products p ON bli.product_id = p.product_id
        WHERE bl.status IN ('shipping', 'arrived', 'customs')
          AND bl.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR bli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
          AND (
            bl.lc_id IS NULL
            OR EXISTS (
              SELECT 1 FROM lc_records lc
              WHERE lc.lc_id = bl.lc_id
                AND lc.status = 'opened'
            )
          )
        GROUP BY bl.company_id, bli.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 5-b. L/C 기반 미착품 — BL 없이 L/C만 개설된 P/O의 품목
async fn fetch_lc_incoming(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT lc.company_id, pli.product_id,
          COALESCE(SUM(
            GREATEST(0.0,
              lc.target_mw * 1000.0
              * (pli.quantity::float8 * p.spec_wp::float8)
              / NULLIF(po_kw.total_kw, 0.0)
              - COALESCE((
                SELECT SUM(bli_done.capacity_kw)
                FROM bl_shipments bl_done
                JOIN bl_line_items bli_done ON bl_done.bl_id = bli_done.bl_id
                WHERE bl_done.lc_id = lc.lc_id
                  AND bl_done.status IN ('completed', 'erp_done')
                  AND bli_done.product_id = pli.product_id
              ), 0.0)
            )
          ), 0.0)::float8 AS kw
        FROM lc_records lc
        JOIN purchase_orders po ON lc.po_id = po.po_id
        JOIN po_line_items pli ON po.po_id = pli.po_id
        JOIN products p ON pli.product_id = p.product_id
        JOIN (
          SELECT pli2.po_id,
            SUM(pli2.quantity::float8 * p2.spec_wp::float8) AS total_kw
          FROM po_line_items pli2
          JOIN products p2 ON pli2.product_id = p2.product_id
          GROUP BY pli2.po_id
        ) po_kw ON po.po_id = po_kw.po_id
        WHERE lc.status = 'opened'
          AND lc.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR pli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
          AND NOT EXISTS (
            SELECT 1 FROM bl_shipments bl
            WHERE bl.lc_id = lc.lc_id
              AND bl.status IN ('shipping', 'arrived', 'customs')
          )
        GROUP BY lc.company_id, pli.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 6. 미착품 예약 (fulfillment_source=incoming)
async fn fetch_incoming_reserved(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT ord.company_id, ord.product_id,
          COALESCE(SUM(ord.remaining_qty * p.wattage_kw), 0)::float8 as kw
        FROM orders ord
        JOIN products p ON ord.product_id = p.product_id
        WHERE ord.status IN ('received', 'partial')
          AND ord.fulfillment_source = 'incoming'
          AND ord.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR ord.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY ord.company_id, ord.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(kw_rows_to_map(rows))
}

/// 장기재고: 최초 입고일 조회
async fn fetch_earliest_arrival(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<HashMap<(Uuid, Uuid), NaiveDate>, sqlx::Error> {
    let rows = sqlx::query_as::<_, DateRow>(
        r#"
        SELECT bl.company_id, bli.product_id,
               MIN(bl.actual_arrival) as date
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        JOIN products p ON bli.product_id = p.product_id
        WHERE bl.status IN ('completed', 'erp_done')
          AND bl.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR bli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY bl.company_id, bli.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(date_rows_to_map(rows))
}

/// 최근 입고일 — 표시용
async fn fetch_latest_arrival(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<HashMap<(Uuid, Uuid), NaiveDate>, sqlx::Error> {
    let rows = sqlx::query_as::<_, DateRow>(
        r#"
        SELECT bl.company_id, bli.product_id,
               MAX(bl.actual_arrival) as date
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        JOIN products p ON bli.product_id = p.product_id
        WHERE bl.status IN ('completed', 'erp_done')
          AND bl.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR bli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY bl.company_id, bli.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    Ok(date_rows_to_map(rows))
}

/// 최근 L/C 개설일 — 표시용
async fn fetch_latest_lc_open(
    pool: &PgPool,
    company_ids: &[Uuid],
    product_id: Option<Uuid>,
    manufacturer_id: Option<Uuid>,
) -> Result<HashMap<(Uuid, Uuid), NaiveDate>, sqlx::Error> {
    let rows = sqlx::query_as::<_, DateRow>(
        r#"
        SELECT bl.company_id, bli.product_id,
               MAX(lc.open_date) as date
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        JOIN lc_records lc ON bl.lc_id = lc.lc_id
        JOIN products p ON bli.product_id = p.product_id
        WHERE bl.status IN ('shipping', 'arrived', 'customs')
          AND bl.company_id = ANY($1::uuid[])
          AND lc.status = 'opened'
          AND ($2::uuid IS NULL OR bli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        GROUP BY bl.company_id, bli.product_id

        UNION ALL

        SELECT lc.company_id, pli.product_id,
               MAX(lc.open_date) as date
        FROM lc_records lc
        JOIN purchase_orders po ON lc.po_id = po.po_id
        JOIN po_line_items pli ON po.po_id = pli.po_id
        JOIN products p ON pli.product_id = p.product_id
        WHERE lc.status = 'opened'
          AND lc.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR pli.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
          AND NOT EXISTS (
            SELECT 1 FROM bl_shipments bl
            WHERE bl.lc_id = lc.lc_id
              AND bl.status IN ('shipping', 'arrived', 'customs', 'completed', 'erp_done')
          )
        GROUP BY lc.company_id, pli.product_id
        "#,
    )
    .bind(company_ids)
    .bind(product_id)
    .bind(manufacturer_id)
    .fetch_all(pool)
    .await?;

    // BL 운송 중 / LC 단독 두 SELECT가 같은 (company, product)를 만들 수 있으므로 MAX로 병합
    let mut map: HashMap<(Uuid, Uuid), NaiveDate> = HashMap::new();
    for r in rows {
        if let Some(d) = r.date {
            let key = (r.company_id, r.product_id);
            map.entry(key)
                .and_modify(|prev| { if d > *prev { *prev = d; } })
                .or_insert(d);
        }
    }
    Ok(map)
}
