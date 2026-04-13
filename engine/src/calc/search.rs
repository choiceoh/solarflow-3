/// 자연어 검색 엔진
/// 비유: "안내 데스크" — 자연어 질문을 이해하고 적절한 데이터를 찾아주는 것

use chrono::{Datelike, Utc};
use serde_json::json;
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::model::search::*;

// === 공개 함수 ===

/// 별칭 맵 (테스트용 pub)
pub fn get_manufacturer_aliases() -> HashMap<String, String> {
    [
        ("진코", "진코솔라"), ("jinko", "진코솔라"),
        ("트리나", "트리나솔라"), ("trina", "트리나솔라"),
        ("통웨이", "통웨이솔라"), ("tongwei", "통웨이솔라"), ("통웨이솔라", "통웨이솔라"),
        ("롱기", "LONGi"), ("론지", "LONGi"), ("longi", "LONGi"),
        ("에스디엔", "에스디엔"), ("sdn", "에스디엔"),
        ("아이코", "AIKO"), ("aiko", "AIKO"),
        ("한화", "한화솔라"), ("한화솔라", "한화솔라"),
        ("라이젠", "라이젠솔라"), ("라이젠솔라", "라이젠솔라"), ("risen", "라이젠솔라"),
        ("tcl", "TCL"), ("티씨엘", "TCL"),
        ("한솔", "한솔테크닉스"),
        ("현대", "현대에너지솔루션"),
        ("캐나디안", "캐나디안솔라"), ("canadian", "캐나디안솔라"),
        ("ja", "JA솔라"),
    ].iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

pub fn get_partner_aliases() -> HashMap<String, String> {
    [
        ("바로", "바로"), ("신명", "신명"), ("미래", "신명"), ("에스엠", "신명"),
    ].iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

/// 의도 분류 (테스트용 pub)
pub fn classify_intent(tokens: &[String]) -> SearchIntent {
    let joined = tokens.join(" ");
    let kw = |words: &[&str]| words.iter().any(|w| joined.contains(w));

    if kw(&["재고", "수량", "몇개", "얼마나"]) { SearchIntent::Inventory }
    else if kw(&["동일규격", "비교", "같은", "대체"]) { SearchIntent::Compare }
    else if kw(&["출고", "출하", "납품", "배송"]) { SearchIntent::Outbound }
    else if kw(&["lc", "만기", "엘씨", "개설"]) { SearchIntent::LcMaturity }
    else if kw(&["계약금", "tt", "송금", "잔금"]) { SearchIntent::PoPayment }
    else if kw(&["미수금", "미수", "미입금", "연체"]) { SearchIntent::Outstanding }
    else { SearchIntent::Fallback }
}

/// spec_wp 인식 (테스트용 pub)
pub fn parse_spec_wp(token: &str) -> Option<i32> {
    token.parse::<i32>().ok().filter(|&v| (400..=900).contains(&v))
}

/// 기간 인식 (테스트용 pub)
pub fn parse_period(token: &str, tokens: &[String]) -> (Option<String>, Option<i32>) {
    let now = Utc::now().date_naive();
    let joined = tokens.join("");

    // "이번달" 등
    if joined.contains("이번달") || joined.contains("이번 달") || joined.contains("이달") {
        return (Some(format!("{:04}-{:02}", now.year(), now.month())), None);
    }
    if joined.contains("다음달") || joined.contains("다음 달") {
        let total = now.year() * 12 + now.month() as i32;
        let y = total / 12; let m = total % 12 + 1;
        return (Some(format!("{:04}-{:02}", y, m)), None);
    }

    // "3월" 패턴
    if let Some(stripped) = token.strip_suffix('월') {
        if let Ok(m) = stripped.parse::<u32>() {
            if (1..=12).contains(&m) {
                return (Some(format!("{:04}-{:02}", now.year(), m)), None);
            }
        }
    }

    // "60일" 패턴
    if let Some(stripped) = token.strip_suffix('일') {
        if let Ok(d) = stripped.parse::<i32>() {
            if d > 0 { return (None, Some(d)); }
        }
    }

    (None, None)
}

// === 메인 검색 ===

pub async fn search(pool: &PgPool, req: &SearchRequest) -> Result<SearchResponse, sqlx::Error> {
    let company_id = req.company_id.unwrap();
    let query = req.query.as_ref().unwrap();
    let parsed = parse_query(query, pool).await?;

    let (results, warnings) = execute_intent(pool, company_id, &parsed).await?;

    Ok(SearchResponse {
        query: query.clone(),
        intent: parsed.intent.as_str().to_string(),
        parsed: ParsedInfo {
            manufacturer: parsed.manufacturer.as_ref().map(|(_, n)| n.clone()),
            spec_wp: parsed.spec_wp,
            month: parsed.month.clone(),
            days: parsed.days,
            keywords: parsed.raw_tokens.clone(),
        },
        results,
        warnings,
        calculated_at: Utc::now(),
    })
}

/// 쿼리 파싱
async fn parse_query(query: &str, pool: &PgPool) -> Result<ParsedQuery, sqlx::Error> {
    let lower = query.to_lowercase();
    let tokens: Vec<String> = lower.split_whitespace().map(|s| s.to_string()).collect();

    let mfg_aliases = get_manufacturer_aliases();
    let partner_aliases = get_partner_aliases();

    let mut pq = ParsedQuery {
        raw_tokens: tokens.clone(),
        ..Default::default()
    };

    // 엔티티 인식
    for token in &tokens {
        // 제조사
        if pq.manufacturer.is_none() {
            if let Some(name) = mfg_aliases.get(token.as_str()) {
                if let Some(row) = resolve_manufacturer_db(pool, name).await? {
                    pq.manufacturer = Some(row);
                }
            }
        }
        // 거래처
        if pq.partners.is_empty() {
            if let Some(alias_val) = partner_aliases.get(token.as_str()) {
                let results = resolve_partners_db(pool, token, alias_val).await?;
                if !results.is_empty() {
                    pq.partners = results;
                }
            }
        }
        // 규격
        if pq.spec_wp.is_none() {
            pq.spec_wp = parse_spec_wp(token);
        }
        // 기간
        if pq.month.is_none() && pq.days.is_none() {
            let (month, days) = parse_period(token, &tokens);
            if month.is_some() { pq.month = month; }
            if days.is_some() { pq.days = days; }
        }
    }

    pq.intent = classify_intent(&tokens);
    Ok(pq)
}

/// 의도별 실행
async fn execute_intent(pool: &PgPool, company_id: Uuid, pq: &ParsedQuery) -> Result<(Vec<SearchResult>, Vec<String>), sqlx::Error> {
    match pq.intent {
        SearchIntent::Inventory => search_inventory(pool, company_id, pq).await,
        SearchIntent::Compare => search_compare(pool, pq).await,
        SearchIntent::Outbound => search_outbound(pool, company_id, pq).await,
        SearchIntent::LcMaturity => search_lc_maturity(pool, company_id, pq).await,
        SearchIntent::PoPayment => search_po_payment(pool, company_id, pq).await,
        SearchIntent::Outstanding => search_outstanding(pool, company_id, pq).await,
        SearchIntent::Fallback => search_fallback(pool, company_id, pq).await,
    }
}

// === 의도별 구현 (간략) ===

async fn search_inventory(pool: &PgPool, company_id: Uuid, pq: &ParsedQuery) -> Result<(Vec<SearchResult>, Vec<String>), sqlx::Error> {
    let mfg_id = pq.manufacturer.as_ref().map(|(id, _)| *id);
    let mut results = Vec::new();

    #[derive(sqlx::FromRow)]
    struct Row { product_id: Uuid, product_name: String, spec_wp: i32, manufacturer_name: String, physical_kw: f64, available_kw: f64 }

    // 간략 조회: 입고-출고
    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT p.product_id, p.product_name, p.spec_wp, m.name_kr as manufacturer_name,
                  COALESCE((SELECT SUM(bli.capacity_kw) FROM bl_line_items bli JOIN bl_shipments bl ON bli.bl_id=bl.bl_id WHERE bl.status IN ('completed','erp_done') AND bl.company_id=$1 AND bli.product_id=p.product_id),0)::float8
                  - COALESCE((SELECT SUM(o.capacity_kw) FROM outbounds o WHERE o.status='active' AND o.company_id=$1 AND o.product_id=p.product_id),0)::float8 as physical_kw,
                  0::float8 as available_kw
           FROM products p JOIN manufacturers m ON p.manufacturer_id=m.manufacturer_id
           WHERE p.is_active=true AND ($2::uuid IS NULL OR p.manufacturer_id=$2) AND ($3::int IS NULL OR p.spec_wp=$3)
           ORDER BY m.name_kr, p.spec_wp LIMIT 20"#
    ).bind(company_id).bind(mfg_id).bind(pq.spec_wp).fetch_all(pool).await?;

    for r in &rows {
        let mut params = HashMap::new();
        params.insert("product_id".to_string(), r.product_id.to_string());
        results.push(SearchResult {
            result_type: "inventory".to_string(), title: r.product_name.clone(),
            data: json!({"manufacturer": r.manufacturer_name, "spec_wp": r.spec_wp, "physical_kw": r.physical_kw}),
            link: SearchLink { module: "inventory".to_string(), params },
        });
    }
    Ok((results, Vec::new()))
}

async fn search_compare(pool: &PgPool, pq: &ParsedQuery) -> Result<(Vec<SearchResult>, Vec<String>), sqlx::Error> {
    let spec = pq.spec_wp.unwrap_or(0);
    let mut warnings = Vec::new();

    #[derive(sqlx::FromRow)]
    struct Row { product_id: Uuid, product_name: String, spec_wp: i32, module_width_mm: i32, module_height_mm: i32, manufacturer_name: String }

    let rows = sqlx::query_as::<_, Row>(
        "SELECT p.product_id, p.product_name, p.spec_wp, p.module_width_mm, p.module_height_mm, m.name_kr as manufacturer_name FROM products p JOIN manufacturers m ON p.manufacturer_id=m.manufacturer_id WHERE p.spec_wp=$1 AND p.is_active=true ORDER BY m.name_kr"
    ).bind(spec).fetch_all(pool).await?;

    // 크기 비교 경고
    if let Some(base) = rows.first() {
        for r in rows.iter().skip(1) {
            if r.module_width_mm != base.module_width_mm || r.module_height_mm != base.module_height_mm {
                warnings.push(format!("⚠ {} {}x{}mm vs {} {}x{}mm — 모듈 크기가 다릅니다. 구조물 호환 확인 필요.",
                    base.manufacturer_name, base.module_width_mm, base.module_height_mm,
                    r.manufacturer_name, r.module_width_mm, r.module_height_mm));
            }
        }
    }

    let results = rows.iter().map(|r| {
        let mut params = HashMap::new();
        params.insert("product_id".to_string(), r.product_id.to_string());
        SearchResult {
            result_type: "compare".to_string(), title: format!("{} {}W", r.manufacturer_name, r.spec_wp),
            data: json!({"product_name": r.product_name, "width_mm": r.module_width_mm, "height_mm": r.module_height_mm}),
            link: SearchLink { module: "inventory".to_string(), params },
        }
    }).collect();
    Ok((results, warnings))
}

async fn search_outbound(pool: &PgPool, company_id: Uuid, pq: &ParsedQuery) -> Result<(Vec<SearchResult>, Vec<String>), sqlx::Error> {
    #[derive(sqlx::FromRow)]
    struct Row { outbound_id: Uuid, outbound_date: Option<chrono::NaiveDate>, quantity: i32, product_name: String, site_name: Option<String>, partner_name: Option<String> }

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT o.outbound_id, o.outbound_date, o.quantity, p.product_name, o.site_name, ptr.partner_name
           FROM outbounds o JOIN products p ON o.product_id=p.product_id LEFT JOIN sales s ON s.outbound_id=o.outbound_id LEFT JOIN partners ptr ON s.customer_id=ptr.partner_id
           WHERE o.company_id=$1 AND o.status='active' AND ($2::text IS NULL OR TO_CHAR(o.outbound_date,'YYYY-MM')=$2)
           ORDER BY o.outbound_date DESC LIMIT 50"#
    ).bind(company_id).bind(&pq.month).fetch_all(pool).await?;

    let results = rows.iter().map(|r| {
        let mut params = HashMap::new();
        params.insert("outbound_id".to_string(), r.outbound_id.to_string());
        SearchResult {
            result_type: "outbound".to_string(),
            title: format!("{} {}장", r.product_name, r.quantity),
            data: json!({"date": r.outbound_date.map(|d|d.to_string()), "site": r.site_name, "customer": r.partner_name}),
            link: SearchLink { module: "outbound".to_string(), params },
        }
    }).collect();
    Ok((results, Vec::new()))
}

async fn search_lc_maturity(pool: &PgPool, company_id: Uuid, pq: &ParsedQuery) -> Result<(Vec<SearchResult>, Vec<String>), sqlx::Error> {
    let month = pq.month.clone().unwrap_or_else(|| { let n = Utc::now().date_naive(); format!("{:04}-{:02}", n.year(), n.month()) });

    #[derive(sqlx::FromRow)]
    struct Row { lc_id: Uuid, lc_number: Option<String>, amount_usd: f64, maturity_date: Option<chrono::NaiveDate>, bank_name: String, days_remaining: Option<i32> }

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT lc.lc_id, lc.lc_number, lc.amount_usd::float8 as amount_usd, lc.maturity_date, b.bank_name, (lc.maturity_date - CURRENT_DATE)::int as days_remaining
           FROM lc_records lc JOIN banks b ON lc.bank_id=b.bank_id WHERE lc.status IN ('opened','docs_received') AND lc.company_id=$1 AND TO_CHAR(lc.maturity_date,'YYYY-MM')=$2 ORDER BY lc.maturity_date ASC"#
    ).bind(company_id).bind(&month).fetch_all(pool).await?;

    let results = rows.iter().map(|r| {
        let mut params = HashMap::new();
        params.insert("lc_id".to_string(), r.lc_id.to_string());
        SearchResult {
            result_type: "lc_maturity".to_string(),
            title: format!("{} ${:.0}", r.bank_name, r.amount_usd),
            data: json!({"lc_number": r.lc_number, "maturity_date": r.maturity_date.map(|d|d.to_string()), "days_remaining": r.days_remaining}),
            link: SearchLink { module: "lc".to_string(), params },
        }
    }).collect();
    Ok((results, Vec::new()))
}

async fn search_po_payment(pool: &PgPool, company_id: Uuid, pq: &ParsedQuery) -> Result<(Vec<SearchResult>, Vec<String>), sqlx::Error> {
    let mfg_id = pq.manufacturer.as_ref().map(|(id, _)| *id);

    #[derive(sqlx::FromRow)]
    struct Row { po_id: Uuid, po_number: Option<String>, status: String, manufacturer_name: String }

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT po.po_id, po.po_number, po.status, m.name_kr as manufacturer_name
           FROM purchase_orders po JOIN manufacturers m ON po.manufacturer_id=m.manufacturer_id
           WHERE po.company_id=$1 AND ($2::uuid IS NULL OR po.manufacturer_id=$2) AND po.status IN ('draft','contracted','shipping')
           ORDER BY po.contract_date DESC LIMIT 20"#
    ).bind(company_id).bind(mfg_id).fetch_all(pool).await?;

    let results = rows.iter().map(|r| {
        let mut params = HashMap::new();
        params.insert("po_id".to_string(), r.po_id.to_string());
        SearchResult {
            result_type: "po_payment".to_string(),
            title: format!("{} {}", r.manufacturer_name, r.po_number.as_deref().unwrap_or("N/A")),
            data: json!({"status": r.status}),
            link: SearchLink { module: "po".to_string(), params },
        }
    }).collect();
    Ok((results, Vec::new()))
}

async fn search_outstanding(pool: &PgPool, company_id: Uuid, pq: &ParsedQuery) -> Result<(Vec<SearchResult>, Vec<String>), sqlx::Error> {
    let min_days = pq.days.unwrap_or(0);

    #[derive(sqlx::FromRow)]
    struct Row { partner_id: Uuid, partner_name: String, outstanding_total: f64, outstanding_count: i64, max_days: Option<i32> }

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT ptr.partner_id, ptr.partner_name,
                  SUM(s.total_amount - COALESCE(matched.total_matched,0))::float8 as outstanding_total,
                  COUNT(*)::bigint as outstanding_count,
                  MAX(CURRENT_DATE - o.outbound_date)::int as max_days
           FROM sales s JOIN outbounds o ON s.outbound_id=o.outbound_id JOIN partners ptr ON s.customer_id=ptr.partner_id
           LEFT JOIN (SELECT rm.outbound_id, SUM(rm.matched_amount) as total_matched FROM receipt_matches rm GROUP BY rm.outbound_id) matched ON matched.outbound_id=o.outbound_id
           WHERE o.company_id=$1 AND o.status='active' AND s.total_amount > COALESCE(matched.total_matched,0) AND (CURRENT_DATE-o.outbound_date)>=$2
           GROUP BY ptr.partner_id, ptr.partner_name HAVING SUM(s.total_amount-COALESCE(matched.total_matched,0))>0
           ORDER BY outstanding_total DESC"#
    ).bind(company_id).bind(min_days).fetch_all(pool).await?;

    let results = rows.iter().map(|r| {
        let mut params = HashMap::new();
        params.insert("customer_id".to_string(), r.partner_id.to_string());
        SearchResult {
            result_type: "outstanding".to_string(),
            title: format!("{} ₩{:.0}", r.partner_name, r.outstanding_total),
            data: json!({"count": r.outstanding_count, "max_days": r.max_days}),
            link: SearchLink { module: "customer-analysis".to_string(), params },
        }
    }).collect();
    Ok((results, Vec::new()))
}

async fn search_fallback(pool: &PgPool, company_id: Uuid, pq: &ParsedQuery) -> Result<(Vec<SearchResult>, Vec<String>), sqlx::Error> {
    let query = pq.raw_tokens.join(" ");
    let pattern = format!("%{}%", query);
    let mfg_id = pq.manufacturer.as_ref().map(|(id, _)| *id);
    let spec = pq.spec_wp;

    let mut results: Vec<SearchResult> = Vec::new();

    // 1. 제품 검색: manufacturer/spec 컨텍스트 우선, 없으면 ILIKE
    {
        #[derive(sqlx::FromRow)]
        struct Row { product_id: Uuid, product_name: String, spec_wp: i32, mfg_name: String }
        let rows = sqlx::query_as::<_, Row>(
            r#"SELECT p.product_id, p.product_name, p.spec_wp, m.name_kr AS mfg_name
               FROM products p JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
               WHERE p.is_active = true
                 AND ($1::uuid IS NULL OR p.manufacturer_id = $1)
                 AND ($2::int  IS NULL OR p.spec_wp = $2)
                 AND ($1::uuid IS NOT NULL OR $2::int IS NOT NULL
                      OR p.product_name ILIKE $3 OR p.product_code ILIKE $3 OR m.name_kr ILIKE $3)
               ORDER BY m.name_kr, p.spec_wp LIMIT 10"#
        ).bind(mfg_id).bind(spec).bind(&pattern).fetch_all(pool).await?;
        for r in rows {
            let mut p = HashMap::new();
            p.insert("product_id".to_string(), r.product_id.to_string());
            results.push(SearchResult {
                result_type: "product".to_string(),
                title: format!("{} {}W", r.mfg_name, r.spec_wp),
                data: json!({"product_name": r.product_name}),
                link: SearchLink { module: "inventory".to_string(), params: p },
            });
        }
    }

    // 2. P/O 검색: manufacturer 있으면 해당 제조사 PO 전체, 없으면 po_number/제조사명 ILIKE
    {
        #[derive(sqlx::FromRow)]
        struct Row { po_id: Uuid, po_number: Option<String>, status: String, mfg_name: String, contract_date: Option<chrono::NaiveDate>, total_mw: Option<f64> }
        let rows = sqlx::query_as::<_, Row>(
            r#"SELECT po.po_id, po.po_number, po.status, m.name_kr AS mfg_name,
                      po.contract_date, po.total_mw::float8 AS total_mw
               FROM purchase_orders po JOIN manufacturers m ON po.manufacturer_id = m.manufacturer_id
               WHERE po.company_id = $1
                 AND ($2::uuid IS NULL OR po.manufacturer_id = $2)
                 AND ($2::uuid IS NOT NULL OR po.po_number ILIKE $3 OR m.name_kr ILIKE $3)
               ORDER BY po.contract_date DESC LIMIT 10"#
        ).bind(company_id).bind(mfg_id).bind(&pattern).fetch_all(pool).await?;
        for r in rows {
            let mut p = HashMap::new();
            p.insert("po_id".to_string(), r.po_id.to_string());
            results.push(SearchResult {
                result_type: "po".to_string(),
                title: format!("{} {}", r.mfg_name, r.po_number.as_deref().unwrap_or("N/A")),
                data: json!({"status": r.status, "contract_date": r.contract_date.map(|d| d.to_string()), "total_mw": r.total_mw}),
                link: SearchLink { module: "procurement".to_string(), params: p },
            });
        }
    }

    // 3. L/C 검색: PO→제조사 JOIN, lc_number/제조사명 ILIKE
    {
        #[derive(sqlx::FromRow)]
        struct Row { lc_id: Uuid, lc_number: Option<String>, status: String, amount_usd: f64, open_date: Option<chrono::NaiveDate>, mfg_name: String }
        let rows = sqlx::query_as::<_, Row>(
            r#"SELECT lc.lc_id, lc.lc_number, lc.status, lc.amount_usd::float8 AS amount_usd,
                      lc.open_date, m.name_kr AS mfg_name
               FROM lc_records lc
               JOIN purchase_orders po ON lc.po_id = po.po_id
               JOIN manufacturers m   ON po.manufacturer_id = m.manufacturer_id
               WHERE lc.company_id = $1
                 AND ($2::uuid IS NULL OR po.manufacturer_id = $2)
                 AND ($2::uuid IS NOT NULL OR lc.lc_number ILIKE $3 OR m.name_kr ILIKE $3)
               ORDER BY lc.open_date DESC LIMIT 10"#
        ).bind(company_id).bind(mfg_id).bind(&pattern).fetch_all(pool).await?;
        for r in rows {
            let mut p = HashMap::new();
            p.insert("lc_id".to_string(), r.lc_id.to_string());
            results.push(SearchResult {
                result_type: "lc".to_string(),
                title: format!("L/C {} ${:.0}", r.lc_number.as_deref().unwrap_or("N/A"), r.amount_usd),
                data: json!({"status": r.status, "open_date": r.open_date.map(|d| d.to_string()), "manufacturer": r.mfg_name}),
                link: SearchLink { module: "banking".to_string(), params: p },
            });
        }
    }

    // 4. B/L 검색: bl_shipments에 manufacturer_id 직접 존재
    {
        #[derive(sqlx::FromRow)]
        struct Row { bl_id: Uuid, bl_number: String, status: String, etd: Option<chrono::NaiveDate>, mfg_name: String }
        let rows = sqlx::query_as::<_, Row>(
            r#"SELECT bl.bl_id, bl.bl_number, bl.status, bl.etd, m.name_kr AS mfg_name
               FROM bl_shipments bl JOIN manufacturers m ON bl.manufacturer_id = m.manufacturer_id
               WHERE bl.company_id = $1
                 AND ($2::uuid IS NULL OR bl.manufacturer_id = $2)
                 AND ($2::uuid IS NOT NULL OR bl.bl_number ILIKE $3 OR m.name_kr ILIKE $3)
               ORDER BY bl.etd DESC LIMIT 10"#
        ).bind(company_id).bind(mfg_id).bind(&pattern).fetch_all(pool).await?;
        for r in rows {
            let mut p = HashMap::new();
            p.insert("bl_id".to_string(), r.bl_id.to_string());
            results.push(SearchResult {
                result_type: "bl".to_string(),
                title: format!("{} B/L {}", r.mfg_name, r.bl_number),
                data: json!({"status": r.status, "etd": r.etd.map(|d| d.to_string())}),
                link: SearchLink { module: "inbound".to_string(), params: p },
            });
        }
    }

    // 5. 거래처 검색 (제조사/규격 컨텍스트 없을 때만)
    if mfg_id.is_none() && spec.is_none() {
        #[derive(sqlx::FromRow)]
        struct Row { partner_id: Uuid, partner_name: String, partner_type: Option<String> }
        let rows = sqlx::query_as::<_, Row>(
            "SELECT partner_id, partner_name, partner_type FROM partners WHERE partner_name ILIKE $1 AND is_active = true LIMIT 10"
        ).bind(&pattern).fetch_all(pool).await?;
        for r in rows {
            let mut p = HashMap::new();
            p.insert("id".to_string(), r.partner_id.to_string());
            results.push(SearchResult {
                result_type: "partner".to_string(),
                title: r.partner_name,
                data: json!({"subtitle": r.partner_type}),
                link: SearchLink { module: "partner".to_string(), params: p },
            });
        }
    }

    Ok((results, Vec::new()))
}

// === DB 헬퍼 ===

async fn resolve_manufacturer_db(pool: &PgPool, name: &str) -> Result<Option<(Uuid, String)>, sqlx::Error> {
    #[derive(sqlx::FromRow)]
    struct Row { manufacturer_id: Uuid, name_kr: String }
    let pattern = format!("%{}%", name);
    let row = sqlx::query_as::<_, Row>(
        "SELECT manufacturer_id, name_kr FROM manufacturers WHERE name_kr ILIKE $1 OR name_en ILIKE $1 LIMIT 1"
    ).bind(&pattern).fetch_optional(pool).await?;
    Ok(row.map(|r| (r.manufacturer_id, r.name_kr)))
}

async fn resolve_partners_db(pool: &PgPool, keyword: &str, alias: &str) -> Result<Vec<(Uuid, String)>, sqlx::Error> {
    #[derive(sqlx::FromRow)]
    struct Row { partner_id: Uuid, partner_name: String }
    let p1 = format!("%{}%", keyword);
    let p2 = format!("%{}%", alias);
    let rows = sqlx::query_as::<_, Row>(
        "SELECT partner_id, partner_name FROM partners WHERE partner_name ILIKE $1 OR partner_name ILIKE $2 LIMIT 10"
    ).bind(&p1).bind(&p2).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|r| (r.partner_id, r.partner_name)).collect())
}
