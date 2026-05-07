/// 수주 충당 위험도 계산
/// 비유: 수주 줄을 날짜순으로 세우고, 앞줄부터 현재고/미착품 잔여 물량을 배정해 보는 것.
use chrono::{NaiveDate, Utc};
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::model::order_risk::{
    OrderFulfillmentRiskItem, OrderFulfillmentRiskRequest, OrderFulfillmentRiskResponse,
    OrderFulfillmentRiskSummary,
};

const EPSILON_KW: f64 = 0.001;

type PoolKey = (Uuid, Uuid);
type KwMap = HashMap<PoolKey, f64>;

#[derive(sqlx::FromRow, Clone)]
struct OrderNeedRow {
    order_id: Uuid,
    company_id: Uuid,
    product_id: Uuid,
    order_date: Option<NaiveDate>,
    fulfillment_source: Option<String>,
    remaining_qty: i32,
    need_kw: f64,
}

#[derive(sqlx::FromRow)]
struct KwRow {
    company_id: Uuid,
    product_id: Uuid,
    kw: f64,
}

fn kw_rows_to_map(rows: Vec<KwRow>) -> KwMap {
    rows.into_iter()
        .map(|r| ((r.company_id, r.product_id), r.kw))
        .collect()
}

fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

fn normalize_company_ids(req: &OrderFulfillmentRiskRequest) -> Vec<Uuid> {
    match (&req.company_ids, req.company_id) {
        (Some(ids), _) => ids.clone(),
        (None, Some(id)) => vec![id],
        (None, None) => Vec::new(),
    }
}

fn assess_risk(available_before_kw: f64, need_kw: f64) -> (&'static str, f64) {
    if need_kw <= EPSILON_KW {
        return ("check", 0.0);
    }
    if available_before_kw + EPSILON_KW >= need_kw {
        return ("available", 0.0);
    }
    ("shortage", (need_kw - available_before_kw).max(0.0))
}

fn risk_reason(risk: &str, source: &str, shortage_kw: f64) -> String {
    let source_label = match source {
        "incoming" => "미착품",
        "stock" => "실재고",
        _ => "충당 소스",
    };
    match risk {
        "available" => format!("{source_label} 잔여 물량으로 수주 잔량을 충당할 수 있습니다"),
        "shortage" => format!(
            "{source_label} 잔여 물량이 {:.3} kW 부족합니다",
            round3(shortage_kw)
        ),
        _ => "잔량, 품번, 충당 소스 정보를 확인하세요".to_string(),
    }
}

pub async fn calculate_order_fulfillment_risk(
    pool: &PgPool,
    req: &OrderFulfillmentRiskRequest,
) -> Result<OrderFulfillmentRiskResponse, sqlx::Error> {
    let company_ids = normalize_company_ids(req);
    if company_ids.is_empty() {
        return Ok(empty_response());
    }

    let mut orders = fetch_active_order_needs(pool, &company_ids).await?;
    if orders.is_empty() {
        return Ok(empty_response());
    }

    let inbound = fetch_inbound(pool, &company_ids).await?;
    let outbound = fetch_outbound(pool, &company_ids).await?;
    let alloc_stock = fetch_alloc_stock(pool, &company_ids).await?;
    let alloc_incoming = fetch_alloc_incoming(pool, &company_ids).await?;
    let bl_incoming = fetch_bl_incoming(pool, &company_ids).await?;
    let lc_incoming = fetch_lc_incoming(pool, &company_ids).await?;

    let mut stock_pool = build_stock_pool(&inbound, &outbound, &alloc_stock);
    let mut incoming_pool = build_incoming_pool(&bl_incoming, &lc_incoming, &alloc_incoming);

    orders.sort_by(|a, b| {
        a.company_id
            .cmp(&b.company_id)
            .then(a.product_id.cmp(&b.product_id))
            .then(a.fulfillment_source.cmp(&b.fulfillment_source))
            .then(a.order_date.cmp(&b.order_date))
            .then(a.order_id.cmp(&b.order_id))
    });

    let requested: Option<HashSet<Uuid>> = req
        .order_ids
        .as_ref()
        .map(|ids| ids.iter().copied().collect());

    let mut items = Vec::new();
    for order in orders {
        let source = order.fulfillment_source.clone().unwrap_or_default();
        let key = (order.company_id, order.product_id);
        let pool = match source.as_str() {
            "stock" => Some(&mut stock_pool),
            "incoming" => Some(&mut incoming_pool),
            _ => None,
        };

        let (available_before, available_after, risk, shortage_kw) = match pool {
            Some(pool_map) => {
                let before = *pool_map.get(&key).unwrap_or(&0.0);
                let (risk, shortage) = assess_risk(before, order.need_kw);
                let after = (before - order.need_kw).max(0.0);
                pool_map.insert(key, after);
                (before, after, risk.to_string(), shortage)
            }
            None => (0.0, 0.0, "check".to_string(), 0.0),
        };

        if requested
            .as_ref()
            .is_some_and(|ids| !ids.contains(&order.order_id))
        {
            continue;
        }

        items.push(OrderFulfillmentRiskItem {
            order_id: order.order_id,
            company_id: order.company_id,
            product_id: order.product_id,
            fulfillment_source: source.clone(),
            risk: risk.clone(),
            remaining_qty: order.remaining_qty,
            need_kw: round3(order.need_kw),
            available_before_kw: round3(available_before),
            available_after_kw: round3(available_after),
            shortage_kw: round3(shortage_kw),
            reason: risk_reason(&risk, &source, shortage_kw),
        });
    }

    let mut summary = OrderFulfillmentRiskSummary {
        total_count: items.len(),
        ..OrderFulfillmentRiskSummary::default()
    };
    for item in &items {
        match item.risk.as_str() {
            "available" => summary.available_count += 1,
            "shortage" => summary.shortage_count += 1,
            _ => summary.check_count += 1,
        }
    }

    Ok(OrderFulfillmentRiskResponse {
        items,
        summary,
        calculated_at: Utc::now(),
    })
}

fn empty_response() -> OrderFulfillmentRiskResponse {
    OrderFulfillmentRiskResponse {
        items: Vec::new(),
        summary: OrderFulfillmentRiskSummary::default(),
        calculated_at: Utc::now(),
    }
}

fn build_stock_pool(inbound: &KwMap, outbound: &KwMap, alloc_stock: &KwMap) -> KwMap {
    let mut keys: HashSet<PoolKey> = HashSet::new();
    keys.extend(inbound.keys().copied());
    keys.extend(outbound.keys().copied());
    keys.extend(alloc_stock.keys().copied());

    keys.into_iter()
        .map(|key| {
            let kw = inbound.get(&key).copied().unwrap_or(0.0)
                - outbound.get(&key).copied().unwrap_or(0.0)
                - alloc_stock.get(&key).copied().unwrap_or(0.0);
            (key, kw)
        })
        .collect()
}

fn build_incoming_pool(bl_incoming: &KwMap, lc_incoming: &KwMap, alloc_incoming: &KwMap) -> KwMap {
    let mut keys: HashSet<PoolKey> = HashSet::new();
    keys.extend(bl_incoming.keys().copied());
    keys.extend(lc_incoming.keys().copied());
    keys.extend(alloc_incoming.keys().copied());

    keys.into_iter()
        .map(|key| {
            let kw = bl_incoming.get(&key).copied().unwrap_or(0.0)
                + lc_incoming.get(&key).copied().unwrap_or(0.0)
                - alloc_incoming.get(&key).copied().unwrap_or(0.0);
            (key, kw)
        })
        .collect()
}

async fn fetch_active_order_needs(
    pool: &PgPool,
    company_ids: &[Uuid],
) -> Result<Vec<OrderNeedRow>, sqlx::Error> {
    sqlx::query_as::<_, OrderNeedRow>(
        r#"
        WITH shipped AS (
          SELECT order_id, COALESCE(SUM(quantity), 0)::int AS shipped_qty
          FROM outbounds
          WHERE status = 'active'
            AND order_id IS NOT NULL
          GROUP BY order_id
        )
        SELECT
          ord.order_id,
          ord.company_id,
          ord.product_id,
          ord.order_date,
          ord.fulfillment_source,
          GREATEST(
            COALESCE(ord.remaining_qty, ord.quantity - COALESCE(shipped.shipped_qty, 0)),
            0
          )::int AS remaining_qty,
          (
            GREATEST(
              COALESCE(ord.remaining_qty, ord.quantity - COALESCE(shipped.shipped_qty, 0)),
              0
            )::float8
            * COALESCE(p.wattage_kw::float8, p.spec_wp::float8 / 1000.0)
          )::float8 AS need_kw
        FROM orders ord
        JOIN products p ON ord.product_id = p.product_id
        LEFT JOIN shipped ON shipped.order_id = ord.order_id
        WHERE ord.status IN ('received', 'partial')
          AND ord.company_id = ANY($1::uuid[])
        "#,
    )
    .bind(company_ids)
    .fetch_all(pool)
    .await
}

async fn fetch_inbound(pool: &PgPool, company_ids: &[Uuid]) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT bl.company_id, bli.product_id,
               COALESCE(SUM(bli.capacity_kw), 0)::float8 AS kw
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        WHERE bl.status IN ('completed', 'erp_done')
          AND bl.company_id = ANY($1::uuid[])
        GROUP BY bl.company_id, bli.product_id
        "#,
    )
    .bind(company_ids)
    .fetch_all(pool)
    .await?;
    Ok(kw_rows_to_map(rows))
}

async fn fetch_outbound(pool: &PgPool, company_ids: &[Uuid]) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT o.company_id, o.product_id,
               COALESCE(SUM(o.capacity_kw), 0)::float8 AS kw
        FROM outbounds o
        WHERE o.status = 'active'
          AND o.company_id = ANY($1::uuid[])
        GROUP BY o.company_id, o.product_id
        "#,
    )
    .bind(company_ids)
    .fetch_all(pool)
    .await?;
    Ok(kw_rows_to_map(rows))
}

async fn fetch_alloc_stock(pool: &PgPool, company_ids: &[Uuid]) -> Result<KwMap, sqlx::Error> {
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
          AND ia.source_type = 'stock'
          AND ia.company_id = ANY($1::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM orders ord
            WHERE ord.order_id = ia.order_id
              AND ord.status IN ('received', 'partial')
          )
        GROUP BY ia.company_id, ia.product_id
        "#,
    )
    .bind(company_ids)
    .fetch_all(pool)
    .await?;
    Ok(kw_rows_to_map(rows))
}

async fn fetch_alloc_incoming(pool: &PgPool, company_ids: &[Uuid]) -> Result<KwMap, sqlx::Error> {
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
          AND NOT EXISTS (
            SELECT 1 FROM orders ord
            WHERE ord.order_id = ia.order_id
              AND ord.status IN ('received', 'partial')
          )
        GROUP BY ia.company_id, ia.product_id
        "#,
    )
    .bind(company_ids)
    .fetch_all(pool)
    .await?;
    Ok(kw_rows_to_map(rows))
}

async fn fetch_bl_incoming(pool: &PgPool, company_ids: &[Uuid]) -> Result<KwMap, sqlx::Error> {
    let rows = sqlx::query_as::<_, KwRow>(
        r#"
        SELECT bl.company_id, bli.product_id,
               COALESCE(SUM(bli.capacity_kw), 0)::float8 AS kw
        FROM bl_line_items bli
        JOIN bl_shipments bl ON bli.bl_id = bl.bl_id
        WHERE bl.status IN ('shipping', 'arrived', 'customs')
          AND bl.company_id = ANY($1::uuid[])
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
    .fetch_all(pool)
    .await?;
    Ok(kw_rows_to_map(rows))
}

async fn fetch_lc_incoming(pool: &PgPool, company_ids: &[Uuid]) -> Result<KwMap, sqlx::Error> {
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
          AND NOT EXISTS (
            SELECT 1 FROM bl_shipments bl
            WHERE bl.lc_id = lc.lc_id
              AND bl.status IN ('shipping', 'arrived', 'customs')
          )
        GROUP BY lc.company_id, pli.product_id
        "#,
    )
    .bind(company_ids)
    .fetch_all(pool)
    .await?;
    Ok(kw_rows_to_map(rows))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assess_risk_marks_available_when_pool_covers_need() {
        let (risk, shortage) = assess_risk(120.0, 119.9995);
        assert_eq!(risk, "available");
        assert_eq!(shortage, 0.0);
    }

    #[test]
    fn assess_risk_marks_shortage_when_pool_is_too_small() {
        let (risk, shortage) = assess_risk(80.0, 125.25);
        assert_eq!(risk, "shortage");
        assert_eq!(round3(shortage), 45.25);
    }

    #[test]
    fn assess_risk_marks_zero_need_as_check() {
        let (risk, shortage) = assess_risk(80.0, 0.0);
        assert_eq!(risk, "check");
        assert_eq!(shortage, 0.0);
    }
}
