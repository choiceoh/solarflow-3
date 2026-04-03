import { useState } from 'react';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDate } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import CostTable from './CostTable';
import CostForm from './CostForm';
import LandedCostPanel from './LandedCostPanel';
import DeclarationForm from './DeclarationForm';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import { useDeclarationDetail, useCostDetailList } from '@/hooks/useCustoms';
import { fetchWithAuth } from '@/lib/api';
import type { DeclarationCost } from '@/types/customs';

interface Props {
  declarationId: string;
  onBack: () => void;
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}

export default function DeclarationDetailView({ declarationId, onBack }: Props) {
  const { data: decl, loading: declLoading, reload: reloadDecl } = useDeclarationDetail(declarationId);
  const { data: costs, loading: costsLoading, reload: reloadCosts } = useCostDetailList(declarationId);
  const [editDeclOpen, setEditDeclOpen] = useState(false);
  const [costFormOpen, setCostFormOpen] = useState(false);
  const [editCost, setEditCost] = useState<DeclarationCost | null>(null);
  const [landedStatus, setLandedStatus] = useState<'preview' | 'saved' | null>(null);

  if (declLoading || !decl) return <LoadingSpinner />;

  const handleUpdateDecl = async (data: Record<string, unknown>) => {
    await fetchWithAuth(`/api/v1/declarations/${declarationId}`, { method: 'PUT', body: JSON.stringify(data) });
    reloadDecl();
  };

  // 원가 API는 /api/v1/cost-details 사용 (지적 2번!)
  const handleCreateCost = async (data: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/cost-details', { method: 'POST', body: JSON.stringify(data) });
    reloadCosts();
  };

  const handleUpdateCost = async (data: Record<string, unknown>) => {
    if (!editCost) return;
    await fetchWithAuth(`/api/v1/cost-details/${editCost.cost_id}`, { method: 'PUT', body: JSON.stringify(data) });
    setEditCost(null);
    reloadCosts();
  };

  return (
    <div className="space-y-4">
      {/* 뒤로가기 */}
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />목록으로
      </Button>

      {/* 기본정보 카드 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="text-sm">면장 기본정보</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setEditDeclOpen(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />수정
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="면장번호" value={decl.declaration_number} />
            <Field label="B/L번호" value={decl.bl_number || decl.bl_id.slice(0, 8)} />
            <Field label="법인" value={decl.company_name || '—'} />
            <Field label="신고일" value={formatDate(decl.declaration_date)} />
            <Field label="입항일" value={decl.arrival_date ? formatDate(decl.arrival_date) : undefined} />
            <Field label="반출일" value={decl.release_date ? formatDate(decl.release_date) : undefined} />
            <Field label="HS코드" value={decl.hs_code || undefined} />
            <Field label="세관" value={decl.customs_office || undefined} />
            <Field label="항구" value={decl.port || undefined} />
            <Field label="메모" value={decl.memo || undefined} />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* 원가 라인아이템 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">원가 라인아이템 (3단계)</h3>
          <Button size="sm" onClick={() => { setEditCost(null); setCostFormOpen(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" />추가
          </Button>
        </div>

        {costsLoading ? <LoadingSpinner /> : (
          <CostTable
            items={costs}
            onEdit={(c) => { setEditCost(c); setCostFormOpen(true); }}
            landedStatus={landedStatus}
          />
        )}
      </div>

      <Separator />

      {/* Landed Cost 미리보기/저장 */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Landed Cost 계산</h3>
        <LandedCostPanel
          declarationId={declarationId}
          onRefresh={() => {
            reloadCosts();
            setLandedStatus('saved');
          }}
        />
      </div>

      {/* Dialog 폼 */}
      <DeclarationForm
        open={editDeclOpen}
        onOpenChange={setEditDeclOpen}
        onSubmit={handleUpdateDecl}
        editData={decl}
      />
      <LinkedMemoWidget linkedTable="declarations" linkedId={declarationId} />

      <CostForm
        open={costFormOpen}
        onOpenChange={setCostFormOpen}
        onSubmit={editCost ? handleUpdateCost : handleCreateCost}
        declarationId={declarationId}
        editData={editCost}
      />
    </div>
  );
}
