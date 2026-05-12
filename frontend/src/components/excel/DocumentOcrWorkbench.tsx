import { useCallback, useMemo, useRef, useState } from 'react';
import { Clipboard, FileSearch, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

type DocumentType = 'generic' | 'customs_declaration';

interface OCRCandidate {
  value?: string;
  label?: string;
  source_text?: string;
  confidence?: number;
}

interface OCRResult {
  filename: string;
  raw_text?: string;
  error?: string;
  fields?: {
    document_type?: string;
    customs_declaration?: Record<string, unknown>;
  };
}

interface OCRExtractResponse {
  results: OCRResult[];
}

function isCandidate(value: unknown): value is OCRCandidate {
  return !!value && typeof value === 'object' && 'value' in value;
}

function candidateRows(result: OCRResult) {
  const customs = result.fields?.customs_declaration;
  if (!customs) return [];
  return Object.entries(customs)
    .flatMap(([key, value]) => {
      if (!isCandidate(value)) return [];
      return [{
        key,
        label: value.label || key,
        value: value.value || '',
        confidence: value.confidence,
        source: value.source_text,
      }];
    });
}

export default function DocumentOcrWorkbench() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('customs_declaration');
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OCRResult[]>([]);

  const allText = useMemo(
    () => results.map((result) => result.raw_text).filter(Boolean).join('\n\n---\n\n'),
    [results],
  );

  const runOCR = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setLoading(true);
    try {
      const fd = new FormData();
      files.forEach((file) => {
        fd.append('images', file);
      });
      if (documentType === 'customs_declaration') fd.append('document_type', 'customs_declaration');
      const res = await fetchWithAuth<OCRExtractResponse>('/api/v1/ocr/extract', {
        method: 'POST',
        body: fd,
      });
      setResults(res.results);
      const failed = res.results.filter((result) => result.error).length;
      if (failed > 0) notify.warning(`OCR ${res.results.length - failed}건 완료, ${failed}건 실패`);
      else notify.success(`OCR ${res.results.length}건을 읽었습니다`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '문서 OCR 처리에 실패했습니다');
    } finally {
      setLoading(false);
      setDragOver(false);
    }
  }, [documentType]);

  const pickFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    void runOCR(Array.from(fileList));
  }, [runOCR]);

  const copyText = useCallback(async () => {
    if (!allText) return;
    try {
      await navigator.clipboard.writeText(allText);
      notify.success('OCR 원문을 복사했습니다');
    } catch {
      notify.error('클립보드 복사에 실패했습니다');
    }
  }, [allText]);

  return (
    <section className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="text-sm font-semibold text-[var(--ink)]">문서 OCR</div>
          <div className="mt-3">
            <Select value={documentType} onValueChange={(value) => setDocumentType(value as DocumentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customs_declaration">면장/수입필증</SelectItem>
                <SelectItem value="generic">일반 문서</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div
            className={cn(
              'mt-3 flex min-h-[128px] flex-col items-center justify-center rounded-md border border-dashed px-3 py-4 text-center transition',
              dragOver ? 'border-[var(--sf-solar)] bg-[var(--sf-solar-bg)]' : 'border-[var(--line)] bg-[var(--bg-2)]',
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              pickFiles(event.dataTransfer.files);
            }}
          >
            <FileSearch className="h-7 w-7 text-[var(--ink-3)]" />
            <Button
              type="button"
              size="sm"
              className="mt-3 h-8 gap-1.5"
              disabled={loading}
              onClick={() => inputRef.current?.click()}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              파일 선택
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.csv,.docx,.txt"
              className="hidden"
              onChange={(event) => {
                pickFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>
        </div>

        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--ink)]">인식 결과</div>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={!allText} onClick={copyText}>
              <Clipboard className="h-3.5 w-3.5" />
              원문 복사
            </Button>
          </div>
          <div className="mt-3 max-h-[460px] overflow-auto">
            {results.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-[var(--ink-3)]">
                처리된 문서가 없습니다
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result) => (
                  <OCRResultBlock key={result.filename} result={result} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function OCRResultBlock({ result }: { result: OCRResult }) {
  const candidates = candidateRows(result);
  return (
    <div className="rounded-md border border-[var(--line)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
        <div className="truncate text-sm font-medium text-[var(--ink)]">{result.filename}</div>
        {result.error ? <span className="sf-pill neg">실패</span> : <span className="sf-pill pos">완료</span>}
      </div>
      {result.error ? (
        <div className="px-3 py-2 text-sm text-destructive">{result.error}</div>
      ) : (
        <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-[var(--bg-2)] p-2 text-[11px] text-[var(--ink-2)]">
            {result.raw_text || '원문 없음'}
          </pre>
          <div className="space-y-1.5">
            {candidates.length === 0 ? (
              <div className="rounded-md border border-dashed px-2 py-3 text-xs text-[var(--ink-3)]">
                구조화 후보 없음
              </div>
            ) : candidates.map((candidate) => (
              <div key={`${candidate.key}-${candidate.value}`} className="rounded border border-[var(--line)] px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--ink-3)]">{candidate.label}</span>
                  {candidate.confidence != null && (
                    <span className="mono text-[10px] text-[var(--ink-3)]">{Math.round(candidate.confidence * 100)}%</span>
                  )}
                </div>
                <div className="mt-0.5 break-all text-xs font-semibold text-[var(--ink)]">{candidate.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
