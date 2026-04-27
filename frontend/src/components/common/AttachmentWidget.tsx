import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchBlobWithAuth, fetchWithAuth } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { DocumentFile } from '@/types/documentFile';

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

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
      setFiles(await fetchWithAuth<DocumentFile[]>(`/api/v1/attachments?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : '첨부파일을 불러오지 못했습니다');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entityType, entityId]);

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

  const openBlob = async (file: DocumentFile, preview: boolean) => {
    try {
      const res = await fetchBlobWithAuth(`/api/v1/attachments/${file.file_id}/download`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (preview) {
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
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
        ) : files.map((file) => (
          <div key={file.file_id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{file.original_name}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openBlob(file, true)} title="미리보기">
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openBlob(file, false)} title="다운로드">
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(file)} title="삭제">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
