import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EditPageShell from '@/components/common/EditPageShell';
import { PartnerFormBody, type PartnerFormData } from '@/components/masters/PartnerForm';
import { fetchWithAuth } from '@/lib/api';

const FORM_ID = 'partner-form';
const BACK_TO = '/data?kind=partners';

export default function PartnerNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (data: PartnerFormData) => {
    setSaving(true);
    try {
      await fetchWithAuth('/api/v1/partners', { method: 'POST', body: JSON.stringify(data) });
      navigate(BACK_TO);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditPageShell
      eyebrow="DATA · 거래처"
      title="거래처 등록"
      description="새로운 거래처 기준정보를 등록합니다."
      backTo={BACK_TO}
      formId={FORM_ID}
      saving={saving}
    >
      <PartnerFormBody formId={FORM_ID} onSubmit={handleSubmit} />
    </EditPageShell>
  );
}
