# SolarFlow Frontend

React + Vite + TypeScript + Tailwind 기반 SolarFlow 업무 화면입니다.

## 역할

- 재고, 발주/결제, 입고, 면장/원가, 수주/수금, 출고/판매, 은행/LC, 대시보드 화면 제공
- Go API(`/api/v1/*`) 호출
- Supabase Auth 로그인 세션 관리
- 엑셀 양식 다운로드/업로드 미리보기, 아마란스 내보내기 UI
- 첨부파일 위젯, 메모, 검색, 결재안 생성 UI

## 주요 실행 명령

```bash
npm install
npm run dev
npm run build
npm run lint     # Biome 린트만
npm run format   # Biome 포맷만 (--write)
npm run check    # 린트 + 포맷 동시 (--write)
```

> 린트/포맷은 [Biome](https://biomejs.dev) 사용 (ESLint + ts-eslint에서 이관, ~10–30배 빠름).
> 설정: `biome.json`. CI에서는 `npm run ci` (Biome `ci` 모드, write 안 함).

## 환경변수

`.env.example` 기준:

```bash
VITE_SUPABASE_URL=https://aalxpmfnsjzmhsfkuxnp.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_API_URL=http://localhost:8080
```

## 운영 반영

Mac mini 운영 환경에서는 Caddy가 `frontend/dist/`를 정적 서빙합니다.

```bash
cd ~/solarflow-3/frontend
npm run build
```

개발 중에는 `npm run dev`를 사용할 수 있지만, 운영 반영 기준은 `npm run build`입니다.
