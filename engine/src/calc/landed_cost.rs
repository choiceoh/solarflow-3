/// Landed Cost 계산 + 환율 환산 비교
/// 비유: "원가 계산실" — CIF + 관세 + 부대비용 -> Landed Wp단가

use chrono::Utc;
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::model::landed_cost::*;

// === 내부 SQL 행 타입 ===

#[derive(sqlx::FromRow)]
struct CostRow {
    cost_id: Uuid,
    declaration_id: Uuid,
    declaration_number: String,
    bl_id: Option<Uuid>,
    declaration_date: Option<chrono::NaiveDate>,
    product_id: Uuid,
    product_code: String,
    product_name: String,
    manufacturer_name: String,
    quantity: i32,
    capacity_kw: Option<f64>,
    exchange_rate: f64,
    fob_unit_usd: Option<f64>,
    fob_wp_krw: Option<f64>,
    cif_total_krw: f64,
    cif_wp_krw: f64,
    spec_wp: i32,
    tariff_rate: Option<f64>,
    tariff_amount: Option<f64>,
    vat_amount: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct ExpenseRow {
    expense_type: String,
    total_amount: f64,
}

#[derive(sqlx::FromRow)]
struct CapacityRow {
    total_capacity_kw: f64,
}

// === Landed Cost 계산 ===

/// Landed Cost 계산 실행
pub async fn calculate_landed_cost(
    pool: &PgPool,
    req: &LandedCostRequest,
) -> Result<LandedCostResponse, sqlx::Error> {
    // 1단계: 면장 + 원가 데이터 조회
    let rows = sqlx::query_as::<_, CostRow>(
        r#"
        SELECT cd.cost_id, cd.declaration_id, id.declaration_number,
               id.bl_id, id.declaration_date,
               cd.product_id, p.product_code, p.product_name,
               m.name_kr as manufacturer_name,
               cd.quantity, cd.capacity_kw::float8 as capacity_kw,
               cd.exchange_rate::float8 as exchange_rate,
               cd.fob_unit_usd::float8 as fob_unit_usd,
               cd.fob_wp_krw::float8 as fob_wp_krw,
               cd.cif_total_krw::float8 as cif_total_krw,
               cd.cif_wp_krw::float8 as cif_wp_krw,
               p.spec_wp,
               cd.tariff_rate::float8 as tariff_rate,
               cd.tariff_amount::float8 as tariff_amount,
               cd.vat_amount::float8 as vat_amount
        FROM cost_details cd
        JOIN import_declarations id ON cd.declaration_id = id.declaration_id
        JOIN products p ON cd.product_id = p.product_id
        JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
        WHERE (
          ($1::uuid IS NOT NULL AND cd.declaration_id = $1)
          OR ($1::uuid IS NULL AND id.company_id = $2 AND ($3::uuid IS NULL OR id.bl_id = $3))
        )
        "#,
    )
    .bind(req.declaration_id)
    .bind(req.company_id)
    .bind(req.bl_id)
    .fetch_all(pool)
    .await?;

    // B/L별로 그룹화하여 부대비용 조회 + 배분
    let mut items: Vec<LandedCostItem> = Vec::new();

    // bl_id별 부대비용 캐시
    let mut expense_cache: HashMap<Uuid, HashMap<String, f64>> = HashMap::new();
    let mut capacity_cache: HashMap<Uuid, f64> = HashMap::new();

    for row in &rows {
        let bl_id = match row.bl_id {
            Some(id) => id,
            None => continue, // bl_id 없으면 부대비용 배분 불가
        };

        let capacity_kw = row.capacity_kw.unwrap_or(0.0);
        if capacity_kw <= 0.0 {
            continue;
        }

        // B/L 전체 capacity (캐시)
        let bl_total_capacity = if let Some(c) = capacity_cache.get(&bl_id) {
            *c
        } else {
            let cap = fetch_bl_capacity(pool, bl_id).await?;
            capacity_cache.insert(bl_id, cap);
            cap
        };

        if bl_total_capacity <= 0.0 {
            continue;
        }

        // 부대비용 (캐시)
        let expenses = if let Some(e) = expense_cache.get(&bl_id) {
            e.clone()
        } else {
            let mut exp = fetch_bl_expenses(pool, bl_id).await?;
            // B/L 직접 연결 부대비용 없으면 월별 조회
            if exp.is_empty() {
                if let Some(decl_date) = row.declaration_date {
                    let month = decl_date.format("%Y-%m").to_string();
                    if let Some(comp_id) = req.company_id.or_else(|| {
                        // declaration_id로 조회한 경우 company_id를 다시 얻어야 함
                        None // 월별 조회 스킵
                    }) {
                        exp = fetch_monthly_expenses(pool, &month, comp_id).await?;
                    }
                }
            }
            expense_cache.insert(bl_id, exp.clone());
            exp
        };

        // 배분 비율
        let ratio = capacity_kw / bl_total_capacity;

        // 각 expense_type별 배분액
        let mut allocated: HashMap<String, f64> = HashMap::new();
        for (exp_type, amount) in &expenses {
            let alloc = amount * ratio;
            allocated.insert(exp_type.clone(), (alloc * 100.0).round() / 100.0);
        }

        let total_expense: f64 = allocated.values().sum();
        let tariff = row.tariff_amount.unwrap_or(0.0);
        let vat = row.vat_amount.unwrap_or(0.0);
        let total_wp = row.quantity as f64 * row.spec_wp as f64;

        let expense_per_wp = if total_wp > 0.0 {
            total_expense / total_wp
        } else {
            0.0
        };

        // Landed = CIF + 관세 + 부대비용 (VAT 미포함)
        let landed_total = row.cif_total_krw + tariff + total_expense;
        let landed_wp = if total_wp > 0.0 {
            landed_total / total_wp
        } else {
            0.0
        };
        let margin_vs_cif = landed_wp - row.cif_wp_krw;

        items.push(LandedCostItem {
            cost_id: row.cost_id,
            declaration_id: row.declaration_id,
            declaration_number: row.declaration_number.clone(),
            product_id: row.product_id,
            product_code: row.product_code.clone(),
            product_name: row.product_name.clone(),
            manufacturer_name: row.manufacturer_name.clone(),
            quantity: row.quantity,
            capacity_kw,
            exchange_rate: row.exchange_rate,
            fob_unit_usd: row.fob_unit_usd,
            fob_wp_krw: row.fob_wp_krw,
            cif_wp_krw: row.cif_wp_krw,
            tariff_rate: row.tariff_rate,
            tariff_amount: tariff,
            vat_amount: vat,
            allocated_expenses: allocated,
            total_expense_krw: (total_expense * 100.0).round() / 100.0,
            expense_per_wp_krw: (expense_per_wp * 100.0).round() / 100.0,
            landed_total_krw: (landed_total * 100.0).round() / 100.0,
            landed_wp_krw: (landed_wp * 100.0).round() / 100.0,
            margin_vs_cif_krw: (margin_vs_cif * 100.0).round() / 100.0,
        });
    }

    // save=true이면 DB 업데이트
    let saved = req.save;
    if saved {
        for item in &items {
            sqlx::query(
                r#"
                UPDATE cost_details SET
                  incidental_cost = $1,
                  landed_total_krw = $2,
                  landed_wp_krw = $3
                WHERE cost_id = $4
                "#,
            )
            .bind(item.total_expense_krw)
            .bind(item.landed_total_krw)
            .bind(item.landed_wp_krw)
            .bind(item.cost_id)
            .execute(pool)
            .await?;
        }
    }

    Ok(LandedCostResponse {
        items,
        saved,
        calculated_at: Utc::now(),
    })
}

// === 환율 환산 비교 ===

#[derive(sqlx::FromRow)]
struct ExchangeRow {
    declaration_number: String,
    declaration_date: Option<chrono::NaiveDate>,
    product_name: String,
    manufacturer_name: String,
    exchange_rate: f64,
    fob_unit_usd: Option<f64>,
    cif_unit_usd: Option<f64>,
    cif_wp_krw: f64,
    spec_wp: i32,
}

/// 환율 환산 비교 실행
pub async fn compare_exchange_rates(
    pool: &PgPool,
    req: &ExchangeCompareRequest,
) -> Result<ExchangeCompareResponse, sqlx::Error> {
    let company_ids = crate::calc::resolve_company_ids(req.company_ids.as_deref(), req.company_id);

    let rows = sqlx::query_as::<_, ExchangeRow>(
        r#"
        SELECT id.declaration_number, id.declaration_date,
               p.product_name, m.name_kr as manufacturer_name,
               cd.exchange_rate::float8 as exchange_rate,
               cd.fob_unit_usd::float8 as fob_unit_usd,
               cd.cif_unit_usd::float8 as cif_unit_usd,
               cd.cif_wp_krw::float8 as cif_wp_krw,
               p.spec_wp
        FROM cost_details cd
        JOIN import_declarations id ON cd.declaration_id = id.declaration_id
        JOIN products p ON cd.product_id = p.product_id
        JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
        WHERE id.company_id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR cd.product_id = $2)
          AND ($3::uuid IS NULL OR p.manufacturer_id = $3)
        ORDER BY id.declaration_date DESC
        "#,
    )
    .bind(&company_ids)
    .bind(req.product_id)
    .bind(req.manufacturer_id)
    .fetch_all(pool)
    .await?;

    // D-024: 실시간 환율 API 미연동 상태에서는 가장 최근 면장 환율을 현재 환율로 사용한다.
    // Phase 확장 시 외부 환율 소스가 들어와도 이 응답 필드는 출처를 함께 밝혀야 한다.
    let latest_rate = rows.first().map(|r| r.exchange_rate).unwrap_or(0.0);

    let items: Vec<ExchangeCompareItem> = rows
        .iter()
        .map(|r| {
            let cif_usd = r.cif_unit_usd.unwrap_or(0.0);
            let cif_wp_at_latest = cif_usd * latest_rate * r.spec_wp as f64;
            let rate_impact = (latest_rate - r.exchange_rate) * cif_usd * r.spec_wp as f64;

            ExchangeCompareItem {
                declaration_number: r.declaration_number.clone(),
                declaration_date: r
                    .declaration_date
                    .map(|d| d.to_string())
                    .unwrap_or_default(),
                product_name: r.product_name.clone(),
                manufacturer_name: r.manufacturer_name.clone(),
                contract_rate: r.exchange_rate,
                fob_unit_usd: r.fob_unit_usd,
                cif_unit_usd: r.cif_unit_usd,
                cif_wp_at_contract: r.cif_wp_krw,
                cif_wp_at_latest: (cif_wp_at_latest * 100.0).round() / 100.0,
                rate_impact_krw: (rate_impact * 100.0).round() / 100.0,
            }
        })
        .collect();

    Ok(ExchangeCompareResponse {
        items,
        latest_rate,
        latest_rate_source: "가장 최근 면장 환율".to_string(),
        calculated_at: Utc::now(),
    })
}

// === SQL 헬퍼 ===

/// B/L 연결 부대비용 조회
async fn fetch_bl_expenses(
    pool: &PgPool,
    bl_id: Uuid,
) -> Result<HashMap<String, f64>, sqlx::Error> {
    let rows = sqlx::query_as::<_, ExpenseRow>(
        r#"
        SELECT ie.expense_type, COALESCE(SUM(ie.amount), 0)::float8 as total_amount
        FROM incidental_expenses ie
        WHERE ie.bl_id = $1
        GROUP BY ie.expense_type
        "#,
    )
    .bind(bl_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| (r.expense_type, r.total_amount))
        .collect())
}

/// 월별 부대비용 조회
async fn fetch_monthly_expenses(
    pool: &PgPool,
    month: &str,
    company_id: Uuid,
) -> Result<HashMap<String, f64>, sqlx::Error> {
    let rows = sqlx::query_as::<_, ExpenseRow>(
        r#"
        SELECT ie.expense_type, COALESCE(SUM(ie.amount), 0)::float8 as total_amount
        FROM incidental_expenses ie
        WHERE ie.bl_id IS NULL
          AND ie.month = $1
          AND ie.company_id = $2
        GROUP BY ie.expense_type
        "#,
    )
    .bind(month)
    .bind(company_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| (r.expense_type, r.total_amount))
        .collect())
}

/// B/L 전체 capacity_kw
async fn fetch_bl_capacity(pool: &PgPool, bl_id: Uuid) -> Result<f64, sqlx::Error> {
    let row = sqlx::query_as::<_, CapacityRow>(
        r#"
        SELECT COALESCE(SUM(bli.capacity_kw), 0)::float8 as total_capacity_kw
        FROM bl_line_items bli
        WHERE bli.bl_id = $1
        "#,
    )
    .bind(bl_id)
    .fetch_one(pool)
    .await?;

    Ok(row.total_capacity_kw)
}

/// 부대비용 배분 단위 함수 (테스트용 pub)
pub fn allocate_expense(total_capacity_kw: f64, item_capacity_kw: f64, expense_amount: f64) -> f64 {
    if total_capacity_kw <= 0.0 {
        return 0.0;
    }
    let ratio = item_capacity_kw / total_capacity_kw;
    (expense_amount * ratio * 100.0).round() / 100.0
}
