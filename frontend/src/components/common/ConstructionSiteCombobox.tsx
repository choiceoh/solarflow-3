// 공사현장 선택 콤보박스 — 검색 + 인라인 생성
// AllocationForm 공용

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, Check, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchWithAuth } from '@/lib/api';
import type { ConstructionSite } from '@/types/masters';

interface Props {
  sites: ConstructionSite[];
  value: string;                                       // 선택된 site_id
  onChange: (siteId: string, siteName: string) => void;
  companyId: string | null;
  siteType?: 'own' | 'epc' | 'all';                   // 필터 (기본: all)
  onCreated?: (site: ConstructionSite) => void;        // 인라인 생성 후 콜백
  error?: boolean;
  placeholder?: string;
  displayName?: string;                                // site_id가 없는 레거시/수정 데이터 표시
}

export function ConstructionSiteCombobox({
  sites, value, onChange, companyId, siteType = 'all', onCreated, error, placeholder = '현장 검색…', displayName = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newType, setNewType] = useState<'own' | 'epc'>('own');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = siteType === 'all' ? sites : sites.filter(s => s.site_type === siteType);
    if (q) list = list.filter(s =>
      s.name.toLowerCase().includes(q) || (s.location ?? '').toLowerCase().includes(q)
    );
    return list.slice(0, 30);
  }, [sites, search, siteType]);

  const selectedSite = sites.find(s => s.site_id === value);

  const handleSelect = (site: ConstructionSite) => {
    onChange(site.site_id, site.name);
    setOpen(false);
    setSearch('');
    setCreating(false);
  };

  const handleCreate = async () => {
    setCreateError('');
    if (!companyId || companyId === 'all') {
      setCreateError('현장을 등록할 법인을 먼저 선택해주세요.');
      return;
    }
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        company_id: companyId,
        name: newName.trim(),
        site_type: newType,
      };
      if (newLocation.trim()) body.location = newLocation.trim();

      const response = await fetchWithAuth<ConstructionSite | { status: string }>('/api/v1/construction-sites', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      let created = response as ConstructionSite;
      if (!created.site_id) {
        const refreshed = await fetchWithAuth<ConstructionSite[]>(`/api/v1/construction-sites?company_id=${companyId}`);
        created = refreshed.find((site) =>
          site.name === newName.trim() &&
          (site.location ?? '') === (newLocation.trim() || '') &&
          site.site_type === newType,
        ) ?? refreshed.find((site) => site.name === newName.trim() && site.site_type === newType) as ConstructionSite;
      }
      if (!created?.site_id) throw new Error('created site missing id');
      onCreated?.(created);
      onChange(created.site_id, created.name);
      setOpen(false);
      setCreating(false);
      setNewName('');
      setNewLocation('');
      setSearch('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '현장 등록에 실패했습니다. 필수값과 법인 선택을 확인해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const SITE_TYPE_LABEL = { own: '자체', epc: '타사 EPC' };

  return (
    <div className="relative" ref={ref}>
      {/* 트리거 버튼 */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setCreating(false); }}
        className={cn(
          'w-full flex items-center gap-2 rounded-md border px-3 h-9 text-sm text-left transition-colors',
          error ? 'border-destructive' : 'border-input',
          'hover:border-ring focus:outline-none focus:ring-1 focus:ring-ring',
          !value && !displayName && 'text-muted-foreground',
        )}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">
          {selectedSite
            ? `${selectedSite.name}${selectedSite.location ? ` (${selectedSite.location})` : ''}`
            : displayName
              ? displayName
            : placeholder}
        </span>
        {(value || displayName) && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange('', ''); }}
            className="text-muted-foreground hover:text-foreground"
          >✕</button>
        )}
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-lg">
          {/* 검색창 */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
              placeholder="현장명 또는 위치로 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* 목록 */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && !creating && (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                {search ? `"${search}" 검색 결과 없음` : '등록된 현장이 없습니다'}
              </p>
            )}
            {filtered.map(site => (
              <button
                key={site.site_id}
                type="button"
                onClick={() => handleSelect(site)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
                  site.site_id === value && 'bg-accent',
                )}
              >
                {site.site_id === value
                  ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  : <span className="h-3.5 w-3.5 shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="font-medium">{site.name}</span>
                  {site.location && <span className="text-muted-foreground ml-1.5 text-xs">{site.location}</span>}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {SITE_TYPE_LABEL[site.site_type]}
                </span>
              </button>
            ))}
          </div>

          {/* 인라인 생성 */}
          {!creating ? (
            <button
              type="button"
              onClick={() => { setCreating(true); setNewName(search); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-accent border-t transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              신규 현장 등록{search ? ` "${search}"` : ''}
            </button>
          ) : (
            <div className="border-t p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">신규 현장 등록</p>
              {createError && (
                <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  {createError}
                </p>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">현장명 *</Label>
                <Input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="예: 영광 1호기"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">위치</Label>
                <Input
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  placeholder="예: 전남 영광군"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">구분</Label>
                <div className="flex gap-2">
                  {(['own', 'epc'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={cn(
                        'flex-1 rounded border py-1 text-xs transition-colors',
                        newType === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted',
                      )}
                    >
                      {SITE_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={handleCreate}
                  disabled={!newName.trim() || saving}
                >
                  {saving ? '저장 중…' : '등록'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setCreating(false)}
                >
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
