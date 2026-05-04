import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import DataTable, { type Column } from '@/components/common/DataTable';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { fetchWithAuth } from '@/lib/api';

// "참조 건수" 컬럼 옵션 — usageEndpoint 가 GET 으로 [{id, ...counts}] 배열을 돌려주면
// MasterSection 이 id 별 카운트를 합쳐 마지막 컬럼에 렌더링한다.
// 비유: 명함 옆에 자동 도장 — 카운트 데이터가 있으면 찍고, 없으면 가만히 둠.
export interface MasterUsageColumn<T> {
  endpoint: string;                                    // 예: '/api/v1/manufacturers/usage-counts'
  rowKey: keyof T & string;                            // 예: 'manufacturer_id'
  countKey: string;                                    // 응답에서 row 식별 컬럼 (보통 rowKey 와 동일)
  label?: string;                                      // 컬럼 헤더 — 기본 '참조'
  render: (counts: Record<string, number> | undefined) => ReactNode;
}

export interface MasterSectionConfig<T> {
  typeLabel: string;
  endpoint: string;
  getId: (row: T) => string;
  getLabel: (row: T) => string;
  columns: Column<T>[];
  hasStatusToggle?: boolean;
  searchPlaceholder: string;
  searchPredicate: (row: T, lowerQuery: string) => boolean;
  newPath: string;
  editPath: (row: T) => string;
  emptyMessage?: string;
  preFilter?: (rows: T[]) => T[];
  toolbar?: ReactNode;
  usage?: MasterUsageColumn<T>;
}

export default function MasterSection<T extends { is_active?: boolean }>({ config }: { config: MasterSectionConfig<T> }) {
  const navigate = useNavigate();
  const [data, setData] = useState<T[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [toggleTarget, setToggleTarget] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);
  // id → {countKeyA: n, countKeyB: n} 형태로 펼쳐 둔 카운트 맵.
  // usage 옵션이 없으면 항상 빈 맵 — 컬럼 자체가 추가되지 않아 렌더 영향 없음.
  const [usageMap, setUsageMap] = useState<Record<string, Record<string, number>>>({});

  const usage = config.usage;
  const usageEndpoint = usage?.endpoint;
  const usageCountKey = usage?.countKey;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchWithAuth<T[]>(config.endpoint);
      setData(Array.isArray(list) ? list : []);
    } catch { /* empty */ }
    setLoading(false);
  }, [config.endpoint]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchWithAuth<T[]>(config.endpoint);
        if (!cancelled) setData(Array.isArray(list) ? list : []);
      } catch { /* empty */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [config.endpoint]);

  // 참조 건수 — 본 목록과 병렬로 한 번만 가져와서 id 키 맵으로 정리.
  // 카운트 실패해도 본 테이블은 그대로 보여야 하므로 조용히 빈 맵 유지.
  useEffect(() => {
    if (!usageEndpoint || !usageCountKey) {
      setUsageMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchWithAuth<Array<Record<string, unknown>>>(usageEndpoint);
        if (cancelled || !Array.isArray(rows)) return;
        const next: Record<string, Record<string, number>> = {};
        for (const row of rows) {
          const id = row[usageCountKey];
          if (typeof id !== 'string') continue;
          const counts: Record<string, number> = {};
          for (const [k, v] of Object.entries(row)) {
            if (k === usageCountKey) continue;
            counts[k] = typeof v === 'number' ? v : Number(v ?? 0);
          }
          next[id] = counts;
        }
        setUsageMap(next);
      } catch { /* empty */ }
    })();
    return () => { cancelled = true; };
  }, [usageEndpoint, usageCountKey]);

  const filtered = useMemo(() => {
    const base = config.preFilter ? config.preFilter(data) : data;
    if (!searchQuery) return base;
    const lower = searchQuery.toLowerCase();
    return base.filter((row) => config.searchPredicate(row, lower));
  }, [data, searchQuery, config]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetchWithAuth(`${config.endpoint}/${config.getId(deleteTarget)}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await load();
    } catch { /* empty */ }
    setDeleting(false);
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    await fetchWithAuth(`${config.endpoint}/${config.getId(toggleTarget)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !toggleTarget.is_active }),
    });
    setToggleTarget(null);
    await load();
  };

  const columns: Column<T>[] = useMemo(() => {
    const base = [...config.columns];
    if (usage) {
      const usageCol: Column<T> = {
        key: `__usage_${usage.rowKey}`,
        label: usage.label ?? '참조',
        render: (row) => {
          const id = row[usage.rowKey];
          const counts = typeof id === 'string' ? usageMap[id] : undefined;
          return usage.render(counts);
        },
      };
      base.push(usageCol);
    }
    if (!config.hasStatusToggle) return base;
    const toggleCol: Column<T> = {
      key: 'is_active',
      label: '활성',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Switch checked={!!row.is_active} onCheckedChange={() => setToggleTarget(row)} />
          <Badge variant={row.is_active ? 'default' : 'secondary'} className="text-[10px]">
            {row.is_active ? '활성' : '비활성'}
          </Badge>
        </div>
      ),
    };
    return [...base, toggleCol];
  }, [config.columns, config.hasStatusToggle, usage, usageMap]);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>{config.toolbar}</div>
        <Button size="sm" onClick={() => navigate(config.newPath)}>
          <Plus className="mr-1.5 h-4 w-4" />새로 등록
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchable
        searchPlaceholder={config.searchPlaceholder}
        onSearch={setSearchQuery}
        emptyMessage={config.emptyMessage}
        actions={(row) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => navigate(config.editPath(row))}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      />
      {config.hasStatusToggle && (
        <ConfirmDialog
          open={!!toggleTarget}
          onOpenChange={() => setToggleTarget(null)}
          title="상태 변경"
          description={toggleTarget
            ? `${config.getLabel(toggleTarget)}을(를) ${toggleTarget.is_active ? '비활성' : '활성'}으로 변경하시겠습니까?`
            : ''}
          onConfirm={handleToggle}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={`${config.typeLabel} 삭제`}
        description={deleteTarget
          ? `"${config.getLabel(deleteTarget)}"을(를) 삭제하시겠습니까? 연결된 데이터가 있으면 삭제가 실패할 수 있습니다.`
          : ''}
        onConfirm={handleDelete}
        confirmLabel={deleting ? '삭제 중...' : '삭제'}
        variant="destructive"
      />
    </>
  );
}
