import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EditPageShell from '@/components/common/EditPageShell';
import { ProductFormBody } from '@/components/masters/ProductForm';
import { fetchWithAuth } from '@/lib/api';

const FORM_ID = 'product-form';
const BACK_TO = '/data?kind=products';

export default function ProductNewPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetchWithAuth('/api/v1/products', { method: 'POST', body: JSON.stringify(data) });
      navigate(BACK_TO);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditPageShell
      eyebrow="DATA · 품번"
      title="품번 등록"
      description="새로운 품번 기준정보를 등록합니다."
      backTo={BACK_TO}
      formId={FORM_ID}
      saving={saving}
    >
      <ProductFormBody formId={FORM_ID} onSubmit={handleSubmit} />
    </EditPageShell>
  );
}
