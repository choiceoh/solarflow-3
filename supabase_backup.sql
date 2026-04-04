--
-- PostgreSQL database dump
--

\restrict XFJoOA2lg2dJVhqJulC3fw2kT6t3STgim4svdOdjoJpLGZwPH2DkOWZw5unOtWl

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: crud_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.crud_action AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE'
);


--
-- Name: domestic_foreign; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.domestic_foreign AS ENUM (
    '국내',
    '해외'
);


--
-- Name: inbound_item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inbound_item_type AS ENUM (
    '본품',
    '스페어',
    '기타자재'
);


--
-- Name: lc_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lc_status AS ENUM (
    '미개설',
    '개설완료',
    '서류접수',
    '만기결제',
    '정산완료'
);


--
-- Name: material_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.material_type AS ENUM (
    '폴리실리콘',
    '웨이퍼',
    '셀',
    '기타'
);


--
-- Name: module_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.module_category AS ENUM (
    '대형',
    '상업용',
    '주택용'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    '예정',
    '지급완료',
    '연체'
);


--
-- Name: payment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_type AS ENUM (
    'TT_ADVANCE',
    'LC_USANCE',
    'TT_BALANCE',
    'OTHER'
);


--
-- Name: po_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.po_status AS ENUM (
    '발주접수',
    '생산중',
    '선적완료',
    '입항',
    '입고완료'
);


--
-- Name: product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_status AS ENUM (
    'active',
    'discontinued'
);


--
-- Name: project_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_status AS ENUM (
    '설계중',
    '시공중',
    '완공',
    'AS중'
);


--
-- Name: shipment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipment_status AS ENUM (
    '예정',
    '통관중',
    '면장발급',
    '입고완료',
    'ERP반영'
);


--
-- Name: spare_charge; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.spare_charge AS ENUM (
    '무상',
    '유상'
);


--
-- Name: usage_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.usage_type AS ENUM (
    '상품판매',
    '자체공사',
    '리파워링',
    '교체_하자',
    '스페어제공',
    '창고이동',
    '재고조정'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'manager',
    'viewer'
);


--
-- Name: get_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role() RETURNS public.user_role
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: banks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banks (
    bank_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    bank_name character varying(50) NOT NULL,
    lc_limit_usd numeric(15,2) NOT NULL,
    opening_fee_rate numeric(5,4),
    acceptance_fee_rate numeric(5,4),
    fee_calc_method character varying(20),
    memo text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE banks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.banks IS '은행 마스터 — 법인별 LC 한도 및 수수료';


--
-- Name: COLUMN banks.opening_fee_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.banks.opening_fee_rate IS '개설수수료율 — 소수점 표기 (0.002 = 0.2%)';


--
-- Name: COLUMN banks.acceptance_fee_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.banks.acceptance_fee_rate IS '인수수수료율 — 소수점 표기 (0.003 = 0.3%)';


--
-- Name: bl_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bl_line_items (
    bl_line_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    bl_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    capacity_kw numeric(10,3) NOT NULL,
    item_type character varying(10) NOT NULL,
    payment_type character varying(10) NOT NULL,
    invoice_amount_usd numeric(15,2),
    unit_price_usd_wp numeric(10,6),
    unit_price_krw_wp numeric(10,2),
    usage_category character varying(20) DEFAULT 'sale'::character varying NOT NULL,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bl_line_items_item_type_check CHECK (((item_type)::text = ANY ((ARRAY['main'::character varying, 'spare'::character varying])::text[]))),
    CONSTRAINT bl_line_items_payment_type_check CHECK (((payment_type)::text = ANY ((ARRAY['paid'::character varying, 'free'::character varying])::text[]))),
    CONSTRAINT bl_line_items_usage_category_check CHECK (((usage_category)::text = ANY ((ARRAY['sale'::character varying, 'construction'::character varying, 'spare'::character varying, 'replacement'::character varying, 'repowering'::character varying, 'transfer'::character varying, 'adjustment'::character varying])::text[])))
);


--
-- Name: bl_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bl_shipments (
    bl_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    bl_number character varying(30) NOT NULL,
    po_id uuid,
    lc_id uuid,
    company_id uuid NOT NULL,
    manufacturer_id uuid NOT NULL,
    inbound_type character varying(20) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    exchange_rate numeric(10,2),
    etd date,
    eta date,
    actual_arrival date,
    port character varying(20),
    forwarder character varying(50),
    warehouse_id uuid,
    invoice_number character varying(30),
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    erp_registered boolean DEFAULT false,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bl_shipments_currency_check CHECK (((currency)::text = ANY ((ARRAY['USD'::character varying, 'KRW'::character varying])::text[]))),
    CONSTRAINT bl_shipments_inbound_type_check CHECK (((inbound_type)::text = ANY ((ARRAY['import'::character varying, 'domestic'::character varying, 'domestic_foreign'::character varying, 'group'::character varying])::text[]))),
    CONSTRAINT bl_shipments_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'shipping'::character varying, 'arrived'::character varying, 'customs'::character varying, 'completed'::character varying, 'erp_done'::character varying])::text[])))
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    company_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_name character varying(100) NOT NULL,
    company_code character varying(10) NOT NULL,
    business_number character varying(20),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE companies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.companies IS '법인 마스터 — 탑솔라 그룹 법인 관리';


--
-- Name: COLUMN companies.company_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.company_code IS '법인 약어: TS(탑솔라), DW(디원), HS(화신)';


--
-- Name: cost_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_details (
    cost_id uuid DEFAULT gen_random_uuid() NOT NULL,
    declaration_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    capacity_kw numeric(10,3),
    fob_unit_usd numeric(10,6),
    fob_total_usd numeric(15,2),
    fob_wp_krw numeric(10,2),
    exchange_rate numeric(10,2) NOT NULL,
    cif_total_krw numeric(15,0) NOT NULL,
    cif_unit_usd numeric(10,6),
    cif_total_usd numeric(15,2),
    cif_wp_krw numeric(10,2) NOT NULL,
    tariff_rate numeric(5,2),
    tariff_amount numeric(15,0),
    vat_amount numeric(15,0),
    customs_fee numeric(12,0),
    incidental_cost numeric(12,0),
    landed_total_krw numeric(15,0),
    landed_wp_krw numeric(10,2),
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN cost_details.cif_wp_krw; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_details.cif_wp_krw IS '회계 원가 — 면장 CIF Wp단가 (원/Wp)';


--
-- Name: COLUMN cost_details.landed_wp_krw; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_details.landed_wp_krw IS '실무 원가 — Landed Wp단가 (원/Wp), Rust 계산엔진 연동 후 자동 계산';


--
-- Name: import_declarations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_declarations (
    declaration_id uuid DEFAULT gen_random_uuid() NOT NULL,
    declaration_number character varying(30) NOT NULL,
    bl_id uuid NOT NULL,
    company_id uuid NOT NULL,
    declaration_date date NOT NULL,
    arrival_date date,
    release_date date,
    hs_code character varying(20),
    customs_office character varying(20),
    port character varying(20),
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE import_declarations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.import_declarations IS '수입면장 — B/L과 1:1(가끔 1:2) 관계';


--
-- Name: incidental_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidental_expenses (
    expense_id uuid DEFAULT gen_random_uuid() NOT NULL,
    bl_id uuid,
    month character varying(7),
    company_id uuid NOT NULL,
    expense_type character varying(30) NOT NULL,
    amount numeric(12,0) NOT NULL,
    vat numeric(12,0),
    total numeric(12,0) NOT NULL,
    vendor character varying(50),
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_bl_or_month CHECK (((bl_id IS NOT NULL) OR (month IS NOT NULL))),
    CONSTRAINT incidental_expenses_expense_type_check CHECK (((expense_type)::text = ANY ((ARRAY['dock_charge'::character varying, 'shuttle'::character varying, 'customs_fee'::character varying, 'transport'::character varying, 'storage'::character varying, 'handling'::character varying, 'surcharge'::character varying, 'lc_fee'::character varying, 'lc_acceptance'::character varying, 'telegraph'::character varying, 'other'::character varying])::text[])))
);


--
-- Name: TABLE incidental_expenses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.incidental_expenses IS '부대비용 — bl_id 또는 month 둘 중 하나는 필수';


--
-- Name: lc_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_records (
    lc_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    po_id uuid NOT NULL,
    lc_number character varying(30),
    bank_id uuid NOT NULL,
    company_id uuid NOT NULL,
    open_date date,
    amount_usd numeric(15,2) NOT NULL,
    target_qty integer,
    target_mw numeric(10,2),
    usance_days integer DEFAULT 90,
    usance_type character varying(20),
    maturity_date date,
    settlement_date date,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lc_records_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'opened'::character varying, 'docs_received'::character varying, 'settled'::character varying])::text[]))),
    CONSTRAINT lc_records_usance_type_check CHECK (((usance_type IS NULL) OR ((usance_type)::text = ANY ((ARRAY['buyers'::character varying, 'shippers'::character varying])::text[]))))
);


--
-- Name: TABLE lc_records; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lc_records IS 'LC 개설 이력 — 1 PO에 여러 은행으로 분할 개설';


--
-- Name: COLUMN lc_records.usance_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lc_records.usance_days IS 'Usance 일수 (기본 90일)';


--
-- Name: COLUMN lc_records.usance_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lc_records.usance_type IS 'buyers=매입자, shippers=선적자';


--
-- Name: limit_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.limit_changes (
    limit_change_id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_id uuid NOT NULL,
    change_date date NOT NULL,
    previous_limit numeric(15,2) NOT NULL,
    new_limit numeric(15,2) NOT NULL,
    reason character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE limit_changes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.limit_changes IS '한도 변경 이력 — 수정/삭제 없음 (이력 보존). 잘못 입력 시 새 이력으로 정정.';


--
-- Name: manufacturers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturers (
    manufacturer_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name_kr character varying(50) NOT NULL,
    name_en character varying(100),
    country character varying(20) NOT NULL,
    domestic_foreign character varying(10) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT manufacturers_domestic_foreign_check CHECK (((domestic_foreign)::text = ANY ((ARRAY['국내'::character varying, '해외'::character varying])::text[])))
);


--
-- Name: TABLE manufacturers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.manufacturers IS '제조사 마스터 — 태양광 모듈 제조사';


--
-- Name: COLUMN manufacturers.domestic_foreign; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.manufacturers.domestic_foreign IS '국내/해외 구분 — 입고유형 결정에 사용';


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    note_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    linked_table character varying(30),
    linked_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    order_id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number character varying(30),
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    order_date date NOT NULL,
    receipt_method character varying(20) NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    capacity_kw numeric(10,3),
    unit_price_wp numeric(10,2) NOT NULL,
    site_name character varying(100),
    site_address character varying(200),
    site_contact character varying(50),
    site_phone character varying(20),
    payment_terms character varying(100),
    deposit_rate numeric(5,2),
    delivery_due date,
    shipped_qty integer DEFAULT 0,
    remaining_qty integer,
    status character varying(20) NOT NULL,
    spare_qty integer,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    management_category character varying(20) DEFAULT 'sale'::character varying NOT NULL,
    fulfillment_source character varying(20) DEFAULT 'stock'::character varying NOT NULL,
    CONSTRAINT orders_fulfillment_source_check CHECK (((fulfillment_source)::text = ANY ((ARRAY['stock'::character varying, 'incoming'::character varying])::text[]))),
    CONSTRAINT orders_management_category_check CHECK (((management_category)::text = ANY ((ARRAY['sale'::character varying, 'construction'::character varying, 'spare'::character varying, 'repowering'::character varying, 'maintenance'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT orders_receipt_method_check CHECK (((receipt_method)::text = ANY ((ARRAY['purchase_order'::character varying, 'phone'::character varying, 'email'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT orders_status_check CHECK (((status)::text = ANY ((ARRAY['received'::character varying, 'partial'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.orders IS '수주 — 판매 발주서 접수. order_number는 유선 접수 시 NULL 가능';


--
-- Name: COLUMN orders.unit_price_wp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.unit_price_wp IS 'Wp당 판매단가 (원/Wp) — 핵심 입력값';


--
-- Name: COLUMN orders.shipped_qty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.shipped_qty IS '출고 완료 수량 — 출고 시 자동 증가';


--
-- Name: COLUMN orders.remaining_qty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.remaining_qty IS '잔량 = quantity - shipped_qty';


--
-- Name: COLUMN orders.management_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.management_category IS '수주 관리구분: sale=판매(재고예약), construction=공사(재고배정), spare/repowering/maintenance/other';


--
-- Name: COLUMN orders.fulfillment_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.fulfillment_source IS 'stock=현재재고충당, incoming=미착품충당. 재고집계 시 가용재고/가용미착품 분리 계산에 사용';


--
-- Name: outbounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbounds (
    outbound_id uuid DEFAULT gen_random_uuid() NOT NULL,
    outbound_date date NOT NULL,
    company_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    capacity_kw numeric(10,3),
    warehouse_id uuid NOT NULL,
    usage_category character varying(20) NOT NULL,
    order_id uuid,
    site_name character varying(100),
    site_address character varying(200),
    spare_qty integer,
    group_trade boolean DEFAULT false,
    target_company_id uuid,
    erp_outbound_no character varying(20),
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    CONSTRAINT outbounds_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'cancel_pending'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT outbounds_usage_category_check CHECK (((usage_category)::text = ANY ((ARRAY['sale'::character varying, 'sale_spare'::character varying, 'construction'::character varying, 'construction_damage'::character varying, 'maintenance'::character varying, 'disposal'::character varying, 'transfer'::character varying, 'adjustment'::character varying, 'other'::character varying])::text[])))
);


--
-- Name: TABLE outbounds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.outbounds IS '출고 — 재고 즉시 차감. group_trade=true이면 target_company_id 필수';


--
-- Name: COLUMN outbounds.usage_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outbounds.usage_category IS 'ERP 관리구분 대응: sale/sale_spare/construction/construction_damage/maintenance/disposal/transfer/adjustment/other';


--
-- Name: COLUMN outbounds.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outbounds.status IS 'active=정상, cancel_pending=취소예정(가용재고 미차감), cancelled=확정취소';


--
-- Name: partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partners (
    partner_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    partner_name character varying(100) NOT NULL,
    partner_type character varying(20) NOT NULL,
    erp_code character varying(10),
    payment_terms character varying(50),
    contact_name character varying(50),
    contact_phone character varying(20),
    contact_email character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partners_partner_type_check CHECK (((partner_type)::text = ANY ((ARRAY['supplier'::character varying, 'customer'::character varying, 'both'::character varying])::text[])))
);


--
-- Name: TABLE partners; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.partners IS '거래처 마스터 — 공급사/고객/양방향';


--
-- Name: COLUMN partners.partner_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.partner_type IS 'supplier=공급사, customer=고객, both=양방향';


--
-- Name: COLUMN partners.erp_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.erp_code IS '아마란스10 거래처코드';


--
-- Name: po_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.po_line_items (
    po_line_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    po_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price_usd numeric(10,6),
    total_amount_usd numeric(15,2),
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE po_line_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.po_line_items IS 'PO 라인아이템 — 1 PO에 여러 규격 가능';


--
-- Name: COLUMN po_line_items.unit_price_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.po_line_items.unit_price_usd IS 'USD/Wp 단가 (예: 0.087 = $0.087/Wp)';


--
-- Name: price_histories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_histories (
    price_history_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    product_id uuid,
    manufacturer_id uuid NOT NULL,
    change_date date NOT NULL,
    previous_price numeric(10,6),
    new_price numeric(10,6) NOT NULL,
    reason character varying(50),
    related_po_id uuid,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE price_histories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.price_histories IS '단가 변경 이력 — 제조사별 USD/Wp 단가 추적';


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    product_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    product_code character varying(30) NOT NULL,
    product_name character varying(100) NOT NULL,
    manufacturer_id uuid NOT NULL,
    spec_wp integer NOT NULL,
    wattage_kw numeric(10,3) NOT NULL,
    module_width_mm integer NOT NULL,
    module_height_mm integer NOT NULL,
    module_depth_mm integer,
    weight_kg numeric(5,1),
    wafer_platform character varying(30),
    cell_config character varying(30),
    series_name character varying(50),
    is_active boolean DEFAULT true NOT NULL,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.products IS '품번 마스터 — 태양광 모듈 규격';


--
-- Name: COLUMN products.product_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.product_code IS '아마란스10 ITEM_CD와 동일';


--
-- Name: COLUMN products.spec_wp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.spec_wp IS 'Wp 규격 — MW 환산의 기준값';


--
-- Name: COLUMN products.module_width_mm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.module_width_mm IS '★ 모듈 크기(mm) = 1차 정렬키 (현장 구조물 호환)';


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    po_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    po_number character varying(30),
    company_id uuid NOT NULL,
    manufacturer_id uuid NOT NULL,
    contract_type character varying(20) NOT NULL,
    contract_date date,
    incoterms character varying(10),
    payment_terms text,
    total_qty integer,
    total_mw numeric(10,2),
    contract_period_start date,
    contract_period_end date,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_orders_contract_type_check CHECK (((contract_type)::text = ANY ((ARRAY['general'::character varying, 'exclusive'::character varying, 'annual'::character varying, 'spot'::character varying])::text[]))),
    CONSTRAINT purchase_orders_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'contracted'::character varying, 'shipping'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: TABLE purchase_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.purchase_orders IS '발주/계약 — 1 PO → N개 LC, N개 B/L';


--
-- Name: COLUMN purchase_orders.contract_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.purchase_orders.contract_type IS 'general=일반, exclusive=독점, annual=연간, spot=스팟';


--
-- Name: COLUMN purchase_orders.payment_terms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.purchase_orders.payment_terms IS '자유기재: T/T 5%, LC 90일 등';


--
-- Name: receipt_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_matches (
    match_id uuid DEFAULT gen_random_uuid() NOT NULL,
    receipt_id uuid NOT NULL,
    outbound_id uuid,
    matched_amount numeric(15,0) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE receipt_matches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.receipt_matches IS '수금매칭 — outbound_id FK는 Step 9에서 outbound 테이블 생성 후 ALTER TABLE로 추가';


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipts (
    receipt_id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    receipt_date date NOT NULL,
    amount numeric(15,0) NOT NULL,
    bank_account character varying(50),
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE receipts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.receipts IS '수금 — 거래처 입금 등록';


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    sale_id uuid DEFAULT gen_random_uuid() NOT NULL,
    outbound_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    unit_price_wp numeric(10,2) NOT NULL,
    unit_price_ea numeric(12,0),
    supply_amount numeric(15,0),
    vat_amount numeric(15,0),
    total_amount numeric(15,0),
    tax_invoice_date date,
    tax_invoice_email character varying(100),
    erp_closed boolean DEFAULT false,
    erp_closed_date date,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN sales.unit_price_wp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.unit_price_wp IS 'Wp당 판매단가 (원/Wp) — 핵심 입력값, 나머지 자동 계산';


--
-- Name: COLUMN sales.tax_invoice_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.tax_invoice_date IS '세금계산서 발행일 — 출고일과 다를 수 있음 (다음달 발행 가능)';


--
-- Name: tt_remittances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tt_remittances (
    tt_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    po_id uuid NOT NULL,
    remit_date date,
    amount_usd numeric(15,2) NOT NULL,
    amount_krw numeric(15,0),
    exchange_rate numeric(10,2),
    purpose character varying(50),
    status character varying(20) DEFAULT 'planned'::character varying NOT NULL,
    bank_name character varying(50),
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tt_remittances_status_check CHECK (((status)::text = ANY ((ARRAY['planned'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: TABLE tt_remittances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tt_remittances IS 'T/T 송금 이력 — 계약금 분할 송금 추적';


--
-- Name: COLUMN tt_remittances.purpose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tt_remittances.purpose IS '계약금1차, 계약금2차, 선적전잔금 등 자유기재';


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    user_id uuid NOT NULL,
    email character varying(100) NOT NULL,
    name character varying(50) NOT NULL,
    role character varying(20) DEFAULT 'viewer'::character varying NOT NULL,
    allowed_modules text[] DEFAULT '{}'::text[],
    company_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    department character varying,
    phone character varying,
    avatar_url character varying,
    CONSTRAINT user_profiles_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'executive'::character varying, 'manager'::character varying, 'staff'::character varying, 'viewer'::character varying])::text[])))
);


--
-- Name: COLUMN user_profiles.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_profiles.role IS 'admin=최고관리자, executive=경영진, manager=관리자, staff=담당자, viewer=뷰어';


--
-- Name: COLUMN user_profiles.allowed_modules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_profiles.allowed_modules IS 'staff 전용: 접근 가능 모듈 목록 (예: {outbound,sales})';


--
-- Name: COLUMN user_profiles.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_profiles.company_id IS '소속 법인 (현재 미사용, 추후 법인별 접근 제한 시 활용)';


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    warehouse_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    warehouse_code character varying(10) NOT NULL,
    warehouse_name character varying(50) NOT NULL,
    warehouse_type character varying(20) NOT NULL,
    location_code character varying(10) NOT NULL,
    location_name character varying(50) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT warehouses_warehouse_type_check CHECK (((warehouse_type)::text = ANY ((ARRAY['port'::character varying, 'factory'::character varying, 'vendor'::character varying])::text[])))
);


--
-- Name: TABLE warehouses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.warehouses IS '창고/장소 마스터 — 항구, 공장, 업체공장';


--
-- Name: COLUMN warehouses.warehouse_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.warehouses.warehouse_code IS '아마란스10 WH_CD';


--
-- Name: COLUMN warehouses.location_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.warehouses.location_code IS '아마란스10 LC_CD';


--
-- Data for Name: banks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.banks (bank_id, company_id, bank_name, lc_limit_usd, opening_fee_rate, acceptance_fee_rate, fee_calc_method, memo, is_active, created_at, updated_at) FROM stdin;
ef4f9d00-6622-4070-ada3-c878aa02522b	99f0fc15-0555-4a41-a025-8bf3630a7947	하나은행	10000000.00	0.0020	0.0030	\N	\N	t	2026-03-28 11:13:05.935682+00	2026-03-28 11:13:05.935682+00
e13be7f2-d835-4893-9a87-3e0581a96eab	99f0fc15-0555-4a41-a025-8bf3630a7947	산업은행	10000000.00	0.0036	0.0040	\N	\N	t	2026-03-28 11:13:05.935682+00	2026-03-28 11:13:05.935682+00
00950132-de5d-482d-9c3f-b89b09a70585	99f0fc15-0555-4a41-a025-8bf3630a7947	신한은행	2500000.00	0.0080	0.0080	연이율/360일	개설,인수 : 0.8%/360	t	2026-03-28 11:13:05.935682+00	2026-03-28 11:13:05.935682+00
eab8d757-524e-427f-87bb-7c749cbfaf3a	99f0fc15-0555-4a41-a025-8bf3630a7947	국민은행	4000000.00	0.0016	0.0016	\N	\N	t	2026-03-28 11:13:05.935682+00	2026-03-28 11:13:05.935682+00
38c0f484-e145-4ed0-bba0-0a0a1b44a907	99f0fc15-0555-4a41-a025-8bf3630a7947	광주은행	2500000.00	0.0075	0.0075	\N	트리나30MW 2026.01.22 개설완료	t	2026-03-28 11:13:05.935682+00	2026-03-28 11:13:05.935682+00
\.


--
-- Data for Name: bl_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bl_line_items (bl_line_id, bl_id, product_id, quantity, capacity_kw, item_type, payment_type, invoice_amount_usd, unit_price_usd_wp, unit_price_krw_wp, usage_category, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: bl_shipments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bl_shipments (bl_id, bl_number, po_id, lc_id, company_id, manufacturer_id, inbound_type, currency, exchange_rate, etd, eta, actual_arrival, port, forwarder, warehouse_id, invoice_number, status, erp_registered, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.companies (company_id, company_name, company_code, business_number, is_active, created_at, updated_at) FROM stdin;
99f0fc15-0555-4a41-a025-8bf3630a7947	탑솔라(주)	TS	\N	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
84e646b9-d9b5-4c7c-84e7-2c67d89d4e5c	디원	DW	\N	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
a9c3c675-8ed5-4a33-80e7-190d25888e80	화신이엔지	HS	\N	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
\.


--
-- Data for Name: cost_details; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cost_details (cost_id, declaration_id, product_id, quantity, capacity_kw, fob_unit_usd, fob_total_usd, fob_wp_krw, exchange_rate, cif_total_krw, cif_unit_usd, cif_total_usd, cif_wp_krw, tariff_rate, tariff_amount, vat_amount, customs_fee, incidental_cost, landed_total_krw, landed_wp_krw, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: import_declarations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.import_declarations (declaration_id, declaration_number, bl_id, company_id, declaration_date, arrival_date, release_date, hs_code, customs_office, port, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: incidental_expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.incidental_expenses (expense_id, bl_id, month, company_id, expense_type, amount, vat, total, vendor, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: lc_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.lc_records (lc_id, po_id, lc_number, bank_id, company_id, open_date, amount_usd, target_qty, target_mw, usance_days, usance_type, maturity_date, settlement_date, status, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: limit_changes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.limit_changes (limit_change_id, bank_id, change_date, previous_limit, new_limit, reason, created_at) FROM stdin;
\.


--
-- Data for Name: manufacturers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.manufacturers (manufacturer_id, name_kr, name_en, country, domestic_foreign, is_active, created_at, updated_at) FROM stdin;
016ba1ef-cf58-4164-8adf-a048f2c54f3e	진코솔라	ZHEJIANG JINKO SOLAR CO.,LTD	중국	해외	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
fe7728ec-2cf5-4c95-89f4-733934fb7fcb	트리나솔라	TRINA SOLAR CO.,LTD	중국	해외	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
ccc9937e-6214-45f8-8b48-26487bf1d0d7	라이젠에너지	RISEN ENERGY CO.,LTD	중국	해외	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
23171f0e-52d4-4475-bea3-5045778f4ed3	JA솔라	JA SOLAR TECHNOLOGY CO.,LTD	중국	해외	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
30f5aae6-000e-4f6e-93af-076a246005a7	LONGi	LONGI GREEN ENERGY TECHNOLOGY CO.,LTD	중국	해외	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
d93b92c0-190a-4529-88a4-605cd470cf0a	통웨이솔라	TONGWEI SOLAR CO.,LTD	중국	해외	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
bc495831-bd38-48e0-beef-fb6e93caaeb0	한화솔루션	\N	한국	국내	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
b02784cd-2175-4c9f-9759-41d1b9bb9241	에스디엔	\N	한국	국내	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
478309eb-ad3a-4e7e-8ed0-13afbfdb185f	한솔테크닉스	\N	한국	국내	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
4d5fa3a6-ed85-4e10-938a-830d26f4c003	현대에너지솔루션	\N	한국	국내	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
c0c0eb4d-3556-434f-8bbf-32c2c65651bc	캐나디안솔라	CANADIAN SOLAR INC.	중국	해외	t	2026-03-28 11:11:51.337967+00	2026-04-03 03:26:02.100865+00
\.


--
-- Data for Name: notes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notes (note_id, user_id, content, linked_table, linked_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (order_id, order_number, company_id, customer_id, order_date, receipt_method, product_id, quantity, capacity_kw, unit_price_wp, site_name, site_address, site_contact, site_phone, payment_terms, deposit_rate, delivery_due, shipped_qty, remaining_qty, status, spare_qty, memo, created_at, updated_at, management_category, fulfillment_source) FROM stdin;
\.


--
-- Data for Name: outbounds; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.outbounds (outbound_id, outbound_date, company_id, product_id, quantity, capacity_kw, warehouse_id, usage_category, order_id, site_name, site_address, spare_qty, group_trade, target_company_id, erp_outbound_no, memo, created_at, updated_at, status) FROM stdin;
\.


--
-- Data for Name: partners; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.partners (partner_id, partner_name, partner_type, erp_code, payment_terms, contact_name, contact_phone, contact_email, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: po_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.po_line_items (po_line_id, po_id, product_id, quantity, unit_price_usd, total_amount_usd, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: price_histories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.price_histories (price_history_id, product_id, manufacturer_id, change_date, previous_price, new_price, reason, related_po_id, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (product_id, product_code, product_name, manufacturer_id, spec_wp, wattage_kw, module_width_mm, module_height_mm, module_depth_mm, weight_kg, wafer_platform, cell_config, series_name, is_active, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.purchase_orders (po_id, po_number, company_id, manufacturer_id, contract_type, contract_date, incoterms, payment_terms, total_qty, total_mw, contract_period_start, contract_period_end, status, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: receipt_matches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.receipt_matches (match_id, receipt_id, outbound_id, matched_amount, created_at) FROM stdin;
\.


--
-- Data for Name: receipts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.receipts (receipt_id, customer_id, receipt_date, amount, bank_account, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sales (sale_id, outbound_id, customer_id, unit_price_wp, unit_price_ea, supply_amount, vat_amount, total_amount, tax_invoice_date, tax_invoice_email, erp_closed, erp_closed_date, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tt_remittances; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tt_remittances (tt_id, po_id, remit_date, amount_usd, amount_krw, exchange_rate, purpose, status, bank_name, memo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_profiles (user_id, email, name, role, allowed_modules, company_id, is_active, created_at, updated_at, department, phone, avatar_url) FROM stdin;
ae97b99a-21af-4f9a-ad1e-c04811d8ed5c	alexkim5294@topsolar.kr	김알렉스	admin	{}	\N	t	2026-04-03 00:03:16.627535+00	2026-04-03 01:29:31.770709+00	\N	\N	\N
\.


--
-- Data for Name: warehouses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.warehouses (warehouse_id, warehouse_code, warehouse_name, warehouse_type, location_code, location_name, is_active, created_at, updated_at) FROM stdin;
c3782a36-5094-48a8-a9ef-d5b7184dd934	A200	블루오션에어	port	A202	광양항	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
df183630-e68f-4662-afbd-58ed9d6cabce	A400	선진로지스틱스	port	A401	광양항	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
5691bd9d-71d8-4cdc-9e50-21dba564e656	A400	선진로지스틱스	port	A402	부산항	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
b7ef7a4c-97ef-4f6d-a546-15298e28ff26	A400	선진로지스틱스	port	A403	평택항	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
0f10b79c-2707-4ae0-9915-b6a2f4e4a25e	F100	광주공장	factory	F101	B동공장	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
66755ecd-a7d8-4512-a8ea-797fefdf4e37	F100	광주공장	factory	F102	제3공장	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
5c070da6-a690-441f-84d1-eea021b273d0	B100	한화 진천	vendor	B101	한화 진천공장	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
4b70dbf9-1733-4e15-a382-b1dde8ec38e9	B100	에스디엔 광주	vendor	B102	에스디엔 광주공장	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
b99a4cb4-d448-4e49-b04a-8bc2633f0cec	B100	한솔테크닉스	vendor	B103	한솔 공장	t	2026-03-28 11:11:51.337967+00	2026-03-28 11:11:51.337967+00
\.


--
-- Name: banks banks_company_id_bank_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_company_id_bank_name_key UNIQUE (company_id, bank_name);


--
-- Name: banks banks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_pkey PRIMARY KEY (bank_id);


--
-- Name: bl_line_items bl_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_line_items
    ADD CONSTRAINT bl_line_items_pkey PRIMARY KEY (bl_line_id);


--
-- Name: bl_shipments bl_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_shipments
    ADD CONSTRAINT bl_shipments_pkey PRIMARY KEY (bl_id);


--
-- Name: companies companies_company_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_company_code_key UNIQUE (company_code);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (company_id);


--
-- Name: cost_details cost_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_details
    ADD CONSTRAINT cost_details_pkey PRIMARY KEY (cost_id);


--
-- Name: import_declarations import_declarations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_declarations
    ADD CONSTRAINT import_declarations_pkey PRIMARY KEY (declaration_id);


--
-- Name: incidental_expenses incidental_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidental_expenses
    ADD CONSTRAINT incidental_expenses_pkey PRIMARY KEY (expense_id);


--
-- Name: lc_records lc_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_records
    ADD CONSTRAINT lc_records_pkey PRIMARY KEY (lc_id);


--
-- Name: limit_changes limit_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.limit_changes
    ADD CONSTRAINT limit_changes_pkey PRIMARY KEY (limit_change_id);


--
-- Name: manufacturers manufacturers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturers
    ADD CONSTRAINT manufacturers_pkey PRIMARY KEY (manufacturer_id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (note_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (order_id);


--
-- Name: outbounds outbounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbounds
    ADD CONSTRAINT outbounds_pkey PRIMARY KEY (outbound_id);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (partner_id);


--
-- Name: po_line_items po_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_pkey PRIMARY KEY (po_line_id);


--
-- Name: price_histories price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_histories
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (price_history_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (product_id);


--
-- Name: products products_product_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_product_code_key UNIQUE (product_code);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (po_id);


--
-- Name: receipt_matches receipt_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_matches
    ADD CONSTRAINT receipt_matches_pkey PRIMARY KEY (match_id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (receipt_id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (sale_id);


--
-- Name: tt_remittances tt_remittances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_remittances
    ADD CONSTRAINT tt_remittances_pkey PRIMARY KEY (tt_id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (warehouse_id);


--
-- Name: warehouses warehouses_warehouse_code_location_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_warehouse_code_location_code_key UNIQUE (warehouse_code, location_code);


--
-- Name: idx_banks_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banks_active ON public.banks USING btree (is_active);


--
-- Name: idx_banks_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_banks_company ON public.banks USING btree (company_id);


--
-- Name: idx_bl_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_company ON public.bl_shipments USING btree (company_id);


--
-- Name: idx_bl_eta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_eta ON public.bl_shipments USING btree (eta);


--
-- Name: idx_bl_line_bl; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_line_bl ON public.bl_line_items USING btree (bl_id);


--
-- Name: idx_bl_line_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_line_product ON public.bl_line_items USING btree (product_id);


--
-- Name: idx_bl_manufacturer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_manufacturer ON public.bl_shipments USING btree (manufacturer_id);


--
-- Name: idx_bl_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_po ON public.bl_shipments USING btree (po_id);


--
-- Name: idx_bl_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bl_status ON public.bl_shipments USING btree (status);


--
-- Name: idx_companies_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_active ON public.companies USING btree (is_active);


--
-- Name: idx_lc_bank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lc_bank ON public.lc_records USING btree (bank_id);


--
-- Name: idx_lc_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lc_company ON public.lc_records USING btree (company_id);


--
-- Name: idx_lc_maturity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lc_maturity ON public.lc_records USING btree (maturity_date);


--
-- Name: idx_lc_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lc_po ON public.lc_records USING btree (po_id);


--
-- Name: idx_lc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lc_status ON public.lc_records USING btree (status);


--
-- Name: idx_manufacturers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manufacturers_active ON public.manufacturers USING btree (is_active);


--
-- Name: idx_manufacturers_domestic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manufacturers_domestic ON public.manufacturers USING btree (domestic_foreign);


--
-- Name: idx_notes_linked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_linked ON public.notes USING btree (linked_table, linked_id);


--
-- Name: idx_notes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_user_id ON public.notes USING btree (user_id);


--
-- Name: idx_partners_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_active ON public.partners USING btree (is_active);


--
-- Name: idx_partners_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_type ON public.partners USING btree (partner_type);


--
-- Name: idx_po_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_company ON public.purchase_orders USING btree (company_id);


--
-- Name: idx_po_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_date ON public.purchase_orders USING btree (contract_date);


--
-- Name: idx_po_line_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_line_po ON public.po_line_items USING btree (po_id);


--
-- Name: idx_po_line_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_line_product ON public.po_line_items USING btree (product_id);


--
-- Name: idx_po_manufacturer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_manufacturer ON public.purchase_orders USING btree (manufacturer_id);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_price_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_date ON public.price_histories USING btree (change_date);


--
-- Name: idx_price_manufacturer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_manufacturer ON public.price_histories USING btree (manufacturer_id);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree (is_active);


--
-- Name: idx_products_manufacturer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_manufacturer ON public.products USING btree (manufacturer_id);


--
-- Name: idx_products_size; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_size ON public.products USING btree (module_width_mm, module_height_mm);


--
-- Name: idx_products_spec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_spec ON public.products USING btree (spec_wp);


--
-- Name: idx_tt_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tt_date ON public.tt_remittances USING btree (remit_date);


--
-- Name: idx_tt_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tt_po ON public.tt_remittances USING btree (po_id);


--
-- Name: idx_tt_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tt_status ON public.tt_remittances USING btree (status);


--
-- Name: idx_warehouses_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouses_active ON public.warehouses USING btree (is_active);


--
-- Name: idx_warehouses_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouses_type ON public.warehouses USING btree (warehouse_type);


--
-- Name: cost_details cost_details_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cost_details_updated_at BEFORE UPDATE ON public.cost_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: import_declarations import_declarations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER import_declarations_updated_at BEFORE UPDATE ON public.import_declarations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: incidental_expenses incidental_expenses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER incidental_expenses_updated_at BEFORE UPDATE ON public.incidental_expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: orders orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: outbounds outbounds_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outbounds_updated_at BEFORE UPDATE ON public.outbounds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: receipts receipts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER receipts_updated_at BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: sales sales_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: banks trg_banks_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_banks_updated BEFORE UPDATE ON public.banks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: bl_line_items trg_bl_line_items_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bl_line_items_updated BEFORE UPDATE ON public.bl_line_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: bl_shipments trg_bl_shipments_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bl_shipments_updated BEFORE UPDATE ON public.bl_shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: companies trg_companies_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: lc_records trg_lc_records_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lc_records_updated BEFORE UPDATE ON public.lc_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: manufacturers trg_manufacturers_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_manufacturers_updated BEFORE UPDATE ON public.manufacturers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: partners trg_partners_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_partners_updated BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: po_line_items trg_po_line_items_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_po_line_items_updated BEFORE UPDATE ON public.po_line_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: price_histories trg_price_history_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_price_history_updated BEFORE UPDATE ON public.price_histories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: products trg_products_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: purchase_orders trg_purchase_orders_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purchase_orders_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tt_remittances trg_tt_remittances_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tt_remittances_updated BEFORE UPDATE ON public.tt_remittances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: warehouses trg_warehouses_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: user_profiles user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: banks banks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banks
    ADD CONSTRAINT banks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: bl_line_items bl_line_items_bl_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_line_items
    ADD CONSTRAINT bl_line_items_bl_id_fkey FOREIGN KEY (bl_id) REFERENCES public.bl_shipments(bl_id) ON DELETE CASCADE;


--
-- Name: bl_line_items bl_line_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_line_items
    ADD CONSTRAINT bl_line_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- Name: bl_shipments bl_shipments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_shipments
    ADD CONSTRAINT bl_shipments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: bl_shipments bl_shipments_lc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_shipments
    ADD CONSTRAINT bl_shipments_lc_id_fkey FOREIGN KEY (lc_id) REFERENCES public.lc_records(lc_id);


--
-- Name: bl_shipments bl_shipments_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_shipments
    ADD CONSTRAINT bl_shipments_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(manufacturer_id);


--
-- Name: bl_shipments bl_shipments_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_shipments
    ADD CONSTRAINT bl_shipments_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(po_id);


--
-- Name: bl_shipments bl_shipments_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bl_shipments
    ADD CONSTRAINT bl_shipments_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(warehouse_id);


--
-- Name: cost_details cost_details_declaration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_details
    ADD CONSTRAINT cost_details_declaration_id_fkey FOREIGN KEY (declaration_id) REFERENCES public.import_declarations(declaration_id);


--
-- Name: cost_details cost_details_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_details
    ADD CONSTRAINT cost_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- Name: receipt_matches fk_receipt_matches_outbound; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_matches
    ADD CONSTRAINT fk_receipt_matches_outbound FOREIGN KEY (outbound_id) REFERENCES public.outbounds(outbound_id);


--
-- Name: import_declarations import_declarations_bl_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_declarations
    ADD CONSTRAINT import_declarations_bl_id_fkey FOREIGN KEY (bl_id) REFERENCES public.bl_shipments(bl_id);


--
-- Name: import_declarations import_declarations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_declarations
    ADD CONSTRAINT import_declarations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: incidental_expenses incidental_expenses_bl_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidental_expenses
    ADD CONSTRAINT incidental_expenses_bl_id_fkey FOREIGN KEY (bl_id) REFERENCES public.bl_shipments(bl_id);


--
-- Name: incidental_expenses incidental_expenses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidental_expenses
    ADD CONSTRAINT incidental_expenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: lc_records lc_records_bank_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_records
    ADD CONSTRAINT lc_records_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.banks(bank_id);


--
-- Name: lc_records lc_records_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_records
    ADD CONSTRAINT lc_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: lc_records lc_records_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_records
    ADD CONSTRAINT lc_records_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(po_id);


--
-- Name: limit_changes limit_changes_bank_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.limit_changes
    ADD CONSTRAINT limit_changes_bank_id_fkey FOREIGN KEY (bank_id) REFERENCES public.banks(bank_id);


--
-- Name: orders orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.partners(partner_id);


--
-- Name: orders orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- Name: outbounds outbounds_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbounds
    ADD CONSTRAINT outbounds_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: outbounds outbounds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbounds
    ADD CONSTRAINT outbounds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id);


--
-- Name: outbounds outbounds_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbounds
    ADD CONSTRAINT outbounds_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- Name: outbounds outbounds_target_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbounds
    ADD CONSTRAINT outbounds_target_company_id_fkey FOREIGN KEY (target_company_id) REFERENCES public.companies(company_id);


--
-- Name: outbounds outbounds_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbounds
    ADD CONSTRAINT outbounds_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(warehouse_id);


--
-- Name: po_line_items po_line_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(po_id) ON DELETE CASCADE;


--
-- Name: po_line_items po_line_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.po_line_items
    ADD CONSTRAINT po_line_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- Name: price_histories price_history_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_histories
    ADD CONSTRAINT price_history_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(manufacturer_id);


--
-- Name: price_histories price_history_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_histories
    ADD CONSTRAINT price_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- Name: price_histories price_history_related_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_histories
    ADD CONSTRAINT price_history_related_po_id_fkey FOREIGN KEY (related_po_id) REFERENCES public.purchase_orders(po_id);


--
-- Name: products products_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(manufacturer_id);


--
-- Name: purchase_orders purchase_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: purchase_orders purchase_orders_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(manufacturer_id);


--
-- Name: receipt_matches receipt_matches_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_matches
    ADD CONSTRAINT receipt_matches_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(receipt_id);


--
-- Name: receipts receipts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.partners(partner_id);


--
-- Name: sales sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.partners(partner_id);


--
-- Name: sales sales_outbound_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_outbound_id_fkey FOREIGN KEY (outbound_id) REFERENCES public.outbounds(outbound_id);


--
-- Name: tt_remittances tt_remittances_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tt_remittances
    ADD CONSTRAINT tt_remittances_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(po_id);


--
-- Name: user_profiles user_profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict XFJoOA2lg2dJVhqJulC3fw2kT6t3STgim4svdOdjoJpLGZwPH2DkOWZw5unOtWl

