import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { Company } from '@/types/masters';

export default function CompanySelector() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const { selectedCompanyId, setCompanyId } = useAppStore();

  useEffect(() => {
    fetchWithAuth<Company[]>('/api/v1/companies')
      .then((list) => setCompanies(list.filter((c) => c.is_active)))
      .catch(() => {});
  }, []);

  return (
    <Select value={selectedCompanyId || 'all'} onValueChange={(v) => setCompanyId(v)}>
      <SelectTrigger className="h-8 w-40 text-xs">
        <SelectValue placeholder="법인 선택" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">전체</SelectItem>
        {companies.map((c) => (
          <SelectItem key={c.company_id} value={c.company_id}>
            {c.company_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
