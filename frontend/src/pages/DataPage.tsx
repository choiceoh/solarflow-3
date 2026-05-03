import { useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type { Column } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { MasterConsole } from '@/components/command/MasterConsole';
import { FilterChips } from '@/components/command/MockupPrimitives';
import MasterSection, { type MasterSectionConfig } from '@/components/data/MasterSection';
import type { Manufacturer, Product, Partner, Warehouse, Bank } from '@/types/masters';
import { formatWp, formatSize, formatUSD, formatDate, formatPercent } from '@/lib/utils';

type DataKind =
  | 'manufacturers'
  | 'products'
  | 'partners'
  | 'warehouses'
  | 'banks'
  | 'construction-sites';

const KINDS: { key: DataKind; label: string }[] = [
  { key: 'manufacturers',      label: '제조사'   },
  { key: 'products',           label: '품번'     },
  { key: 'partners',           label: '거래처'   },
  { key: 'warehouses',         label: '창고'     },
  { key: 'banks',              label: '은행'     },
  { key: 'construction-sites', label: '공사현장' },
];

const DEFAULT_KIND: DataKind = 'manufacturers';

function isDataKind(value: string | null): value is DataKind {
  return KINDS.some((k) => k.key === value);
}

export default function DataPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const kindParam = searchParams.get('kind');
  const activeKind: DataKind = isDataKind(kindParam) ? kindParam : DEFAULT_KIND;
  const activeMeta = KINDS.find((k) => k.key === activeKind)!;

  const handleChangeKind = useCallback((next: string) => {
    if (!isDataKind(next)) return;
    setSearchParams({ kind: next }, { replace: true });
  }, [setSearchParams]);

  return (
    <MasterConsole
      eyebrow="MASTER"
      title="마스터"
      description="제조사·품번·거래처·창고·은행·공사현장 기준정보를 조회하고 연결 상태를 정리합니다. 법인은 엑셀 입력에서 등록합니다."
      tableTitle={activeMeta.label}
      tableSub="기준정보"
      metrics={[]}
      toolbar={
        <FilterChips
          options={KINDS.map((k) => ({ key: k.key, label: k.label }))}
          value={activeKind}
          onChange={handleChangeKind}
        />
      }
    >
      <KindSection kind={activeKind} />
    </MasterConsole>
  );
}

function KindSection({ kind }: { kind: DataKind }) {
  const manufacturerConfig = useManufacturerConfig();
  const productConfig = useProductConfig();
  const partnerConfig = usePartnerConfig();
  const warehouseConfig = useWarehouseConfig();
  const bankConfig = useBankConfig();

  switch (kind) {
    case 'manufacturers': return <MasterSection config={manufacturerConfig} />;
    case 'products':      return <MasterSection config={productConfig} />;
    case 'partners':      return <MasterSection config={partnerConfig} />;
    case 'warehouses':    return <MasterSection config={warehouseConfig} />;
    case 'banks':         return <MasterSection config={bankConfig} />;
    case 'construction-sites':
      return <ConstructionSitesPending />;
  }
}

function ConstructionSitesPending() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="text-sm text-[var(--ink-3)]">
        공사현장은 다음 단계에서 통합 페이지로 옮겨집니다.
      </div>
      <Link to="/masters/construction-sites" className="text-sm text-[var(--solar-3)] underline">
        기존 공사현장 관리 화면으로 이동 →
      </Link>
    </div>
  );
}

function useManufacturerConfig(): MasterSectionConfig<Manufacturer> {
  return useMemo(() => ({
    typeLabel: '제조사',
    endpoint: '/api/v1/manufacturers',
    getId: (r) => r.manufacturer_id,
    getLabel: (r) => r.name_kr,
    columns: [
      { key: 'priority_rank', label: '순위', sortable: true },
      { key: 'name_kr', label: '제조사명(한)', sortable: true },
      { key: 'name_en', label: '제조사명(영)', sortable: true },
      { key: 'country', label: '국가', sortable: true },
      { key: 'domestic_foreign', label: '국내/해외', sortable: true },
    ] as Column<Manufacturer>[],
    hasStatusToggle: true,
    searchPlaceholder: '제조사명, 국가 검색',
    searchPredicate: (row, q) =>
      row.name_kr.toLowerCase().includes(q) ||
      (row.name_en ?? '').toLowerCase().includes(q) ||
      row.country.toLowerCase().includes(q),
    newPath: '/data/manufacturers/new',
    editPath: (r) => `/data/manufacturers/${r.manufacturer_id}/edit`,
  }), []);
}

function useProductConfig(): MasterSectionConfig<Product> {
  return useMemo(() => ({
    typeLabel: '품번',
    endpoint: '/api/v1/products',
    getId: (r) => r.product_id,
    getLabel: (r) => `${r.product_code} ${r.product_name}`,
    columns: [
      { key: 'product_code', label: '품번코드', sortable: true },
      { key: 'manufacturer_name', label: '제조사', sortable: true,
        render: (r) => r.manufacturers?.name_kr ?? r.manufacturer_name ?? '—' },
      { key: 'product_name', label: '품명', sortable: true },
      { key: 'spec_wp', label: '규격(Wp)', sortable: true, render: (r) => formatWp(r.spec_wp) },
      { key: 'module_width_mm', label: '크기(mm)', sortable: true,
        render: (r) => formatSize(r.module_width_mm, r.module_height_mm) },
    ] as Column<Product>[],
    hasStatusToggle: true,
    searchPlaceholder: '품번코드, 품명, 제조사 검색',
    searchPredicate: (row, q) =>
      row.product_code.toLowerCase().includes(q) ||
      row.product_name.toLowerCase().includes(q) ||
      (row.manufacturer_name ?? row.manufacturers?.name_kr ?? '').toLowerCase().includes(q),
    newPath: '/data/products/new',
    editPath: (r) => `/data/products/${r.product_id}/edit`,
  }), []);
}

const PARTNER_TYPE_LABEL: Record<string, string> = { supplier: '공급사', customer: '고객사', both: '공급+고객' };
const PARTNER_TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  supplier: 'default', customer: 'secondary', both: 'outline',
};

function usePartnerConfig(): MasterSectionConfig<Partner> {
  return useMemo(() => ({
    typeLabel: '거래처',
    endpoint: '/api/v1/partners',
    getId: (r) => r.partner_id,
    getLabel: (r) => r.partner_name,
    columns: [
      { key: 'partner_name', label: '거래처명', sortable: true },
      { key: 'partner_type', label: '유형',
        render: (r) => (
          <Badge variant={PARTNER_TYPE_VARIANT[r.partner_type] ?? 'secondary'}>
            {PARTNER_TYPE_LABEL[r.partner_type] ?? r.partner_type}
          </Badge>
        ) },
      { key: 'erp_code', label: 'ERP코드' },
      { key: 'contact_name', label: '담당자' },
      { key: 'contact_phone', label: '연락처' },
    ] as Column<Partner>[],
    hasStatusToggle: true,
    searchPlaceholder: '거래처명, ERP코드, 담당자 검색',
    searchPredicate: (row, q) =>
      row.partner_name.toLowerCase().includes(q) ||
      (row.erp_code ?? '').toLowerCase().includes(q) ||
      (row.contact_name ?? '').toLowerCase().includes(q),
    newPath: '/data/partners/new',
    editPath: (r) => `/data/partners/${r.partner_id}/edit`,
  }), []);
}

const WH_TYPE_LABEL: Record<string, string> = { port: '항구', factory: '공장', vendor: '업체' };

function useWarehouseConfig(): MasterSectionConfig<Warehouse> {
  return useMemo(() => ({
    typeLabel: '창고',
    endpoint: '/api/v1/warehouses',
    getId: (r) => r.warehouse_id,
    getLabel: (r) => `${r.warehouse_code} ${r.warehouse_name}`,
    columns: [
      { key: 'warehouse_code', label: '창고코드', sortable: true },
      { key: 'warehouse_name', label: '창고명', sortable: true },
      { key: 'warehouse_type', label: '유형', render: (r) => WH_TYPE_LABEL[r.warehouse_type] ?? r.warehouse_type },
      { key: 'location_code', label: '장소코드' },
      { key: 'location_name', label: '장소명', sortable: true },
    ] as Column<Warehouse>[],
    hasStatusToggle: true,
    searchPlaceholder: '창고코드, 창고명, 장소명 검색',
    searchPredicate: (row, q) =>
      row.warehouse_code.toLowerCase().includes(q) ||
      row.warehouse_name.toLowerCase().includes(q) ||
      row.location_name.toLowerCase().includes(q),
    newPath: '/data/warehouses/new',
    editPath: (r) => `/data/warehouses/${r.warehouse_id}/edit`,
  }), []);
}

function useBankConfig(): MasterSectionConfig<Bank> {
  return useMemo(() => ({
    typeLabel: '은행',
    endpoint: '/api/v1/banks',
    getId: (r) => r.bank_id,
    getLabel: (r) => `${r.bank_name} (${r.companies?.company_name ?? r.company_name ?? ''})`,
    columns: [
      { key: 'bank_name', label: '은행명', sortable: true,
        render: (r) => (
          <span>
            {r.bank_name}
            {!r.is_active && <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 rounded px-1">비활성</span>}
          </span>
        ) },
      { key: 'company_name', label: '법인', sortable: true,
        render: (r) => r.companies?.company_name ?? r.company_name ?? '—' },
      { key: 'lc_limit_usd', label: '승인한도(USD)', sortable: true, render: (r) => formatUSD(r.lc_limit_usd) },
      { key: 'limit_approve_date', label: '승인일', render: (r) => formatDate(r.limit_approve_date ?? '') },
      { key: 'limit_expiry_date', label: '승인기한',
        render: (r) => {
          if (!r.limit_expiry_date) return <span className="text-muted-foreground">—</span>;
          const daysLeft = Math.ceil((new Date(r.limit_expiry_date).getTime() - Date.now()) / 86400000);
          if (daysLeft < 0) return <span className="text-red-600 font-semibold">{formatDate(r.limit_expiry_date)} <span className="text-[10px] bg-red-100 text-red-700 rounded px-1">만료</span></span>;
          if (daysLeft <= 30) return <span className="text-orange-500 font-semibold">{formatDate(r.limit_expiry_date)} <span className="text-[10px] bg-orange-100 text-orange-700 rounded px-1">D-{daysLeft}</span></span>;
          if (daysLeft <= 90) return <span className="text-yellow-600">{formatDate(r.limit_expiry_date)} <span className="text-[10px] bg-yellow-100 text-yellow-700 rounded px-1">D-{daysLeft}</span></span>;
          return <span>{formatDate(r.limit_expiry_date)}</span>;
        } },
      { key: 'opening_fee_rate', label: '개설수수료율',
        render: (r) => r.opening_fee_rate != null ? formatPercent(r.opening_fee_rate) : '—' },
      { key: 'acceptance_fee_rate', label: '인수수수료율',
        render: (r) => r.acceptance_fee_rate != null ? formatPercent(r.acceptance_fee_rate) : '—' },
    ] as Column<Bank>[],
    hasStatusToggle: true,
    searchPlaceholder: '은행명, 법인 검색',
    searchPredicate: (row, q) =>
      row.bank_name.toLowerCase().includes(q) ||
      (row.companies?.company_name ?? row.company_name ?? '').toLowerCase().includes(q),
    newPath: '/data/banks/new',
    editPath: (r) => `/data/banks/${r.bank_id}/edit`,
  }), []);
}
