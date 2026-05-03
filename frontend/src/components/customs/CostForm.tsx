import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import type { Product } from '@/types/masters';
import type { DeclarationCost } from '@/types/customs';
import { SandboxBanner, useFormReadOnly } from '@/onboarding';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  declarationId: string;
  editData?: DeclarationCost | null;
}

export default function CostForm({ open, onOpenChange, onSubmit, declarationId, editData }: Props) {
  const readOnly = useFormReadOnly(editData);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [fobUnitUsd, setFobUnitUsd] = useState('');
  const [fobTotalUsd, setFobTotalUsd] = useState('');
  const [fobWpKrw, setFobWpKrw] = useState('');
  const [cifTotalKrw, setCifTotalKrw] = useState('');
  const [cifUnitUsd, setCifUnitUsd] = useState('');
  const [cifTotalUsd, setCifTotalUsd] = useState('');
  const [tariffRate, setTariffRate] = useState('');
  const [tariffAmount, setTariffAmount] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [customsFee, setCustomsFee] = useState('');
  const [incidentalCost, setIncidentalCost] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
  }, []);

  // 자동 계산: CIF Wp단가 = CIF 합계 KRW / (수량 * spec_wp)
  const selectedProduct = products.find((p) => p.product_id === productId);
  const specWp = selectedProduct?.spec_wp || 0;
  const qty = parseInt(quantity) || 0;
  const cifKrw = parseFloat(cifTotalKrw) || 0;
  const cifWpKrw = specWp > 0 && qty > 0 ? cifKrw / (qty * specWp) : 0;
  const capacityKw = specWp > 0 && qty > 0 ? (qty * specWp) / 1000 : 0;

  // Landed Wp단가 자동계산
  const landedTotalKrw = (parseFloat(tariffAmount) || 0) + cifKrw + (parseFloat(customsFee) || 0) + (parseFloat(incidentalCost) || 0);
  const landedWpKrw = specWp > 0 && qty > 0 ? landedTotalKrw / (qty * specWp) : 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 편집 모드 폼 prefill (open/editData 동기화)
    if (open) setSubmitError('');
    if (editData) {
      setProductId(editData.product_id);
      setQuantity(String(editData.quantity));
      setExchangeRate(String(editData.exchange_rate));
      setFobUnitUsd(editData.fob_unit_usd != null ? String(editData.fob_unit_usd) : '');
      setFobTotalUsd(editData.fob_total_usd != null ? String(editData.fob_total_usd) : '');
      setFobWpKrw(editData.fob_wp_krw != null ? String(editData.fob_wp_krw) : '');
      setCifTotalKrw(String(editData.cif_total_krw));
      setCifUnitUsd(editData.cif_unit_usd != null ? String(editData.cif_unit_usd) : '');
      setCifTotalUsd(editData.cif_total_usd != null ? String(editData.cif_total_usd) : '');
      setTariffRate(editData.tariff_rate != null ? String(editData.tariff_rate) : '');
      setTariffAmount(editData.tariff_amount != null ? String(editData.tariff_amount) : '');
      setVatAmount(editData.vat_amount != null ? String(editData.vat_amount) : '');
      setCustomsFee(editData.customs_fee != null ? String(editData.customs_fee) : '');
      setIncidentalCost(editData.incidental_cost != null ? String(editData.incidental_cost) : '');
      setMemo(editData.memo || '');
    } else {
      setProductId(''); setQuantity(''); setExchangeRate('');
      setFobUnitUsd(''); setFobTotalUsd(''); setFobWpKrw('');
      setCifTotalKrw(''); setCifUnitUsd(''); setCifTotalUsd('');
      setTariffRate(''); setTariffAmount(''); setVatAmount('');
      setCustomsFee(''); setIncidentalCost(''); setMemo('');
    }
  }, [editData, open]);

  const handleSubmit = async () => {
    if (readOnly) return;
    setLoading(true);
    setSubmitError('');
    try {
      const payload: Record<string, unknown> = {
        declaration_id: declarationId,
        product_id: productId,
        quantity: qty,
        capacity_kw: capacityKw || undefined,
        exchange_rate: parseFloat(exchangeRate),
        cif_total_krw: cifKrw,
        cif_wp_krw: Math.round(cifWpKrw * 100) / 100,
      };
      if (fobUnitUsd) payload.fob_unit_usd = parseFloat(fobUnitUsd);
      if (fobTotalUsd) payload.fob_total_usd = parseFloat(fobTotalUsd);
      if (fobWpKrw) payload.fob_wp_krw = parseFloat(fobWpKrw);
      if (cifUnitUsd) payload.cif_unit_usd = parseFloat(cifUnitUsd);
      if (cifTotalUsd) payload.cif_total_usd = parseFloat(cifTotalUsd);
      if (tariffRate) payload.tariff_rate = parseFloat(tariffRate);
      if (tariffAmount) payload.tariff_amount = parseFloat(tariffAmount);
      if (vatAmount) payload.vat_amount = parseFloat(vatAmount);
      if (customsFee) payload.customs_fee = parseFloat(customsFee);
      if (incidentalCost) payload.incidental_cost = parseFloat(incidentalCost);
      if (landedTotalKrw > 0) payload.landed_total_krw = landedTotalKrw;
      if (landedWpKrw > 0) payload.landed_wp_krw = Math.round(landedWpKrw * 100) / 100;
      if (memo) payload.memo = memo;
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '원가 수정' : '원가 추가'}</DialogTitle>
        </DialogHeader>
        {readOnly && <SandboxBanner />}
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <fieldset disabled={readOnly} className="contents">
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>품목 *</Label>
              <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
                <SelectTrigger><Txt text={(() => { const p = products.find(p => p.product_id === productId); return p ? `${p.product_name} (${p.spec_wp}Wp)` : ''; })()} placeholder="품목 선택" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.product_id} value={p.product_id}>{p.product_name} ({p.spec_wp}Wp)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>수량 *</Label>
              <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min={1} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>용량 kW (자동)</Label>
              <Input value={capacityKw ? capacityKw.toFixed(1) : ''} readOnly className="bg-muted" />
            </div>
            <div>
              <Label>환율 *</Label>
              <Input inputMode="decimal" placeholder="예: 1450.30" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
          </div>

          {/* FOB */}
          <p className="text-xs font-semibold text-orange-600 mt-2">Stage 1: FOB</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>FOB 단가 (cent/Wp)</Label>
              <Input type="number" value={fobUnitUsd} onChange={(e) => setFobUnitUsd(e.target.value)} step="0.0001" />
            </div>
            <div>
              <Label>FOB 합계 ($)</Label>
              <Input type="number" value={fobTotalUsd} onChange={(e) => setFobTotalUsd(e.target.value)} step="0.01" />
            </div>
            <div>
              <Label>FOB 원/Wp</Label>
              <Input type="number" value={fobWpKrw} onChange={(e) => setFobWpKrw(e.target.value)} step="0.01" />
            </div>
          </div>

          {/* CIF */}
          <p className="text-xs font-semibold text-blue-600 mt-2">Stage 2: CIF</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>CIF 합계 KRW *</Label>
              <Input type="number" value={cifTotalKrw} onChange={(e) => setCifTotalKrw(e.target.value)} />
            </div>
            <div>
              <Label>CIF 단가 USD</Label>
              <Input type="number" value={cifUnitUsd} onChange={(e) => setCifUnitUsd(e.target.value)} step="0.01" />
            </div>
            <div>
              <Label>CIF 합계 USD</Label>
              <Input type="number" value={cifTotalUsd} onChange={(e) => setCifTotalUsd(e.target.value)} step="0.01" />
            </div>
          </div>
          <div>
            <Label>CIF Wp단가 (자동 읽기전용)</Label>
            <Input value={cifWpKrw ? `${cifWpKrw.toFixed(2)} 원/Wp` : ''} readOnly className="bg-muted" />
          </div>

          {/* Landed */}
          <p className="text-xs font-semibold text-green-600 mt-2">Stage 3: Landed</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>관세율 (%)</Label>
              <Input type="number" value={tariffRate} onChange={(e) => setTariffRate(e.target.value)} step="0.01" />
            </div>
            <div>
              <Label>관세액</Label>
              <Input type="number" value={tariffAmount} onChange={(e) => setTariffAmount(e.target.value)} />
            </div>
            <div>
              <Label>부가세 (VAT)</Label>
              <Input type="number" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>통관수수료</Label>
              <Input type="number" value={customsFee} onChange={(e) => setCustomsFee(e.target.value)} />
            </div>
            <div>
              <Label>부대비용</Label>
              <Input type="number" value={incidentalCost} onChange={(e) => setIncidentalCost(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Landed 합계 KRW (자동)</Label>
              <Input value={landedTotalKrw ? `${landedTotalKrw.toLocaleString('ko-KR')}원` : ''} readOnly className="bg-muted" />
            </div>
            <div>
              <Label>Landed Wp단가 (자동)</Label>
              <Input value={landedWpKrw ? `${landedWpKrw.toFixed(2)} 원/Wp` : ''} readOnly className="bg-muted" />
            </div>
          </div>

          <div>
            <Label>메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
          </div>
        </div>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>취소</Button>
          {!readOnly && (
            <Button onClick={handleSubmit} disabled={loading || !productId || !quantity || !exchangeRate || !cifTotalKrw}>
              {loading ? '처리 중...' : editData ? '수정' : '추가'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
