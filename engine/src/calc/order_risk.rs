/// 수주 충당 위험도 계산
/// 비유: 수주 줄을 날짜순으로 세우고, 앞줄부터 현재고/미착품 잔여 물량을 배정해 보는 것.
use chrono::{NaiveDate, Utc};
use sqlx::PgPool;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::model::order_risk::{
    OrderFulfillmentRiskBreakdown, OrderFulfillmentRiskItem, OrderFulfillmentRiskRequest,
    OrderFulfillmentRiskResponse, OrderFulfillmentRiskSummary,
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
    delivery_due: Option<NaiveDate>,
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

#[derive(sqlx::FromRow)]
struct IncomingEventRow {
    company_id: Uuid,
    product_id: Uuid,
    available_date: Option<NaiveDate>,
    kw: f64,
}

#[derive(Clone, Debug)]
struct IncomingSupplyEvent {
    available_date: Option<NaiveDate>,
    kw: f64,
}

#[derive(Debug)]
struct IncomingAllocation {
    covered_kw: f64,
    expected_available_date: Option<NaiveDate>,
    used_unknown_date: bool,
    fully_covered: bool,
}

#[derive(Debug)]
struct EtaAssessment {
    status: &'static str,
    expected_available_date: Option<NaiveDate>,
    days_late: Option<i64>,
    reason: String,
    should_check: bool,
}

fn kw_rows_to_map(rows: Vec<KwRow>) -> KwMap {
    rows.into_iter()
        .map(|r| ((r.company_id, r.product_id), r.kw))
        .collect()
}

fn incoming_event_rows_to_map(
    rows: Vec<IncomingEventRow>,
) -> HashMap<PoolKey, Vec<IncomingSupplyEvent>> {
    let mut map: HashMap<PoolKey, Vec<IncomingSupplyEvent>> = HashMap::new();
    for row in rows {
        map.entry((row.company_id, row.product_id))
            .or_default()
            .push(IncomingSupplyEvent {
                available_date: row.available_date,
                kw: row.kw,
            });
    }
    for events in map.values_mut() {
        sort_incoming_events(events);
    }
    map
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

fn risk_reason(risk: &str, source: &str, shortage_kw: f64, eta: &EtaAssessment) -> String {
    let source_label = match source {
        "incoming" => "미착품",
        "stock" => "실재고",
        _ => "충당 소스",
    };
    match risk {
        "available" if source == "incoming" => {
            format!(
                "{source_label} 잔여 물량으로 수주 잔량을 충당할 수 있고 납기 내 입고 예정입니다"
            )
        }
        "available" => format!("{source_label} 잔여 물량으로 수주 잔량을 충당할 수 있습니다"),
        "shortage" => format!(
            "{source_label} 잔여 물량이 {:.3} kW 부족합니다",
            round3(shortage_kw)
        ),
        "check" if eta.should_check => eta.reason.clone(),
        _ => "잔량, 품번, 충당 소스 정보를 확인하세요".to_string(),
    }
}

fn max_date(a: Option<NaiveDate>, b: NaiveDate) -> Option<NaiveDate> {
    Some(match a {
        Some(current) if current > b => current,
        _ => b,
    })
}

fn sort_incoming_events(events: &mut [IncomingSupplyEvent]) {
    events.sort_by(|a, b| match (a.available_date, b.available_date) {
        (Some(a_date), Some(b_date)) => a_date.cmp(&b_date),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    });
}

fn subtract_from_incoming_events(events: &mut Vec<IncomingSupplyEvent>, mut kw: f64) {
    if kw <= EPSILON_KW {
        return;
    }
    sort_incoming_events(events);
    for event in events.iter_mut() {
        if kw <= EPSILON_KW {
            break;
        }
        if event.kw <= EPSILON_KW {
            continue;
        }
        let used = event.kw.min(kw);
        event.kw -= used;
        kw -= used;
    }
    events.retain(|event| event.kw > EPSILON_KW);
}

fn apply_incoming_allocations(
    events: &mut HashMap<PoolKey, Vec<IncomingSupplyEvent>>,
    allocations: &KwMap,
) {
    for (key, kw) in allocations {
        if let Some(event_list) = events.get_mut(key) {
            subtract_from_incoming_events(event_list, *kw);
        }
    }
}

fn allocate_incoming_events(
    events: &mut HashMap<PoolKey, Vec<IncomingSupplyEvent>>,
    key: PoolKey,
    need_kw: f64,
) -> IncomingAllocation {
    if need_kw <= EPSILON_KW {
        return IncomingAllocation {
            covered_kw: 0.0,
            expected_available_date: None,
            used_unknown_date: false,
            fully_covered: true,
        };
    }

    let Some(event_list) = events.get_mut(&key) else {
        return IncomingAllocation {
            covered_kw: 0.0,
            expected_available_date: None,
            used_unknown_date: false,
            fully_covered: false,
        };
    };

    sort_incoming_events(event_list);
    let mut remaining = need_kw;
    let mut covered = 0.0;
    let mut expected_available_date = None;
    let mut used_unknown_date = false;

    for event in event_list.iter_mut() {
        if remaining <= EPSILON_KW {
            break;
        }
        if event.kw <= EPSILON_KW {
            continue;
        }
        let used = event.kw.min(remaining);
        event.kw -= used;
        remaining -= used;
        covered += used;

        match event.available_date {
            Some(date) => expected_available_date = max_date(expected_available_date, date),
            None => used_unknown_date = true,
        }
    }
    event_list.retain(|event| event.kw > EPSILON_KW);

    IncomingAllocation {
        covered_kw: covered,
        expected_available_date,
        used_unknown_date,
        fully_covered: remaining <= EPSILON_KW,
    }
}

fn assess_eta(
    source: &str,
    quantity_risk: &str,
    delivery_due: Option<NaiveDate>,
    incoming_allocation: Option<&IncomingAllocation>,
) -> EtaAssessment {
    if source == "stock" {
        return EtaAssessment {
            status: "ready",
            expected_available_date: None,
            days_late: None,
            reason: "실재고 충당 수주는 ETA 확인 대상이 아닙니다".to_string(),
            should_check: false,
        };
    }

    if source != "incoming" {
        return EtaAssessment {
            status: "not_applicable",
            expected_available_date: None,
            days_late: None,
            reason: "충당 소스가 없어 ETA 확인 대상이 아닙니다".to_string(),
            should_check: false,
        };
    }

    if quantity_risk == "shortage" {
        return EtaAssessment {
            status: "shortage",
            expected_available_date: incoming_allocation.and_then(|a| a.expected_available_date),
            days_late: None,
            reason: "미착품 물량 부족으로 납기 적기 여부보다 충당 부족을 먼저 확인해야 합니다"
                .to_string(),
            should_check: false,
        };
    }

    if quantity_risk != "available" {
        return EtaAssessment {
            status: "not_applicable",
            expected_available_date: incoming_allocation.and_then(|a| a.expected_available_date),
            days_late: None,
            reason: "수주 잔량과 충당 정보를 먼저 확인해야 합니다".to_string(),
            should_check: false,
        };
    }

    let Some(allocation) = incoming_allocation else {
        return EtaAssessment {
            status: "unknown_eta",
            expected_available_date: None,
            days_late: None,
            reason: "미착품 ETA별 잔여량을 확인할 수 없습니다".to_string(),
            should_check: true,
        };
    };

    if !allocation.fully_covered {
        return EtaAssessment {
            status: "unknown_eta",
            expected_available_date: allocation.expected_available_date,
            days_late: None,
            reason: format!(
                "미착품 ETA별 잔여량은 {:.3} kW까지만 확인됩니다",
                round3(allocation.covered_kw)
            ),
            should_check: true,
        };
    }

    let Some(due) = delivery_due else {
        return EtaAssessment {
            status: "missing_due",
            expected_available_date: allocation.expected_available_date,
            days_late: None,
            reason: "납기일이 없어 미착품 ETA 적기 여부를 확인할 수 없습니다".to_string(),
            should_check: true,
        };
    };

    if allocation.used_unknown_date {
        return EtaAssessment {
            status: "unknown_eta",
            expected_available_date: allocation.expected_available_date,
            days_late: None,
            reason: "잔량 일부가 ETA 없는 L/C 또는 B/L에서 충당되어 납기 확인이 필요합니다"
                .to_string(),
            should_check: true,
        };
    }

    let Some(expected_date) = allocation.expected_available_date else {
        return EtaAssessment {
            status: "unknown_eta",
            expected_available_date: None,
            days_late: None,
            reason: "미착품 예상 가용일이 없어 납기 확인이 필요합니다".to_string(),
            should_check: true,
        };
    };

    if expected_date <= due {
        return EtaAssessment {
            status: "on_time",
            expected_available_date: Some(expected_date),
            days_late: None,
            reason: format!("미착품 예상 가용일 {expected_date}이 납기 {due} 이내입니다"),
            should_check: false,
        };
    }

    let days_late = (expected_date - due).num_days();
    EtaAssessment {
        status: "late",
        expected_available_date: Some(expected_date),
        days_late: Some(days_late),
        reason: format!(
            "미착품 예상 가용일 {expected_date}이 납기 {due}보다 {days_late}일 늦습니다"
        ),
        should_check: true,
    }
}

fn breakdown_for_key(
    key: PoolKey,
    inbound: &KwMap,
    outbound: &KwMap,
    alloc_stock: &KwMap,
    bl_incoming: &KwMap,
    lc_incoming: &KwMap,
    alloc_incoming: &KwMap,
) -> OrderFulfillmentRiskBreakdown {
    OrderFulfillmentRiskBreakdown {
        inbound_completed_kw: round3(inbound.get(&key).copied().unwrap_or(0.0)),
        outbound_active_kw: round3(outbound.get(&key).copied().unwrap_or(0.0)),
        stock_allocated_kw: round3(alloc_stock.get(&key).copied().unwrap_or(0.0)),
        bl_incoming_kw: round3(bl_incoming.get(&key).copied().unwrap_or(0.0)),
        lc_incoming_kw: round3(lc_incoming.get(&key).copied().unwrap_or(0.0)),
        incoming_allocated_kw: round3(alloc_incoming.get(&key).copied().unwrap_or(0.0)),
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
    let mut incoming_events = fetch_incoming_events(pool, &company_ids).await?;
    apply_incoming_allocations(&mut incoming_events, &alloc_incoming);

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
    let mut rank_by_pool: HashMap<(Uuid, Uuid, String), usize> = HashMap::new();
    for order in orders {
        let source = order.fulfillment_source.clone().unwrap_or_default();
        let key = (order.company_id, order.product_id);
        let rank_key = (order.company_id, order.product_id, source.clone());
        let rank = rank_by_pool.entry(rank_key).or_insert(0);
        *rank += 1;
        let allocation_rank = *rank;
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
        let quantity_risk = risk.clone();

        let incoming_allocation = if source == "incoming" {
            Some(allocate_incoming_events(
                &mut incoming_events,
                key,
                order.need_kw,
            ))
        } else {
            None
        };
        let eta = assess_eta(
            &source,
            &quantity_risk,
            order.delivery_due,
            incoming_allocation.as_ref(),
        );
        let risk = if risk == "available" && eta.should_check {
            "check".to_string()
        } else {
            risk
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
            allocation_rank,
            remaining_qty: order.remaining_qty,
            need_kw: round3(order.need_kw),
            available_before_kw: round3(available_before),
            available_after_kw: round3(available_after),
            shortage_kw: round3(shortage_kw),
            delivery_due: order.delivery_due,
            expected_available_date: eta.expected_available_date,
            eta_status: eta.status.to_string(),
            eta_days_late: eta.days_late,
            eta_reason: eta.reason.clone(),
            breakdown: breakdown_for_key(
                key,
                &inbound,
                &outbound,
                &alloc_stock,
                &bl_incoming,
                &lc_incoming,
                &alloc_incoming,
            ),
            reason: risk_reason(&risk, &source, shortage_kw, &eta),
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
          ord.delivery_due,
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

async fn fetch_incoming_events(
    pool: &PgPool,
    company_ids: &[Uuid],
) -> Result<HashMap<PoolKey, Vec<IncomingSupplyEvent>>, sqlx::Error> {
    let mut events = fetch_bl_incoming_events(pool, company_ids).await?;
    let lc_events = fetch_lc_incoming_events(pool, company_ids).await?;
    for (key, mut rows) in lc_events {
        events.entry(key).or_default().append(&mut rows);
    }
    for rows in events.values_mut() {
        sort_incoming_events(rows);
    }
    Ok(events)
}

async fn fetch_bl_incoming_events(
    pool: &PgPool,
    company_ids: &[Uuid],
) -> Result<HashMap<PoolKey, Vec<IncomingSupplyEvent>>, sqlx::Error> {
    let rows = sqlx::query_as::<_, IncomingEventRow>(
        r#"
        SELECT bl.company_id, bli.product_id,
               COALESCE(bl.eta, bl.actual_arrival, bl.etd)::date AS available_date,
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
        GROUP BY bl.company_id, bli.product_id, COALESCE(bl.eta, bl.actual_arrival, bl.etd)::date
        "#,
    )
    .bind(company_ids)
    .fetch_all(pool)
    .await?;
    Ok(incoming_event_rows_to_map(rows))
}

async fn fetch_lc_incoming_events(
    pool: &PgPool,
    company_ids: &[Uuid],
) -> Result<HashMap<PoolKey, Vec<IncomingSupplyEvent>>, sqlx::Error> {
    let rows = sqlx::query_as::<_, IncomingEventRow>(
        r#"
        SELECT lc.company_id, pli.product_id,
          NULL::date AS available_date,
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
    Ok(incoming_event_rows_to_map(rows))
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

    #[test]
    fn assess_eta_marks_late_incoming_as_check() {
        let due = NaiveDate::from_ymd_opt(2026, 5, 10).unwrap();
        let expected = NaiveDate::from_ymd_opt(2026, 5, 13).unwrap();
        let allocation = IncomingAllocation {
            covered_kw: 100.0,
            expected_available_date: Some(expected),
            used_unknown_date: false,
            fully_covered: true,
        };

        let eta = assess_eta("incoming", "available", Some(due), Some(&allocation));

        assert_eq!(eta.status, "late");
        assert_eq!(eta.days_late, Some(3));
        assert!(eta.should_check);
    }

    #[test]
    fn assess_eta_marks_on_time_incoming_as_available() {
        let due = NaiveDate::from_ymd_opt(2026, 5, 10).unwrap();
        let expected = NaiveDate::from_ymd_opt(2026, 5, 9).unwrap();
        let allocation = IncomingAllocation {
            covered_kw: 100.0,
            expected_available_date: Some(expected),
            used_unknown_date: false,
            fully_covered: true,
        };

        let eta = assess_eta("incoming", "available", Some(due), Some(&allocation));

        assert_eq!(eta.status, "on_time");
        assert_eq!(eta.days_late, None);
        assert!(!eta.should_check);
    }

    #[test]
    fn assess_eta_marks_missing_due_as_check() {
        let expected = NaiveDate::from_ymd_opt(2026, 5, 9).unwrap();
        let allocation = IncomingAllocation {
            covered_kw: 100.0,
            expected_available_date: Some(expected),
            used_unknown_date: false,
            fully_covered: true,
        };

        let eta = assess_eta("incoming", "available", None, Some(&allocation));

        assert_eq!(eta.status, "missing_due");
        assert!(eta.should_check);
    }

    #[test]
    fn allocate_incoming_events_consumes_earliest_eta_first() {
        let key = (Uuid::nil(), Uuid::nil());
        let first = NaiveDate::from_ymd_opt(2026, 5, 9).unwrap();
        let second = NaiveDate::from_ymd_opt(2026, 5, 13).unwrap();
        let mut events = HashMap::from([(
            key,
            vec![
                IncomingSupplyEvent {
                    available_date: Some(second),
                    kw: 80.0,
                },
                IncomingSupplyEvent {
                    available_date: Some(first),
                    kw: 30.0,
                },
            ],
        )]);

        let allocation = allocate_incoming_events(&mut events, key, 100.0);

        assert!(allocation.fully_covered);
        assert_eq!(allocation.expected_available_date, Some(second));
        assert_eq!(round3(events.get(&key).unwrap()[0].kw), 10.0);
    }
}
