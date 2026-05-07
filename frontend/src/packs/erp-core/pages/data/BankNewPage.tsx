import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EditPageShell from '@/components/common/EditPageShell';
import { BankFormBody } from '@/components/masters/BankForm';
import { fetchWithAuth } from '@/lib/api';

const FORM_ID = 'bank-form';
const BACK_TO = '/data?kind=banks';

export default function BankNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetchWithAuth('/api/v1/banks', { method: 'POST', body: JSON.stringify(data) });
      navigate(BACK_TO);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditPageShell
      eyebrow="DATA · 은행"
      title="은행 등록"
      description="새로운 은행 한도/수수료 기준정보를 등록합니다."
      backTo={BACK_TO}
      formId={FORM_ID}
      saving={saving}
    >
      <BankFormBody formId={FORM_ID} onSubmit={handleSubmit} />
    </EditPageShell>
  );
}
