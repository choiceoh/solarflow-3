# SolarFlow 3.0 — 프로젝트 진행 상태

> 새 Claude 대화 시작 시: "SolarFlow 3.0 작업 계속합니다. STATUS.md 확인해주세요."

---

## 📍 현재 위치

| 항목 | 상태 |
|------|------|
| **현재 단계** | Phase 1 — 기초 공사 (마스터 관리) |
| **마지막 작업** | Step 3 완료 — 마스터 6개 CRUD API 전체 동작 확인 |
| **다음 할 일** | Step 4 — 프론트엔드 마스터 관리 화면 |
| **마지막 업데이트** | 2026-03-28 21:15 |

---

## 🏗️ Phase 1: 기초 공사 (마스터 관리)

### Step 0: 인프라 배포 ✅ 완료
### Step 1: DB 마스터 테이블 ✅ 완료
### Step 2: Go 백엔드 구조 ✅ 완료
### Step 3: 마스터 CRUD API ✅ 완료
- [x] 법인(companies) — CRUD + 상태토글
- [x] 제조사(manufacturers) — CRUD
- [x] 품번(products) — CRUD + 제조사필터 + 제조사JOIN
- [x] 거래처(partners) — CRUD + 타입필터
- [x] 창고(warehouses) — CRUD + 타입필터
- [x] 은행(banks) — CRUD + 법인필터 + 법인JOIN
- [x] fly.io 배포 + 전체 API 동작 확인

### Step 4: 프론트엔드 마스터 화면 ⬜ 다음

---

## 🔮 Phase 2: 핵심 거래 (발주~입고~출고)
## 🔮 Phase 3: 재고/분석/대시보드
## 🔮 Phase 4: 연동/고도화

---

## 🔧 인프라 정보

| 항목 | 값 |
|------|---|
| 프론트 URL | https://solarflow-3-frontend.pages.dev |
| 백엔드 URL | https://solarflow-backend.fly.dev |
| Supabase | aalxpmfnsjzmhsfkuxnp.supabase.co |
| GitHub (백엔드) | alexkim5294-blip/solarflow-3 |
| GitHub (프론트) | alexkim5294-blip/solarflow-3-frontend |
| 프로젝트 폴더 | ~/solarflow-3/backend (git), ~/solarflow-3/frontend (git) |

## 🌐 동작 중인 API (전체)

| 메서드 | 경로 | 설명 | 필터 |
|--------|------|------|------|
| GET | /health | 서버상태 | |
| GET/POST | /api/v1/companies | 법인 목록/등록 | |
| GET/PUT | /api/v1/companies/{id} | 법인 상세/수정 | |
| PATCH | /api/v1/companies/{id}/status | 활성토글 | |
| GET/POST | /api/v1/manufacturers | 제조사 목록/등록 | |
| GET/PUT | /api/v1/manufacturers/{id} | 제조사 상세/수정 | |
| GET/POST | /api/v1/products | 품번 목록/등록 | ?manufacturer_id=&active= |
| GET/PUT | /api/v1/products/{id} | 품번 상세/수정 | |
| GET/POST | /api/v1/partners | 거래처 목록/등록 | ?type=supplier/customer/both |
| GET/PUT | /api/v1/partners/{id} | 거래처 상세/수정 | |
| GET/POST | /api/v1/warehouses | 창고 목록/등록 | ?type=port/factory/vendor |
| GET/PUT | /api/v1/warehouses/{id} | 창고 상세/수정 | |
| GET/POST | /api/v1/banks | 은행 목록/등록 | ?company_id= |
| GET/PUT | /api/v1/banks/{id} | 은행 상세/수정 | |

## 🔑 기술 결정사항

| 결정 | 선택 | 이유 |
|------|------|------|
| Go HTTP 라우터 | chi v5 | 표준 net/http 호환, 깔끔한 라우팅 |
| DB 접근 | supabase-go | REST API 기반, 설정 간단 |
| DB | Supabase PostgreSQL | 무료 2개 제한, solarflow-2 재활용 |
| 호스팅 | Cloudflare Pages + fly.io | 배포 완료 |
| Supabase 키 | service_role | RLS 없이 전체 접근 (개발단계) |
