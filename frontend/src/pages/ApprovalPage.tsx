// 결재안 자동 생성 페이지 (Step 30)
// 6유형 카드 → 데이터 선택 → 텍스트 생성 → 미리보기/수정/복사

import { useState, useCallback } from 'react';
import { FileText, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/stores/appStore';
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
      <div className="p-6">
        <h1 className="text-xl font-bold flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5" />결재안 자동 생성
        </h1>
        <p className="text-sm text-muted-foreground">법인을 먼저 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        {selectedType && (
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {selectedType ? `결재안: ${APPROVAL_TYPE_LABEL[selectedType]}` : '결재안 자동 생성'}
        </h1>
      </div>

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
    </div>
  );
}
