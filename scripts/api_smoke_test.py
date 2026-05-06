"""API smoke test — enrich 응답 구조 검증 (D-064 PR 37 Layer 2).

DB 정합성 cron (Layer 1) 으로는 못 잡는 회귀:
- enrichSales 가 outbounds 첫 1000행만 가져오는 경우
  → DB 의 sales.tax_invoice_date NULL 비율 0% 정상이어도
  → API 응답의 SaleListItem.outbound_date NULL 다수 = 화면 회귀

이 스크립트는 실제 운영 API 를 호출해 응답 구조 검증.

실행:
  SOLARFLOW_API=https://api.module.topworks.ltd \\
  SOLARFLOW_TOKEN=<jwt> \\
  python api_smoke_test.py

또는 backend 자체 테스트로 (Go)도 가능 — 이건 Python 운영 cron 친화.

알림:
  Layer 1 과 동일하게 SOLARFLOW_ALERT_WEBHOOK 사용.
"""
import json
import os
import sys
import urllib.request
import urllib.error
from typing import Any

API = os.environ.get("SOLARFLOW_API", "").rstrip("/")
TOKEN = os.environ.get("SOLARFLOW_TOKEN")
WEBHOOK = os.environ.get("SOLARFLOW_ALERT_WEBHOOK")


def fetch_json(path: str, params: dict = None) -> Any:
    url = API + path
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    req = urllib.request.Request(url)
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} {url}", file=sys.stderr)
        return None


def post_alert(issues: list[str]):
    body = "🚨 SolarFlow API smoke 회귀\n" + "\n".join(issues)
    if WEBHOOK:
        try:
            payload = json.dumps({"text": body}).encode()
            req = urllib.request.Request(
                WEBHOOK, data=payload, headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=10).read()
        except Exception as e:
            print(f"webhook 실패: {e}\n{body}", file=sys.stderr)
    else:
        print(body, file=sys.stderr)


def null_ratio(items: list, key: str) -> float:
    if not items:
        return 0.0
    null_n = sum(1 for it in items if it.get(key) in (None, "", 0))
    return null_n / len(items)


def main():
    if not API or not TOKEN:
        print("SOLARFLOW_API + SOLARFLOW_TOKEN 필요", file=sys.stderr)
        sys.exit(2)

    issues = []

    # ============================================================
    # /api/v1/sales — enrichSales 응답에 outbound_date 채움 검증
    # ============================================================
    sales = fetch_json("/api/v1/sales", {"limit": 1000})
    if sales is None or not isinstance(sales, list):
        issues.append("❌ /api/v1/sales 응답 비정상")
    else:
        # outbound_date NULL 비율 — 0% 가까워야 (모든 sale 은 outbound 매핑됨)
        nr_outbound_date = null_ratio(sales, "outbound_date")
        if nr_outbound_date > 0.05:
            issues.append(
                f"🔴 /api/v1/sales: outbound_date NULL 비율 {nr_outbound_date:.1%} (5% 초과) — enrichSales 회귀 의심"
            )
        # tax_invoice_date NULL 비율 — sale.tax_invoice_date (nested)
        nr_tax = sum(1 for s in sales if not (s.get("sale", {}) or {}).get("tax_invoice_date")) / max(len(sales), 1)
        if nr_tax > 0.05:
            issues.append(
                f"🔴 /api/v1/sales: sale.tax_invoice_date NULL 비율 {nr_tax:.1%} — 매출 발행일 회귀"
            )
        # customer_name NULL — partners enrich 회귀 검증
        nr_cust = null_ratio(sales, "customer_name")
        if nr_cust > 0.10:
            issues.append(
                f"🟡 /api/v1/sales: customer_name NULL 비율 {nr_cust:.1%} — partners enrich 회귀 의심"
            )
        # product_name NULL — products enrich 회귀
        nr_prod = null_ratio(sales, "product_name")
        if nr_prod > 0.10:
            issues.append(
                f"🟡 /api/v1/sales: product_name NULL 비율 {nr_prod:.1%} — products enrich 회귀"
            )

    # ============================================================
    # /api/v1/outbounds — outbound 자체 응답
    # ============================================================
    outbounds = fetch_json("/api/v1/outbounds", {"limit": 1000})
    if outbounds is None or not isinstance(outbounds, list):
        issues.append("❌ /api/v1/outbounds 응답 비정상")
    else:
        nr_date = null_ratio(outbounds, "outbound_date")
        if nr_date > 0.01:
            issues.append(
                f"🔴 /api/v1/outbounds: outbound_date NULL 비율 {nr_date:.1%} — 출고일자 누락"
            )
        nr_usage = null_ratio(outbounds, "usage_category")
        if nr_usage > 0.01:
            issues.append(
                f"🔴 /api/v1/outbounds: usage_category NULL 비율 {nr_usage:.1%}"
            )

    # ============================================================
    # /api/v1/sales/summary — 요약 응답
    # ============================================================
    summary = fetch_json("/api/v1/sales/summary")
    if summary is None:
        issues.append("❌ /api/v1/sales/summary 응답 비정상")
    elif isinstance(summary, dict):
        if summary.get("total_count", 0) < 100:
            issues.append(
                f"🟡 /api/v1/sales/summary: total_count {summary.get('total_count')} 너무 적음"
            )

    # 결과
    print(f"=== api_smoke_test ===")
    print(f"  검증: 8개 / 위반: {len(issues)}")
    for i in issues:
        print(f"  {i}")

    if issues:
        post_alert(issues)
        sys.exit(1)


if __name__ == "__main__":
    main()
