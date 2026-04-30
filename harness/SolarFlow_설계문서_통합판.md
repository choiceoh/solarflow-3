# SolarFlow 앱 설계 블루프린트

## 문서 정보

| 항목 | 내용 |
|------|------|
| 프로젝트명 | SolarFlow |
| 버전 | 3.0 (Go+Rust 재설계) |
| 작성일 | 2026-03-29 (통합본) |
| 대상 | 탑솔라 그룹 (탑솔라, 디원, 화신이엔지) |
| 사용자 | 기획조정실 3팀 (기자재담당) + 경영진 + 뷰어 |
| 예상 사용자 수 | 5~20명 (확장 가능성 있음) |
| 기술스택 | React + Vite + TypeScript + Tailwind (프론트엔드) + Go API 게이트웨이 + Rust 계산엔진 |

> 이 문서는 SolarFlow의 유일한 설계 정본(正本)입니다.
> 원본 설계문서 + 감리자 보완 6건 + 엑셀 입력 방식 변경 + UI/UX 흐름을 하나로 통합했습니다.

---

## 1. 프로젝트 개요

### 1.1 목적
태양광 모듈 수입·발주·입고·출고·판매·재고·원가를 통합 관리하는 **엑셀 기반 입력 + 통합 분석 플랫폼**.
현재 엑셀 47개 시트 + 아마란스10 ERP 수기 입력을 SolarFlow 하나로 통합.

### 1.2 SolarFlow의 역할 정의
- **입력**: 엑셀 Import 허브 (양식 다운로드 + 업로드 + 서버 검증)
- **출력**: 엑셀 Export (아마란스10 양식, 보고서, 분석 자료)
- **핵심 가치**: 통합 분석 시스템 (재고 현황, 마진 분석, LC 한도, 대시보드, 검색)
- **보조**: 웹 화면 직접 입력 (소량 수정, 긴급 등록용)

### 1.3 관리 대상 법인
- **탑솔라(주)**: 해외 수입 + 국내 구매 → 유통사/대리점 판매. ERP(아마란스10) 사용.
- **디원**: 해외 수입 + 국내 구매 → 공사/판매. ERP 미사용, SolarFlow가 유일한 시스템.
- **화신이엔지**: 해외 수입 + 국내 구매 → 공사/판매. ERP 미사용, SolarFlow가 유일한 시스템.
- **추후 법인 추가 가능**

### 1.4 별도 앱 구성
- **SolarFlow (탑솔라용)**: 탑솔라 + 디원 + 화신 3개 법인 통합 관리
- **SolarFlow (바로용)**: 유통 계열사 바로(주) 전용 (별도 앱, 별도 DB)
- 데이터 격리: 탑솔라는 바로의 판매가를 볼 수 없고, 바로도 탑솔라의 원가를 볼 수 없음

### 1.5 핵심 원칙
1. **쉬운 접근**: 실무자가 바로 사용 가능
2. **편리한 사용**: 엑셀로 입력, SolarFlow로 분석
3. **쉬운 수정/변경**: Go에서 5분이면 필드 추가
4. **안정성**: 다운타임 최소, SolarFlow 다운되어도 엑셀 원본이 실무자 PC에 있음

### 1.6 아키텍처
```
사용자(브라우저)
    ↕
React/Vite 프론트엔드 — 화면 UI, 필터/검색/입력 UX
    ↕
Go API 게이트웨이 — 인증, CRUD, 엑셀 Import/Export, Rust 프록시
    ↕ REST API 게이트웨이
Rust (백엔드) — 복잡한 계산, 안정적인 부분
    ↕
PostgreSQL (운영: 로컬 PostgreSQL + PostgREST, 인증: Supabase Auth)
```

#### React 프론트엔드가 담당하는 것
- 화면 UI, 메뉴 구조, 필터/검색/정렬
- 폼 UX, 드롭다운, 테이블, 차트, 첨부파일 위젯
- 엑셀 양식 다운로드/업로드 미리보기 화면

#### Go가 담당하는 것 (자주 바뀌는 API/업무 처리)
- HTTP API, CRUD, 인증/권한 미들웨어
- 엑셀 내보내기/불러오기 (양식 생성, 업로드 검증)
- 아마란스10 양식 매핑
- 사용자 인증, 권한, auto-provision
- 결재안 텍스트 생성
- Rust 계산엔진 프록시 (`/api/v1/calc/*`)

#### Rust가 담당하는 것 (복잡하고 안정적인 부분)
- Landed Cost 계산 (CIF + 관세 + 통관비 + 부대비)
- 환율 환산 (시점별 비교)
- 재고 집계 (물리적→가용→총확보량)
- 마진/이익률 분석 (제조사별·규격별, 원가 vs 매입가)
- L/C 만기일 계산, 결제 스케줄, 한도 복원 타임라인
- LC 수수료 계산 (Invoice Value × 수수료율 × 일수/360 × 환율)
- 월별 수급 전망 계산 (6개월)
- 장기재고 판별 (6개월/12개월)
- 수금 매칭 자동 추천
- 단가 추이 분석
- 자연어 검색 엔진

### Rust 계산엔진
- Framework: Axum 0.8.8, sqlx 0.8.6
- 현재 운영: Mac mini launchd `com.solarflow.engine`, 포트 8081
- 과거 배포 이력: fly.io solarflow-engine.fly.dev (D-072 이전)
- Go-Rust 통신: REST API, 운영 환경에서는 `ENGINE_URL=http://127.0.0.1:8081`
- DB 연결: `SUPABASE_DB_URL` 환경변수로 PostgreSQL 직접 연결, sqlx 풀 5개
- 인증: 불필요 (Go가 게이트웨이, Rust는 내부 전용)

### Rust API 엔드포인트 (16개)
| 엔드포인트 | 기능 |
|-----------|------|
| /health | 서버 생존 확인 |
| /health/ready | DB 연결 확인 |
| /api/calc/inventory | 재고 3단계 집계 |
| /api/calc/landed-cost | Landed Cost 계산 |
| /api/calc/exchange-compare | 환율 환산 비교 |
| /api/calc/lc-fee | LC 수수료 계산 |
| /api/calc/lc-limit-timeline | 한도 복원 타임라인 |
| /api/calc/lc-maturity-alert | LC 만기 알림 |
| /api/calc/margin-analysis | 마진/이익률 분석 |
| /api/calc/customer-analysis | 거래처 분석 |
| /api/calc/price-trend | 단가 추이 |
| /api/calc/supply-forecast | 월별 수급 전망 |
| /api/calc/outstanding-list | 미수금 목록 |
| /api/calc/receipt-match-suggest | 수금 매칭 추천 |
| /api/calc/search | 자연어 검색 |
| /api/calc/inventory-turnover | 재고 회전율 |

### 1.7 Go+Rust 분리 기준

**기준: "한 행 안의 사칙연산 = Go, 여러 테이블 조합 = Rust"**

Go에서 허용하는 단순 필드 계산:
- capacity_kw = quantity × spec_wp / 1000
- unit_price_ea = wp_price × spec_wp
- supply_amount = unit_price_ea × quantity
- vat_amount = supply_amount × 0.1
- total_amount = supply_amount + vat_amount

Phase 2 구현 시: Rust 담당 자리에 `// TODO: Rust 계산엔진 연동` 주석 필수, Go에서 임시 구현 금지.

---

## 2. 권한 체계

### 2.1 역할
| 역할 | 코드 | 대시보드 | 데이터 입력 | 설정 변경 |
|------|------|---------|----------|---------|
| 최고관리자 | admin | 관리자용 | ✅ 전체 | ✅ |
| 경영진 | executive | 경영진용 (큰 그림) | ❌ 조회만 | ❌ |
| 관리자 | manager | 관리자용 (상세) | ✅ 전체 | ❌ |
| 담당자 | staff | 담당 모듈만 | ✅ 담당 모듈만 | ❌ |
| 뷰어 | viewer | 조회용 | ❌ 조회만 | ❌ |

### 2.2 인증 구현 방식
- **인증**: Supabase Auth + JWT
- **로그인**: 이메일 + 비밀번호
- **JWT 토큰**: Supabase Auth 발급 → Go 미들웨어에서 매 요청 검증
- **비밀번호 분실**: Supabase Auth 비밀번호 리셋 기능
- **세션**: JWT 기반 (Authorization 헤더)

### 2.3 권한 저장 (user_profiles 테이블)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| user_id | UUID | ✅ | PK, Supabase Auth uid 연결 |
| email | VARCHAR(100) | ✅ | 이메일 |
| name | VARCHAR(50) | ✅ | 이름 |
| role | VARCHAR(20) | ✅ | admin/executive/manager/staff/viewer |
| allowed_modules | TEXT[] | | staff 전용 모듈 접근 (예: {outbound,sales}) |
| company_id | UUID(FK) | | 소속 법인 (현재 미사용, 추후 법인별 제한 시) |
| is_active | BOOLEAN | ✅ | 활성/비활성 |

### 2.4 Go 미들웨어 구조
```
요청 → AuthMiddleware (JWT 검증 + user_profiles 조회)
     → RoleMiddleware (역할 확인)
     → 핸들러 (실제 처리)

/health → 인증 불필요
/api/v1/* → 인증 필수
```

---

## 3. 모듈 구성 (7개 핵심 + 3개 보조)

### 핵심 모듈
1. 마스터 관리 (법인, 제조사, 품번, 거래처, 창고, 은행)
2. 발주/결제 (PO, L/C, T/T, 계약관리)
3. 입고 관리 (B/L 기반, 해외/국내/그룹내)
4. 수입면장/원가 (FOB→CIF→Landed Cost)
5. 수주/수금 (발주서 접수, 분할출고, 수금 매칭)
6. 출고/판매 (출고등록, 매출등록, 세금계산서, 아마란스 연동)
7. 재고/분석 (3단계 재고, 월별 수급 전망, 이익률 분석)

### 보조 모듈
8. 은행/LC 한도 관리
9. 대시보드 (역할별)
10. 공통 기능 (메모, 검색, 첨부파일, 엑셀 Import/Export, 결재안 생성)

---

## 4. 모듈 상세 설계

### 4.1 마스터 관리

#### 법인 마스터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| company_id | UUID | ✅ | PK |
| company_name | VARCHAR(100) | ✅ | 탑솔라(주), 디원, 화신이엔지 |
| company_code | VARCHAR(10) | ✅ | TS, DW, HS |
| business_number | VARCHAR(20) | | 사업자등록번호 |
| is_active | BOOLEAN | ✅ | 활성/비활성 |

#### 제조사 마스터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| manufacturer_id | UUID | ✅ | PK |
| name_kr | VARCHAR(50) | ✅ | 진코솔라, 트리나, 라이젠 등 |
| name_en | VARCHAR(100) | | ZHEJIANG JINKO SOLAR 등 |
| country | VARCHAR(20) | ✅ | 중국, 한국 등 |
| domestic_foreign | VARCHAR(4) | ✅ | 국내/해외 |
| is_active | BOOLEAN | ✅ | |

#### 품번 마스터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| product_id | UUID | ✅ | PK |
| product_code | VARCHAR(30) | ✅ | M-JK0635-01 (아마란스 ITEM_CD) |
| product_name | VARCHAR(100) | ✅ | JKM635N-78HL4-BDV-S |
| manufacturer_id | UUID(FK) | ✅ | 제조사 |
| spec_wp | INTEGER | ✅ | 규격 Wp (635, 640, 720 등) |
| wattage_kw | DECIMAL(10,3) | ✅ | kW 환산 (0.635) |
| module_width_mm | INTEGER | ✅ | 모듈 가로 (2465) |
| module_height_mm | INTEGER | ✅ | 모듈 세로 (1134) |
| module_depth_mm | INTEGER | | 모듈 두께 (30) |
| weight_kg | DECIMAL(5,1) | | 무게 |
| wafer_platform | VARCHAR(30) | | M10(182mm) 등 |
| cell_config | VARCHAR(30) | | 72셀(144 half-cut) 등 |
| series_name | VARCHAR(50) | | Hi-MO 7, Tiger Neo 등 |
| is_active | BOOLEAN | ✅ | |
| memo | TEXT | | |

※ 모듈 크기(mm) 기준 정렬 필수 — 현장 구조물 호환 확인용
※ 추후 필드 추가 쉬움 (ALTER TABLE, Go에서 5분)

#### 거래처 마스터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| partner_id | UUID | ✅ | PK |
| partner_name | VARCHAR(100) | ✅ | 바로(주), 신명엔지니어링 등 |
| partner_type | VARCHAR(20) | ✅ | supplier/customer/both |
| erp_code | VARCHAR(10) | | 아마란스10 거래처코드 |
| payment_terms | VARCHAR(50) | | 기본 결제조건 (60일, 현금 등) |
| contact_name | VARCHAR(50) | | 담당자 |
| contact_phone | VARCHAR(20) | | 연락처 |
| contact_email | VARCHAR(100) | | 이메일 |
| is_active | BOOLEAN | ✅ | |

#### 창고/장소 마스터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| warehouse_id | UUID | ✅ | PK |
| warehouse_code | VARCHAR(4) | ✅ | 아마란스 WH_CD (A200, A400 등) |
| warehouse_name | VARCHAR(50) | ✅ | 블루오션에어, 선진로지스틱스 등 |
| warehouse_type | VARCHAR(20) | ✅ | port(항구)/factory(공장)/vendor(업체) |
| location_code | VARCHAR(4) | ✅ | 아마란스 LC_CD (A202, A401 등) |
| location_name | VARCHAR(50) | ✅ | 광양항, 부산항, 평택항 등 |
| is_active | BOOLEAN | ✅ | |

실무 창고 현황:
- 블루오션에어(A200): 광양항
- 선진로지스틱스(A400): 광양항, 부산항, 평택항
- 광주공장(F100): B동공장, 제3공장
- 업체공장(B100): 한화 진천, 에스디엔 광주 등

#### 공사 현장 마스터
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| site_id | UUID | ✅ | PK |
| company_id | UUID(FK) | ✅ | 담당 법인 |
| name | VARCHAR | ✅ | 발전소/현장명 |
| location | VARCHAR | | 지명/주소 요약 |
| site_type | VARCHAR | ✅ | own(자체) / epc(타사 EPC) |
| capacity_mw | DECIMAL | | 발전소 설비용량 MW |
| started_at | DATE | | 착공일 |
| completed_at | DATE | | 준공일 |
| notes | TEXT | | 메모 |
| is_active | BOOLEAN | ✅ | 활성/비활성 |

#### 은행 마스터 (법인별)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| bank_id | UUID | ✅ | PK |
| company_id | UUID(FK) | ✅ | 법인 (탑/디원/화신 각각) |
| bank_name | VARCHAR(50) | ✅ | 하나은행, 산업은행 등 |
| lc_limit_usd | DECIMAL(15,2) | ✅ | LC 개설한도 (USD) |
| opening_fee_rate | DECIMAL(5,4) | | 개설수수료율 (%) |
| acceptance_fee_rate | DECIMAL(5,4) | | 인수수수료율 (%) |
| fee_calc_method | VARCHAR(20) | | 수수료 계산방식 (연이율/360일 등) |
| memo | TEXT | | |
| is_active | BOOLEAN | ✅ | |

실무 현황 (탑솔라):
- 하나은행: $10M, 개설 0.2%, 인수 0.3%
- 산업은행: $10M, 개설 0.36%, 인수 0.4%
- 신한은행: $2.5M, 개설 0.8%, /360
- 국민은행: $4M, 개설 0.16%, 인수 0.16%
- 광주은행: $2.5M, 개설 0.75%, 인수 0.75%

---

### 4.2 발주/결제 모듈

#### PO (발주/계약)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| po_id | UUID | ✅ | PK |
| po_number | VARCHAR(30) | | PO번호 (NULL 가능 — 25년 데이터) |
| company_id | UUID(FK) | ✅ | 발주 법인 |
| manufacturer_id | UUID(FK) | ✅ | 제조사 |
| contract_type | VARCHAR(20) | ✅ | general/exclusive/annual/spot |
| contract_date | DATE | | 계약일 |
| incoterms | VARCHAR(10) | | CIF, FOB, BAFCA 등 |
| payment_terms | TEXT | | 결제조건 자유기재 (T/T 5%, LC 90일 등) |
| total_qty | INTEGER | | 총 수량(장) |
| total_mw | DECIMAL(10,2) | | 총 MW |
| contract_period_start | DATE | | 독점/연간 계약 시작 |
| contract_period_end | DATE | | 독점/연간 계약 종료 |
| status | VARCHAR(20) | ✅ | draft/contracted/shipping/completed |
| memo | TEXT | | |

#### PO 라인아이템 (규격 혼합 대응)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| po_line_id | UUID | ✅ | PK |
| po_id | UUID(FK) | ✅ | PO 연결 |
| product_id | UUID(FK) | ✅ | 품번 |
| quantity | INTEGER | ✅ | 수량(장) |
| unit_price_usd | DECIMAL(10,6) | | USD/Wp 단가 |
| total_amount_usd | DECIMAL(15,2) | | 총액(USD) |
| memo | TEXT | | |

예시: 라이젠 PO — Line1: 640Wp 15,552장 $0.087, Line2: 635Wp 141,982장 $0.132

#### 번호 없는 데이터 정책
- PO번호, 수주 발주번호: NULL 허용
- 자동 임시번호 미생성 (실무 혼동 위험)
- 검색 시 "번호 미부여" 필터 제공
- 나중에 번호 확인 시 업데이트 가능

#### 단가 변경 이력
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| price_history_id | UUID | ✅ | PK |
| product_id | UUID(FK) | ✅ | 품번 또는 제조사+규격 |
| manufacturer_id | UUID(FK) | ✅ | 제조사 |
| change_date | DATE | ✅ | 변경일 |
| previous_price | DECIMAL(10,6) | | 이전 단가 (USD/Wp) |
| new_price | DECIMAL(10,6) | ✅ | 변경 단가 (USD/Wp) |
| reason | VARCHAR(50) | | 시세변동/재협상/계약갱신/최초계약 |
| related_po_id | UUID(FK) | | 관련 PO |
| memo | TEXT | | |

#### T/T 송금 이력
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| tt_id | UUID | ✅ | PK |
| po_id | UUID(FK) | ✅ | PO 연결 |
| remit_date | DATE | | 송금일 |
| amount_usd | DECIMAL(15,2) | ✅ | 송금액(USD) |
| amount_krw | DECIMAL(15,0) | | 원화 환산 |
| exchange_rate | DECIMAL(10,2) | | 적용 환율 |
| purpose | VARCHAR(50) | | 계약금1차/계약금2차/선적전잔금 등 |
| status | VARCHAR(20) | ✅ | planned/completed |
| bank_name | VARCHAR(50) | | 송금 은행 |
| memo | TEXT | | |

#### LC 개설 이력
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| lc_id | UUID | ✅ | PK |
| po_id | UUID(FK) | ✅ | PO 연결 |
| lc_number | VARCHAR(30) | | LC 번호 |
| bank_id | UUID(FK) | ✅ | 은행 마스터 연결 |
| company_id | UUID(FK) | ✅ | 개설 법인 |
| open_date | DATE | | 개설일 |
| amount_usd | DECIMAL(15,2) | ✅ | 개설금액(USD) |
| target_qty | INTEGER | | 대상 수량 |
| target_mw | DECIMAL(10,2) | | 대상 MW |
| usance_days | INTEGER | | Usance 일수 (기본 90) |
| usance_type | VARCHAR(20) | | buyers/shippers |
| maturity_date | DATE | | 만기일 |
| settlement_date | DATE | | 실제 결제일 |
| status | VARCHAR(20) | ✅ | pending/opened/docs_received/settled |
| memo | TEXT | | |

관계: 1 PO → N개 LC (분할 개설)

#### PO 입고현황 뷰 (Rust 계산)
PO 화면에서 바로 표시:
- 계약량 / LC개설량 / 선적완료 / 입고완료 / 미착품 / 잔여량
- 진행률 바 + 잔여량 표시

---

### 4.3 입고 모듈

#### 입고 유형 4가지
1. **해외 직수입**: USD, CIF, 면장 발급, B/L 기반
2. **국내 제조사 구매**: KRW, 면장 없음 (한화, 에스디엔 등)
3. **국내 유통사 외산 구매**: KRW, 면장 없음
4. **그룹 내 구매**: 탑솔라↔디원↔화신 양방향, 자동 연동

#### B/L (선적/입고 기본 단위)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| bl_id | UUID | ✅ | PK |
| bl_number | VARCHAR(30) | ✅ | B/L No. |
| po_id | UUID(FK) | | PO 연결 (없을 수 있음) |
| lc_id | UUID(FK) | | LC 연결 |
| company_id | UUID(FK) | ✅ | 수입 법인 |
| manufacturer_id | UUID(FK) | ✅ | 공급사/제조사 |
| inbound_type | VARCHAR(20) | ✅ | import/domestic/domestic_foreign/group |
| currency | VARCHAR(3) | ✅ | USD/KRW |
| exchange_rate | DECIMAL(10,2) | | 환율 |
| etd | DATE | | 출항일 |
| eta | DATE | | 입항일 |
| actual_arrival | DATE | | 실제 입항일 |
| port | VARCHAR(20) | | 광양항/부산항/평택항 |
| forwarder | VARCHAR(50) | | 블루오션에어/선진로지스틱스 |
| warehouse_id | UUID(FK) | | 입고 창고 |
| invoice_number | VARCHAR(30) | | Invoice No. |
| status | VARCHAR(20) | ✅ | scheduled/shipping/arrived/customs/completed/erp_done |
| erp_registered | BOOLEAN | | 아마란스 등록 여부 |
| memo | TEXT | | |

#### B/L 라인아이템
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| bl_line_id | UUID | ✅ | PK |
| bl_id | UUID(FK) | ✅ | B/L 연결 |
| product_id | UUID(FK) | ✅ | 품번 |
| quantity | INTEGER | ✅ | 수량(장) |
| capacity_kw | DECIMAL(10,3) | ✅ | 용량(kW) = 수량 × Wp/1000 |
| item_type | VARCHAR(10) | ✅ | main(본품)/spare(스페어) |
| payment_type | VARCHAR(10) | ✅ | paid(유상)/free(무상) |
| invoice_amount_usd | DECIMAL(15,2) | | 인보이스 금액 (무상도 금액 있음) |
| unit_price_usd_wp | DECIMAL(10,6) | | USD/Wp 단가 |
| unit_price_krw_wp | DECIMAL(10,2) | | 원/Wp 단가 (국내 구매 시) |
| usage_category | VARCHAR(20) | ✅ | sale/construction/spare/replacement/repowering/transfer/adjustment |
| memo | TEXT | | |

#### 그룹 내 거래 자동 연동 상세

**관리 주체**: 3팀(Alex)이 3개 법인 전부 관리. 별도 담당자 없음.

**탑솔라→디원 출고 시 동작:**
1. 탑솔라 출고 등록 (용도="그룹내거래", 상대법인=디원)
2. 탑솔라 재고 즉시 차감
3. 디원 입고 자동 생성 (입고단가 = 탑솔라 판매단가, 수정 불가)
4. 디원 재고 증가
5. 세금계산서: 양쪽 각각 수동 등록

**디원에서 외부 판매 시:** 디원 재고에서 출고, 마진 추적 가능

**출고 취소 시:** 탑솔라 출고 취소 → 디원 입고 자동 취소, 양쪽 재고 원복. 단, 디원에서 이미 외부 출고한 경우 취소 불가 (경고 표시).

**양방향:** 탑솔라↔디원↔화신 모든 조합 동일 구조.

---

### 4.4 수입면장/원가 모듈

#### 수입면장
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| declaration_id | UUID | ✅ | PK |
| declaration_number | VARCHAR(30) | ✅ | 수입면장번호 |
| bl_id | UUID(FK) | ✅ | B/L 연결 (보통 1:1, 가끔 1:2) |
| company_id | UUID(FK) | ✅ | 수입 법인 |
| declaration_date | DATE | ✅ | 수입신고일 |
| arrival_date | DATE | | 입항일 |
| release_date | DATE | | 반출일 |
| hs_code | VARCHAR(20) | | HS코드 |
| customs_office | VARCHAR(20) | | 세관 |
| port | VARCHAR(20) | | 항구 |
| memo | TEXT | | |

#### 원가 3단계 (면장 라인아이템별)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| cost_id | UUID | ✅ | PK |
| declaration_id | UUID(FK) | ✅ | 면장 연결 |
| product_id | UUID(FK) | ✅ | 품번 |
| quantity | INTEGER | ✅ | 수량(EA) |
| capacity_kw | DECIMAL(10,3) | | 용량(kW) |
| fob_unit_usd | DECIMAL(10,6) | | FOB 단가 (¢/Wp) |
| fob_total_usd | DECIMAL(15,2) | | FOB 총액 (USD) |
| fob_wp_krw | DECIMAL(10,2) | | FOB Wp단가 (원/Wp) |
| exchange_rate | DECIMAL(10,2) | ✅ | 면장 적용 환율 |
| cif_total_krw | DECIMAL(15,0) | ✅ | 면장 CIF (원화) |
| cif_unit_usd | DECIMAL(10,6) | | CIF 단가 (¢/Wp) |
| cif_total_usd | DECIMAL(15,2) | | CIF 총액 (USD) |
| cif_wp_krw | DECIMAL(10,2) | ✅ | **CIF Wp단가 (원/Wp) = 회계 원가** |
| tariff_rate | DECIMAL(5,2) | | 관세율 (%) |
| tariff_amount | DECIMAL(15,0) | | 관세액 (원) |
| vat_amount | DECIMAL(15,0) | | 부가세 (원, 원가 불포함) |
| customs_fee | DECIMAL(12,0) | | 통관비 (원) |
| incidental_cost | DECIMAL(12,0) | | 기타 부대비용 (원) |
| landed_total_krw | DECIMAL(15,0) | | Landed Cost (VAT제외, 원) |
| landed_wp_krw | DECIMAL(10,2) | | **Landed Wp단가 (원/Wp) = 실무 원가** |
| memo | TEXT | | |

원가 기준:
- **회계 원가** = 면장 CIF Wp단가 (원/Wp) — 공식 장부, 회계팀 보고
- **실무 원가** = CIF + 약 3원/Wp (부대비용 추정) — 판매 의사결정, 마진 계산
- VAT(부가세)는 매입세액공제 대상이므로 원가에 불포함
- **Landed Cost 계산은 Rust 담당** (여러 테이블 조합)
- Landed Cost save 옵션: save=false(미리보기), save=true(DB 저장) (D-025)
- 부대비용 배분: capacity_kw 비율 (D-023)
- allocated_expenses: 동적 맵 — expense_type 추가 시 코드 변경 불필요 (D-026)

#### 부대비용 (B/L별 또는 월별)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| expense_id | UUID | ✅ | PK |
| bl_id | UUID(FK) | | B/L 연결 (추적 가능 시) |
| month | VARCHAR(7) | | 월별 정산 시 (2026-03) |
| company_id | UUID(FK) | ✅ | 법인 |
| expense_type | VARCHAR(30) | ✅ | dock_charge/shuttle/customs_fee/transport/storage/handling/surcharge/lc_fee/lc_acceptance/telegraph/other |
| amount | DECIMAL(12,0) | ✅ | 금액 (원) |
| vat | DECIMAL(12,0) | | 부가세 (원) |
| total | DECIMAL(12,0) | ✅ | 합계 (원) |
| vendor | VARCHAR(50) | | 거래처 (블루오션에어 등) |
| memo | TEXT | | |

※ bl_id 또는 month 둘 중 하나는 있어야 함. Buyer's Usance 사용 중 (이자 별도 없음).

---

### 4.5 수주/수금 모듈

#### 수주 (판매 발주서 접수)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| order_id | UUID | ✅ | PK |
| order_number | VARCHAR(30) | | 발주번호 (NULL 가능 — 유선 접수 시) |
| company_id | UUID(FK) | ✅ | 판매 법인 |
| customer_id | UUID(FK) | ✅ | 거래처 |
| order_date | DATE | ✅ | 수주일 |
| receipt_method | VARCHAR(20) | ✅ | purchase_order/phone/email/other |
| product_id | UUID(FK) | ✅ | 품번 |
| quantity | INTEGER | ✅ | 수량(장) |
| capacity_kw | DECIMAL(10,3) | | 용량(kW) |
| unit_price_wp | DECIMAL(10,2) | ✅ | Wp당 판매단가 (원/Wp) |
| site_name | VARCHAR(100) | | 현장명 |
| site_address | VARCHAR(200) | | 현장주소 |
| site_contact | VARCHAR(50) | | 현장담당자 |
| site_phone | VARCHAR(20) | | 연락처 |
| payment_terms | VARCHAR(100) | | 결제조건 (자유입력) |
| deposit_rate | DECIMAL(5,2) | | 계약금 비율 (%) |
| delivery_due | DATE | | 납기 요청일 |
| shipped_qty | INTEGER | | 출고 완료 수량 (자동) |
| remaining_qty | INTEGER | | 잔량 (자동 = quantity - shipped_qty) |
| status | VARCHAR(20) | ✅ | received/partial/completed/cancelled |
| spare_qty | INTEGER | | 스페어 수량 |
| memo | TEXT | | |

- management_category: sale/construction/spare/repowering/maintenance/other (D-015)
- fulfillment_source: stock/incoming — 미착품 충당 수주 구분 (D-015)

분할출고: 1 수주 → N 출고 (잔량 자동 계산)

#### 수금 (입금 등록 + 매칭)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| receipt_id | UUID | ✅ | PK |
| customer_id | UUID(FK) | ✅ | 거래처 |
| receipt_date | DATE | ✅ | 입금일 |
| amount | DECIMAL(15,0) | ✅ | 입금액 (원) |
| bank_account | VARCHAR(50) | | 입금 계좌 |
| memo | TEXT | | |

#### 수금 매칭
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| match_id | UUID | ✅ | PK |
| receipt_id | UUID(FK) | ✅ | 수금 연결 |
| outbound_id | UUID(FK) | ✅ | 출고/매출 연결 |
| matched_amount | DECIMAL(15,0) | ✅ | 매칭 금액 |

#### 수금 매칭 화면 동작 상세
1. 입금 등록: 거래처 + 금액 + 입금일
2. 해당 거래처 미수금 목록 자동 표시 (출고일, 현장명, 모듈명, 금액)
3. 사용자가 체크박스로 선택 → 하단에 "선택 합계" 실시간 변동
4. 합계가 입금액에 맞으면 [매칭 확정]
5. 차액: 선수금 / 다음 정산 이월 선택

---

### 4.6 출고/판매 모듈

#### 출고 등록 (재고 즉시 차감)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| outbound_id | UUID | ✅ | PK |
| outbound_date | DATE | ✅ | 출고일 |
| company_id | UUID(FK) | ✅ | 출고 법인 |
| product_id | UUID(FK) | ✅ | 품번 |
| quantity | INTEGER | ✅ | 수량(장) |
| capacity_kw | DECIMAL(10,3) | | 용량(kW) |
| warehouse_id | UUID(FK) | ✅ | 출고 창고 |
| status | VARCHAR(20) | ✅ | active/cancel_pending/cancelled (D-013, 3단계 취소) |
| usage_category | VARCHAR(20) | ✅ | sale/construction/spare/replacement/repowering/transfer/adjustment |
| order_id | UUID(FK) | | 수주 연결 |
| site_name | VARCHAR(100) | | 목적지/현장명 |
| site_address | VARCHAR(200) | | 현장주소 |
| spare_qty | INTEGER | | 스페어 수량 |
| group_trade | BOOLEAN | | 그룹내 거래 여부 |
| target_company_id | UUID(FK) | | 그룹내 거래 시 상대법인 |
| erp_outbound_no | VARCHAR(20) | | 아마란스 출고번호 |
| memo | TEXT | | |

- usage_category 9개 (D-014, ERP 1881건 기반): sale/sale_spare/construction/construction_damage/maintenance/disposal/transfer/adjustment/other

#### 매출 등록 (판매 시)
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| sale_id | UUID | ✅ | PK |
| outbound_id | UUID(FK) | ✅ | 출고 연결 |
| customer_id | UUID(FK) | ✅ | 거래처 |
| unit_price_wp | DECIMAL(10,2) | ✅ | **Wp당 판매단가 — 핵심 입력값** |
| unit_price_ea | DECIMAL(12,0) | | EA당 단가 (자동) |
| supply_amount | DECIMAL(15,0) | | 공급가 (자동) |
| vat_amount | DECIMAL(15,0) | | 부가세 (자동) |
| total_amount | DECIMAL(15,0) | | 합계 (자동) |
| tax_invoice_date | DATE | | 세금계산서 발행일 (직접 지정) |
| tax_invoice_email | VARCHAR(100) | | 발행 메일 |
| erp_closed | BOOLEAN | | ERP 마감 여부 |
| erp_closed_date | DATE | | ERP 마감일 |
| memo | TEXT | | |

세금계산서: 출고일과 발행일이 다를 수 있음 (다음달 발행 가능)

---

### 4.7 재고/분석 모듈

#### 재고 3단계 (Rust 계산)
```
물리적 재고 = 입고완료 합계 - 출고완료 합계
가용재고   = 물리적 재고 - 예약(수주잔량) - 배정(공사투입예정)
총 확보량  = 가용재고 + 미착품(PO잔량, 해상운송 중)
```

### 재고 집계 공식 (확정)
- 물리적 = 입고(completed/erp_done) - 출고(active)
- 예약 = fulfillment_source=stock + sale/spare/maintenance/other 수주잔량
- 배정 = fulfillment_source=stock + construction/repowering 수주잔량
- 가용재고 = 물리적 - 예약 - 배정
- 미착품 = PO(contracted/shipping) 잔량 - 해당PO 입고완료
- 미착품예약 = fulfillment_source=incoming 수주잔량
- 가용미착품 = 미착품 - 미착품예약
- 총확보량 = 가용재고 + 가용미착품

재고 정렬: 제조사 → 모듈크기(mm) → 출력(Wp)

#### 장기재고
- 0~6개월: 정상
- 6~12개월: 🟡 장기재고
- 12개월+: 🔴 초장기재고

#### 월별 수급 전망 (6개월, Rust 계산)

| 월 | 기초재고 | 입고예정 | 출고(공사) | 출고(판매) | 기말재고 | 가용재고 |
|----|---------|---------|-----------|-----------|---------|---------|
| 자동 | 전월 기말 | PO 선적스케줄 | 프로젝트 배정 | 수주 잔량 | 자동 | 기말-예약-배정 |

- 품번별(제조사+규격) 각각 생성
- 법인 전체 합산 + 법인별 분리 가능

#### LC 한도 복원 타임라인 (Rust 계산)
```
3월       4월         5월         6월
──┼──────────┼──────────┼──────────
  │          │ 5/19 하나 +$1.15M (LC만기결제)
  │          │ 5/26 산업 +$2.31M
  │          │ 5/27 하나 +$2.04M
  │          │          │ 6/5 광주 +$1.27M
현재 가용: $3.43M → 5월말: $8.93M → 6월말: $12.05M
```
법인별 표시, 3개 법인 통합 요약, 보고서+엑셀 다운로드

- 수수료 공식: 개설수수료 = amount x rate x exchange_rate, 인수수수료 = amount x rate x days/360 x exchange_rate
- fee_note: "요율 기반 자동 계산 예상 금액" (D-030)
- 한도 복원: maturity_date 기준 (D-028)

#### 분석 뷰
1. 제조사별·규격별 이익률 분석 (가중평균)
2. 거래처별 매출/수금 분석 (미수금, 평균결제일)
3. 단가 추이 차트 (분기별)
4. 월별 매출/마진
5. 재고 회전율

#### 운영 수요 계획 (module_demand_forecasts)
수주/출고 전 단계의 공사 예정 또는 유통 보정 수요를 월별·규격별로 수동 입력한다.

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| forecast_id | UUID | ✅ | PK |
| company_id | UUID(FK) | ✅ | 법인 |
| site_id | UUID(FK) | | 현장 마스터 연결 |
| site_name | VARCHAR | ✅ | 현장명 |
| demand_month | CHAR(7) | ✅ | YYYY-MM |
| demand_type | VARCHAR | ✅ | construction / distribution_adjustment / other |
| manufacturer_id | UUID(FK) | | 선호 제조사 |
| spec_wp | INTEGER | ✅ | 규격 Wp |
| module_width_mm | INTEGER | ✅ | 모듈 가로 |
| module_height_mm | INTEGER | ✅ | 모듈 세로 |
| required_kw | DECIMAL | ✅ | 필요 용량 kW |
| status | VARCHAR | ✅ | planned / confirmed / done / cancelled |

---

### 4.8 은행/LC 한도 관리

#### 한도 변경 이력
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| limit_change_id | UUID | ✅ | PK |
| bank_id | UUID(FK) | ✅ | 은행 |
| change_date | DATE | ✅ | 변경일 |
| previous_limit | DECIMAL(15,2) | ✅ | 이전 한도 |
| new_limit | DECIMAL(15,2) | ✅ | 변경 한도 |
| reason | VARCHAR(100) | | 사유 |

LC 한도 현황 화면: 법인별→은행별 한도/개설잔액/가용한도/사용률, 한도 복원 타임라인

---

### 4.9 대시보드 (역할별)

#### 경영진 대시보드
총 재고(MW), 가용재고, 미착품, 총 확보량, 월 매출/마진/마진율, 미수금, LC 가용한도, 장기재고, 법인별 요약, 단가 추이 차트

#### 관리자 대시보드
재고 중심 (실재고 vs 가용, 예약/배정 드릴다운), 오늘의 알림, 미착품+입고예정, 수주잔량, 미수금 상세, 검색창

#### 알림 트리거 조건

| 알림 유형 | 트리거 조건 | 표시 |
|----------|-----------|------|
| LC 만기 임박 | 만기일 7일 이내 | 🔴 |
| 미수금 주의 | 결제예정일 30일 초과 | 🟡 |
| 미수금 연체 | 결제예정일 60일 초과 | 🔴 |
| 세금계산서 미발행 | 출고 완료 + 미등록 건 전체 | 📋 목록 |
| 입항 예정 | ETA 7일 이내 | 🚢 |
| 장기재고 주의 | 입고일 180일 초과 | 🟡 |
| 장기재고 심각 | 입고일 365일 초과 | 🔴 |
| 출고 예정 | 납기요청일 7일 이내 미출고 | 📦 |

※ 세금계산서: 기간 기준 아님, 미발행 건 목록 (출고월 넘겨서 다음달 발행 가능)

---

### 4.10 공통 기능

#### 엑셀 Import/Export (핵심)

**데이터 흐름:**
```
1. SolarFlow에서 빈 엑셀 양식 다운로드 (드롭다운 포함: 제조사, 창고, 거래처 목록)
2. 실무자가 엑셀에 입력 (원본은 실무자 PC에 보관 — SolarFlow 다운 시 안전장치)
3. SolarFlow에 업로드 → 서버 검증 → DB 저장
   검증: 필수 필드 누락, FK 존재 여부, 양수 체크, 허용값 체크
   에러: "3행: manufacturer_id가 존재하지 않습니다" 행별 에러 반환
4. SolarFlow에서 아마란스10 양식 내보내기 → ERP 업로드
5. 웹 화면 직접 입력도 유지 (소량/긴급용)
```

양식 종류: 입고, 출고, 매출, 면장/원가, 부대비용, 수주, 수금

아마란스10 내보내기: 입고등록(34컬럼), 출고등록(35컬럼), 매출마감

#### 감사 로그

PO, LC, 출고, 매출은 생성/수정/삭제 요청을 모두 감사 로그로 남긴다.

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| audit_id | UUID | ✅ | PK |
| entity_type | VARCHAR(40) | ✅ | purchase_orders/lc_records/outbounds/sales |
| entity_id | UUID | ✅ | 대상 업무 데이터 ID |
| action | VARCHAR(20) | ✅ | create/update/delete |
| user_id | UUID | | 요청자 Supabase Auth uid |
| user_email | TEXT | | 요청자 이메일 |
| request_method | TEXT | | POST/PUT/DELETE |
| request_path | TEXT | | API 경로 |
| old_data | JSONB | | 변경 전 데이터 |
| new_data | JSONB | | 변경 후 데이터 |
| note | TEXT | | soft_cancel, excel_import 등 |
| created_at | TIMESTAMPTZ | ✅ | 기록 시각 |

운영 데이터 삭제 정책: PO/LC/출고/매출 DELETE는 실제 삭제가 아니라 `status='cancelled'` 취소 처리로 보존한다. `audit_logs.action='delete'`는 삭제 요청이 들어왔다는 의미이며, 업무 행은 이력 확인과 연결 추적을 위해 남긴다.

#### 결재안 자동 생성 (6유형)
1. **수입 모듈대금** — PI No., 은행, 품명, 금액, 부가세, 인수수수료, 전신료, LC No., 환율
2. **CIF 비용/제경비** — Contract, B/L, 품명·수량, ETD/ETA, 부대비용 항목별(금액+VAT)
3. **판매 세금계산서** — 거래처, 발전소별 내역(모델/수량/단가/금액/스페어), 발행일
4. **운송비 월정산** — 거래처, 기간, 차량별 톤수·대수·금액
5. **계약금 지출** — 제조사, 기존/변경 비교, 분납내역, 은행계좌(SWIFT)
6. **공사 현장 운송료** — 현장별 운송 내역

→ [클립보드 복사] 버튼으로 그룹웨어 붙여넣기

#### 자연어 검색 (Rust 검색 엔진)

- "진코 640 재고" → 재고수량 + 수입단가(¢/Wp) + 원화원가 + 최근판매가
- "진코 640 동일규격" → 같은 Wp 다른 제조사 비교, 크기(mm) 다르면 **"⚠ 모듈 크기가 다릅니다"** 경고
- "바로 3월 출고" → 바로 3월 출고 목록
- "LC 만기 이번달" → 이번 달 만기 LC + 금액 + 은행
- "라이젠 계약금" → 라이젠 PO + T/T 이력 + 잔여 계약금
- "미수금 60일" → 60일 초과 미수금 거래처 목록

- 키워드 패턴 매칭 7가지 의도 + fallback (D-044)
- 별칭 매핑: 제조사 15개 + 거래처 그룹 2개 (D-043, D-047)
- spec_wp 인식 범위: 400-900

검색 결과 클릭 → 해당 상세 화면으로 이동

#### 메모 기능
- 데이터 연결 메모: 모든 테이블의 memo 필드 (길이 제한 없음)
- 독립 메모장: 포스트잇 형태, 데이터 연결 가능, 자유메모 가능

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| note_id | UUID | ✅ | PK |
| user_id | UUID(FK) | ✅ | 작성자 |
| content | TEXT | ✅ | 메모 내용 (길이 제한 없음) |
| linked_table | VARCHAR(30) | | 연결 테이블명 |
| linked_id | UUID | | 연결 데이터 ID |
| created_at | TIMESTAMP | ✅ | |
| updated_at | TIMESTAMP | ✅ | |

#### 첨부파일 기능
업무 데이터에 PDF 등 근거 서류를 연결한다. 현재 B/L 상세의 서류 탭에서 사용하며, 공통 위젯으로 확장 가능하다.

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| file_id | UUID | ✅ | PK |
| entity_type | VARCHAR | ✅ | 연결 대상 종류 (예: bl_shipments) |
| entity_id | UUID | ✅ | 연결 대상 ID |
| file_type | VARCHAR | ✅ | 서류 유형 |
| original_name | VARCHAR | ✅ | 원본 파일명 |
| stored_name | VARCHAR | ✅ | 저장 파일명 |
| stored_path | TEXT | ✅ | 로컬 저장 경로 |
| content_type | VARCHAR | | MIME 타입 |
| size_bytes | BIGINT | ✅ | 파일 크기 |
| uploaded_by | UUID | | 업로드 사용자 |

#### 문서 OCR 워크벤치
업무 서류 이미지/PDF에서 PaddleOCR 원문 텍스트를 추출한다. OCR 결과는 즉시 DB에 저장하지 않고 사용자가 검토·수정할 수 있는 미리보기로 제공한다.

| 항목 | 내용 |
|------|------|
| API | `POST /api/v1/ocr/extract` |
| Health | `GET /api/v1/ocr/health`, `GET /api/v1/ocr/health?warm=1` |
| 입력 | multipart `images` 여러 개 (이미지/PDF) |
| 처리 | PaddleOCR/RapidOCR ONNX sidecar |
| 출력 | 파일별 원문 텍스트 + 줄별 신뢰도/좌표 + 파일별 오류 |
| 설치 | `scripts/setup_ocr_sidecar.sh`로 `backend/.venv-ocr` 런타임 구성 |
| 정책 | 원가/재고에 영향 주는 자동 저장은 금지, 입력폼 자동채움 후 검토·저장 |

수입필증/면장 PDF 자동채움:
- 입력: `document_type=customs_declaration`
- 후보 필드: B/L(AWB)번호, 입항일, 수입자, 운송주선인, 무역거래처, 국내도착항, 모델/규격, 수량, 단가, 금액(USD), CIF 원화금액, 환율
- 반영: B/L 입력/수정 폼의 B/L번호, 실제입항일, 포워더, 항구, 입고품목, 면장 CIF 원화금액, 환율을 자동 채움
- 보류: 수입자/무역거래처/HS/세관 등 현재 B/L 본문에 직접 저장하지 않는 값은 참고 요약으로 표시

---

## 5. 데이터 흐름 (엑셀 기반)

```
[구매 흐름]
PO 등록(엑셀) → T/T 계약금 → LC 개설(한도 차감)
→ 선적(B/L) → 입항 → 통관 → 면장(원가 확정)
→ 입고 등록(엑셀) → 부대비용 등록(엑셀)

[판매 흐름]
수주 접수(엑셀/유선) → 재고 예약(가용 차감)
→ 출고 등록(엑셀, 물리재고 차감) → 매출 등록(엑셀, Wp단가)
→ 세금계산서(엑셀) → ERP 마감(아마란스 내보내기)

[수금 흐름]
입금 등록(엑셀) → 미수금 목록에서 클릭 매칭 → 차액 처리

[그룹 내 거래]
탑솔라→디원 출고 → 디원 입고 자동 → 세금계산서 각각 수동

[엑셀 핵심 흐름]
SolarFlow 양식 다운로드 → 실무자 PC 입력(원본 보관)
→ SolarFlow 업로드(검증) → 아마란스 양식 내보내기 → ERP 업로드
```

---

## 6. UI/UX 화면 전환 설계

### 흐름 1: 입고 등록
```
[대시보드] → 입고 메뉴 → [입고 목록]
→ "엑셀 양식 다운로드" → PC에서 입력 → "엑셀 업로드" → 서버 검증
→ 성공: 목록 업데이트 + "N건 등록 완료"
→ 실패: 행별 에러 목록 → 수정 후 재업로드
→ [입고 상세] 클릭 → B/L 정보 + 라인아이템
→ [아마란스 내보내기] → 입고등록 엑셀 다운로드
```

### 흐름 2: 출고/판매 등록
```
[대시보드] → 출고 메뉴 → [출고 목록]
→ 양식 다운로드 → 입력(출고+매출 함께) → 업로드 → 검증+재고차감
→ [출고 상세] → 매출 정보 + 세금계산서 상태
→ [아마란스 내보내기] → 출고등록/매출마감 엑셀
```

### 흐름 3: 수금 매칭
```
[대시보드] → 수금 메뉴 → 입금 등록/업로드
→ 거래처 선택 → 미수금 목록 자동 표시
→ 체크박스 선택 → 합계 실시간 변동 → [매칭 확정]
→ 차액: 선수금/이월 선택
```

### 흐름 4: PO 상세 조회
```
[대시보드] → 발주 메뉴 → [PO 목록] → PO 클릭
→ [PO 상세]: 기본정보 + 라인아이템 + LC현황 + TT이력 + 입고현황
```

### 흐름 5: 재고 조회
```
[대시보드] → 재고 메뉴 → 제조사별 → 규격(mm)별
→ 실재고/예약/배정/가용재고 + 예약·배정 드릴다운
→ [미착품 탭] → [수급 전망 탭]
```

---

## 7. 초기 데이터 이관

SolarFlow 엑셀 Import 기능으로 일괄 업로드.
순서: 마스터 → 25년 입출고 → 26년 → 면장 → 현재 재고 스냅샷

---

## 8. 작업 순서 (확정)

### 작업 완료 현황
- Phase 1: Go 기초 보강 — 완료
- Phase 2: 핵심 거래 모듈 — 완료
- Phase 3: Rust 계산엔진 — 완료 (153개 테스트)
- Phase 4: 프론트엔드 + 연동 + 배포 — 완료
- 현재: 실데이터 이관 + 운영 기능 보강 + 실사용 검증

---

## 9. 향후 확장 (핵심 완성 후)

- 뉴스 피드: 제조사 관련 뉴스 RSS/검색 API
- 바로(유통사)용 별도 앱
- 인버터/전선 등 모듈 외 품목 확장
- 모바일 뷰 최적화

---

문서 끝.
