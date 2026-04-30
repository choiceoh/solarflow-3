// 결재안 자동 생성 페이지 (Step 30)
// 6유형 카드 → 데이터 선택 → 텍스트 생성 → 미리보기/수정/복사

import { useState, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/stores/appStore';
import { MasterConsole } from '@/components/command/MasterConsole';
import { RailBlock, Sparkline } from '@/components/command/MockupPrimitives';
import type { ApprovalType } from '@/types/approval';
import { APPROVAL_TYPE_LABEL } from '@/types/approval';
import ApprovalTypeSelector from '@/components/approval/ApprovalTypeSelector';
import ApprovalGenerator from '@/components/approval/ApprovalGenerator';
import ApprovalPreview from '@/components/approval/ApprovalPreview';

export default function ApprovalPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [selectedType, setSelectedType] = useState<ApprovalType | null>(null);
  const [generatedText, setGeneratedText] = useState('');
  const [editedText, setEditedText] = useState('');

  const handleGenerate = useCallback((text: string) => {
    setGeneratedText(text);
    setEditedText(text);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedType(null);
    setGeneratedText('');
    setEditedText('');
  }, []);

  if (!selectedCompanyId) {
    return (
      <div className="sf-page">
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          법인을 먼저 선택해주세요.
        </div>
      </div>
    );
  }

  return (
    <MasterConsole
      eyebrow="APPROVAL STUDIO"
      title={selectedType ? `결재안: ${APPROVAL_TYPE_LABEL[selectedType]}` : '결재안 자동 생성'}
      description="수입대금, 부대비용, 세금계산서, 운송비 결재 문안을 실제 업무 데이터에서 생성합니다."
      tableTitle={selectedType ? '데이터 선택 · 미리보기' : '결재 유형 선택'}
      tableSub={selectedType ? `${editedText.length.toLocaleString()}자 편집 중` : '6개 표준 유형'}
      actions={
        selectedType ? (
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
            유형 선택
          </Button>
        ) : null
      }
      metrics={[
        { label: '유형', value: selectedType ? '1' : '6', sub: selectedType ? APPROVAL_TYPE_LABEL[selectedType] : '자동 생성 카드', tone: 'solar', spark: [2, 3, 4, 5, 6] },
        { label: '원문', value: generatedText.length.toLocaleString(), unit: '자', sub: generatedText ? '생성 완료' : '생성 전', tone: generatedText ? 'pos' : 'ink' },
        { label: '편집본', value: editedText.length.toLocaleString(), unit: '자', sub: editedText && editedText !== generatedText ? '수정됨' : '동기화', tone: editedText ? 'info' : 'ink' },
        { label: '복사 준비', value: editedText ? 'OK' : '—', sub: '미리보기 생성 후', tone: editedText ? 'warn' : 'ink' },
      ]}
      rail={
        <>
          <RailBlock title="결재 흐름" accent="var(--solar-3)" count={selectedType ? '작성 중' : '대기'}>
            <div className="space-y-2 text-[11px] leading-5 text-[var(--ink-3)]">
              <p>유형 선택 → 데이터 조회 → 문안 생성 → 미리보기 수정 → 복사 순서로 진행합니다.</p>
              <Sparkline data={[10, 16, 14, 22, 28, 34]} color="var(--solar-3)" area />
            </div>
          </RailBlock>
          <RailBlock title="현재 유형" count={selectedType ? APPROVAL_TYPE_LABEL[selectedType] : '미선택'}>
            <div className="text-[11px] leading-5 text-[var(--ink-3)]">
              생성된 문안은 자동 저장하지 않고, 사용자가 확인한 텍스트만 복사해서 사용합니다.
            </div>
          </RailBlock>
        </>
      }
    >
      {!selectedType ? (
        <ApprovalTypeSelector selected={selectedType} onSelect={setSelectedType} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 왼쪽: 데이터 선택 + 생성 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">데이터 선택</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalGenerator type={selectedType} onGenerate={handleGenerate} />
            </CardContent>
          </Card>

          {/* 오른쪽: 미리보기 + 수정 + 복사 */}
          {editedText && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">미리보기</CardTitle>
              </CardHeader>
              <CardContent>
                <ApprovalPreview
                  text={editedText}
                  originalText={generatedText}
                  onTextChange={setEditedText}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </MasterConsole>
  );
}
