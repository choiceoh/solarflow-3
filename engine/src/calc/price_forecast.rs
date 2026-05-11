use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Duration, NaiveDate, Utc};

use crate::model::price_forecast::{
    PriceForecastBacktestSummary, PriceForecastMarketSnapshot, PriceForecastObservation,
    PriceForecastOutlier, PriceForecastRunInput, PriceForecastScenario,
    PriceForecastSourceAdjustment, PriceForecastSourceQuality, PriceForecastStrategyRequest,
    PriceForecastStrategyResponse,
};

struct SourceAggregate {
    source_name: String,
    latest_date: Option<NaiveDate>,
    count: i32,
    confidence_sum: f64,
    confidence_count: i32,
}

pub fn calculate_price_forecast_strategy(
    req: &PriceForecastStrategyRequest,
    now: DateTime<Utc>,
) -> PriceForecastStrategyResponse {
    let outliers = detect_outliers(&req.observations);
    let outlier_keys = outliers
        .iter()
        .map(outlier_fingerprint)
        .collect::<HashSet<_>>();
    let observations = req
        .observations
        .iter()
        .filter(|row| !outlier_keys.contains(&observation_fingerprint(row)))
        .cloned()
        .collect::<Vec<_>>();
    let backtest = calculate_backtest(&observations, &outliers);

    let cmm = latest_price_for(&observations, &["cmm_fob_china_topcon_600w"]);
    let floor = latest_price_for(&observations, &["cpia_cost_floor"]);
    let tender = latest_price_for(&observations, &["china_state_tender"]);
    let quote = valid_price(req.own_quote_usd_w)
        .or_else(|| latest_price_for(&observations, &["supplier_quote"]));
    let current = cmm
        .or_else(|| {
            latest_price_for(
                &observations,
                &[
                    "china_export",
                    "china_domestic",
                    "module_centralized",
                    "module_distributed",
                ],
            )
        })
        .or(tender);

    let cmm_trend_pct = trend_pct(&observations, "cmm_fob_china_topcon_600w");
    let purchase_vs_cmm_pct = match (valid_price(req.own_purchase_usd_w), cmm) {
        (Some(purchase), Some(cmm_price)) => Some(((purchase - cmm_price) / cmm_price) * 100.0),
        _ => None,
    };
    let quote_vs_cmm_pct = match (quote, cmm) {
        (Some(quote_price), Some(cmm_price)) => {
            Some(((quote_price - cmm_price) / cmm_price) * 100.0)
        }
        _ => None,
    };
    let cmm_vs_floor_pct = match (cmm, floor) {
        (Some(cmm_price), Some(floor_price)) => {
            Some(((cmm_price - floor_price) / cmm_price) * 100.0)
        }
        _ => None,
    };

    let source_quality = calculate_source_quality(req, &observations, &outliers, &backtest, now);
    let overall_quality = if source_quality.is_empty() {
        0.0
    } else {
        source_quality.iter().map(|item| item.score).sum::<f64>() / source_quality.len() as f64
    };

    let scenarios = build_scenarios(&observations, current, tender, floor, cmm_trend_pct);
    let one_month_view = scenario_view(current, scenarios.get(0).and_then(|s| s.base_usd_w), floor);
    let three_month_view =
        scenario_view(current, scenarios.get(1).and_then(|s| s.base_usd_w), floor);
    let six_month_view = scenario_view(current, scenarios.get(2).and_then(|s| s.base_usd_w), floor);

    let (action_key, action_label, tone, note) = choose_action(
        current,
        cmm_trend_pct,
        purchase_vs_cmm_pct.or(quote_vs_cmm_pct),
        cmm_vs_floor_pct,
        overall_quality,
    );

    let basis = build_basis(&observations, cmm, tender, floor, current, quote);
    let confidence_score = clamp(
        (overall_quality / 100.0) * 0.82
            + if cmm.is_some() { 0.12 } else { 0.0 }
            + if req.own_purchase_usd_w.is_some() {
                0.06
            } else {
                0.0
            },
        0.0,
        0.98,
    );

    PriceForecastStrategyResponse {
        action_key,
        action_label,
        tone,
        confidence_score: round4(confidence_score),
        one_month_view,
        three_month_view,
        six_month_view,
        note,
        basis,
        market: PriceForecastMarketSnapshot {
            latest_cmm_usd_w: cmm.map(round4),
            latest_floor_usd_w: floor.map(round4),
            latest_tender_usd_w: tender.map(round4),
            latest_quote_usd_w: quote.map(round4),
            cmm_trend_pct: cmm_trend_pct.map(round2),
            purchase_vs_cmm_pct: purchase_vs_cmm_pct.map(round2),
            quote_vs_cmm_pct: quote_vs_cmm_pct.map(round2),
            cmm_vs_floor_pct: cmm_vs_floor_pct.map(round2),
        },
        scenarios,
        backtest,
        outliers,
        source_quality,
        calculated_at: now.to_rfc3339(),
    }
}

fn detect_outliers(observations: &[PriceForecastObservation]) -> Vec<PriceForecastOutlier> {
    let mut groups: HashMap<String, Vec<&PriceForecastObservation>> = HashMap::new();
    for row in observations {
        if valid_price(row.price_usd_w).is_none() {
            continue;
        }
        groups.entry(outlier_group_key(row)).or_default().push(row);
    }

    let mut outliers = Vec::new();
    for rows in groups.values() {
        if rows.len() < 3 {
            continue;
        }
        let prices = rows
            .iter()
            .filter_map(|row| valid_price(row.price_usd_w))
            .collect::<Vec<_>>();
        let Some(median) = median_price(&prices) else {
            continue;
        };
        if median <= 0.0 {
            continue;
        }
        for row in rows {
            let Some(price) = valid_price(row.price_usd_w) else {
                continue;
            };
            let deviation_pct = ((price - median).abs() / median) * 100.0;
            if deviation_pct >= 10.0 && (price - median).abs() >= 0.004 {
                outliers.push(PriceForecastOutlier {
                    source_key: row.source_key.clone(),
                    source_name: row.source_name.clone(),
                    metric_key: row.metric_key.clone(),
                    metric_label: row.metric_label.clone(),
                    value_date: row.value_date.clone(),
                    price_usd_w: round4(price),
                    median_usd_w: round4(median),
                    deviation_pct: round2(deviation_pct),
                });
            }
        }
    }
    outliers.sort_by(|a, b| {
        b.deviation_pct
            .partial_cmp(&a.deviation_pct)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    outliers
}

fn calculate_backtest(
    observations: &[PriceForecastObservation],
    outliers: &[PriceForecastOutlier],
) -> PriceForecastBacktestSummary {
    let mut cmm_points = observations
        .iter()
        .filter(|row| row.metric_key == "cmm_fob_china_topcon_600w")
        .filter_map(|row| {
            let date = parse_date(&row.value_date)?;
            let price = valid_price(row.price_usd_w)?;
            Some((date, price))
        })
        .collect::<Vec<_>>();
    cmm_points.sort_by(|a, b| a.0.cmp(&b.0));
    cmm_points.dedup_by(|a, b| a.0 == b.0 && (a.1 - b.1).abs() < f64::EPSILON);

    let mut hits = 0;
    let mut errors = Vec::new();
    for (actual_date, actual_price) in cmm_points.iter().copied() {
        let anchor_limit = actual_date - Duration::days(25);
        let Some((anchor_date, anchor_price)) = cmm_points
            .iter()
            .copied()
            .filter(|(date, _)| *date <= anchor_limit)
            .max_by(|a, b| a.0.cmp(&b.0))
        else {
            continue;
        };
        let horizon_days = (actual_date - anchor_date).num_days();
        if !(21..=45).contains(&horizon_days) {
            continue;
        }
        let as_of = observations
            .iter()
            .filter(|row| parse_date(&row.value_date).is_some_and(|date| date <= anchor_date))
            .cloned()
            .collect::<Vec<_>>();
        let trend = trend_pct(&as_of, "cmm_fob_china_topcon_600w");
        let floor = latest_price_for(&as_of, &["cpia_cost_floor"]);
        let tender = latest_price_for(&as_of, &["china_state_tender"]);
        let scenario = build_scenario(
            "1m_backtest",
            "1개월",
            1,
            Some(anchor_price),
            tender,
            floor,
            trend,
            latest_price_for(&as_of, &["forward_q1"]),
        );
        let Some(predicted) = scenario.base_usd_w else {
            continue;
        };
        let predicted_direction = direction_bucket(predicted, anchor_price);
        let actual_direction = direction_bucket(actual_price, anchor_price);
        if predicted_direction == actual_direction {
            hits += 1;
        }
        errors.push(((predicted - actual_price) / actual_price) * 100.0);
    }

    let sample_count = errors.len() as i32;
    let direction_hit_rate = if sample_count > 0 {
        Some(round4(hits as f64 / sample_count as f64))
    } else {
        None
    };
    let mean_abs_error_pct = if sample_count > 0 {
        Some(round2(
            errors.iter().map(|value| value.abs()).sum::<f64>() / errors.len() as f64,
        ))
    } else {
        None
    };
    let mean_bias_pct = if sample_count > 0 {
        Some(round2(errors.iter().sum::<f64>() / errors.len() as f64))
    } else {
        None
    };
    let note = if sample_count < 3 {
        "백테스트 표본이 부족합니다".to_string()
    } else if direction_hit_rate.unwrap_or(0.0) >= 0.67 {
        "최근 1개월 방향성 검증이 양호합니다".to_string()
    } else {
        "방향성 적중률이 낮아 source 품질 보정이 필요합니다".to_string()
    };

    PriceForecastBacktestSummary {
        sample_count,
        direction_hit_rate,
        mean_abs_error_pct,
        mean_bias_pct,
        note,
        source_adjustments: calculate_source_adjustments(
            observations,
            outliers,
            direction_hit_rate,
            mean_abs_error_pct,
        ),
    }
}

fn build_scenarios(
    observations: &[PriceForecastObservation],
    current: Option<f64>,
    tender: Option<f64>,
    floor: Option<f64>,
    trend_pct: Option<f64>,
) -> Vec<PriceForecastScenario> {
    let forward_q1 = latest_price_for(observations, &["forward_q1"]);
    let forward_q2 = latest_price_for(observations, &["forward_q2"]);
    let forward_q3 = latest_price_for(observations, &["forward_q3"]);
    let forward_q4 = latest_price_for(observations, &["forward_q4"]);
    let forward_3m = average_prices(&[forward_q2, forward_q3]);
    let forward_6m = average_prices(&[forward_q3, forward_q4]);

    vec![
        build_scenario(
            "1m", "1개월", 1, current, tender, floor, trend_pct, forward_q1,
        ),
        build_scenario(
            "3m", "3개월", 3, current, tender, floor, trend_pct, forward_3m,
        ),
        build_scenario(
            "6m", "6개월", 6, current, tender, floor, trend_pct, forward_6m,
        ),
    ]
}

fn build_scenario(
    key: &str,
    label: &str,
    horizon_months: i32,
    current: Option<f64>,
    tender: Option<f64>,
    floor: Option<f64>,
    trend_pct: Option<f64>,
    forward: Option<f64>,
) -> PriceForecastScenario {
    let base = current.and_then(|current_price| {
        let trend_factor = clamp(trend_pct.unwrap_or(0.0) / 100.0, -0.08, 0.08);
        let trend_price =
            current_price * (1.0 + trend_factor * (horizon_months as f64 / 3.0).sqrt());
        let weighted = match horizon_months {
            1 => weighted_average(&[(Some(trend_price), 0.55), (forward, 0.30), (tender, 0.15)]),
            3 => weighted_average(&[(Some(trend_price), 0.35), (forward, 0.45), (tender, 0.20)]),
            _ => weighted_average(&[(Some(trend_price), 0.25), (forward, 0.55), (tender, 0.20)]),
        }?;
        Some(apply_floor(weighted, floor, 1.015))
    });

    let volatility = clamp(
        0.035 + trend_pct.unwrap_or(0.0).abs() / 100.0 * 0.45,
        0.035,
        0.09,
    );
    let (low, high) = match base {
        Some(base_price) => (
            Some(apply_floor(base_price * (1.0 - volatility), floor, 1.005)),
            Some(base_price * (1.0 + volatility)),
        ),
        None => (None, None),
    };

    let mut drivers = Vec::new();
    if current.is_some() {
        drivers.push("CMM/현물 기준".to_string());
    } else {
        drivers.push("CMM 관측 보강 필요".to_string());
    }
    if forward.is_some() {
        drivers.push("Forward 반영".to_string());
    }
    if tender.is_some() {
        drivers.push("중국 입찰가 보정".to_string());
    }
    if floor.is_some() {
        drivers.push("CPIA floor 하방 제한".to_string());
    }

    PriceForecastScenario {
        key: key.to_string(),
        label: label.to_string(),
        horizon_months,
        low_usd_w: low.map(round4),
        base_usd_w: base.map(round4),
        high_usd_w: high.map(round4),
        drivers,
    }
}

fn choose_action(
    current: Option<f64>,
    trend_pct: Option<f64>,
    purchase_vs_cmm_pct: Option<f64>,
    cmm_vs_floor_pct: Option<f64>,
    overall_quality: f64,
) -> (String, String, String, String) {
    if current.is_none() {
        return (
            "observe_more".to_string(),
            "관측 보강".to_string(),
            "neutral".to_string(),
            "CMM 또는 중국 수출가가 들어오면 구매 판단 정확도가 올라갑니다.".to_string(),
        );
    }
    if overall_quality < 55.0 {
        return (
            "verify_evidence".to_string(),
            "근거 확인".to_string(),
            "warning".to_string(),
            "최근성이나 source 품질이 낮아 계약 전 원문 근거 확인이 필요합니다.".to_string(),
        );
    }
    if trend_pct.unwrap_or(0.0) >= 1.5 && purchase_vs_cmm_pct.unwrap_or(0.0) <= 2.0 {
        return (
            "lock_now".to_string(),
            "즉시 협상".to_string(),
            "positive".to_string(),
            "상승 흐름 대비 현재 계약가를 빠르게 잠그는 쪽이 유리합니다.".to_string(),
        );
    }
    if trend_pct.unwrap_or(0.0) <= -1.5 && purchase_vs_cmm_pct.unwrap_or(0.0) > 2.0 {
        return (
            "split_buy".to_string(),
            "분할 매입".to_string(),
            "warning".to_string(),
            "시장가 대비 계약가가 높아 단가 확인 후 나눠 잡는 편이 낫습니다.".to_string(),
        );
    }
    if cmm_vs_floor_pct.is_some_and(|value| value < 4.0) {
        return (
            "short_wait".to_string(),
            "짧은 관망".to_string(),
            "neutral".to_string(),
            "원가 floor와 가까워 추가 하락 여지가 제한적입니다.".to_string(),
        );
    }
    (
        "conditional_wait".to_string(),
        "조건부 관망".to_string(),
        "neutral".to_string(),
        "추가 입찰가와 forward 확인 후 계약 시점을 정하는 편이 안정적입니다.".to_string(),
    )
}

fn calculate_source_quality(
    req: &PriceForecastStrategyRequest,
    observations: &[PriceForecastObservation],
    outliers: &[PriceForecastOutlier],
    backtest: &PriceForecastBacktestSummary,
    now: DateTime<Utc>,
) -> Vec<PriceForecastSourceQuality> {
    let mut aggregates: HashMap<String, SourceAggregate> = HashMap::new();
    for observation in observations
        .iter()
        .filter(|item| valid_price(item.price_usd_w).is_some())
    {
        let entry = aggregates
            .entry(observation.source_key.clone())
            .or_insert_with(|| SourceAggregate {
                source_name: observation.source_name.clone(),
                latest_date: None,
                count: 0,
                confidence_sum: 0.0,
                confidence_count: 0,
            });
        entry.count += 1;
        if let Some(date) = parse_date(&observation.value_date) {
            if entry.latest_date.is_none_or(|latest| date > latest) {
                entry.latest_date = Some(date);
            }
        }
        if let Some(confidence) = observation.confidence {
            if confidence.is_finite() {
                entry.confidence_sum += clamp(confidence, 0.0, 1.0);
                entry.confidence_count += 1;
            }
        }
    }
    let mut outlier_counts: HashMap<String, i32> = HashMap::new();
    for outlier in outliers {
        *outlier_counts
            .entry(outlier.source_key.clone())
            .or_default() += 1;
    }
    let backtest_adjustments = backtest
        .source_adjustments
        .iter()
        .map(|item| (item.source_key.clone(), item.score_delta))
        .collect::<HashMap<_, _>>();

    let mut items = aggregates
        .into_iter()
        .map(|(source_key, aggregate)| {
            let avg_confidence = if aggregate.confidence_count > 0 {
                Some(aggregate.confidence_sum / aggregate.confidence_count as f64)
            } else {
                None
            };
            let age_days = aggregate
                .latest_date
                .map(|date| (now.date_naive() - date).num_days().max(0))
                .unwrap_or(999);
            let recency_score = if age_days <= 14 {
                20.0
            } else if age_days <= 45 {
                14.0
            } else if age_days <= 90 {
                8.0
            } else {
                2.0
            };
            let count_score = clamp(aggregate.count as f64 / 8.0, 0.0, 1.0) * 10.0;
            let warning_count =
                warning_count_for_source(&source_key, &aggregate.source_name, &req.runs) as i32;
            let run_penalty = warning_count as f64 * 7.5;
            let outlier_count = *outlier_counts.get(&source_key).unwrap_or(&0);
            let outlier_penalty = outlier_count as f64 * 9.0;
            let backtest_score_delta = backtest_adjustments
                .get(&source_key)
                .copied()
                .unwrap_or(0.0);
            let confidence_score = avg_confidence.unwrap_or(0.62) * 70.0;
            let score = clamp(
                confidence_score + recency_score + count_score - run_penalty - outlier_penalty
                    + backtest_score_delta,
                0.0,
                100.0,
            );
            let status = if score >= 75.0 {
                "ok"
            } else if score >= 55.0 {
                "watch"
            } else {
                "stale"
            };
            let note = if outlier_count > 0 {
                "이상치 제외"
            } else if warning_count > 0 {
                "수집 경고 확인"
            } else if age_days > 45 {
                "최근 관측 보강"
            } else if aggregate.count < 2 {
                "표본 추가 필요"
            } else {
                "정상"
            };
            PriceForecastSourceQuality {
                source_key,
                source_name: aggregate.source_name,
                score: round1(score),
                status: status.to_string(),
                latest_date: aggregate.latest_date.map(|date| date.to_string()),
                observation_count: aggregate.count,
                avg_confidence: avg_confidence.map(round4),
                warning_count,
                outlier_count,
                backtest_score_delta: round1(backtest_score_delta),
                note: note.to_string(),
            }
        })
        .collect::<Vec<_>>();
    items.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    items
}

fn calculate_source_adjustments(
    observations: &[PriceForecastObservation],
    outliers: &[PriceForecastOutlier],
    direction_hit_rate: Option<f64>,
    mean_abs_error_pct: Option<f64>,
) -> Vec<PriceForecastSourceAdjustment> {
    let mut sources: HashMap<String, (String, i32)> = HashMap::new();
    for row in observations
        .iter()
        .filter(|row| valid_price(row.price_usd_w).is_some())
    {
        let entry = sources
            .entry(row.source_key.clone())
            .or_insert_with(|| (row.source_name.clone(), 0));
        entry.1 += 1;
    }
    let mut outlier_counts: HashMap<String, i32> = HashMap::new();
    for row in outliers {
        *outlier_counts.entry(row.source_key.clone()).or_default() += 1;
        sources
            .entry(row.source_key.clone())
            .or_insert_with(|| (row.source_name.clone(), 0));
    }

    let mut items = sources
        .into_iter()
        .map(|(source_key, (source_name, sample_count))| {
            let outlier_penalty = *outlier_counts.get(&source_key).unwrap_or(&0) as f64 * -6.0;
            let backtest_delta = match direction_hit_rate {
                Some(rate) if rate >= 0.67 && sample_count >= 2 => 3.0,
                Some(rate) if rate < 0.50 && sample_count >= 2 => -4.0,
                _ => 0.0,
            };
            PriceForecastSourceAdjustment {
                source_key,
                source_name,
                sample_count,
                direction_hit_rate,
                mean_abs_error_pct,
                score_delta: round1(clamp(outlier_penalty + backtest_delta, -18.0, 6.0)),
            }
        })
        .collect::<Vec<_>>();
    items.sort_by(|a, b| {
        a.score_delta
            .partial_cmp(&b.score_delta)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    items
}

fn warning_count_for_source(
    source_key: &str,
    source_name: &str,
    runs: &[PriceForecastRunInput],
) -> usize {
    let source_key_lower = source_key.to_lowercase();
    let source_name_lower = source_name.to_lowercase();
    runs.iter()
        .map(|run| {
            let run_targets_source = run.source_keys.is_empty()
                || run
                    .source_keys
                    .iter()
                    .any(|key| key.eq_ignore_ascii_case(source_key));
            let failed = run.status.eq_ignore_ascii_case("failed") && run_targets_source;
            let warnings = run
                .warnings
                .iter()
                .filter(|warning| {
                    let lower = warning.to_lowercase();
                    lower.contains(&source_key_lower) || lower.contains(&source_name_lower)
                })
                .count();
            warnings + usize::from(failed)
        })
        .sum()
}

fn build_basis(
    observations: &[PriceForecastObservation],
    cmm: Option<f64>,
    tender: Option<f64>,
    floor: Option<f64>,
    current: Option<f64>,
    quote: Option<f64>,
) -> Vec<String> {
    let mut basis = Vec::new();
    if cmm.is_some() {
        basis.push("CMM FOB China".to_string());
    }
    if observations
        .iter()
        .any(|row| row.metric_key.starts_with("forward_") && valid_price(row.price_usd_w).is_some())
    {
        basis.push("Forward curve".to_string());
    }
    if tender.is_some() {
        basis.push("중국 국영 입찰".to_string());
    }
    if floor.is_some() {
        basis.push("CPIA 원가 floor".to_string());
    }
    if quote.is_some()
        || observations
            .iter()
            .any(|row| row.metric_key == "supplier_quote" && valid_price(row.price_usd_w).is_some())
    {
        basis.push("우리 미체결 견적".to_string());
    }
    if current.is_some() {
        basis.push("현물 보조지표".to_string());
    }
    basis
}

fn scenario_view(current: Option<f64>, projected: Option<f64>, floor: Option<f64>) -> String {
    match (current, projected) {
        (Some(current_price), Some(projected_price)) => {
            let pct = ((projected_price - current_price) / current_price) * 100.0;
            if pct >= 1.5 {
                "상승".to_string()
            } else if pct <= -1.5 {
                if floor.is_some_and(|floor_price| projected_price <= floor_price * 1.04) {
                    "하방 제한".to_string()
                } else {
                    "하락".to_string()
                }
            } else {
                "보합".to_string()
            }
        }
        _ => "관측 대기".to_string(),
    }
}

fn latest_price_for(
    observations: &[PriceForecastObservation],
    metric_keys: &[&str],
) -> Option<f64> {
    observations
        .iter()
        .filter(|row| metric_keys.contains(&row.metric_key.as_str()))
        .filter_map(|row| {
            valid_price(row.price_usd_w).map(|price| (row.value_date.as_str(), price))
        })
        .max_by(|a, b| a.0.cmp(b.0))
        .map(|(_, price)| price)
}

fn trend_pct(observations: &[PriceForecastObservation], metric_key: &str) -> Option<f64> {
    let mut values = observations
        .iter()
        .filter(|row| row.metric_key == metric_key)
        .filter_map(|row| {
            valid_price(row.price_usd_w).map(|price| (row.value_date.as_str(), price))
        })
        .collect::<Vec<_>>();
    values.sort_by(|a, b| a.0.cmp(b.0));
    if values.len() < 2 {
        return None;
    }
    let latest = values[values.len() - 1].1;
    let previous = values[values.len() - 2].1;
    if previous <= 0.0 {
        return None;
    }
    Some(((latest - previous) / previous) * 100.0)
}

fn average_prices(values: &[Option<f64>]) -> Option<f64> {
    let present = values.iter().filter_map(|value| *value).collect::<Vec<_>>();
    if present.is_empty() {
        None
    } else {
        Some(present.iter().sum::<f64>() / present.len() as f64)
    }
}

fn weighted_average(values: &[(Option<f64>, f64)]) -> Option<f64> {
    let mut weighted_sum = 0.0;
    let mut weight_sum = 0.0;
    for (value, weight) in values {
        if let Some(value) = valid_price(*value) {
            weighted_sum += value * weight;
            weight_sum += weight;
        }
    }
    if weight_sum <= 0.0 {
        None
    } else {
        Some(weighted_sum / weight_sum)
    }
}

fn apply_floor(value: f64, floor: Option<f64>, multiplier: f64) -> f64 {
    match valid_price(floor) {
        Some(floor_price) => value.max(floor_price * multiplier),
        None => value,
    }
}

fn valid_price(value: Option<f64>) -> Option<f64> {
    value.filter(|price| price.is_finite() && *price > 0.0)
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value.get(0..10)?, "%Y-%m-%d").ok()
}

fn median_price(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = sorted.len() / 2;
    if sorted.len() % 2 == 0 {
        Some((sorted[mid - 1] + sorted[mid]) / 2.0)
    } else {
        Some(sorted[mid])
    }
}

fn direction_bucket(next: f64, current: f64) -> &'static str {
    if current <= 0.0 {
        return "flat";
    }
    let pct = ((next - current) / current) * 100.0;
    if pct >= 1.5 {
        "up"
    } else if pct <= -1.5 {
        "down"
    } else {
        "flat"
    }
}

fn outlier_group_key(row: &PriceForecastObservation) -> String {
    [
        row.value_date.as_str(),
        row.metric_key.as_str(),
        row.market_region.as_str(),
        row.basis.as_str(),
    ]
    .join("|")
}

fn observation_fingerprint(row: &PriceForecastObservation) -> String {
    [
        row.source_key.clone(),
        row.source_name.clone(),
        row.metric_key.clone(),
        row.value_date.clone(),
        row.price_usd_w.map(round4).unwrap_or(0.0).to_string(),
    ]
    .join("|")
}

fn outlier_fingerprint(row: &PriceForecastOutlier) -> String {
    [
        row.source_key.clone(),
        row.source_name.clone(),
        row.metric_key.clone(),
        row.value_date.clone(),
        row.price_usd_w.to_string(),
    ]
    .join("|")
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn round4(value: f64) -> f64 {
    (value * 10000.0).round() / 10000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn observation(metric_key: &str, value_date: &str, price: f64) -> PriceForecastObservation {
        observation_with_source(
            if metric_key == "cpia_cost_floor" {
                "cpia_floor"
            } else {
                "opis"
            },
            if metric_key == "cpia_cost_floor" {
                "CPIA"
            } else {
                "OPIS"
            },
            metric_key,
            value_date,
            price,
        )
    }

    fn observation_with_source(
        source_key: &str,
        source_name: &str,
        metric_key: &str,
        value_date: &str,
        price: f64,
    ) -> PriceForecastObservation {
        PriceForecastObservation {
            source_key: source_key.to_string(),
            source_name: source_name.to_string(),
            metric_key: metric_key.to_string(),
            metric_label: metric_key.to_string(),
            value_date: value_date.to_string(),
            market_region: "fob_china".to_string(),
            basis: "spot".to_string(),
            price_usd_w: Some(price),
            price_cny_w: None,
            price_krw_w: None,
            confidence: Some(0.9),
        }
    }

    #[test]
    fn rising_cmm_recommends_lock_when_purchase_is_near_market() {
        let now = DateTime::parse_from_rfc3339("2026-05-11T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let req = PriceForecastStrategyRequest {
            unit: Some("usd".to_string()),
            observations: vec![
                observation("cmm_fob_china_topcon_600w", "2026-04-01", 0.085),
                observation("cmm_fob_china_topcon_600w", "2026-05-01", 0.089),
                observation("forward_q1", "2026-05-01", 0.091),
                observation("cpia_cost_floor", "2026-05-01", 0.082),
            ],
            own_purchase_usd_w: Some(0.090),
            own_purchase_date: Some("2026-05-01".to_string()),
            own_quote_usd_w: None,
            own_quote_date: None,
            runs: Vec::new(),
        };

        let response = calculate_price_forecast_strategy(&req, now);

        assert_eq!(response.action_key, "lock_now");
        assert_eq!(response.one_month_view, "상승");
        assert!(response.confidence_score > 0.8);
    }

    #[test]
    fn floor_limits_downside_scenario() {
        let now = DateTime::parse_from_rfc3339("2026-05-11T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let req = PriceForecastStrategyRequest {
            unit: Some("usd".to_string()),
            observations: vec![
                observation("cmm_fob_china_topcon_600w", "2026-04-01", 0.089),
                observation("cmm_fob_china_topcon_600w", "2026-05-01", 0.084),
                observation("forward_q1", "2026-05-01", 0.080),
                observation("cpia_cost_floor", "2026-05-01", 0.083),
            ],
            own_purchase_usd_w: Some(0.091),
            own_purchase_date: Some("2026-05-01".to_string()),
            own_quote_usd_w: None,
            own_quote_date: None,
            runs: Vec::new(),
        };

        let response = calculate_price_forecast_strategy(&req, now);
        let first = response.scenarios.first().expect("1m scenario");

        assert!(first.low_usd_w.unwrap() >= 0.0834);
        assert_eq!(response.market.cmm_vs_floor_pct, Some(1.19));
    }

    #[test]
    fn median_outlier_is_removed_before_strategy() {
        let now = DateTime::parse_from_rfc3339("2026-05-11T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let req = PriceForecastStrategyRequest {
            unit: Some("usd".to_string()),
            observations: vec![
                observation_with_source(
                    "opis",
                    "OPIS",
                    "cmm_fob_china_topcon_600w",
                    "2026-04-01",
                    0.089,
                ),
                observation_with_source(
                    "opis",
                    "OPIS",
                    "cmm_fob_china_topcon_600w",
                    "2026-05-01",
                    0.090,
                ),
                observation_with_source(
                    "infolink",
                    "InfoLink",
                    "cmm_fob_china_topcon_600w",
                    "2026-05-01",
                    0.091,
                ),
                observation_with_source(
                    "trendforce",
                    "TrendForce",
                    "cmm_fob_china_topcon_600w",
                    "2026-05-01",
                    0.121,
                ),
                observation("cpia_cost_floor", "2026-05-01", 0.084),
            ],
            own_purchase_usd_w: Some(0.091),
            own_purchase_date: Some("2026-05-01".to_string()),
            own_quote_usd_w: None,
            own_quote_date: None,
            runs: Vec::new(),
        };

        let response = calculate_price_forecast_strategy(&req, now);

        assert_eq!(response.outliers.len(), 1);
        assert_eq!(response.outliers[0].source_key, "trendforce");
        assert_ne!(response.market.latest_cmm_usd_w, Some(0.121));
    }

    #[test]
    fn one_month_backtest_reports_direction_and_error() {
        let now = DateTime::parse_from_rfc3339("2026-05-11T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let req = PriceForecastStrategyRequest {
            unit: Some("usd".to_string()),
            observations: vec![
                observation("cmm_fob_china_topcon_600w", "2026-01-01", 0.100),
                observation("forward_q1", "2026-01-01", 0.103),
                observation("cmm_fob_china_topcon_600w", "2026-02-01", 0.103),
                observation("forward_q1", "2026-02-01", 0.104),
                observation("cmm_fob_china_topcon_600w", "2026-03-01", 0.105),
                observation("forward_q1", "2026-03-01", 0.106),
                observation("cmm_fob_china_topcon_600w", "2026-04-01", 0.106),
            ],
            own_purchase_usd_w: Some(0.106),
            own_purchase_date: Some("2026-04-01".to_string()),
            own_quote_usd_w: None,
            own_quote_date: None,
            runs: Vec::new(),
        };

        let response = calculate_price_forecast_strategy(&req, now);

        assert!(response.backtest.sample_count >= 3);
        assert!(response.backtest.direction_hit_rate.is_some());
        assert!(response.backtest.mean_abs_error_pct.is_some());
    }
}
