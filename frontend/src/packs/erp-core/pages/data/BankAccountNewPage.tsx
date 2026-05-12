import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EditPageShell from '@/components/common/EditPageShell';
import { BankAccountFormBody } from '@/components/masters/BankAccountForm';
import { fetchWithAuth } from '@/lib/api';

const FORM_ID = 'bank-account-form';
const BACK_TO = '/data?kind=bank-accounts';

export default function BankAccountNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetchWithAuth('/api/v1/bank-accounts', { method: 'POST', body: JSON.stringify(data) });
      navigate(BACK_TO);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditPageShell
      eyebrow="DATA · 은행 계좌"
      title="계좌 등록"
      description="회사의 수금/지급 계좌를 등록합니다. 등록된 계좌는 수금 입력에서 선택할 수 있습니다."
      backTo={BACK_TO}
      formId={FORM_ID}
      saving={saving}
    >
      <BankAccountFormBody formId={FORM_ID} onSubmit={handleSubmit} />
    </EditPageShell>
  );
}
