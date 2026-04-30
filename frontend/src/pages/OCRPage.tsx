import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Copy, FileImage, FileText, Play, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { MasterConsole } from '@/components/command/MasterConsole';
import { RailBlock, Sparkline } from '@/components/command/MockupPrimitives';
import { fetchWithAuth } from '@/lib/api';
import { cn } from '@/lib/utils';

interface OCRBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface OCRLine {
  text: string;
  score: number;
  box: OCRBox;
}

interface OCRResult {
  filename: string;
  raw_text?: string;
  lines?: OCRLine[];
  error?: string;
}

interface OCRExtractResponse {
  results: OCRResult[];
}

interface OCRHealth {
  status: string;
  configured: boolean;
  running: boolean;
  ready: boolean;
  error?: string;
}

type OCRItem = OCRResult & {
  id: string;
  raw_text: string;
  lines: OCRLine[];
};

let resultSeq = 0;

function newResultID(filename: string) {
  resultSeq += 1;
  return `ocr-${Date.now()}-${resultSeq}-${filename}`;
}

function resultToItem(result: OCRResult): OCRItem {
  return {
    ...result,
    id: newResultID(result.filename),
    raw_text: result.raw_text ?? '',
    lines: result.lines ?? [],
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('ko-KR')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isAcceptedOCRFile(file: File) {
  return file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(png|jpe?g|webp|gif|pdf)$/i.test(file.name);
}

function fileIcon(file: File) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return <FileText className="h-4 w-4 text-muted-foreground" />;
  return <FileImage className="h-4 w-4 text-muted-foreground" />;
}

function formatScore(score: number) {
  if (!Number.isFinite(score)) return '-';
  return `${Math.round(score * 100)}%`;
}

export default function OCRPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<OCRItem[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [copiedID, setCopiedID] = useState('');
  const [health, setHealth] = useState<OCRHealth | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const okCount = useMemo(() => results.filter((result) => !result.error).length, [results]);
  const totalLineCount = useMemo(() => results.reduce((sum, result) => sum + result.lines.length, 0), [results]);
  const healthLabel = useMemo(() => {
    if (checkingHealth) return 'OCR 확인 중';
    if (!health) return 'OCR 미확인';
    if (health.ready) return 'OCR 준비됨';
    if (health.configured) return 'OCR 대기';
    return 'OCR 설정 필요';
  }, [checkingHealth, health]);
  const healthTone = health?.ready ? 'text-emerald-700' : health?.configured ? 'text-amber-700' : 'text-red-700';

  const loadHealth = async (warm = false) => {
    setCheckingHealth(true);
    try {
      const response = await fetchWithAuth<OCRHealth>(`/api/v1/ocr/health${warm ? '?warm=1' : ''}`);
      setHealth(response);
      if (response.error && warm) setError(response.error);
    } catch (err) {
      setHealth({ status: 'error', configured: false, running: false, ready: false, error: err instanceof Error ? err.message : 'OCR 상태 확인 실패' });
      if (warm) setError(err instanceof Error ? err.message : 'OCR 상태 확인 실패');
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    void loadHealth(false);
  }, []);

  const addFiles = (selected: FileList | null) => {
    const nextFiles = Array.from(selected ?? []);
    if (nextFiles.length === 0) return;

    const accepted = nextFiles.filter(isAcceptedOCRFile);
    const rejectedCount = nextFiles.length - accepted.length;
    setError(rejectedCount > 0 ? 'PDF 또는 이미지 파일만 선택되었습니다' : '');
    setFiles((prev) => [...prev, ...accepted]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const extract = async () => {
    if (files.length === 0) {
      setError('파일을 선택해주세요');
      return;
    }

    const form = new FormData();
    files.forEach((file) => form.append('images', file));

    setExtracting(true);
    setError('');
    try {
      const response = await fetchWithAuth<OCRExtractResponse>('/api/v1/ocr/extract', { method: 'POST', body: form });
      setResults((prev) => [...response.results.map(resultToItem), ...prev]);
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR 추출에 실패했습니다');
    } finally {
      setExtracting(false);
    }
  };

  const updateRawText = (id: string, value: string) => {
    setResults((prev) => prev.map((result) => (result.id === id ? { ...result, raw_text: value } : result)));
  };

  const deleteResult = (id: string) => {
    setResults((prev) => prev.filter((result) => result.id !== id));
  };

  const copyText = async (result: OCRItem) => {
    await navigator.clipboard.writeText(result.raw_text);
    setCopiedID(result.id);
    window.setTimeout(() => setCopiedID(''), 1200);
  };

  return (
    <MasterConsole
      eyebrow="DOCUMENT OCR"
      title="문서 OCR"
      description="PDF와 이미지 문서를 판독하고 원문 텍스트와 좌표 신뢰도를 검토합니다."
      tableTitle="OCR 워크벤치"
      tableSub={`${results.length.toLocaleString()}개 결과 · ${totalLineCount.toLocaleString('ko-KR')}줄`}
      actions={
        <>
          <div className={cn('flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium', healthTone)}>
            <Activity className="h-3.5 w-3.5" />
            {healthLabel}
          </div>
          <Button variant="outline" size="icon" disabled={checkingHealth} onClick={() => loadHealth(true)} title="OCR 상태 확인">
            <RefreshCw className={cn('h-4 w-4', checkingHealth && 'animate-spin')} />
          </Button>
          <Button variant="outline" disabled={results.length === 0} onClick={() => setResults([])}>
            초기화
          </Button>
        </>
      }
      metrics={[
        { label: '대기 파일', value: files.length.toLocaleString(), sub: '선택된 파일', tone: files.length > 0 ? 'solar' : 'ink', spark: [1, 2, 2, 3, Math.max(files.length, 1)] },
        { label: '정상 결과', value: okCount.toLocaleString(), sub: `${results.length.toLocaleString()}개 중`, tone: 'pos' },
        { label: '인식 줄', value: totalLineCount.toLocaleString('ko-KR'), sub: '좌표 포함', tone: 'info' },
        { label: 'OCR 상태', value: health?.ready ? 'READY' : health?.configured ? 'WAIT' : 'CHECK', sub: healthLabel, tone: health?.ready ? 'pos' : health?.configured ? 'warn' : 'ink' },
      ]}
      rail={
        <>
          <RailBlock title="엔진 상태" accent={health?.ready ? 'var(--pos)' : 'var(--warn)'} count={health?.status ?? 'unknown'}>
            <div className="space-y-2 text-[11px] leading-5 text-[var(--ink-3)]">
              <p>{health?.ready ? 'OCR sidecar가 응답 준비 상태입니다.' : '상태 확인 또는 warm-up이 필요할 수 있습니다.'}</p>
              <Sparkline data={[12, 20, 16, 28, 24, 36]} color={health?.ready ? 'var(--pos)' : 'var(--warn)'} area />
            </div>
          </RailBlock>
          <RailBlock title="파일 규칙" count="PDF · 이미지">
            <div className="text-[11px] leading-5 text-[var(--ink-3)]">
              판독 결과는 자동 저장하지 않고, 사용자가 원문을 확인하고 복사하거나 후속 입력에 사용합니다.
            </div>
          </RailBlock>
        </>
      }
    >
      <div className="space-y-4">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            파일 선택
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <FileImage className="mr-1.5 h-4 w-4" />
              불러오기
            </Button>
            <Button onClick={extract} disabled={files.length === 0 || extracting}>
              <Play className={cn('mr-1.5 h-4 w-4', extracting && 'animate-pulse')} />
              {extracting ? '추출 중' : `추출 실행 (${files.length})`}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.pdf"
              className="hidden"
              onChange={(event) => addFiles(event.target.files)}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          {files.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file, index) => (
                <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                  {fileIcon(file)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile(index)} title="제거">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span>추출 결과</span>
            <span className="text-xs font-normal text-muted-foreground">
              {okCount}/{results.length} 정상 · {totalLineCount.toLocaleString('ko-KR')}줄
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {results.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              결과가 없습니다
            </div>
          ) : (
            results.map((result) => (
              <div key={result.id} className="rounded-md border bg-background">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b px-3 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {result.error ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{result.filename}</p>
                      {result.error ? (
                        <p className="line-clamp-2 text-xs text-red-600">{result.error}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{result.lines.length.toLocaleString('ko-KR')}줄</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!!result.error} onClick={() => copyText(result)} title="텍스트 복사">
                      {copiedID === result.id ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteResult(result.id)} title="삭제">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {!result.error && (
                  <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
                    <Textarea
                      value={result.raw_text}
                      className="min-h-56 resize-y text-sm leading-6"
                      onChange={(event) => updateRawText(result.id, event.target.value)}
                    />
                    <div className="max-h-72 overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>텍스트</TableHead>
                            <TableHead className="w-20 text-right">신뢰도</TableHead>
                            <TableHead className="w-32 text-right">좌표</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.lines.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="h-20 text-center text-sm text-muted-foreground">
                                인식된 줄 없음
                              </TableCell>
                            </TableRow>
                          ) : (
                            result.lines.map((line, index) => (
                              <TableRow key={`${result.id}-${index}`}>
                                <TableCell className="max-w-64 whitespace-normal text-xs">{line.text}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums">{formatScore(line.score)}</TableCell>
                                <TableCell className="text-right text-[11px] tabular-nums text-muted-foreground">
                                  {line.box.x0},{line.box.y0} · {line.box.x1},{line.box.y1}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
      </div>
    </MasterConsole>
  );
}
