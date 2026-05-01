import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Factory, Package, Briefcase, Warehouse,
  Landmark, HardHat, ChevronRight, Plus, type LucideIcon,
} from 'lucide-react';
import { MasterConsole } from '@/components/command/MasterConsole';
import { RailBlock } from '@/components/command/MockupPrimitives';
import { fetchWithAuth } from '@/lib/api';

interface Category {
  key: string;
  label: string;
  description: string;
  path: string;
  endpoint: string;
  icon: LucideIcon;
  accent: string;
}

const CATEGORIES: Category[] = [
  { key: 'companies',          label: '법인',       description: '운영 법인 정보',         path: '/masters/companies',          endpoint: '/api/v1/companies',          icon: Building2, accent: 'var(--solar-3)' },
  { key: 'manufacturers',      label: '제조사',     description: '모듈 제조사',            path: '/masters/manufacturers',      endpoint: '/api/v1/manufacturers',      icon: Factory,   accent: 'var(--info)' },
  { key: 'products',           label: '품번(모듈)', description: '모듈 사양·규격',         path: '/masters/products',           endpoint: '/api/v1/products',           icon: Package,   accent: 'var(--solar-2)' },
  { key: 'partners',           label: '거래처',     description: '매입처·매출처',          path: '/masters/partners',           endpoint: '/api/v1/partners',           icon: Briefcase, accent: 'var(--warn)' },
  { key: 'warehouses',         label: '창고',       description: '입출고 창고',            path: '/masters/warehouses',         endpoint: '/api/v1/warehouses',         icon: Warehouse, accent: 'var(--ink-3)' },
  { key: 'banks',              label: '은행',       description: 'LC·결제 은행',           path: '/masters/banks',              endpoint: '/api/v1/banks',              icon: Landmark,  accent: 'var(--pos)' },
  { key: 'construction-sites', label: '공사현장',   description: '출고 대상 현장',         path: '/masters/construction-sites', endpoint: '/api/v1/construction-sites', icon: HardHat,   accent: 'var(--solar)' },
];

interface EntityRecord {
  is_active?: boolean;
}

export default function DataHubPage() {
  const [counts, setCounts] = useState<Record<string, { total: number; active: number } | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        CATEGORIES.map(async (cat) => {
          try {
            const list = await fetchWithAuth<EntityRecord[]>(cat.endpoint);
            const arr = Array.isArray(list) ? list : [];
            const active = arr.filter((row) => row?.is_active !== false).length;
            return [cat.key, { total: arr.length, active }] as const;
          } catch {
            return [cat.key, null] as const;
          }
        }),
      );
      if (cancelled) return;
      setCounts(Object.fromEntries(results));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const totalRecords = CATEGORIES.reduce((sum, c) => sum + (counts[c.key]?.total ?? 0), 0);
  const activeRecords = CATEGORIES.reduce((sum, c) => sum + (counts[c.key]?.active ?? 0), 0);
  const failed = CATEGORIES.filter((c) => counts[c.key] === null).length;

  return (
    <MasterConsole
      eyebrow="DATA"
      title="데이터"
      description="법인·제조사·품번·거래처·창고·은행·공사현장 등 모든 기준정보를 한곳에서 등록·관리합니다."
      tableTitle="정보 카테고리"
      tableSub={`${CATEGORIES.length}개 카테고리 · ${totalRecords.toLocaleString()}개 항목`}
      metrics={[
        { label: '전체 항목', value: loading ? '—' : totalRecords.toLocaleString(), sub: '모든 카테고리 합계', tone: 'solar' },
        { label: '활성 항목', value: loading ? '—' : activeRecords.toLocaleString(), sub: '비활성 제외', tone: 'pos' },
        { label: '카테고리', value: CATEGORIES.length.toString(), sub: '등록 가능 종류', tone: 'info' },
        { label: '동기화', value: loading ? 'LOAD' : failed > 0 ? 'WARN' : 'OK', sub: loading ? '불러오는 중' : failed > 0 ? `${failed}개 실패` : '모두 정상', tone: loading ? 'ink' : failed > 0 ? 'warn' : 'pos' },
      ]}
      rail={
        <RailBlock title="안내" accent="var(--solar-3)">
          <div className="space-y-2 text-[11px] leading-5 text-[var(--ink-3)]">
            <p>각 카테고리 카드를 클릭하면 등록·수정·삭제 화면으로 이동합니다.</p>
            <p>등록한 정보는 즉시 PO·수주·면장 등 업무 화면의 선택지에 반영됩니다.</p>
          </div>
        </RailBlock>
      }
    >
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const stat = counts[cat.key];
          const total = stat?.total ?? 0;
          const active = stat?.active ?? 0;
          const isError = stat === null;

          return (
            <Link
              key={cat.key}
              to={cat.path}
              className="card hover group relative flex flex-col gap-3 p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                  style={{ background: `color-mix(in srgb, ${cat.accent} 14%, transparent)`, color: cat.accent }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[var(--ink)]">{cat.label}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">{cat.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5" />
              </div>

              <div className="flex items-baseline justify-between border-t border-[var(--line)] pt-3">
                <div>
                  <div className="bignum" style={{ fontSize: 22 }}>
                    {loading ? '—' : isError ? '!' : total.toLocaleString()}
                  </div>
                  <div className="mono mt-0.5 text-[10px] text-[var(--ink-4)]">
                    {isError ? '불러오기 실패' : `활성 ${active.toLocaleString()}`}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-3)] transition-colors group-hover:border-[var(--solar-3)] group-hover:text-[var(--solar-3)]">
                  <Plus className="h-3 w-3" />등록·관리
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </MasterConsole>
  );
}
