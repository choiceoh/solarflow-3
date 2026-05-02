// Phase 4 — Inbound Step 3 final: BLForm 메타 v2 로 완전 교체
// ListScreen 이 list / filter / metric / rail / form (BLFormV2 + saveBLShipmentWithLines submitter)
// 모두 처리. InboundPage 는 사실상 thin wrapper.
//
// Trade-off: 기존 페이지-레벨 OCR 드롭 (드롭 어디서나 → 폼 자동 열기) 은 잃음.
// 대신 BL 메타 폼 안에 OCR 위젯이 있어서 폼 안에서 드롭 가능 (BLOcrWidget).

import { useAppStore } from '@/stores/appStore';
import ListScreen from '@/templates/ListScreen';
import inboundConfig from '@/config/screens/inbound';

export default function InboundPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  return <ListScreen config={inboundConfig} />;
}
