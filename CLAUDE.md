# SolarFlow 3.0 — Claude Code 작업 안내

## 읽기 순서
이 프로젝트에서 작업하기 전에 아래 순서로 읽으세요:
1. harness/PROGRESS.md — 현재 위치 확인 (이것만 읽으면 지금 어디인지 파악)
2. harness/RULES.md — 개발 규칙 + 감리 교훈 (헌법)
3. harness/AGENTS.md — 역할 정의 (시공자/감리자/Alex)
4. harness/SolarFlow_설계문서_통합판.md — 유일한 설계 정본
5. harness/DECISIONS.md — 설계 판단 기록 (왜 이렇게 했는지)
6. 할당된 TASK 파일

## 프로젝트 구조
- backend/ — Go API 게이트웨이 (chi v5, 포트 8080, fly.io solarflow-backend)
- engine/ — Rust 계산엔진 (Axum 0.8.8, 포트 8081, fly.io solarflow-engine)
- frontend/ — React + Vite + TypeScript + Tailwind (Phase 4, Cloudflare Pages)
- harness/ — 하네스 파일 (규칙, 설계, 판단 기록)

## 핵심 원칙
1. 설계문서 통합판이 유일한 정본. 임의 변경 금지.
2. Go+Rust 분리: 한 행 사칙연산=Go, 여러 테이블 조합=Rust.
3. CHECKLIST_TEMPLATE.md 양식으로 보고.
4. 커밋은 작업 단위별.
5. Rust 담당 로직에 // TODO: Rust 계산엔진 연동 주석 필수.

## DB 연결
- Supabase PostgreSQL (Session pooler, 포트 5432)
- Go 풀 약5개, Rust 풀 5개
- 프로젝트: aalxpmfnsjzmhsfkuxnp.supabase.co
