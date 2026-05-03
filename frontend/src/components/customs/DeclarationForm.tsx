import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { BLShipment } from '@/types/inbound';
import type { Declaration } from '@/types/customs';
import { SandboxBanner, useFormReadOnly } from '@/onboarding';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Declaration | null;
  /** D-085: BL 상세에서 면장 등록 시 사전 연결 */
  presetBLId?: string | null;
}

export default function DeclarationForm({ open, onOpenChange, onSubmit, editData, presetBLId }: Props) {
  const readOnly = useFormReadOnly(editData);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [bls, setBls] = useState<BLShipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [declarationNumber, setDeclarationNumber] = useState('');
  const [blId, setBlId] = useState('');
  const [declarationDate, setDeclarationDate] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [customsOffice, setCustomsOffice] = useState('');
  const [port, setPort] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<BLShipment[]>(`/api/v1/bls?company_id=${selectedCompanyId}`)
        .then(setBls).catch(() => {});
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 편집 모드 폼 prefill (open/editData 동기화)
    if (open) setSubmitError('');
    if (editData) {
      setDeclarationNumber(editData.declaration_number);
      setBlId(editData.bl_id);
      setDeclarationDate(editData.declaration_date?.slice(0, 10) || '');
      setArrivalDate(editData.arrival_date?.slice(0, 10) || '');
      setReleaseDate(editData.release_date?.slice(0, 10) || '');
      setHsCode(editData.hs_code || '');
      setCustomsOffice(editData.customs_office || '');
      setPort(editData.port || '');
      setMemo(editData.memo || '');
    } else {
      setDeclarationNumber(''); setBlId(presetBLId ?? ''); setDeclarationDate('');
      setArrivalDate(''); setReleaseDate(''); setHsCode('');
      setCustomsOffice(''); setPort(''); setMemo('');
    }
  }, [editData, open, presetBLId]);

  const handleSubmit = async () => {
    if (readOnly) return;
    setLoading(true);
    setSubmitError('');
    try {
      const payload: Record<string, unknown> = {
        declaration_number: declarationNumber,
        bl_id: blId,
        company_id: selectedCompanyId,
        declaration_date: declarationDate,
      };
      if (arrivalDate) payload.arrival_date = arrivalDate;
      if (releaseDate) payload.release_date = releaseDate;
      if (hsCode) payload.hs_code = hsCode;
      if (customsOffice) payload.customs_office = customsOffice;
      if (port) payload.port = port;
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
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '면장 수정' : '면장 등록'}</DialogTitle>
        </DialogHeader>
        {readOnly && <SandboxBanner />}
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <fieldset disabled={readOnly} className="contents">
        <div className="grid gap-3 py-2">
          <div>
            <Label>면장번호 *</Label>
            <Input value={declarationNumber} onChange={(e) => setDeclarationNumber(e.target.value)} placeholder="면장번호" />
          </div>
          <div>
            <Label>B/L *</Label>
            <Select value={blId} onValueChange={(v) => setBlId(v ?? '')}>
              <SelectTrigger><Txt text={bls.find(b => b.bl_id === blId)?.bl_number ?? ''} placeholder="B/L 선택" /></SelectTrigger>
              <SelectContent>
                {bls.map((bl) => (
                  <SelectItem key={bl.bl_id} value={bl.bl_id}>{bl.bl_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>신고일 *</Label>
            <DateInput value={declarationDate} onChange={setDeclarationDate} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>입항일</Label>
              <DateInput value={arrivalDate} onChange={setArrivalDate} />
            </div>
            <div>
              <Label>반출일</Label>
              <DateInput value={releaseDate} onChange={setReleaseDate} />
            </div>
          </div>
          <div>
            <Label>HS코드</Label>
            <Input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="HS코드" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>세관</Label>
              <Input value={customsOffice} onChange={(e) => setCustomsOffice(e.target.value)} placeholder="세관" />
            </div>
            <div>
              <Label>항구</Label>
              <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="항구" />
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
            <Button onClick={handleSubmit} disabled={loading || !declarationNumber || !blId || !declarationDate}>
              {loading ? '처리 중...' : editData ? '수정' : '등록'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
