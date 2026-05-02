// Phase 4 보강: MetaForm 의존성·동적 옵션·다중선택·파일·동적정적옵션 데모 페이지
// 다섯 기능 동시 시연:
//   1) visibleIf — has_warranty 체크 시 warranty_months 노출
//   2) optionsDependsOn — domestic_filter 값에 따라 manufacturer_id 옵션 변경
//   3) multiselect — features 체크박스 다중 선택
//   4) file — product_image 파일 첨부
//   5) staticOptionsIf — delivery_type 값에 따라 delivery_slot 옵션 분기
//
// 저장 흐름은 콘솔 로그로만 — 실 데이터 저장 없음 (UI 데모 전용).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import MetaForm from '@/templates/MetaForm';
import depsDemoConfig from '@/config/forms/deps_demo';

export default function MetaFormDepsDemoPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  const handleSubmit = async (data: Record<string, unknown>) => {
    // File 객체는 직접 직렬화 안 됨 — 표시용으로 메타정보만 추출
    const display: Record<string, unknown> = {};
    Object.entries(data).forEach(([k, v]) => {
      if (v instanceof File) display[k] = `File(${v.name}, ${v.size}B)`;
      else display[k] = v;
    });
    setSubmitted(display);
    console.log('[deps-demo] submit', data);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
        <div className="font-semibold mb-1">PoC · Phase 4 보강 — MetaForm 의존성·동적 옵션 데모</div>
        <p>
          MetaForm 두 인프라 기능을 한 폼에서 시연합니다:
        </p>
        <ul className="mt-2 list-disc pl-4 space-y-1">
          <li><b>visibleIf</b> — "보증 포함" 스위치 ON 시 "보증 개월 수" 필드 노출</li>
          <li><b>optionsDependsOn</b> — "제조사 범위" 변경 시 "제조사" 셀렉트 옵션이 즉시 필터됨</li>
          <li><b>multiselect</b> — "제품 특성" 체크박스 다중 선택 (값은 string[])</li>
          <li><b>staticOptionsIf</b> — "배송 방식" 변경 시 "시간대" 옵션이 분기 (택배/픽업)</li>
          <li><b>file</b> — "제품 이미지" 파일 첨부 (File 객체 캡처)</li>
          <li><b>masterSource.search</b> — "연관 제품" combobox (디바운스 300ms, 입력 시 백엔드 검색 호출 — 대용량 옵션 처리)</li>
          <li><b>computed</b> — "총액" 자동 계산 (수량 × 단가, readonly + payload 포함)</li>
          <li><b>extraPayload</b> — submit 시 자동 첨가 (static <code>form_kind</code> + fromStore <code>company_id</code>)</li>
          <li><b>dialogSize='lg'</b> — 더 넓은 다이얼로그 (3컬럼 행 표현 가능)</li>
        </ul>
        <p className="mt-2">제출은 콘솔 로그만 — 저장 없음.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => { setOpen(true); setSubmitted(null); }}>다이얼로그 다시 열기</Button>
        <Button size="sm" variant="outline" onClick={() => navigate('/')}>홈</Button>
      </div>

      {submitted && (
        <pre className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs overflow-auto">
{JSON.stringify(submitted, null, 2)}
        </pre>
      )}

      <MetaForm
        config={depsDemoConfig}
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
