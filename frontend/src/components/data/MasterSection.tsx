import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import DataTable, { type Column } from '@/components/common/DataTable';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { fetchWithAuth } from '@/lib/api';
import { notify, formatError } from '@/lib/notify';

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
  // 복수 선택 상태 — id 셋. 데이터 리로드/엔드포인트 변경 시 초기화.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
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
    // 마스터 종류가 바뀌면 (탭 전환 등) 이전 선택은 유효하지 않으니 초기화.
    setSelectedIds(new Set());
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

  // 선택된 모든 행을 병렬 DELETE. allSettled 로 일부 실패해도 끝까지 진행.
  // FK 걸린 행은 백엔드가 409/500 을 돌려주므로 실패 카운트로 분리 표시한다.
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    const results = await Promise.allSettled(
      ids.map((id) => fetchWithAuth(`${config.endpoint}/${id}`, { method: 'DELETE' })),
    );
    const success = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - success;
    const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed === 0) {
      notify.success(`${success}개 ${config.typeLabel} 삭제 완료`);
    } else if (success === 0) {
      notify.error(`삭제 실패 (${failed}건) — ${firstError ? formatError(firstError.reason) : '연결된 데이터가 있는지 확인하세요'}`);
    } else {
      notify.warning(`${success}건 삭제, ${failed}건 실패 — 연결된 데이터가 있어 못 지운 행이 있습니다`);
    }
    setBulkConfirmOpen(false);
    setBulkDeleting(false);
    setSelectedIds(new Set());
    await load();
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

  // 현재 화면(검색 필터 적용 후) 의 id 목록 — 모두선택 토글 대상.
  const filteredIds = useMemo(() => filtered.map((row) => config.getId(row)), [filtered, config]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected = !allFilteredSelected && filteredIds.some((id) => selectedIds.has(id));

  const toggleAllFiltered = useCallback((checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of filteredIds) next.add(id);
      } else {
        for (const id of filteredIds) next.delete(id);
      }
      return next;
    });
  }, [filteredIds]);

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const columns: Column<T>[] = useMemo(() => {
    const selectCol: Column<T> = {
      key: '__select',
      label: '',
      defaultWidth: 36,
      resizable: false,
      reorderable: false,
      pinnable: false,
      headerCell: () => (
        <input
          type="checkbox"
          aria-label="전체 선택"
          checked={allFilteredSelected}
          ref={(el) => { if (el) el.indeterminate = someFilteredSelected; }}
          onChange={(e) => toggleAllFiltered(e.target.checked)}
          className="size-3.5 cursor-pointer"
        />
      ),
      render: (row) => {
        const id = config.getId(row);
        return (
          <input
            type="checkbox"
            aria-label="행 선택"
            checked={selectedIds.has(id)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => toggleOne(id, e.target.checked)}
            className="size-3.5 cursor-pointer"
          />
        );
      },
    };
    const base: Column<T>[] = [selectCol, ...config.columns];
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
  }, [config, usage, usageMap, selectedIds, allFilteredSelected, someFilteredSelected, toggleAllFiltered, toggleOne]);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>{config.toolbar}</div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkConfirmOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />선택 {selectedIds.size}개 삭제
            </Button>
          )}
          <Button size="sm" onClick={() => navigate(config.newPath)}>
            <Plus className="mr-1.5 h-4 w-4" />새로 등록
          </Button>
        </div>
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
      <ConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={(open) => { if (!open && !bulkDeleting) setBulkConfirmOpen(false); }}
        title={`${config.typeLabel} 일괄 삭제`}
        description={`선택한 ${selectedIds.size}개 ${config.typeLabel}을(를) 삭제하시겠습니까?\n연결된 데이터가 있는 행은 삭제되지 않고 남습니다.`}
        onConfirm={handleBulkDelete}
        loading={bulkDeleting}
        confirmLabel={bulkDeleting ? '삭제 중...' : `${selectedIds.size}개 삭제`}
        variant="destructive"
      />
    </>
  );
}
