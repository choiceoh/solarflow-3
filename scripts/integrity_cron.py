"""운영 정합성 cron — DB 검증 + Slack/log 알림 (D-064 PR 37 Layer 1).

설계 원칙:
1. **결과 기반** — 화면/사용자 증상 직접 매핑되는 검증
2. **baseline + tolerance** — 갑작스런 변화 감지 (단순 카운트 X)
3. **새로 발견된 것만 알림** — cooldown + 직전 정상 → 단발 noise 방지
4. **계층 우선순위** — HIGH 즉시 / MED 1시간 / LOW 매일

알림 채널:
- 환경변수 SOLARFLOW_ALERT_WEBHOOK 있으면 Slack 형식 webhook 호출
- 없으면 stderr 출력 (cron MAILTO 또는 systemd journal 로 수집)

실행 예:
  SUPABASE_DB_URL=... SOLARFLOW_ALERT_WEBHOOK=https://... python integrity_cron.py
  python integrity_cron.py --severity high  (high 만 검증, 30분 주기 cron 용)
  python integrity_cron.py --dry-run        (알림 안 보내고 결과만 출력)
"""
import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from typing import Optional

import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
WEBHOOK = os.environ.get("SOLARFLOW_ALERT_WEBHOOK")


# ============================================================
# 검증 SQL — name 별로 actual_value 산출
# ============================================================
CHECK_SQL = {
    # HIGH: count
    "count_sales":               "SELECT count(*)::numeric FROM sales",
    "count_outbounds":           "SELECT count(*)::numeric FROM outbounds",
    "count_inbounds":            "SELECT count(*)::numeric FROM inbounds",
    "count_fifo_matches":        "SELECT count(*)::numeric FROM fifo_matches",
    "count_declarations":        "SELECT count(*)::numeric FROM import_declarations",
    "count_products_active":     "SELECT count(*)::numeric FROM products WHERE is_active",
    # HIGH: null_ratio (0~1 범위)
    "null_ratio_sales_tax_invoice":  "SELECT (count(*) FILTER (WHERE tax_invoice_date IS NULL))::numeric / NULLIF(count(*), 0) FROM sales",
    "null_ratio_sales_outbound_id":  "SELECT (count(*) FILTER (WHERE outbound_id IS NULL))::numeric / NULLIF(count(*), 0) FROM sales",
    # MED: orphan
    "orphan_fifo_outbound":      "SELECT count(*)::numeric FROM fifo_matches fm WHERE fm.outbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbounds o WHERE o.outbound_id=fm.outbound_id)",
    "orphan_fifo_inbound":       "SELECT count(*)::numeric FROM fifo_matches fm WHERE fm.inbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbounds i WHERE i.inbound_id=fm.inbound_id)",
    "orphan_sales_outbound":     "SELECT count(*)::numeric FROM sales s WHERE s.outbound_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbounds o WHERE o.outbound_id=s.outbound_id)",
    "orphan_sales_customer":     "SELECT count(*)::numeric FROM sales s WHERE NOT EXISTS(SELECT 1 FROM partners p WHERE p.partner_id=s.customer_id)",
    "orphan_outbounds_product":  "SELECT count(*)::numeric FROM outbounds o WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.product_id=o.product_id)",
    # MED: formula
    "formula_sales_supply_vat_total": "SELECT count(*)::numeric FROM sales WHERE supply_amount IS NOT NULL AND vat_amount IS NOT NULL AND total_amount IS NOT NULL AND abs(supply_amount + vat_amount - total_amount) > 5",
    "formula_fifo_cost_profit_sales": "SELECT count(*)::numeric FROM fifo_matches WHERE cost_amount IS NOT NULL AND profit_amount IS NOT NULL AND sales_amount IS NOT NULL AND sales_amount > 0 AND abs(cost_amount + profit_amount - sales_amount) / GREATEST(sales_amount, 1) > 0.01",
    # MED: balance
    "balance_negative":          "SELECT count(*)::numeric FROM v_product_qty_balance WHERE balance_qty < 0",
    # LOW: ERP 본질 잔존
    "erp_residual_contract_krw": """SELECT count(*)::numeric FROM import_declarations
        WHERE contract_total_krw > 0 AND contract_total_usd > 0 AND exchange_rate > 0
          AND abs(contract_total_krw - contract_total_usd * exchange_rate) / GREATEST(contract_total_krw, 1) > 0.05""",
    "erp_residual_decl_after_arrival":   "SELECT count(*)::numeric FROM import_declarations WHERE declaration_date > arrival_date",
    "erp_residual_arrival_after_release":"SELECT count(*)::numeric FROM import_declarations WHERE arrival_date IS NOT NULL AND release_date IS NOT NULL AND arrival_date > release_date",
}


def measure(cur, name: str) -> Optional[float]:
    sql = CHECK_SQL.get(name)
    if not sql:
        return None
    cur.execute(sql)
    r = cur.fetchone()
    return float(r[0]) if r and r[0] is not None else 0.0


def is_violation(actual: float, baseline: float, tolerance: float, tolerance_type: str) -> bool:
    """tolerance 초과 여부."""
    if tolerance_type == "pct":
        if baseline == 0:
            return actual > tolerance  # baseline 0 일 때는 tolerance 를 절대값으로
        return abs(actual - baseline) / baseline > tolerance
    return abs(actual - baseline) > tolerance


def recently_alerted(cur, check_id, cooldown_minutes: int) -> bool:
    cur.execute(
        """SELECT 1 FROM integrity_check_runs
           WHERE check_id = %s AND alerted = true
             AND ran_at > now() - (%s || ' minutes')::interval
           LIMIT 1""",
        (check_id, cooldown_minutes),
    )
    return cur.fetchone() is not None


def previous_value(cur, check_id) -> Optional[float]:
    """직전 실행값 (단발 noise 판단용)."""
    cur.execute(
        "SELECT actual_value FROM integrity_check_runs WHERE check_id = %s ORDER BY ran_at DESC LIMIT 1",
        (check_id,),
    )
    r = cur.fetchone()
    return float(r[0]) if r and r[0] is not None else None


def post_alert(issues: list[dict]):
    """webhook 또는 stderr 알림."""
    title = f"🚨 SolarFlow 정합성 회귀 {len(issues)}건"
    lines = [title]
    for i in issues:
        sev_emoji = {"high": "🔴", "med": "🟡", "low": "🟢"}.get(i["severity"], "⚪")
        lines.append(
            f"{sev_emoji} {i['name']}: {i['actual']:.4g} (baseline {i['baseline']:.4g}, ±{i['tolerance']:.4g} {i['tolerance_type']})"
        )
        lines.append(f"   {i['description']}")
    body = "\n".join(lines)

    if WEBHOOK:
        try:
            payload = json.dumps({"text": body}).encode()
            req = urllib.request.Request(
                WEBHOOK, data=payload, headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=10).read()
        except Exception as e:
            print(f"webhook 실패, stderr 폴백: {e}", file=sys.stderr)
            print(body, file=sys.stderr)
    else:
        print(body, file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--severity", choices=["high", "med", "low", "all"], default="all")
    ap.add_argument("--dry-run", action="store_true", help="알림 안 보내고 결과만 출력")
    args = ap.parse_args()

    if not DB_URL:
        print("SUPABASE_DB_URL 필요", file=sys.stderr)
        sys.exit(2)

    c = psycopg2.connect(DB_URL)
    c.autocommit = False
    cur = c.cursor()

    # 활성화된 검증만 가져오기
    if args.severity == "all":
        cur.execute("SELECT check_id, name, severity, baseline_value, tolerance, tolerance_type, cooldown_minutes, description FROM integrity_checks WHERE enabled")
    else:
        cur.execute(
            "SELECT check_id, name, severity, baseline_value, tolerance, tolerance_type, cooldown_minutes, description FROM integrity_checks WHERE enabled AND severity = %s",
            (args.severity,),
        )
    checks = cur.fetchall()

    issues = []
    n_passed, n_failed, n_alerted = 0, 0, 0
    for check_id, name, severity, baseline, tolerance, tolerance_type, cooldown, desc in checks:
        baseline_f = float(baseline) if baseline is not None else 0
        tolerance_f = float(tolerance) if tolerance is not None else 0
        t0 = time.time()
        try:
            actual = measure(cur, name)
        except Exception as e:
            print(f"  [error] {name}: {e}", file=sys.stderr)
            continue
        duration_ms = int((time.time() - t0) * 1000)

        passed = not is_violation(actual, baseline_f, tolerance_f, tolerance_type)

        # 알림 판단
        alert_reason = None
        do_alert = False
        if not passed:
            n_failed += 1
            if recently_alerted(cur, check_id, cooldown):
                alert_reason = "cooldown 중 — 알림 skip"
            else:
                # 단발 noise 방지: HIGH 는 항상 / MED+LOW 는 직전값도 위반이어야
                prev = previous_value(cur, check_id)
                if severity == "high" or (
                    prev is not None and is_violation(prev, baseline_f, tolerance_f, tolerance_type)
                ):
                    do_alert = True
                else:
                    alert_reason = "직전값 정상 — 단발 noise 가능성, skip"
        else:
            n_passed += 1

        # 결과 저장
        cur.execute(
            "INSERT INTO integrity_check_runs (check_id, actual_value, passed, alerted, alert_reason, duration_ms) VALUES (%s, %s, %s, %s, %s, %s)",
            (check_id, actual, passed, do_alert, alert_reason, duration_ms),
        )

        if do_alert:
            n_alerted += 1
            issues.append({
                "name": name,
                "severity": severity,
                "actual": actual,
                "baseline": baseline_f,
                "tolerance": tolerance_f,
                "tolerance_type": tolerance_type,
                "description": desc or "",
            })

    c.commit()

    # 알림 발송
    if issues and not args.dry_run:
        post_alert(issues)

    # 콘솔 요약
    print(f"=== integrity_cron — severity={args.severity} ===")
    print(f"  통과: {n_passed} / 위반: {n_failed} / 알림: {n_alerted}")
    if args.dry_run and issues:
        print(f"  [dry-run] 알림 skip — {len(issues)} 이슈:")
        for i in issues:
            print(f"    {i['name']}: {i['actual']:.4g} (baseline {i['baseline']:.4g})")

    sys.exit(1 if issues else 0)


if __name__ == "__main__":
    main()
