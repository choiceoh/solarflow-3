import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatNumber, shortMfgName } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { DetailSection, DetailField, DetailFieldGrid } from '@/components/common/detail';
import InboundStatusBadge from './InboundStatusBadge';
import StatusChanger from './StatusChanger';
import BLLineTable from './BLLineTable';
import BLLineForm from './BLLineForm';
import LinkedMemoWidget from '@/components/memo/LinkedMemoWidget';
import AttachmentWidget from '@/components/common/AttachmentWidget';
import BLForm from './BLForm';
import { saveBLShipmentWithLines } from '@/lib/blShipment';
import { useBLDetail, useBLLines } from '@/hooks/useInbound';
import { fetchWithAuth } from '@/lib/api';
import { INBOUND_TYPE_LABEL, type BLLineItem } from '@/types/inbound';
import type { Manufacturer } from '@/types/masters';
import BLExpensesTab from './BLExpensesTab';
import BLOutboundTrackingTab from './BLOutboundTrackingTab';

interface Props {
  blId: string;
  onBack: () => void;
}

const BL_DOCUMENT_ATTACHMENTS = [
  { fileType: 'customs_declaration_pdf', title: '면장', uploadLabel: '면장 PDF 업로드' },
  { fileType: 'commercial_invoice_pdf', title: 'C/I', uploadLabel: 'C/I PDF 업로드' },
  { fileType: 'bill_of_lading_pdf', title: 'B/L', uploadLabel: 'B/L PDF 업로드' },
  { fileType: 'packing_list_pdf', title: 'P/L', uploadLabel: 'P/L PDF 업로드' },
] as const;

type BLDocumentFileType = typeof BL_DOCUMENT_ATTACHMENTS[number]['fileType'];

function classifyBLDocument(name: string): BLDocumentFileType | null {
  const lower = name.toLowerCase();
  const compact = lower.replace(/[\s._()-]+/g, '');
  if (lower.includes('면장') || lower.includes('수입신고') || lower.includes('declaration') || lower.includes('customs')) {
    return 'customs_declaration_pdf';
  }
  if (lower.includes('commercial') || lower.includes('invoice') || lower.includes('인보이스') || lower.includes('송장') || compact.includes('ci')) {
    return 'commercial_invoice_pdf';
  }
  if (lower.includes('bill of lading') || lower.includes('선하증권') || compact.includes('billoflading') || compact.includes('bl')) {
    return 'bill_of_lading_pdf';
  }
  if (lower.includes('packing') || lower.includes('패킹') || lower.includes('포장명세') || compact.includes('pl')) {
    return 'packing_list_pdf';
  }
  return null;
}

export default function BLDetailView({ blId, onBack }: Props) {
  const { data: bl, loading: blLoading, reload: reloadBL } = useBLDetail(blId);
  const { data: lines, loading: linesLoading, reload: reloadLines } = useBLLines(blId);
  const [editingBL, setEditingBL] = useState(false);
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [editLine, setEditLine] = useState<BLLineItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manufacturerName, setManufacturerName] = useState<string>('');
  const documentSetInputRef = useRef<HTMLInputElement | null>(null);
  const [documentReloadKey, setDocumentReloadKey] = useState(0);
  const [documentSetUploading, setDocumentSetUploading] = useState(false);
  const [documentSetError, setDocumentSetError] = useState('');

  // 평탄 응답에는 공급사명이 포함되지 않으므로 별도 조회
  useEffect(() => {
    if (!bl?.manufacturer_id) { setManufacturerName(''); return; }
    if (bl.manufacturer_name) { setManufacturerName(bl.manufacturer_name); return; }
    let cancelled = false;
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => {
        if (cancelled) return;
        const m = list.find((x) => x.manufacturer_id === bl.manufacturer_id);
        setManufacturerName(m?.name_kr ?? '');
      })
      .catch(() => { if (!cancelled) setManufacturerName(''); });
    return () => { cancelled = true; };
  }, [bl?.manufacturer_id, bl?.manufacturer_name]);

  if (blLoading || !bl) return <LoadingSpinner />;

  const isImport = bl.inbound_type === 'import';

  const handleUpdateBL = async (data: Record<string, unknown>) => {
    await saveBLShipmentWithLines({ ...data, bl_id: blId });
    reloadBL();
    reloadLines();
    setEditingBL(false);
  };

  const handleCreateLine = async (data: Record<string, unknown>) => {
    await fetchWithAuth(`/api/v1/bls/${blId}/lines`, { method: 'POST', body: JSON.stringify(data) });
    reloadLines();
  };

  const handleUpdateLine = async (data: Record<string, unknown>) => {
    if (!editLine) return;
    await fetchWithAuth(`/api/v1/bls/${blId}/lines/${editLine.bl_line_id}`, { method: 'PUT', body: JSON.stringify(data) });
    setEditLine(null);
    reloadLines();
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetchWithAuth(`/api/v1/bls/${blId}`, { method: 'DELETE' });
      setDeleteOpen(false);
      onBack();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  const uploadDocumentSet = async (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;

    const invalid = selected.filter((file) => !file.name.toLowerCase().endsWith('.pdf'));
    if (invalid.length > 0) {
      setDocumentSetError('PDF 파일만 업로드할 수 있습니다');
      if (documentSetInputRef.current) documentSetInputRef.current.value = '';
      return;
    }

    const classified = selected.map((file) => ({ file, fileType: classifyBLDocument(file.name) }));
    const unknown = classified.filter((item) => !item.fileType).map((item) => item.file.name);
    if (unknown.length > 0) {
      setDocumentSetError(`서류 종류를 알 수 없습니다: ${unknown.join(', ')}`);
      if (documentSetInputRef.current) documentSetInputRef.current.value = '';
      return;
    }

    setDocumentSetUploading(true);
    setDocumentSetError('');
    try {
      for (const item of classified) {
        const form = new FormData();
        form.append('entity_type', 'bl_shipments');
        form.append('entity_id', blId);
        form.append('file_type', item.fileType!);
        form.append('file', item.file);
        await fetchWithAuth('/api/v1/attachments', { method: 'POST', body: form });
      }
      setDocumentReloadKey((key) => key + 1);
    } catch (err) {
      setDocumentSetError(err instanceof Error ? err.message : '서류 세트 업로드에 실패했습니다');
    } finally {
      setDocumentSetUploading(false);
      if (documentSetInputRef.current) documentSetInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="sf-detail-header">
        <button type="button" className="sf-detail-header-back" onClick={onBack} aria-label="목록으로">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-base font-semibold" style={{ letterSpacing: '-0.012em' }}>
          입고 <span className="sf-mono">{bl.bl_number}</span>
        </h2>
        {!editingBL && (
          <>
            <StatusChanger blId={blId} currentStatus={bl.status} inboundType={bl.inbound_type} onChanged={reloadBL} />
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />삭제
            </Button>
          </>
        )}
      </div>

      {editingBL && (
        <DetailSection title="B/L 수정">
          <BLForm
            variant="inline"
            onOpenChange={(o) => { if (!o) setEditingBL(false); }}
            onSubmit={handleUpdateBL}
            editData={bl}
          />
        </DetailSection>
      )}

      {!editingBL && (
      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">기본정보</TabsTrigger>
          <TabsTrigger value="documents">서류</TabsTrigger>
          <TabsTrigger value="lines">입고품목</TabsTrigger>
          <TabsTrigger value="customs">부대비용 등록</TabsTrigger>
          <TabsTrigger value="outbound">출고추적</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <div className="space-y-4">
            <DetailSection
              title="기본 정보"
              badges={<InboundStatusBadge status={bl.status} />}
              actions={(
                <Button variant="outline" size="sm" onClick={() => setEditingBL(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />수정
                </Button>
              )}
            >
              <DetailFieldGrid cols={4}>
                <DetailField label="입고 구분" value={INBOUND_TYPE_LABEL[bl.inbound_type]} />
                <DetailField label="공급사" value={shortMfgName(manufacturerName || bl.manufacturer_name)} />
                {bl.po_id && (
                  <DetailField label="PO번호">
                    <button className="text-sm text-primary underline" onClick={() => { window.location.href = `/procurement?po=${bl.po_id}`; }}>
                      {bl.po_number ?? bl.po_id.slice(0, 8)}
                    </button>
                  </DetailField>
                )}
                {bl.lc_id && (
                  <DetailField label="LC번호">
                    <button className="text-sm text-primary underline" onClick={() => { window.location.href = `/lc?lc=${bl.lc_id}`; }}>
                      {bl.lc_number ?? bl.lc_id.slice(0, 8)}
                    </button>
                  </DetailField>
                )}
                <DetailField label="통화" value={bl.currency === 'USD' ? 'USD (달러)' : 'KRW (원)'} />
                {isImport && <DetailField label="환율" value={bl.exchange_rate?.toString()} />}
                <DetailField label="입고 창고" value={bl.warehouse_name} />
              </DetailFieldGrid>
            </DetailSection>

            {isImport && (
              <DetailSection title="선적 일정">
                <DetailFieldGrid cols={4}>
                  <DetailField label="ETD" value={formatDate(bl.etd ?? '')} />
                  <DetailField label="ETA" value={formatDate(bl.eta ?? '')} />
                  <DetailField label="실제입항" value={formatDate(bl.actual_arrival ?? '')} />
                  <DetailField label="항구" value={bl.port} />
                  <DetailField label="포워더" value={bl.forwarder} />
                  <DetailField label="Invoice No." value={bl.invoice_number} />
                  {bl.declaration_number && <DetailField label="면장번호" value={bl.declaration_number} />}
                  <DetailField label="인코텀즈" value={bl.incoterms} />
                </DetailFieldGrid>
              </DetailSection>
            )}

            {!isImport && (
              <DetailSection title="입고/납품">
                <DetailFieldGrid cols={4}>
                  <DetailField label="입고/납품일" value={formatDate(bl.actual_arrival ?? '')} />
                  {bl.declaration_number && <DetailField label="면장번호" value={bl.declaration_number} />}
                </DetailFieldGrid>
              </DetailSection>
            )}

            {(bl.payment_terms || bl.counterpart_company_id) && (
              <DetailSection title="결제 · 거래">
                <DetailFieldGrid cols={4}>
                  {bl.payment_terms && <DetailField label="결제조건" value={bl.payment_terms} span={2} />}
                  {bl.counterpart_company_id && <DetailField label="상대법인" value={bl.counterpart_company_id} span={2} />}
                </DetailFieldGrid>
              </DetailSection>
            )}

            {bl.memo && (
              <DetailSection title="메모">
                <p className="text-sm whitespace-pre-wrap break-words">{bl.memo}</p>
              </DetailSection>
            )}

            {lines.length > 0 && (() => {
              const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
              const totalMW = lines.reduce((s, l) => s + (l.capacity_kw ?? 0), 0) / 1000;
              const totalInvoice = lines.reduce((s, l) => s + (l.invoice_amount_usd ?? 0), 0);
              // 원가 확정: 해외직수입 = unit_price_usd_wp × exchange_rate, 국내 = unit_price_krw_wp
              const exRate = bl.exchange_rate ?? 0;
              const totalCostKrw = lines.reduce((s, l) => {
                const costWp = isImport
                  ? (l.unit_price_usd_wp != null ? l.unit_price_usd_wp * exRate : 0)
                  : (l.unit_price_krw_wp ?? 0);
                return s + costWp * (l.capacity_kw ?? 0) * 1000;
              }, 0);
              const hasCost = lines.some(l => l.unit_price_usd_wp != null || l.unit_price_krw_wp != null);
              return (
                <DetailSection title="합계">
                  <DetailFieldGrid cols={3}>
                    <DetailField label="총 수량" value={`${formatNumber(totalQty)} EA`} />
                    <DetailField label="총 용량" value={`${totalMW.toFixed(3)} MW`} />
                    {totalInvoice > 0 && (
                      <DetailField label="총 입고금액" value={`$${formatNumber(Math.round(totalInvoice))}`} />
                    )}
                  </DetailFieldGrid>
                  {hasCost && totalCostKrw > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-1.5">원가 확정 (BL 기준)</p>
                      <div className="flex gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground">총 원가</p>
                          <p className="text-sm font-mono font-medium text-blue-700">
                            {Math.round(totalCostKrw).toLocaleString('ko-KR')}원
                          </p>
                        </div>
                        {totalMW > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">평균 원가</p>
                            <p className="text-sm font-mono font-medium text-blue-700">
                              {(totalCostKrw / (totalMW * 1_000_000)).toFixed(2)}원/Wp
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </DetailSection>
              );
            })()}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">B/L 서류 보관</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={documentSetUploading}
                  onClick={() => documentSetInputRef.current?.click()}
                >
                  <Upload className={`mr-1 h-3.5 w-3.5 ${documentSetUploading ? 'animate-pulse' : ''}`} />
                  {documentSetUploading ? '업로드 중' : '서류 세트 업로드'}
                </Button>
                <input
                  ref={documentSetInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => void uploadDocumentSet(event.target.files)}
                />
              </div>
              {documentSetError && <p className="text-[11px] text-destructive">{documentSetError}</p>}
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 pb-4 lg:grid-cols-2">
              {BL_DOCUMENT_ATTACHMENTS.map((item) => (
                <AttachmentWidget
                  key={item.fileType}
                  entityType="bl_shipments"
                  entityId={blId}
                  fileType={item.fileType}
                  title={`${bl.bl_number} ${item.title}`}
                  uploadLabel={item.uploadLabel}
                  compact
                  reloadKey={documentReloadKey}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lines">
          <Separator className="my-2" />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">입고 품목</h3>
            <Button size="sm" onClick={() => { setEditLine(null); setLineFormOpen(true); }}>
              <Plus className="mr-1 h-3.5 w-3.5" />추가
            </Button>
          </div>
          {linesLoading ? <LoadingSpinner /> : (
            <BLLineTable
              items={lines}
              currency={bl.currency}
              manufacturerName={manufacturerName || bl.manufacturer_name}
              onEdit={(line) => { setEditLine(line); setLineFormOpen(true); }}
            />
          )}
        </TabsContent>

        <TabsContent value="customs">
          <BLExpensesTab blId={blId} lines={lines} />
        </TabsContent>

        <TabsContent value="outbound">
          <BLOutboundTrackingTab blId={blId} companyId={bl.company_id} lines={lines} />
        </TabsContent>
      </Tabs>
      )}

      <LinkedMemoWidget linkedTable="bl_shipments" linkedId={blId} />

      <BLLineForm
        open={lineFormOpen}
        onOpenChange={setLineFormOpen}
        onSubmit={editLine ? handleUpdateLine : handleCreateLine}
        editData={editLine}
        blId={blId}
        currency={bl.currency}
        manufacturerId={bl.manufacturer_id}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="입고 삭제"
        description={`"${bl.bl_number}" 입고 건과 연결된 입고품목이 모두 삭제됩니다. 정말 삭제하시겠습니까?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
