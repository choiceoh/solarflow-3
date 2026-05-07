import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EditPageShell from '@/components/common/EditPageShell';
import { WarehouseFormBody, type WarehouseFormData } from '@/components/masters/WarehouseForm';
import { fetchWithAuth } from '@/lib/api';

const FORM_ID = 'warehouse-form';
const BACK_TO = '/data?kind=warehouses';

export default function WarehouseNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (data: WarehouseFormData) => {
    setSaving(true);
    try {
      await fetchWithAuth('/api/v1/warehouses', { method: 'POST', body: JSON.stringify(data) });
      navigate(BACK_TO);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditPageShell
      eyebrow="DATA · 창고"
      title="창고 등록"
      description="새로운 창고 기준정보를 등록합니다."
      backTo={BACK_TO}
      formId={FORM_ID}
      saving={saving}
    >
      <WarehouseFormBody formId={FORM_ID} onSubmit={handleSubmit} />
    </EditPageShell>
  );
}
