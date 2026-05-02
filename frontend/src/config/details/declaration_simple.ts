// Phase 4 보강: 면장(declarations) 상세 — MetaDetail 두 번째 도메인 적용
// ───────────────────────────────────────────────────────────────────────────
// DeclarationDetailView.tsx (199줄) 분석 결과 메타로 표현 가능한 영역은
// 면장 기본정보 카드(이 파일)가 약 60%. 나머지는 코드 영역.
//
// 메타 가능 (이 파일):
//   - 기본 정보 (면장번호·B/L번호·법인·신고일·입항일·반출일·HS코드·세관·항구·메모)
//
// 메타 불가 — 코드 영역:
//   - 헤더 워크플로우 (수정·삭제 버튼 + ConfirmDialog)
//   - 원가 라인아이템 (CostTable + CostForm CRUD)
//   - Landed Cost 계산 패널 (LandedCostPanel — 미리보기/저장 토글)
//   - 첨부 메모 위젯 (LinkedMemoWidget)
// ───────────────────────────────────────────────────────────────────────────

import type { MetaDetailConfig } from '@/templates/types';

const declarationDetailSimple: MetaDetailConfig = {
  id: 'declaration_detail_simple',
  source: { hookId: 'useDeclarationDetail' },
  header: {
    title: '면장 상세 (메타 한계선 데모)',
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        { key: 'declaration_number', label: '면장번호' },
        { key: 'bl_number', label: 'B/L번호' },
        { key: 'company_name', label: '법인' },
        { key: 'declaration_date', label: '신고일', formatter: 'date' },
        { key: 'arrival_date', label: '입항일', formatter: 'date' },
        { key: 'release_date', label: '반출일', formatter: 'date' },
        { key: 'hs_code', label: 'HS코드' },
        { key: 'customs_office', label: '세관' },
        { key: 'port', label: '항구' },
        // memo는 값 있을 때만 표시
        {
          key: 'memo', label: '메모', span: 4,
          visibleIf: { field: 'memo', value: '__truthy' },
        },
      ],
    },
  ],
};

export default declarationDetailSimple;
