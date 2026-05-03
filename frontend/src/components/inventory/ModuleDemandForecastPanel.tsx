import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import { confirmDialog } from '@/lib/dialogs';
import { companyQueryUrl } from '@/lib/companyUtils';
import { cn, formatKw, moduleLabel, shortMfgName } from '@/lib/utils';
import type {
  InventoryItem,
  ModuleDemandForecast,
  ModuleDemandForecastPayload,
} from '@/types/inventory';
import type { Manufacturer } from '@/types/masters';
import type { Company } from '@/types/masters';
import type { SaleListItem } from '@/types/outbound';

interface Props {
  companyId: string;
  inventoryItems: InventoryItem[];
  manufacturers: Manufacturer[];
}

interface ModuleOption {
  key: string;
  companyId: string;
  specWp: number;
  width: number;
  height: number;
  securedKw: number;
  manufacturerNames: Set<string>;
  label: string;
}

interface FormState {
  companyId: string;
  siteName: string;
  demandMonth: string;
  moduleKey: string;
  manufacturerId: string;
  requiredMw: string;
  status: ModuleDemandForecast['status'];
  notes: string;
}

function nextMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthOffset(month: string, delta: number): string {
  const [year, rawMonth] = month.split('-').map(Number);
  const d = new Date(year, rawMonth - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function moduleKey(specWp: number, width: number, height: number, companyId?: string): string {
  return `${companyId || 'all'}:${width}x${height}:${specWp}`;
}

function monthRange(count: number): string[] {
  return Array.from({ length: count }, (_, i) => monthOffset(nextMonth(), i));
}

function mw(value: number): string {
  return `${(value / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}MW`;
}

function emptyForm(defaultModuleKey: string): FormState {
  return {
    companyId: '',
    siteName: '',
    demandMonth: nextMonth(),
    moduleKey: defaultModuleKey,
    manufacturerId: 'any',
    requiredMw: '',
    status: 'planned',
    notes: '',
  };
}

function saleMonth(sale: SaleListItem): string {
  const date = sale.outbound_date || sale.order_date || '';
  return date.slice(0, 7);
}

function SelectText({ text }: { text: string }) {
  return <span className="flex flex-1 truncate text-left" data-slot="select-value">{text}</span>;
}

const DEMAND_STATUS_LABEL: Record<ModuleDemandForecast['status'], string> = {
  planned: '계획',
  confirmed: '확정',
  done: '반영완료',
  cancelled: '취소',
};

export default function ModuleDemandForecastPanel({ companyId, inventoryItems, manufacturers }: Props) {
  const [demands, setDemands] = useState<ModuleDemandForecast[]>([]);
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModuleDemandForecast | null>(null);

  const moduleOptions = useMemo(() => {
    const map = new Map<string, ModuleOption>();
    for (const item of inventoryItems) {
      const itemCompanyId = item.company_id || companyId;
      const key = moduleKey(item.spec_wp, item.module_width_mm, item.module_height_mm, itemCompanyId);
      const prev = map.get(key);
      const securedKw = item.total_secured_kw || item.physical_kw + item.incoming_kw;
      if (prev) {
        prev.securedKw += securedKw;
        prev.manufacturerNames.add(item.manufacturer_name);
      } else {
        const manufacturerNames = new Set<string>();
        manufacturerNames.add(item.manufacturer_name);
        map.set(key, {
          key,
          companyId: itemCompanyId,
          specWp: item.spec_wp,
          width: item.module_width_mm,
          height: item.module_height_mm,
          securedKw,
          manufacturerNames,
          label: '',
        });
      }
    }
    return Array.from(map.values()).map((option) => {
      const names = Array.from(option.manufacturerNames).filter(Boolean);
      const firstName = names[0];
      const mfgPart = names.length <= 1
        ? moduleLabel(firstName, option.specWp)
        : `${shortMfgName(firstName)} 외 ${names.length - 1} · ${option.specWp}W`;
      return {
        ...option,
        label: `${mfgPart} · ${option.width}×${option.height}`,
      };
    }).sort((a, b) => {
      if (a.companyId !== b.companyId) return a.companyId.localeCompare(b.companyId);
      if (a.width !== b.width) return a.width - b.width;
      if (a.height !== b.height) return a.height - b.height;
      return a.specWp - b.specWp;
    });
  }, [companyId, inventoryItems]);

  const [form, setForm] = useState<FormState>(() => emptyForm(moduleOptions[0]?.key ?? ''));

  useEffect(() => {
    if (!form.moduleKey && moduleOptions[0]) {
      setForm((prev) => ({ ...prev, moduleKey: moduleOptions[0].key }));
    }
  }, [form.moduleKey, moduleOptions]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const [demandList, saleList, companyList] = await Promise.all([
        fetchWithAuth<ModuleDemandForecast[]>(companyQueryUrl('/api/v1/module-demand-forecasts', companyId)),
        fetchWithAuth<SaleListItem[]>(companyQueryUrl('/api/v1/sales', companyId)),
        fetchWithAuth<Company[]>('/api/v1/companies'),
      ]);
      setDemands(demandList);
      setSales(saleList);
      setCompanies(companyList);
    } catch (err) {
      setError(err instanceof Error ? err.message : '수급 forecast 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm(moduleOptions[0]?.key ?? ''), companyId: companyId === 'all' ? (moduleOptions[0]?.companyId ?? '') : companyId });
    setFormOpen(true);
  };

  const openEdit = (item: ModuleDemandForecast) => {
    setEditing(item);
    setForm({
      siteName: item.site_name,
      companyId: item.company_id,
      demandMonth: item.demand_month,
      moduleKey: moduleKey(item.spec_wp, item.module_width_mm, item.module_height_mm, item.company_id),
      manufacturerId: item.manufacturer_id || 'any',
      requiredMw: String(item.required_kw / 1000),
      status: item.status,
      notes: item.notes || '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    const option = moduleOptions.find((m) => m.key === form.moduleKey);
    const requiredMw = Number(form.requiredMw);
    const targetCompanyId = companyId === 'all' ? form.companyId : companyId;
    if (!option) { setError('모듈군을 선택해 주세요'); return; }
    if (!targetCompanyId) { setError('법인을 선택해 주세요'); return; }
    if (!form.siteName.trim()) { setError('현장명은 필수입니다'); return; }
    if (!form.demandMonth) { setError('투입월은 필수입니다'); return; }
    if (!Number.isFinite(requiredMw) || requiredMw <= 0) { setError('필요 용량은 양수여야 합니다'); return; }

    const payload: ModuleDemandForecastPayload = {
      company_id: targetCompanyId,
      site_name: form.siteName.trim(),
      demand_month: form.demandMonth,
      demand_type: 'construction',
      manufacturer_id: form.manufacturerId === 'any' ? undefined : form.manufacturerId,
      spec_wp: option.specWp,
      module_width_mm: option.width,
      module_height_mm: option.height,
      required_kw: requiredMw * 1000,
      status: form.status,
      notes: form.notes.trim() || undefined,
    };

    try {
      if (editing) {
        await fetchWithAuth(`/api/v1/module-demand-forecasts/${editing.forecast_id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchWithAuth('/api/v1/module-demand-forecasts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '수요 계획 저장에 실패했습니다');
    }
  };

  const remove = async (item: ModuleDemandForecast) => {
    const ok = await confirmDialog({
      description: `${item.site_name} 수요 계획을 삭제할까요?`,
      variant: 'destructive',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    try {
      await fetchWithAuth(`/api/v1/module-demand-forecasts/${item.forecast_id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '수요 계획 삭제에 실패했습니다');
    }
  };

  const forecastRows = useMemo(() => {
    const recentMonths = new Set(monthRange(3).map((m) => monthOffset(m, -3)));
    const securedByKey = new Map(moduleOptions.map((opt) => [opt.key, opt.securedKw]));
    const salesByKey = new Map<string, number>();
    const productToModule = new Map<string, string>();
    for (const item of inventoryItems) {
      const itemCompanyId = item.company_id || companyId;
      const key = moduleKey(item.spec_wp, item.module_width_mm, item.module_height_mm, itemCompanyId);
      productToModule.set(`${item.product_id}:${itemCompanyId}`, key);
      productToModule.set(item.product_id, key);
    }
    for (const sale of sales) {
      const month = saleMonth(sale);
      if (month && !recentMonths.has(month)) continue;
      const key = sale.product_id ? productToModule.get(`${sale.product_id}:${sale.company_id ?? ''}`) ?? productToModule.get(sale.product_id) : undefined;
      if (!key) continue;
      const kw = sale.capacity_kw ?? (sale.quantity && sale.spec_wp ? sale.quantity * sale.spec_wp / 1000 : 0);
      salesByKey.set(key, (salesByKey.get(key) || 0) + kw);
    }

    const activeDemands = demands.filter((d) => d.status !== 'cancelled' && d.status !== 'done');
    const demandKeys = new Set(activeDemands.map((d) => moduleKey(d.spec_wp, d.module_width_mm, d.module_height_mm, d.company_id)));
    const allKeys = new Set([...securedByKey.keys(), ...salesByKey.keys(), ...demandKeys]);
    const months = monthRange(12);

    return Array.from(allKeys).map((key) => {
      const option = moduleOptions.find((m) => m.key === key);
      const matchingDemand = activeDemands.filter((d) => moduleKey(d.spec_wp, d.module_width_mm, d.module_height_mm, d.company_id) === key);
      const securedKw = securedByKey.get(key) || 0;
      const monthlyDistributionKw = (salesByKey.get(key) || 0) / 3;
      const plannedConstructionKw = matchingDemand.reduce((sum, d) => sum + d.required_kw, 0);
      let balance = securedKw;
      let depletionMonth = '';
      for (const month of months) {
        const constructionKw = matchingDemand
          .filter((d) => d.demand_month === month)
          .reduce((sum, d) => sum + d.required_kw, 0);
        balance -= monthlyDistributionKw + constructionKw;
        if (!depletionMonth && balance <= 0) {
          depletionMonth = month;
        }
      }
      const actionMonth = depletionMonth ? monthOffset(depletionMonth, -3) : '';
      const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label: option?.label || `${key}`,
        securedKw,
        monthlyDistributionKw,
        plannedConstructionKw,
        depletionMonth,
        actionMonth,
        status: depletionMonth && actionMonth <= currentMonth ? 'negotiate' : depletionMonth ? 'watch' : 'ok',
      };
    }).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'negotiate' ? -1 : b.status === 'negotiate' ? 1 : 0;
      return b.securedKw - a.securedKw;
    });
  }, [companyId, demands, inventoryItems, moduleOptions, sales]);

  const selectedManufacturerName = form.manufacturerId === 'any'
    ? '제조사 무관'
    : shortMfgName(manufacturers.find((m) => m.manufacturer_id === form.manufacturerId)?.name_kr || '');
  const selectedCompanyName = companies.find((company) => company.company_id === form.companyId)?.company_name || '법인 선택';
  const selectedModuleLabel = moduleOptions.find((option) => option.key === form.moduleKey)?.label || '모듈군 선택';
  const selectedStatusLabel = DEMAND_STATUS_LABEL[form.status] || '상태 선택';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">운영 수급 forecast</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            최근 판매 속도와 자체 공사 예정수요를 합쳐 재고 소진 시점과 협의 필요월을 봅니다.
          </p>
        </div>
        <Button size="sm" onClick={openNew} disabled={moduleOptions.length === 0}>
          <Plus className="h-3.5 w-3.5" />
          현장 수요
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">모듈군</th>
                <th className="px-3 py-2 text-right font-medium">현재 확보</th>
                <th className="px-3 py-2 text-right font-medium">월 유통 추정</th>
                <th className="px-3 py-2 text-right font-medium">계획 공사</th>
                <th className="px-3 py-2 text-center font-medium">소진 예상</th>
                <th className="px-3 py-2 text-center font-medium">협의 필요</th>
                <th className="px-3 py-2 text-center font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {forecastRows.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">forecast 데이터가 없습니다</td></tr>
              ) : forecastRows.map((row) => (
                <tr key={row.key} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  <td className="px-3 py-2 text-right">{formatKw(row.securedKw)}</td>
                  <td className="px-3 py-2 text-right">{formatKw(row.monthlyDistributionKw)}</td>
                  <td className="px-3 py-2 text-right">{formatKw(row.plannedConstructionKw)}</td>
                  <td className="px-3 py-2 text-center">{row.depletionMonth || '미정'}</td>
                  <td className="px-3 py-2 text-center">{row.actionMonth || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                      row.status === 'negotiate' && 'bg-red-100 text-red-700',
                      row.status === 'watch' && 'bg-amber-100 text-amber-700',
                      row.status === 'ok' && 'bg-green-100 text-green-700',
                    )}>
                      {row.status === 'negotiate' ? '협의 필요' : row.status === 'watch' ? '관찰' : '여유'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2 text-xs font-semibold">
            <CalendarClock className="h-3.5 w-3.5" />
            자체 공사 예정수요
            {loading && <span className="text-muted-foreground">불러오는 중...</span>}
          </div>
          <div className="divide-y">
            {demands.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">등록된 현장 수요가 없습니다</p>
            ) : demands.map((item) => (
              <div key={item.forecast_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <span className="font-medium">{item.site_name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {item.demand_month} · {item.module_width_mm}×{item.module_height_mm} · {item.spec_wp}W · {mw(item.required_kw)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon-xs" variant="ghost" onClick={() => openEdit(item)} aria-label="수요 수정">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => remove(item)} aria-label="수요 삭제">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '현장 수요 수정' : '현장 수요 등록'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {companyId === 'all' && (
              <div className="space-y-1.5">
                <Label>법인 *</Label>
                <Select
                  value={form.companyId}
                  onValueChange={(v) => {
                    const nextCompanyId = v ?? '';
                    const nextOption = moduleOptions.find((option) => option.companyId === nextCompanyId);
                    setForm((p) => ({ ...p, companyId: nextCompanyId, moduleKey: nextOption?.key ?? '' }));
                  }}
                >
                  <SelectTrigger><SelectText text={selectedCompanyName} /></SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.company_id} value={company.company_id}>{company.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>현장명 *</Label>
                <Input value={form.siteName} onChange={(e) => setForm((p) => ({ ...p, siteName: e.target.value }))} placeholder="예) 완도 관산포" />
              </div>
              <div className="space-y-1.5">
                <Label>투입월 *</Label>
                <Input type="month" value={form.demandMonth} onChange={(e) => setForm((p) => ({ ...p, demandMonth: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>모듈군 *</Label>
                <Select value={form.moduleKey} onValueChange={(v) => setForm((p) => ({ ...p, moduleKey: v ?? '' }))}>
                  <SelectTrigger><SelectText text={selectedModuleLabel} /></SelectTrigger>
                  <SelectContent>
                    {moduleOptions
                      .filter((option) => companyId !== 'all' || option.companyId === form.companyId)
                      .map((option) => (
                      <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>제조사</Label>
                <Select value={form.manufacturerId} onValueChange={(v) => setForm((p) => ({ ...p, manufacturerId: v ?? 'any' }))}>
                  <SelectTrigger><SelectText text={selectedManufacturerName} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">제조사 무관</SelectItem>
                    {manufacturers.map((m) => (
                      <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.short_name || m.name_kr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>필요 용량 (MW) *</Label>
                <Input type="number" step="0.001" value={form.requiredMw} onChange={(e) => setForm((p) => ({ ...p, requiredMw: e.target.value }))} placeholder="예) 90" />
              </div>
              <div className="space-y-1.5">
                <Label>상태</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as ModuleDemandForecast['status'] }))}>
                  <SelectTrigger><SelectText text={selectedStatusLabel} /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(DEMAND_STATUS_LABEL) as [ModuleDemandForecast['status'], string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>메모</Label>
              <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="예) 일정 유동, Tier1 대체 가능" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>취소</Button>
            <Button onClick={save}>{editing ? '수정 저장' : '등록'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
