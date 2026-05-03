import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Box,
  Database,
  FileSignature,
  FileSpreadsheet,
  FileText,
  History,
  Settings,
  Ship,
  type LucideIcon,
} from 'lucide-react';
import { MasterConsole } from '@/components/command/MasterConsole';
import { detectTenantScope, type TenantScope } from '@/lib/tenantScope';
import { usePermission } from '@/hooks/usePermission';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import type { MenuKey } from '@/config/permissions';

interface LibraryItem {
  key: string;
  title: string;
  desc: string;
  path: string;
  icon: LucideIcon;
  menu: MenuKey;
  tenants?: TenantScope[];
}

const LIBRARY_ITEMS: LibraryItem[] = [
  {
    key: 'inventory',
    title: '가용재고 현황',
    desc: '창고 보유분과 예약 가능 수량',
    path: '/inventory',
    icon: Box,
    menu: 'inventory',
  },
  {
    key: 'import-hub',
    title: '엑셀 입력 양식',
    desc: '통합 양식과 업무별 검증 업로드',
    path: '/import',
    icon: FileSpreadsheet,
    menu: 'import_hub',
  },
  {
    key: 'bl-documents',
    title: 'B/L 서류 보관',
    desc: '선적·면장·인보이스 PDF 원문',
    path: '/procurement?tab=bl',
    icon: Ship,
    menu: 'inbound',
    tenants: ['topsolar'],
  },
  {
    key: 'purchase-history',
    title: '구매 이력',
    desc: 'P/O·단가·변경계약 타임라인',
    path: '/purchase-history',
    icon: History,
    menu: 'purchase_history',
    tenants: ['topsolar'],
  },
  {
    key: 'baro-incoming',
    title: '입고예정 자료',
    desc: 'BARO 공급예정 ETA와 품목 수량',
    path: '/baro/incoming',
    icon: Ship,
    menu: 'baro_incoming',
    tenants: ['baro'],
  },
  {
    key: 'baro-purchase-history',
    title: 'BARO 구매이력',
    desc: '국내 타사·그룹내 매입 이력',
    path: '/baro/purchase-history',
    icon: History,
    menu: 'baro_purchase_history',
    tenants: ['baro'],
  },
  {
    key: 'approval',
    title: '결재안 문안',
    desc: '수입대금·부대비용·운송비 표준 문안',
    path: '/approval',
    icon: FileSignature,
    menu: 'approval',
    tenants: ['topsolar'],
  },
  {
    key: 'masters',
    title: '기준정보',
    desc: '법인·품번·거래처·창고 마스터',
    path: '/data',
    icon: Database,
    menu: 'masters',
  },
  {
    key: 'assistant',
    title: 'AI OCR 첨부 분석',
    desc: 'PDF·이미지 원문 추출과 업무 질의',
    path: '/assistant',
    icon: Bot,
    menu: 'assistant',
  },
  {
    key: 'settings',
    title: '개인 설정',
    desc: '표시 단위와 계정 환경',
    path: '/settings/personal',
    icon: Settings,
    menu: 'settings',
  },
];

export default function LibraryPage() {
  const tenant = detectTenantScope();
  const { canAccessMenu } = usePermission();
  const { hidden } = useMenuVisibility();

  const items = LIBRARY_ITEMS.filter((item) =>
    canAccessMenu(item.menu) &&
    !hidden.has(item.key) &&
    (!item.tenants || item.tenants.includes(tenant)),
  );

  return (
    <MasterConsole
      eyebrow="LIBRARY"
      title="자료실"
      description="업무 양식, 보관 서류, 기준정보와 분석 도구를 한곳에서 엽니다."
      tableTitle="업무 자료"
      tableSub={`${items.length.toLocaleString('ko-KR')}개 항목`}
      metrics={[
        { label: '자료 묶음', value: items.length.toLocaleString('ko-KR'), unit: '개', sub: tenant === 'baro' ? 'BARO 기준' : '탑솔라 기준', tone: 'solar' },
        { label: '엑셀 양식', value: canAccessMenu('import_hub') ? '열림' : '—', sub: 'Import Hub', tone: canAccessMenu('import_hub') ? 'pos' : 'ink' },
        { label: '문서 보관', value: canAccessMenu('inbound') ? 'B/L' : '—', sub: 'PDF 원문', tone: canAccessMenu('inbound') ? 'info' : 'ink' },
        { label: 'AI 분석', value: canAccessMenu('assistant') ? '사용' : '—', sub: 'OCR 첨부', tone: canAccessMenu('assistant') ? 'warn' : 'ink' },
      ]}
    >
      <div className="grid gap-2 xl:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              to={item.path}
              className="group flex min-h-[76px] items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 transition hover:border-[var(--solar-3)] hover:bg-[var(--bg-2)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--bg-2)]">
                <Icon className="h-4 w-4 text-[var(--ink-3)] transition group-hover:text-[var(--solar-3)]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-[var(--ink)]">{item.title}</span>
                <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-3)]">{item.desc}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-4)] transition group-hover:translate-x-0.5 group-hover:text-[var(--solar-3)]" />
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <FileText className="h-8 w-8 text-[var(--ink-4)]" />
          <p className="text-sm text-[var(--ink-3)]">현재 권한에서 열 수 있는 자료가 없습니다.</p>
        </div>
      ) : null}
    </MasterConsole>
  );
}
