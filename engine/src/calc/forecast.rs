/// 월별 수급 전망 (6개월)
/// 비유: "수급 전망판" — 향후 6개월간 품번별 재고 흐름을 예측

use chrono::{Datelike, Utc};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::model::forecast::*;

// === 공개 단위 함수 (테스트용) ===

/// 월별 기말재고 계산
pub fn calc_closing(opening: f64, incoming: f64, out_sale: f64, out_construction: f64) -> f64 {
    opening + incoming - out_sale - out_construction
}

// === SQL 행 타입 ===

#[derive(sqlx::FromRow)]
struct ProductRow {
    product_id: Uuid, product_code: String, product_name: String,
    manufacturer_name: String, spec_wp: i32,
    module_width_mm: i32, module_height_mm: i32,
}

#[derive(sqlx::FromRow)]
struct KwRow { product_id: Uuid, kw: f64 }

#[derive(sqlx::FromRow)]
struct MonthKwRow { product_id: Uuid, month: Option<String>, kw: f64 }

type KwMap = HashMap<Uuid, f64>;
type MonthKwMap = HashMap<(Uuid, String), f64>;

fn kw_map(rows: Vec<KwRow>) -> KwMap { rows.into_iter().map(|r| (r.product_id, r.kw)).collect() }
fn month_kw_map(rows: Vec<MonthKwRow>) -> MonthKwMap {
    rows.into_iter().filter_map(|r| r.month.map(|m| ((r.product_id, m), r.kw))).collect()
}

// === 메인 계산 ===

pub async fn calculate_forecast(pool: &PgPool, req: &SupplyForecastRequest) -> Result<SupplyForecastResponse, sqlx::Error> {
    let company_id = req.company_id.unwrap();
    let pid = req.product_id;
    let mid = req.manufacturer_id;
    let months = req.months_ahead.clamp(1, 12);

    // 품번 목록
    let products = sqlx::query_as::<_, ProductRow>(
        r#"SELECT p.product_id, p.product_code, p.product_name, m.name_kr as manufacturer_name,
                  p.spec_wp, p.module_width_mm, p.module_height_mm
           FROM products p JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
           WHERE p.is_active = true AND ($1::uuid IS NULL OR p.product_id = $1) AND ($2::uuid IS NULL OR p.manufacturer_id = $2)
           ORDER BY m.name_kr, p.module_width_mm, p.module_height_mm, p.spec_wp"#
    ).bind(pid).bind(mid).fetch_all(pool).await?;

    // 1. 물리적 재고
    let inbound = kw_map(sqlx::query_as::<_, KwRow>(
        "SELECT bli.product_id, COALESCE(SUM(bli.capacity_kw),0)::float8 as kw FROM bl_line_items bli JOIN bl_shipments bl ON bli.bl_id=bl.bl_id JOIN products p ON bli.product_id=p.product_id WHERE bl.status IN ('completed','erp_done') AND bl.company_id=$1 AND ($2::uuid IS NULL OR bli.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) GROUP BY bli.product_id"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    let outbound = kw_map(sqlx::query_as::<_, KwRow>(
        "SELECT o.product_id, COALESCE(SUM(o.capacity_kw),0)::float8 as kw FROM outbounds o JOIN products p ON o.product_id=p.product_id WHERE o.status='active' AND o.company_id=$1 AND ($2::uuid IS NULL OR o.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) GROUP BY o.product_id"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    // 2. 입고예정 — L/C 오픈 완료 기준 (재고 현황과 동일 기준 적용)
    // T/T 방식(lc_id IS NULL)은 LC 조건 없이 포함
    let incoming_by_month = month_kw_map(sqlx::query_as::<_, MonthKwRow>(
        "SELECT bli.product_id, TO_CHAR(bl.eta,'YYYY-MM') as month, COALESCE(SUM(bli.capacity_kw),0)::float8 as kw FROM bl_line_items bli JOIN bl_shipments bl ON bli.bl_id=bl.bl_id JOIN products p ON bli.product_id=p.product_id WHERE bl.status IN ('scheduled','shipping','arrived','customs') AND bl.company_id=$1 AND ($2::uuid IS NULL OR bli.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) AND bl.eta IS NOT NULL AND (bl.lc_id IS NULL OR EXISTS (SELECT 1 FROM lc_records lc WHERE lc.lc_id=bl.lc_id AND lc.status='opened')) GROUP BY bli.product_id, month"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    let incoming_unsched = kw_map(sqlx::query_as::<_, KwRow>(
        "SELECT bli.product_id, COALESCE(SUM(bli.capacity_kw),0)::float8 as kw FROM bl_line_items bli JOIN bl_shipments bl ON bli.bl_id=bl.bl_id JOIN products p ON bli.product_id=p.product_id WHERE bl.status IN ('scheduled','shipping','arrived','customs') AND bl.company_id=$1 AND ($2::uuid IS NULL OR bli.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) AND bl.eta IS NULL AND (bl.lc_id IS NULL OR EXISTS (SELECT 1 FROM lc_records lc WHERE lc.lc_id=bl.lc_id AND lc.status='opened')) GROUP BY bli.product_id"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    // PO 잔량 (B/L 미생성분)
    let po_total = kw_map(sqlx::query_as::<_, KwRow>(
        "SELECT pol.product_id, COALESCE(SUM(pol.quantity*p.wattage_kw),0)::float8 as kw FROM po_line_items pol JOIN products p ON pol.product_id=p.product_id JOIN purchase_orders po ON pol.po_id=po.po_id WHERE po.status IN ('contracted','shipping') AND po.company_id=$1 AND ($2::uuid IS NULL OR pol.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) GROUP BY pol.product_id"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    let bl_total = kw_map(sqlx::query_as::<_, KwRow>(
        "SELECT bli.product_id, COALESCE(SUM(bli.capacity_kw),0)::float8 as kw FROM bl_line_items bli JOIN bl_shipments bl ON bli.bl_id=bl.bl_id JOIN products p ON bli.product_id=p.product_id WHERE bl.po_id IN (SELECT po_id FROM purchase_orders WHERE status IN ('contracted','shipping') AND company_id=$1) AND ($2::uuid IS NULL OR bli.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) GROUP BY bli.product_id"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    // 3. 출고예정 — 판매
    let sale_by_month = month_kw_map(sqlx::query_as::<_, MonthKwRow>(
        "SELECT ord.product_id, TO_CHAR(ord.delivery_due,'YYYY-MM') as month, COALESCE(SUM(ord.remaining_qty*p.wattage_kw),0)::float8 as kw FROM orders ord JOIN products p ON ord.product_id=p.product_id WHERE ord.status IN ('received','partial') AND ord.management_category IN ('sale','spare','maintenance','other') AND ord.fulfillment_source='stock' AND ord.company_id=$1 AND ($2::uuid IS NULL OR ord.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) AND ord.delivery_due IS NOT NULL GROUP BY ord.product_id, month"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    let sale_unsched = kw_map(sqlx::query_as::<_, KwRow>(
        "SELECT ord.product_id, COALESCE(SUM(ord.remaining_qty*p.wattage_kw),0)::float8 as kw FROM orders ord JOIN products p ON ord.product_id=p.product_id WHERE ord.status IN ('received','partial') AND ord.management_category IN ('sale','spare','maintenance','other') AND ord.fulfillment_source='stock' AND ord.company_id=$1 AND ($2::uuid IS NULL OR ord.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) AND ord.delivery_due IS NULL GROUP BY ord.product_id"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    // 4. 출고예정 — 공사
    let constr_by_month = month_kw_map(sqlx::query_as::<_, MonthKwRow>(
        "SELECT ord.product_id, TO_CHAR(ord.delivery_due,'YYYY-MM') as month, COALESCE(SUM(ord.remaining_qty*p.wattage_kw),0)::float8 as kw FROM orders ord JOIN products p ON ord.product_id=p.product_id WHERE ord.status IN ('received','partial') AND ord.management_category IN ('construction','repowering') AND ord.fulfillment_source='stock' AND ord.company_id=$1 AND ($2::uuid IS NULL OR ord.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) AND ord.delivery_due IS NOT NULL GROUP BY ord.product_id, month"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    let constr_unsched = kw_map(sqlx::query_as::<_, KwRow>(
        "SELECT ord.product_id, COALESCE(SUM(ord.remaining_qty*p.wattage_kw),0)::float8 as kw FROM orders ord JOIN products p ON ord.product_id=p.product_id WHERE ord.status IN ('received','partial') AND ord.management_category IN ('construction','repowering') AND ord.fulfillment_source='stock' AND ord.company_id=$1 AND ($2::uuid IS NULL OR ord.product_id=$2) AND ($3::uuid IS NULL OR p.manufacturer_id=$3) AND ord.delivery_due IS NULL GROUP BY ord.product_id"
    ).bind(company_id).bind(pid).bind(mid).fetch_all(pool).await?);

    // 월 목록 생성
    let today = Utc::now().date_naive();
    let month_strs: Vec<String> = (1..=months).map(|i| {
        let total = today.year() * 12 + today.month() as i32 - 1 + i;
        let y = total / 12; let m = (total % 12 + 1) as u32;
        format!("{:04}-{:02}", y, m)
    }).collect();

    // 품번별 계산
    let mut forecast_products: Vec<ProductForecast> = Vec::new();
    let mut summary_months: Vec<SummaryMonth> = month_strs.iter().map(|m| SummaryMonth {
        month: m.clone(), total_opening_kw: 0.0, total_incoming_kw: 0.0,
        total_outgoing_kw: 0.0, total_closing_kw: 0.0, total_available_kw: 0.0,
    }).collect();

    for p in &products {
        let physical = inbound.get(&p.product_id).unwrap_or(&0.0) - outbound.get(&p.product_id).unwrap_or(&0.0);

        // unscheduled 집계
        let po_remainder = (po_total.get(&p.product_id).unwrap_or(&0.0) - bl_total.get(&p.product_id).unwrap_or(&0.0)).max(0.0);
        let unsched = UnscheduledForecast {
            sale_kw: r2(*sale_unsched.get(&p.product_id).unwrap_or(&0.0)),
            construction_kw: r2(*constr_unsched.get(&p.product_id).unwrap_or(&0.0)),
            incoming_kw: r2(*incoming_unsched.get(&p.product_id).unwrap_or(&0.0) + po_remainder),
        };

        // 월별 전망
        let mut month_forecasts: Vec<MonthForecast> = Vec::new();
        let mut opening = physical;

        // 전체 남은 판매/공사 잔량 (reserved/allocated 계산용)
        let mut remaining_sale: f64 = sale_by_month.iter()
            .filter(|((pid, _), _)| *pid == p.product_id).map(|(_, v)| v).sum::<f64>()
            + sale_unsched.get(&p.product_id).unwrap_or(&0.0);
        let mut remaining_constr: f64 = constr_by_month.iter()
            .filter(|((pid, _), _)| *pid == p.product_id).map(|(_, v)| v).sum::<f64>()
            + constr_unsched.get(&p.product_id).unwrap_or(&0.0);

        for (i, month_str) in month_strs.iter().enumerate() {
            let inc = *incoming_by_month.get(&(p.product_id, month_str.clone())).unwrap_or(&0.0);
            let out_sale = *sale_by_month.get(&(p.product_id, month_str.clone())).unwrap_or(&0.0);
            let out_constr = *constr_by_month.get(&(p.product_id, month_str.clone())).unwrap_or(&0.0);

            let closing = calc_closing(opening, inc, out_sale, out_constr);

            // 해당 월 출고 후 잔여 예약/배정
            remaining_sale -= out_sale;
            remaining_constr -= out_constr;
            let reserved = remaining_sale.max(0.0);
            let allocated = remaining_constr.max(0.0);
            let available = closing - reserved - allocated;

            month_forecasts.push(MonthForecast {
                month: month_str.clone(),
                opening_kw: r2(opening), incoming_kw: r2(inc),
                outgoing_construction_kw: r2(out_constr), outgoing_sale_kw: r2(out_sale),
                closing_kw: r2(closing), reserved_kw: r2(reserved), allocated_kw: r2(allocated),
                available_kw: r2(available), insufficient: closing < 0.0,
            });

            // summary 누적
            summary_months[i].total_opening_kw += opening;
            summary_months[i].total_incoming_kw += inc;
            summary_months[i].total_outgoing_kw += out_sale + out_constr;
            summary_months[i].total_closing_kw += closing;
            summary_months[i].total_available_kw += available;

            opening = closing;
        }

        forecast_products.push(ProductForecast {
            product_id: p.product_id, product_code: p.product_code.clone(),
            product_name: p.product_name.clone(), manufacturer_name: p.manufacturer_name.clone(),
            spec_wp: p.spec_wp, module_width_mm: p.module_width_mm, module_height_mm: p.module_height_mm,
            months: month_forecasts, unscheduled: unsched,
        });
    }

    // summary 반올림
    for sm in &mut summary_months {
        sm.total_opening_kw = r2(sm.total_opening_kw);
        sm.total_incoming_kw = r2(sm.total_incoming_kw);
        sm.total_outgoing_kw = r2(sm.total_outgoing_kw);
        sm.total_closing_kw = r2(sm.total_closing_kw);
        sm.total_available_kw = r2(sm.total_available_kw);
    }

    Ok(SupplyForecastResponse {
        products: forecast_products,
        summary: ForecastSummary { months: summary_months },
        calculated_at: Utc::now(),
    })
}

fn r2(v: f64) -> f64 { (v * 100.0).round() / 100.0 }
