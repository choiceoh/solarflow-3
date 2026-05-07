-- D-134~137 BARO Phase 2.5 인프라 마이그레이션 (단일 묶음).
--
-- 목적: 후속 4개 PR 시리즈(PR2.5/PR5.5/PR6.5/PR7.5)가 동작할 DB 골격을 한 번에 깔아둔다.
-- 각 마이그는 IF NOT EXISTS / DEFAULT 사용으로 멱등 — 부분 적용 후 재실행 안전.
--
-- ⚠️  이 SQL 은 코드 푸시와 별도로 운영자가 명시적으로 적용해야 한다:
--    psql -d solarflow -f backend/migrations/084_baro_phase2_5_scaffold.sql
--    launchctl stop com.solarflow.postgrest && launchctl start com.solarflow.postgrest
--
-- 각 섹션의 DECISIONS 본문은 본 PR 의 D-134~137 참조.

-- ============================================================================
-- D-134 (PR6.5): products.product_kind 컬럼 — module / inverter / package
-- ============================================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_kind text NOT NULL DEFAULT 'module',
  ADD COLUMN IF NOT EXISTS rated_power_kw numeric,         -- 인버터 정격 출력
  ADD COLUMN IF NOT EXISTS max_input_kw numeric,           -- 인버터 최대 입력(오버사이징 한도)
  ADD COLUMN IF NOT EXISTS mppt_channels integer,          -- 인버터 MPPT 채널 수
  ADD COLUMN IF NOT EXISTS voltage_min_v integer,          -- 인버터 MPPT 전압 하한
  ADD COLUMN IF NOT EXISTS voltage_max_v integer,          -- 인버터 MPPT 전압 상한
  ADD COLUMN IF NOT EXISTS phase text;                     -- '1P' | '3P' (인버터)

-- product_kind 도메인 제약 — 잘못된 값 입력 차단
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_product_kind_check;
ALTER TABLE products
  ADD CONSTRAINT products_product_kind_check
  CHECK (product_kind IN ('module', 'inverter', 'package'));

-- 패키지 SKU 구성품 — 모듈+인버터 묶음 1 row → 다수 child products 매핑
CREATE TABLE IF NOT EXISTS product_package_items (
  package_id uuid NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  child_product_id uuid NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  notes text,
  PRIMARY KEY (package_id, child_product_id)
);

-- ============================================================================
-- D-135 (PR2.5): baro_quotes — 견적 DB 저장 + 회신 추적
-- ============================================================================
CREATE TABLE IF NOT EXISTS baro_quotes (
  quote_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(partner_id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  valid_until date,
  notes text,
  -- 상태: draft → sent → replied(승인/거부 정보 포함) → won/lost
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'replied', 'won', 'lost', 'expired')),
  -- 발송 메타
  sent_at timestamptz,
  sent_channel text CHECK (sent_channel IN ('kakao', 'sms', 'email', 'pdf', 'manual') OR sent_channel IS NULL),
  sent_to text,                  -- 받는이(전화번호/이메일)
  -- 회신 추적
  replied_at timestamptz,
  reply_note text,
  -- 합계 (라인 합 캐시 — 정합성은 라인 변경 시 트리거 또는 핸들러가 갱신)
  subtotal_krw numeric(18,2) NOT NULL DEFAULT 0,
  vat_krw numeric(18,2) NOT NULL DEFAULT 0,
  total_krw numeric(18,2) NOT NULL DEFAULT 0,
  -- 마진 (PR5.5 매입원가 통합 후 채움)
  estimated_cost_krw numeric(18,2),
  estimated_margin_pct numeric(5,2)
);
CREATE INDEX IF NOT EXISTS idx_baro_quotes_partner ON baro_quotes(partner_id);
CREATE INDEX IF NOT EXISTS idx_baro_quotes_status ON baro_quotes(status);
CREATE INDEX IF NOT EXISTS idx_baro_quotes_created_by ON baro_quotes(created_by);

CREATE TABLE IF NOT EXISTS baro_quote_lines (
  line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES baro_quotes(quote_id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  product_id uuid REFERENCES products(product_id),
  product_code text,             -- snapshot — products.product_code (history 보존)
  product_name text,             -- snapshot
  spec_wp integer,               -- snapshot
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_krw numeric(18,2) NOT NULL,
  line_total_krw numeric(18,2) GENERATED ALWAYS AS (quantity * unit_price_krw) STORED,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_baro_quote_lines_quote ON baro_quote_lines(quote_id);

-- ============================================================================
-- D-136 (PR5.5): credit_holds — 한도 초과 출고 차단 추적
-- ============================================================================
-- 출고/수주 생성 시 한도 체크 로직이 hit 되면 본 테이블에 row 기록 + 결재 강제.
-- 실제 차단 enforcement 는 outbound 핸들러에서 본 테이블 조회 후 hold flag 설정.
CREATE TABLE IF NOT EXISTS baro_credit_holds (
  hold_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(partner_id) ON DELETE CASCADE,
  triggered_at timestamptz NOT NULL DEFAULT NOW(),
  trigger_reason text NOT NULL CHECK (trigger_reason IN ('over_limit', 'aging_60d', 'aging_90d', 'manual')),
  outstanding_krw numeric(18,2),
  credit_limit_krw numeric(18,2),
  oldest_unpaid_days integer,
  -- 해제 정보 (released_at IS NULL → 활성 hold)
  released_at timestamptz,
  released_by uuid REFERENCES auth.users(id),
  release_note text,
  -- 시도 차단된 출고/수주 컨텍스트 (있으면)
  blocked_outbound_id uuid,
  blocked_order_id uuid
);
CREATE INDEX IF NOT EXISTS idx_baro_credit_holds_partner ON baro_credit_holds(partner_id);
CREATE INDEX IF NOT EXISTS idx_baro_credit_holds_active ON baro_credit_holds(partner_id) WHERE released_at IS NULL;

-- ============================================================================
-- D-137 (PR7.5): baro_shipment_notices — 출하 알림 발송 추적
-- ============================================================================
CREATE TABLE IF NOT EXISTS baro_shipment_notices (
  notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES partners(partner_id),
  outbound_id uuid,                    -- /baro/dispatch outbound 연동
  dispatch_route_id uuid,              -- 배차 묶음
  stage text NOT NULL CHECK (stage IN ('loading', 'departure', 'arrival', 'delivered')),
  channel text NOT NULL CHECK (channel IN ('kakao', 'sms', 'manual_copy')),
  recipient_phone text,
  recipient_name text,
  message_body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT NOW(),
  sent_by uuid REFERENCES auth.users(id),
  -- 외부 발송 결과 (kakao/sms API 응답 캐시)
  delivery_status text CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed') OR delivery_status IS NULL),
  delivery_error text,
  external_message_id text,
  -- 드라이버 PWA 업로드 (D-137 PR7.5 후반부)
  driver_photo_url text,
  driver_signature_url text,
  delivery_note text,
  delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_baro_shipment_notices_outbound ON baro_shipment_notices(outbound_id);
CREATE INDEX IF NOT EXISTS idx_baro_shipment_notices_dispatch ON baro_shipment_notices(dispatch_route_id);
CREATE INDEX IF NOT EXISTS idx_baro_shipment_notices_partner ON baro_shipment_notices(partner_id);

-- 드라이버 access 토큰 (PWA 인증 simplified — 출하 1건당 1 토큰, 24h 만료)
CREATE TABLE IF NOT EXISTS baro_driver_tokens (
  token text PRIMARY KEY,                       -- random 32+ chars
  notice_id uuid NOT NULL REFERENCES baro_shipment_notices(notice_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  used_at timestamptz,
  driver_phone text                              -- 매핑된 차주 (audit)
);
CREATE INDEX IF NOT EXISTS idx_baro_driver_tokens_notice ON baro_driver_tokens(notice_id);
