import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import EditPageShell from '@/components/common/EditPageShell';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { BankAccountFormBody } from '@/components/masters/BankAccountForm';
import { fetchWithAuth } from '@/lib/api';
import type { BankAccount } from '@/types/masters';

const FORM_ID = 'bank-account-form';
const BACK_TO = '/data?kind=bank-accounts';

export default function BankAccountEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editData, setEditData] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchWithAuth<BankAccount>(`/api/v1/bank-accounts/${id}`);
        if (!cancelled) setEditData(data);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '불러오기 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    if (!id) return;
    setSaving(true);
    try {
      await fetchWithAuth(`/api/v1/bank-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      navigate(BACK_TO);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner className="h-screen" />;
  if (loadError || !editData) {
    return (
      <EditPageShell eyebrow="DATA · 은행 계좌" title="계좌 수정" backTo={BACK_TO} formId={FORM_ID}>
        <p className="text-sm text-destructive">계좌 정보를 불러올 수 없습니다. {loadError ?? ''}</p>
      </EditPageShell>
    );
  }

  return (
    <EditPageShell
      eyebrow="DATA · 은행 계좌"
      title={`계좌 수정 — ${editData.bank_name} ${editData.account_number}`}
      backTo={BACK_TO}
      formId={FORM_ID}
      saving={saving}
    >
      <BankAccountFormBody formId={FORM_ID} editData={editData} onSubmit={handleSubmit} />
    </EditPageShell>
  );
}
