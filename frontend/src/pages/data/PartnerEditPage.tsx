import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { PartnerFormBody, type PartnerFormData } from '@/components/masters/PartnerForm';
import PartnerActivityPanel from '@/components/partners/PartnerActivityPanel';
import { fetchWithAuth } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Partner } from '@/types/masters';

const FORM_ID = 'partner-form';
const BACK_TO = '/data?kind=partners';

type TabKey = 'info' | 'activity';

export default function PartnerEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') === 'activity' ? 'activity' : 'info') as TabKey;
  const [tab, setTab] = useState<TabKey>(initialTab);

  const [editData, setEditData] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchWithAuth<Partner>(`/api/v1/partners/${id}`);
        if (!cancelled) setEditData(data);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '불러오기 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleTabChange = (next: TabKey) => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'activity') params.set('tab', 'activity');
    else params.delete('tab');
    setSearchParams(params, { replace: true });
  };

  const handleSubmit = async (data: PartnerFormData) => {
    if (!id) return;
    setSaving(true);
    try {
      await fetchWithAuth(`/api/v1/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      navigate(BACK_TO);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner className="h-screen" />;

  return (
    <div className="sf-page">
      <div className="sf-page-header">
        <div className="min-w-0">
          <div className="sf-eyebrow">DATA · 거래처</div>
          <h1 className="sf-page-title">
            {editData ? `거래처 수정 — ${editData.partner_name}` : '거래처 수정'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(BACK_TO)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />뒤로
          </Button>
        </div>
      </div>

      <div className="card mx-auto w-full max-w-2xl p-6">
        <div className="mb-4 flex gap-1 border-b border-[var(--line)]">
          <TabButton active={tab === 'info'} onClick={() => handleTabChange('info')}>
            정보
          </TabButton>
          <TabButton active={tab === 'activity'} onClick={() => handleTabChange('activity')}>
            활동
          </TabButton>
        </div>

        {loadError || !editData ? (
          <p className="text-sm text-destructive">거래처 정보를 불러올 수 없습니다. {loadError ?? ''}</p>
        ) : tab === 'info' ? (
          <>
            <PartnerFormBody formId={FORM_ID} editData={editData} onSubmit={handleSubmit} />
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-[var(--line)] pt-4">
              <Button type="button" variant="outline" onClick={() => navigate(BACK_TO)} disabled={saving}>
                취소
              </Button>
              <Button type="submit" form={FORM_ID} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </>
        ) : (
          <PartnerActivityPanel partnerId={editData.partner_id} />
        )}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
        active
          ? 'border-primary text-foreground font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
