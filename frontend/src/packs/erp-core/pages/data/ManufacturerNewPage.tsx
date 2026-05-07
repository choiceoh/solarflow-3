import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EditPageShell from '@/components/common/EditPageShell';
import { ManufacturerFormBody, type ManufacturerFormData } from '@/components/masters/ManufacturerForm';
import { fetchWithAuth } from '@/lib/api';

const FORM_ID = 'manufacturer-form';
const BACK_TO = '/data?kind=manufacturers';

export default function ManufacturerNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (data: ManufacturerFormData) => {
    setSaving(true);
    try {
      await fetchWithAuth('/api/v1/manufacturers', { method: 'POST', body: JSON.stringify(data) });
      navigate(BACK_TO);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditPageShell
      eyebrow="DATA · 제조사"
      title="제조사 등록"
      description="새로운 제조사 기준정보를 등록합니다."
      backTo={BACK_TO}
      formId={FORM_ID}
      saving={saving}
    >
      <ManufacturerFormBody formId={FORM_ID} onSubmit={handleSubmit} />
    </EditPageShell>
  );
}
