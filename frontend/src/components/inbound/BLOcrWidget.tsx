// Phase 4 — Step 3 follow-up: 면장 OCR 위젯 (BLForm + MetaForm contentBlock 공용)
// 책임: 파일 드롭/선택 → /api/v1/ocr/extract → 후보 추출 → review dialog → onApply 콜백
// 적용 로직 (특정 폼의 setValue) 은 onApply 받아서 호출자가 처리.

import { useEffect, useRef, useState, useCallback, type DragEvent } from 'react';
import { ScanText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import {
  type CustomsDeclarationOCRFields,
  type CustomsDeclarationOCRLine,
  type OCRExtractResponse,
  OCR_PRODUCT_NONE,
  buildFallbackCustomsOCRFields, mergeCustomsOCRFields,
  findProductForOCRLine, selectableOCRProducts, formatOCRProductLabel,
} from '@/lib/blOcr';
import type { Product, Manufacturer } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={text ? '' : 'text-muted-foreground'}>{text || placeholder}</span>;
}

export interface BLOcrApplyArgs {
  fields: CustomsDeclarationOCRFields;
  productOverrides: Record<number, string>;
  /** review dialog 가 매칭에 사용한 product source — onApply 가 lines 매칭에 동일 source 사용 */
  productSource: Product[];
}

export interface BLOcrWidgetProps {
  /** OCR review 통과 후 호출 — 호출자가 form 의 setValue 로 실제 반영 */
  onApply: (args: BLOcrApplyArgs) => Promise<void> | void;
  /** 외부 (페이지 드롭존) 에서 받은 초기 파일 — 동일 key 일 때만 1회 처리 */
  initialFile?: File | null;
  initialFileKey?: number;
  /** 적용 후 summary 표시 — 호출자가 적용 결과 요약 텍스트 제공 */
  summaryFromApply?: string;
  /** 표시 visibleIf 등 호출자 책임 (이 prop 은 클래스 추가만) */
  className?: string;
  /** 호출자가 미리 manufacturer 매칭 등에 사용할 수 있게 노출 — 위젯 자체는 안 씀 (참고용) */
  manufacturers?: Manufacturer[];
}

function isCustomsOCRAcceptedFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type === 'application/pdf'
    || file.type.startsWith('image/')
    || /\.(pdf|png|jpe?g|webp|heic|heif|bmp|tiff?)$/i.test(name);
}

export default function BLOcrWidget({ onApply, initialFile, initialFileKey, summaryFromApply, className }: BLOcrWidgetProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const processedKeyRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFields, setPendingFields] = useState<CustomsDeclarationOCRFields | null>(null);
  const [previewProducts, setPreviewProducts] = useState<Product[]>([]);
  const [productOverrides, setProductOverrides] = useState<Record<number, string>>({});
  const [reviewOpen, setReviewOpen] = useState(false);

  // 호출자가 적용 후 summary 갱신하면 위젯 표시 갱신
  useEffect(() => {
    if (summaryFromApply !== undefined) setSummary(summaryFromApply);
  }, [summaryFromApply]);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError('');
    setSummary('');
    try {
      const form = new FormData();
      form.append('document_type', 'customs_declaration');
      form.append('images', file);
      const response = await fetchWithAuth<OCRExtractResponse>('/api/v1/ocr/extract', { method: 'POST', body: form });
      const result = response.results[0];
      if (!result) throw new Error('OCR 결과가 없습니다');
      if (result.error) throw new Error(result.error);
      const fallbackFields = buildFallbackCustomsOCRFields(result, file.name);
      const fields = mergeCustomsOCRFields(result.fields?.customs_declaration, fallbackFields);
      if (!fields) {
        const rawLineCount = result.lines?.length ?? (result.raw_text ? result.raw_text.split('\n').filter(Boolean).length : 0);
        throw new Error(rawLineCount > 0
          ? 'OCR 원문은 읽었지만 면장 입력 후보를 찾지 못했습니다. 문서가 잘리지 않았는지 확인해주세요.'
          : 'OCR 원문을 읽지 못했습니다. 더 선명한 PDF/사진으로 다시 등록해주세요.');
      }
      let preview: Product[] = [];
      if (fields.line_items?.length) {
        try {
          const list = await fetchWithAuth<Product[]>('/api/v1/products?active=true');
          preview = list.filter((product) => product.is_active);
        } catch { preview = []; }
      }
      setPreviewProducts(preview);
      setProductOverrides({});
      setPendingFields(fields);
      setReviewOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '면장 PDF를 읽지 못했습니다');
      setPendingFile(null);
      setPendingFields(null);
      setPreviewProducts([]);
      setProductOverrides({});
    } finally {
      setLoading(false);
    }
  }, []);

  const prepareUploadFile = useCallback((file: File) => {
    setDragActive(false);
    if (!isCustomsOCRAcceptedFile(file)) {
      setSummary('');
      setError('PDF 또는 사진 파일만 등록할 수 있습니다');
      setPendingFile(null);
      setPendingFields(null);
      setPreviewProducts([]);
      setProductOverrides({});
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setPendingFile(file);
    if (inputRef.current) inputRef.current.value = '';
    void handleFile(file);
  }, [handleFile]);

  const prepareFileList = useCallback((fileList: FileList | null) => {
    const file = fileList?.[0];
    if (file) prepareUploadFile(file);
  }, [prepareUploadFile]);

  // 외부에서 주입한 initialFile 1회 처리 (initialFileKey 변경 시)
  useEffect(() => {
    if (!initialFile || initialFileKey == null) return;
    if (processedKeyRef.current === initialFileKey) return;
    processedKeyRef.current = initialFileKey;
    prepareUploadFile(initialFile);
  }, [initialFile, initialFileKey, prepareUploadFile]);

  // Review confirm
  const onConfirm = async () => {
    if (!pendingFields) { setReviewOpen(false); return; }
    const productSource = previewProducts.length > 0 ? previewProducts : [];
    await onApply({ fields: pendingFields, productOverrides, productSource });
    setPendingFields(null);
    setPendingFile(null);
    setPreviewProducts([]);
    setProductOverrides({});
    setReviewOpen(false);
  };

  const onReviewOpenChange = (next: boolean) => {
    setReviewOpen(next);
    if (!next && !loading) {
      setPendingFile(null);
      setPendingFields(null);
    }
  };

  // Drag handlers
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = loading ? 'none' : 'copy';
    if (!loading) setDragActive(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setDragActive(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    setDragActive(false);
    if (loading) return;
    prepareFileList(event.dataTransfer.files);
  };

  // ─── Review dialog content ───────────────────────────────────────────────
  const reviewRows = pendingFields ? [
    { label: 'B/L번호', value: pendingFields.bl_number?.value, target: 'B/L번호' },
    { label: '면장번호', value: pendingFields.declaration_number?.value, target: '면장번호' },
    { label: '입항일', value: pendingFields.arrival_date?.value, target: '실제입항일' },
    { label: '항구', value: pendingFields.port?.value, target: '항구' },
    { label: '환율', value: pendingFields.exchange_rate?.value, target: '환율' },
    { label: 'CIF(KRW)', value: pendingFields.cif_amount_krw?.value, target: '면장 CIF 원화금액' },
    { label: 'Invoice', value: pendingFields.invoice_number?.value, target: 'Invoice No.' },
    { label: '수입자', value: pendingFields.importer?.value, target: '구매법인 매칭' },
    { label: '거래처', value: pendingFields.trade_partner?.value, target: '공급사 매칭' },
    { label: '신고일', value: pendingFields.declaration_date?.value, target: '참고' },
    { label: 'HS코드', value: pendingFields.hs_code?.value, target: '참고' },
  ].filter((row) => row.value) : [];

  const reviewLineItems = pendingFields?.line_items ?? [];
  const reviewProductSource = previewProducts;
  const reviewLineItemRows = reviewLineItems.map((item, index) => {
    const overrideProduct = productOverrides[index]
      ? reviewProductSource.find((p) => p.product_id === productOverrides[index]) ?? null
      : null;
    const matchedProduct = overrideProduct ?? findProductForOCRLine(item, reviewProductSource);
    return {
      item, index, matchedProduct,
      selectableProducts: selectableOCRProducts(item, reviewProductSource, matchedProduct),
    };
  });

  return (
    <>
      <div
        className={`rounded-md border border-dashed p-3 transition-colors ${
          dragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 bg-muted/40'
        } ${loading ? 'opacity-75' : ''} ${className ?? ''}`}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
            dragActive ? 'border-primary bg-background text-primary' : 'bg-background text-muted-foreground'
          }`}>
            <ScanText className={`h-5 w-5 ${loading ? 'animate-pulse' : ''}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">면장 PDF/사진 자동채움</div>
            <div className={`text-xs ${dragActive ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
              {dragActive ? '여기에 놓으면 바로 읽습니다' : '파일을 이 박스에 끌어다 놓거나 선택하세요'}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto"
            disabled={loading} onClick={() => inputRef.current?.click()}>
            {loading ? '읽는 중' : '파일 선택'}
          </Button>
          <input ref={inputRef} type="file" accept="application/pdf,image/*,.pdf"
            className="hidden"
            onChange={(event) => prepareFileList(event.target.files)} />
        </div>
        {(summary || error) && (
          <div className="mt-2 text-xs">
            {summary && <span className="text-primary">{summary}</span>}
            {error && <span className="text-destructive">{error}</span>}
          </div>
        )}
      </div>

      <Dialog open={reviewOpen} onOpenChange={onReviewOpenChange}>
        <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>OCR 입력값 확인</DialogTitle>
            <DialogDescription>
              {pendingFile ? `${pendingFile.name}에서 읽은 값입니다. 맞는 값만 확인한 뒤 입력칸에 반영하세요.` : 'OCR로 읽은 값을 확인한 뒤 입력칸에 반영하세요.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border">
              <div className="grid grid-cols-[120px_minmax(0,1fr)_140px] border-b bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                <span>항목</span>
                <span>읽은 값</span>
                <span className="text-right">반영 위치</span>
              </div>
              {reviewRows.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">확인할 기본값이 없습니다</div>
              ) : (
                reviewRows.map((row) => (
                  <div key={`${row.label}-${row.value}`} className="grid grid-cols-[120px_minmax(0,1fr)_140px] border-b px-3 py-2 last:border-b-0">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="break-all text-xs font-medium">{row.value}</span>
                    <span className="text-right text-[11px] text-muted-foreground">{row.target}</span>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-md border">
              <div className="border-b bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">품목 후보</div>
              {reviewLineItems.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">품목 후보가 없습니다</div>
              ) : (
                <div className="divide-y">
                  {reviewLineItemRows.map(({ item, index, matchedProduct, selectableProducts }) => (
                    <div key={`${item.model_spec?.value ?? 'line'}-${index}`}
                      className="grid gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1.1fr)_minmax(170px,0.9fr)_72px_72px_88px]">
                      <span className="break-all font-medium">{item.model_spec?.value ?? '모델 미확인'}</span>
                      <Select
                        value={productOverrides[index] ?? matchedProduct?.product_id ?? OCR_PRODUCT_NONE}
                        onValueChange={(value) => {
                          const nextValue = value ?? OCR_PRODUCT_NONE;
                          setProductOverrides((prev) => {
                            const next = { ...prev };
                            if (nextValue === OCR_PRODUCT_NONE) delete next[index];
                            else next[index] = nextValue;
                            return next;
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 min-w-0 text-xs">
                          <Txt text={formatOCRProductLabel(matchedProduct)} placeholder="품목 후보 없음" />
                        </SelectTrigger>
                        <SelectContent className="min-w-[min(560px,calc(100vw-3rem))]">
                          {!matchedProduct && <SelectItem value={OCR_PRODUCT_NONE}>품목 후보 없음</SelectItem>}
                          {matchedProduct && (
                            <SelectItem value={matchedProduct.product_id}>
                              자동 후보 · {formatOCRProductLabel(matchedProduct)}
                            </SelectItem>
                          )}
                          {selectableProducts
                            .filter((p) => p.product_id !== matchedProduct?.product_id)
                            .map((p) => (
                              <SelectItem key={p.product_id} value={p.product_id}>
                                {formatOCRProductLabel(p)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <span className="text-right tabular-nums">{item.quantity?.value ? `${Number(item.quantity.value).toLocaleString('ko-KR')} EA` : '-'}</span>
                      <span className="text-right tabular-nums">{item.unit_price_usd?.value ?? '-'}</span>
                      <span className="text-right tabular-nums">{item.amount_usd?.value ? `$${Number(item.amount_usd.value).toLocaleString('en-US')}` : '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onReviewOpenChange(false)}>취소</Button>
            <Button type="button" onClick={onConfirm}>확인 후 입력칸에 반영</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
