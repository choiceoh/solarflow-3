import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, Plus, Trash2, Upload, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { DocumentFile } from '@/types/documentFile';

interface AttachmentAccess {
  url: string;
  expires_at: number;
}

interface PreparedAttachmentLinks {
  inline?: string;
  attachment?: string;
}

interface Props {
  entityType: string;
  entityId: string;
  fileType?: string;
  title?: string;
  uploadLabel?: string;
  compact?: boolean;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('ko-KR')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AttachmentWidget({
  entityType,
  entityId,
  fileType = 'other',
  title = '첨부파일',
  uploadLabel = 'PDF 업로드',
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ url: string; file: DocumentFile } | null>(null);
  const [accessLinks, setAccessLinks] = useState<Record<string, PreparedAttachmentLinks>>({});

  const accessUrl = async (file: DocumentFile, disposition: 'inline' | 'attachment') => {
    const params = new URLSearchParams({ disposition });
    const result = await fetchWithAuth<AttachmentAccess>(`/api/v1/attachments/${file.file_id}/access?${params}`);
    return result.url;
  };

  const toBrowserUrl = (url: string) => {
    if (!url) return '';
    return new URL(url, window.location.origin).toString();
  };

  const prepareAccessLinks = async (file: DocumentFile) => {
    const [inlineUrl, attachmentUrl] = await Promise.all([
      accessUrl(file, 'inline'),
      accessUrl(file, 'attachment'),
    ]);
    const links = {
      inline: toBrowserUrl(inlineUrl),
      attachment: toBrowserUrl(attachmentUrl),
    };
    setAccessLinks((prev) => ({ ...prev, [file.file_id]: links }));
    return links;
  };

  const primeAccessLinks = async (targetFiles: DocumentFile[]) => {
    await Promise.all(targetFiles.map(async (file) => {
      try {
        await prepareAccessLinks(file);
      } catch {
        // 개별 링크 준비 실패는 사용자가 해당 파일을 열 때 에러로 다시 표시합니다.
      }
    }));
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
      const loadedFiles = await fetchWithAuth<DocumentFile[]>(`/api/v1/attachments?${params}`);
      setAccessLinks({});
      setFiles(loadedFiles);
      void primeAccessLinks(loadedFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : '첨부파일을 불러오지 못했습니다');
      setFiles([]);
      setAccessLinks({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [entityType, entityId]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF 파일만 업로드할 수 있습니다');
      return;
    }

    const form = new FormData();
    form.append('entity_type', entityType);
    form.append('entity_id', entityId);
    form.append('file_type', fileType);
    form.append('file', file);

    setUploading(true);
    setError('');
    try {
      await fetchWithAuth<DocumentFile>('/api/v1/attachments', { method: 'POST', body: form });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const previewFile = async (file: DocumentFile) => {
    setError('');
    try {
      const prepared = accessLinks[file.file_id];
      const url = prepared?.inline || (await prepareAccessLinks(file)).inline;
      if (!url) throw new Error('파일 미리보기 링크를 만들 수 없습니다');
      setPreview({ url, file });
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일을 열 수 없습니다');
    }
  };

  const remove = async (file: DocumentFile) => {
    if (!window.confirm(`"${file.original_name}" 첨부파일을 삭제할까요?`)) return;
    setError('');
    try {
      await fetchWithAuth(`/api/v1/attachments/${file.file_id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다');
    }
  };

  return (
    <div className={compact ? 'rounded-md border bg-muted/10 p-2' : 'rounded-md border p-3'}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className={compact ? 'truncate text-xs font-semibold' : 'text-sm font-semibold'}>
            <FileText className="mr-1.5 inline h-3.5 w-3.5" />{title}
          </h4>
          {!compact && <p className="text-[11px] text-muted-foreground">PDF 원문을 LC와 함께 보관합니다</p>}
        </div>
        <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Upload className="mr-1 h-3.5 w-3.5 animate-pulse" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          {uploading ? '업로드 중' : uploadLabel}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </div>

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

      <div className={compact ? 'mt-2 space-y-1' : 'mt-3 space-y-1.5'}>
        {loading ? (
          <p className="text-[11px] text-muted-foreground">불러오는 중...</p>
        ) : files.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">첨부된 PDF가 없습니다</p>
        ) : files.map((file) => {
          const downloadHref = accessLinks[file.file_id]?.attachment;
          return (
            <div key={file.file_id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{file.original_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => previewFile(file)} title="미리보기">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <a
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'h-7 px-2 text-[11px]',
                  !downloadHref && 'pointer-events-none opacity-50',
                )}
                href={downloadHref}
                download={file.original_name || 'attachment.pdf'}
                rel="noopener"
                title="사본 다운로드"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="ml-1 hidden sm:inline">{downloadHref ? '사본' : '준비 중'}</span>
              </a>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(file)} title="삭제">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{preview.file.original_name}</p>
                <p className="text-[11px] text-muted-foreground">PDF 미리보기</p>
              </div>
              <div className="flex items-center gap-1">
                <a
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="새 탭에서 열기"
                >
                  새 탭 열기
                </a>
                <a
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    !accessLinks[preview.file.file_id]?.attachment && 'pointer-events-none opacity-50',
                  )}
                  href={accessLinks[preview.file.file_id]?.attachment}
                  download={preview.file.original_name || 'attachment.pdf'}
                  rel="noopener"
                  title="사본 다운로드"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  사본 다운로드
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPreview(null)}
                  title="닫기"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <iframe
              key={preview.url}
              title={`${preview.file.original_name} 미리보기`}
              className="min-h-0 flex-1 border-0 bg-white"
              src={`${preview.url}#toolbar=1&navpanes=0`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
