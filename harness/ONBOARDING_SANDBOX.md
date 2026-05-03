# 박물관 표본 (튜토리얼 데이터) 운영 가이드

신입 직원 학습 곡선 PR 시리즈에서 사용하는 **박물관 표본** 데이터를 운영자가 셋업하는 절차.

## 무엇이 박물관 표본인가
- Q1·Q2 결정: 신입은 진짜 폼을 그대로 보면서 도메인 시퀀스(PO→LC→BL→면장→원가) 5단계를 1건 따라가게 한다.
- 표본은 **영구 보존 1세트** — 신입이 망가뜨려도 다음 신입이 같은 표본 본다.
- 식별: `is_sandbox = true` 컬럼 (마이그레이션 053으로 9개 테이블에 추가됨).

## 자동 격리 (PR #2-B)
- 일반 list endpoint(`GET /api/v1/partners`, `/pos`, `/lcs`, `/bls`, `/declarations`, `/cost-details`)는 **자동으로 `is_sandbox=true` row 제외** — 운영자에게 안 보임.
- 신입이 박물관 표본을 fetch할 땐 `?include_sandbox=true` 쿼리 명시. 튜토리얼 컨텍스트만 우회.
- `purchase_orders_ext` view에 `is_sandbox` 컬럼 노출됨 (마이그레이션 054).
- **incidental_expenses**: 컬럼 미추가 — 박물관 표본의 부대비용은 후속 PR.

## 표본 셋업 절차 (운영자 — 1회만)

표본 데이터는 schema 정확도가 critical해서 **운영자가 supabase dashboard에서 직접 1회 셋업**한다. SQL 자동화는 위험(컬럼 누락 시 운영 중단). 아래 절차로 약 10분 작업.

### 1. 가짜 공급사 1개
```sql
INSERT INTO partners (partner_name, partner_type, is_active, is_sandbox)
VALUES ('_TUTORIAL_공급사_ABC', 'supplier', true, true)
RETURNING partner_id;
-- 반환된 partner_id를 메모
```

### 2. 가짜 PO 1건
운영 PC에서 정상 절차로 신규 PO 등록 (사이드바 [P/O 발주] → [+ 새로 등록]):
- 공급사: `_TUTORIAL_공급사_ABC`
- 라인: 적당한 모듈 1개 (예: 100장 × 100W, USD 50,000)
- 결제조건·환율 등 채움

저장 후 supabase dashboard에서:
```sql
UPDATE purchase_orders SET is_sandbox = true WHERE po_number = '_TUTORIAL_PO_2026_001';
UPDATE po_line_items SET is_sandbox = true WHERE po_id = (SELECT po_id FROM purchase_orders WHERE po_number = '_TUTORIAL_PO_2026_001');
```

### 3. 가짜 L/C 1건
같은 PO에 LC 등록 (사이드바 [L/C 개설] → 해당 PO 선택). 저장 후:
```sql
UPDATE lc_records SET is_sandbox = true WHERE lc_number = '_TUTORIAL_LC_2026_001';
UPDATE lc_line_items SET is_sandbox = true WHERE lc_id = (SELECT lc_id FROM lc_records WHERE lc_number = '_TUTORIAL_LC_2026_001');
```

### 4. 가짜 B/L 1건
[B/L 입고] → 신규. 저장 후:
```sql
UPDATE bl_shipments SET is_sandbox = true WHERE bl_number = '_TUTORIAL_BL_2026_001';
UPDATE bl_line_items SET is_sandbox = true WHERE bl_id = (SELECT bl_id FROM bl_shipments WHERE bl_number = '_TUTORIAL_BL_2026_001');
```

### 5. 가짜 면장 + 원가 1건
[면장/원가] → 신규. 저장 후:
```sql
UPDATE import_declarations SET is_sandbox = true WHERE declaration_number = '_TUTORIAL_CUSTOMS_2026_001';
UPDATE cost_details SET is_sandbox = true WHERE declaration_id = (SELECT declaration_id FROM import_declarations WHERE declaration_number = '_TUTORIAL_CUSTOMS_2026_001');
```

### 6. 검증
PostgREST 갱신:
```bash
systemctl --user restart solarflow-postgrest
```

운영 화면에서 일반 list(거래처·PO·LC·BL·면장)에서 `_TUTORIAL_*` row가 **안 보이는지** 확인.

박물관 표본 fetch 직접 확인 (튜토리얼 컨텍스트):
```bash
curl 'https://module.topworks.ltd/api/v1/partners?include_sandbox=true' | jq '.[] | select(.partner_name | startswith("_TUTORIAL_"))'
```

## 신입이 표본을 어떻게 만나는가 (PR #2-C 예정)
- 사이드바 🎓 튜토리얼 → "탑솔라 수입 흐름" → 5단계 풍선이 진짜 폼을 짚어줌.
- 폼 데이터는 `?include_sandbox=true&po_id=<TUTORIAL_PO_ID>` 같은 URL로 fetch.
- 폼 컴포넌트가 `data.is_sandbox === true` 시 `useFormReadOnly()` 훅으로 자동 disabled + `<SandboxBanner />` 노출 (PR #2-A에 인프라 준비 완료).

## 장애 시 복원
신입이 어떻게든 표본 데이터를 망가뜨려도 (현재는 readonly 강제 안 됨, PR #2-C 적용 후 안전) 운영 영향 0 — `is_sandbox=true` 자동 격리. 복원 필요 시 위 셋업 절차 재실행.

## 관련 결정·PR
- D-인터뷰: Q1~Q14 결정 트리 (인터뷰 기록은 PR #322 description)
- 마이그레이션 053: is_sandbox 컬럼 추가 (PR #335)
- 마이그레이션 054: purchase_orders_ext view + 6개 list handler 자동 필터 (이 PR)
- 후속 PR #2-C: 폼 컴포넌트의 useFormReadOnly 적용 + SandboxBanner 노출
- 후속 PR #3: BARO 영업 흐름 박물관 표본
