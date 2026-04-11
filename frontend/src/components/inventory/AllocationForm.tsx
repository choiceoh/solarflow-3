import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { InventoryItem } from '@/types/inventory';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return (
    <span
      className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`}
      data-slot="select-value"
    >
      {text || placeholder}
    </span>
  );
}

export interface InventoryAllocation {
  alloc_id: string;
  company_id: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  spec_wp?: number;
  quantity: number;
  capacity_kw?: number;
  purpose: 'sale' | 'construction' | 'other';
  source_type: 'stock' | 'incoming';
  customer_name?: string;
  site_name?: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  outbound_id?: string;
  created_at: string;
}

const PURPOSE_LABEL: Record<string, string> = {
  sale: '판매 예정',
  construction: '공사 사용 예정',
  other: '기타',
};
const SOURCE_LABEL: Record<string, string> = {
  stock: '현재고',
  incoming: '미착품',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  prefilledProductId?: string;
  invItems?: InventoryItem[];          // InventoryPage에서 전달받은 재고 아이템
  priceMapProp?: Map<string, number>;  // 부모에서 전달받은 단가 맵 (product_id → price)
}

function eaFromKw(kw: number, specWp: number) {
  if (!specWp) return 0;
  return Math.round((kw * 1000) / specWp);
}

/** YYYY-MM-DD → "YY년 M월" 형식 */
function fmtYearMonth(dateStr?: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const yy = String(d.getFullYear()).slice(2);
  const mm = d.getMonth() + 1;
  return `${yy}년 ${mm}월`;
}

/** 단가 표시: $0.XXXX/Wp */
function fmtPrice(price?: number) {
  if (!price) return null;
  return `$${price.toFixed(4)}/Wp`;
}

export default function AllocationForm({
  open,
  onOpenChange,
  onSaved,
  prefilledProductId,
  invItems = [],
  priceMapProp,
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 단가 맵: 부모에서 전달받은 값 우선, 없으면 빈 Map
  const priceMap = priceMapProp ?? new Map<string, number>();

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [qtyDisplay, setQtyDisplay] = useState('');
  const [purpose, setPurpose] = useState<'sale' | 'construction' | 'other'>('sale');
  const [sourceType, setSourceType] = useState<'stock' | 'incoming'>('stock');
  const [customerName, setCustomerName] = useState('');
  const [siteName, setSiteName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // 폼 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setProductId(prefilledProductId ?? '');
      setQuantity('');
      setQtyDisplay('');
      setPurpose('sale');
      setSourceType('stock');
      setCustomerName('');
      setSiteName('');
      setNotes('');
      setError('');
    }
  }, [open, prefilledProductId]);

  // source_type에 따라 표시 가능한 품목 필터링
  const filteredItems = useMemo(() => {
    return invItems.filter((it) =>
      sourceType === 'stock' ? it.physical_kw > 0 : it.incoming_kw > 0,
    );
  }, [invItems, sourceType]);

  // source_type 변경 시 해당 출처에 재고 없으면 품목 초기화
  useEffect(() => {
    if (productId && !filteredItems.find((it) => it.product_id === productId)) {
      setProductId('');
    }
  }, [sourceType, filteredItems, productId]);

  const selectedItem = filteredItems.find((it) => it.product_id === productId);

  // 용량 자동 계산
  const capacityKw = useMemo(() => {
    if (!selectedItem || !quantity) return 0;
    const qty = parseInt(quantity.replace(/,/g, ''), 10);
    if (!qty || isNaN(qty)) return 0;
    return qty * (selectedItem.spec_wp / 1000);
  }, [selectedItem, quantity]);

  // 선택된 품목의 가용/미착 EA
  const availEa = selectedItem
    ? sourceType === 'stock'
      ? eaFromKw(selectedItem.available_kw, selectedItem.spec_wp)
      : eaFromKw(selectedItem.available_incoming_kw, selectedItem.spec_wp)
    : 0;

  // 드롭다운 표시 레이블 생성 헬퍼
  function itemLabel(it: InventoryItem) {
    const ea =
      sourceType === 'stock'
        ? eaFromKw(it.physical_kw, it.spec_wp)
        : eaFromKw(it.incoming_kw, it.spec_wp);
    const price = priceMap.get(it.product_id);
    const priceStr = fmtPrice(price) ? ` · ${fmtPrice(price)}` : '';
    const tag = sourceType === 'stock' ? '현재고' : '미착';
    const dateStr =
      sourceType === 'stock'
        ? fmtYearMonth(it.latest_arrival)
        : fmtYearMonth(it.latest_lc_open);
    const dateTag = dateStr ? ` (${dateStr} 입고${sourceType === 'incoming' ? ' 예정' : ''})` : '';
    return `${it.manufacturer_name} | ${it.product_name} | ${it.spec_wp}Wp · ${tag} ${ea.toLocaleString()}ea${dateTag}${priceStr}`;
  }

  // 선택된 아이템의 축약 레이블 (SelectTrigger 표시용)
  const triggerLabel = selectedItem
    ? `${selectedItem.manufacturer_name} | ${selectedItem.product_name} | ${selectedItem.spec_wp}Wp`
    : '';

  const handleSave = async () => {
    setError('');
    if (!productId) {
      setError('품목을 선택해주세요');
      return;
    }
    const qty = parseInt(quantity.replace(/,/g, ''), 10);
    if (!qty || qty <= 0) {
      setError('수량을 입력해주세요');
      return;
    }

    setSaving(true);
    try {
      await fetchWithAuth('/api/v1/inventory/allocations', {
        method: 'POST',
        body: JSON.stringify({
          company_id: selectedCompanyId,
          product_id: productId,
          quantity: qty,
          capacity_kw: capacityKw || undefined,
          purpose,
          source_type: sourceType,
          customer_name: customerName || undefined,
          site_name: siteName || undefined,
          notes: notes || undefined,
        }),
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>가용재고 배정 등록</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* 용도 + 출처 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>용도 *</Label>
              <Select value={purpose} onValueChange={(v) => setPurpose((v ?? 'sale') as typeof purpose)}>
                <SelectTrigger className="w-full">
                  <Txt text={PURPOSE_LABEL[purpose]} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PURPOSE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>재고 출처 *</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType((v ?? 'stock') as typeof sourceType)}>
                <SelectTrigger className="w-full">
                  <Txt text={SOURCE_LABEL[sourceType]} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">현재고</SelectItem>
                  <SelectItem value="incoming">미착품 (L/C 개설 후)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 품목 선택 */}
          <div className="space-y-1.5">
            <Label>품목 *</Label>
            {filteredItems.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {sourceType === 'stock' ? '현재고가 있는 품목이 없습니다.' : 'L/C 개설 후 미착품이 없습니다.'}
              </div>
            ) : (
              <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <Txt text={triggerLabel} placeholder="제조사 | 품명 | 규격 선택" />
                </SelectTrigger>
                <SelectContent className="max-w-[640px]">
                  {filteredItems.map((it) => (
                    <SelectItem key={it.product_id} value={it.product_id} className="text-xs">
                      {itemLabel(it)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* 선택 품목 상세 — 5열 한 줄 */}
            {selectedItem && (
              <div className="rounded bg-muted/30 px-3 py-2 text-xs grid grid-cols-5 gap-x-4 gap-y-1">
                <div>
                  <div className="text-muted-foreground mb-0.5">제조사</div>
                  <div className="font-medium truncate">{selectedItem.manufacturer_name}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">규격</div>
                  <div className="font-medium">{selectedItem.spec_wp}Wp</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">
                    {sourceType === 'stock' ? '가용 EA' : '미착 EA'}
                  </div>
                  <div className="font-medium text-blue-700">
                    {availEa.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">최근 단가</div>
                  <div className="font-medium text-emerald-700">
                    {fmtPrice(priceMap.get(selectedItem.product_id)) ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">
                    {sourceType === 'stock' ? '최근 입항일' : 'L/C 개설일'}
                  </div>
                  <div className="font-medium">
                    {sourceType === 'stock'
                      ? (selectedItem.latest_arrival ?? '—')
                      : (selectedItem.latest_lc_open ?? '—')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 수량 + 용량 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>수량 (EA) *</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={qtyDisplay}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setQtyDisplay(raw ? parseInt(raw, 10).toLocaleString('ko-KR') : '');
                  setQuantity(raw);
                }}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>용량 (kW)</Label>
              <Input
                value={capacityKw ? `${capacityKw.toFixed(1)} kW` : '—'}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>

          {/* 거래처/현장 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{purpose === 'sale' ? '거래처명' : '현장명'}</Label>
              <Input
                value={purpose === 'sale' ? customerName : siteName}
                onChange={(e) =>
                  purpose === 'sale' ? setCustomerName(e.target.value) : setSiteName(e.target.value)
                }
                placeholder={purpose === 'sale' ? '거래처 이름' : '현장 이름'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{purpose === 'sale' ? '현장명' : '거래처명'}</Label>
              <Input
                value={purpose === 'sale' ? siteName : customerName}
                onChange={(e) =>
                  purpose === 'sale' ? setSiteName(e.target.value) : setCustomerName(e.target.value)
                }
                placeholder="선택 입력"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>메모</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '배정 등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
