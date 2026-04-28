// 유형 2: CIF 비용/제경비 — B/L 선택 → 부대비용 조회 → 텍스트 생성
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import SearchableSelect, { type SearchableSelectOption } from '@/components/common/SearchableSelect';
import { useType2 } from '@/hooks/useApproval';
import { generateType2 } from '@/lib/approvalTemplates';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { manufacturerRankByName } from '@/lib/manufacturerPriority';
import { moduleLabel } from '@/lib/utils';
import type { Manufacturer } from '@/types/masters';
import { BL_STATUS_LABEL, type BLShipment, type BLLineItem } from '@/types/inbound';

interface Props { onGenerate: (text: string) => void }

type BLWithDetails = BLShipment & { line_items?: BLLineItem[] };

export default function Type2CIFExpense({ onGenerate }: Props) {
  const [blId, setBlId] = useState('');
  const [bls, setBls] = useState<BLWithDetails[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [blsLoading, setBlsLoading] = useState(true);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const { data, loading, generate } = useType2();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selectedCompanyId 변경 시 외부 API에서 BL 목록 fetch (loading 상태 동기화)
    if (!selectedCompanyId) { setBls([]); setBlsLoading(false); return; }
    setBlsLoading(true);
    Promise.all([
      fetchWithAuth<BLShipment[]>(`/api/v1/bls?company_id=${selectedCompanyId}`),
      fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers'),
    ])
      .then(async ([list, mfgs]) => {
        setManufacturers(mfgs.filter((m) => m.is_active));
        const details = await Promise.all(list.map(async (bl) => {
          try {
            return await fetchWithAuth<BLWithDetails>(`/api/v1/bls/${bl.bl_id}`);
          } catch {
            return bl;
          }
        }));
        setBls(details);
      })
      .catch(() => {
        setBls([]);
        setManufacturers([]);
      })
      .finally(() => setBlsLoading(false));
  }, [selectedCompanyId]);

  useEffect(() => {
    if (data) onGenerate(generateType2(data));
  }, [data, onGenerate]);

  const blOptions = useMemo<SearchableSelectOption[]>(() => {
    const mfgById = new Map(manufacturers.map((m) => [m.manufacturer_id, m]));
    const specOf = (bl: BLWithDetails) => bl.line_items?.find((line) => line.payment_type !== 'free')?.products?.spec_wp
      ?? bl.line_items?.[0]?.products?.spec_wp
      ?? null;
    const mfgNameOf = (bl: BLWithDetails) => {
      const mfg = mfgById.get(bl.manufacturer_id);
      return mfg?.short_name?.trim() || mfg?.name_kr || bl.manufacturer_name || '';
    };

    return [...bls].sort((a, b) => {
      const rankDiff = manufacturerRankByName(mfgNameOf(a), manufacturers) - manufacturerRankByName(mfgNameOf(b), manufacturers);
      if (rankDiff !== 0) return rankDiff;
      const specDiff = (specOf(a) ?? 0) - (specOf(b) ?? 0);
      if (specDiff !== 0) return specDiff;
      return (a.bl_number ?? '').localeCompare(b.bl_number ?? '', 'ko', { numeric: true });
    }).map((bl) => {
      const spec = specOf(bl);
      const mfgName = mfgNameOf(bl);
      const modulePart = moduleLabel(mfgName, spec);
      const status = BL_STATUS_LABEL[bl.status] ?? bl.status;
      return {
        value: bl.bl_id,
        label: `${modulePart} · ${bl.bl_number} — ${status}`,
        keywords: [mfgName, spec, bl.bl_number, status, bl.po_number, bl.lc_number].filter(Boolean).join(' '),
      };
    });
  }, [bls, manufacturers]);

  return (
    <div className="space-y-4">
      <div>
        <Label>B/L 선택</Label>
        <SearchableSelect
          className="mt-1"
          options={blOptions}
          value={blId}
          onChange={setBlId}
          placeholder="B/L 선택..."
          searchPlaceholder="제조사, 규격, B/L번호 검색"
          disabled={blsLoading}
        />
      </div>
      <Button onClick={() => generate(blId)} disabled={!blId || loading} size="sm">
        {loading ? '생성 중...' : '결재안 생성'}
      </Button>
    </div>
  );
}
