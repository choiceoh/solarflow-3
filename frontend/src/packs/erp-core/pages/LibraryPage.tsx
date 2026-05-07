import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { MasterConsole } from '@/components/command/MasterConsole';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/api';
import { confirmDialog } from '@/lib/dialogs';
import { formatError, notify } from '@/lib/notify';
import { formatDate } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';
import type { DocumentFile } from '@/types/documentFile';

interface LibraryPost {
  post_id: string;
  title: string;
  content: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  files?: DocumentFile[];
}

interface AttachmentAccess {
  url: string;
  expires_at: number;
}

const ACCEPTED_ATTACHMENT_TYPES = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.zip',
].join(',');

function formatBytes(bytes: number) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('ko-KR')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toBrowserUrl(url: string) {
  if (!url) return '';
  return new URL(url, window.location.origin).toString();
}

async function attachmentUrl(fileID: string, disposition: 'inline' | 'attachment') {
  const params = new URLSearchParams({ disposition });
  const result = await fetchWithAuth<AttachmentAccess>(`/api/v1/attachments/${fileID}/access?${params}`);
  return toBrowserUrl(result.url);
}

async function downloadAttachment(file: DocumentFile) {
  const url = await attachmentUrl(file.file_id, 'attachment');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('첨부파일을 다운로드할 수 없습니다');
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('다운로드된 파일이 비어 있습니다');
  const { saveAs } = await import('file-saver');
  saveAs(blob, file.original_name || 'attachment');
}

export default function LibraryPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { canEdit } = usePermission();
  const [posts, setPosts] = useState<LibraryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const loadedPosts = await fetchWithAuth<LibraryPost[]>('/api/v1/library-posts');
      const withFiles = await Promise.all(loadedPosts.map(async (post) => {
        try {
          const params = new URLSearchParams({ entity_type: 'library_posts', entity_id: post.post_id });
          const files = await fetchWithAuth<DocumentFile[]>(`/api/v1/attachments?${params}`);
          return { ...post, files };
        } catch {
          return { ...post, files: [] };
        }
      }));
      setPosts(withFiles);
    } catch (err) {
      setError(formatError(err));
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const attachmentCount = useMemo(
    () => posts.reduce((sum, post) => sum + (post.files?.length ?? 0), 0),
    [posts],
  );
  const latestPost = posts[0];

  const resetForm = () => {
    setTitle('');
    setContent('');
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const next = Array.from(fileList);
    setSelectedFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (postID: string) => {
    for (const file of selectedFiles) {
      const form = new FormData();
      form.append('entity_type', 'library_posts');
      form.append('entity_id', postID);
      form.append('file_type', 'library');
      form.append('file', file);
      await fetchWithAuth<DocumentFile>('/api/v1/attachments', { method: 'POST', body: form });
    }
  };

  const submit = async () => {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle || !nextContent) {
      setError('제목과 내용을 모두 입력해주세요');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const created = await fetchWithAuth<LibraryPost>('/api/v1/library-posts', {
        method: 'POST',
        body: JSON.stringify({ title: nextTitle, content: nextContent }),
      });
      if (selectedFiles.length > 0) {
        await uploadFiles(created.post_id);
      }
      notify.success('자료실에 등록했습니다');
      resetForm();
      await load();
    } catch (err) {
      const msg = formatError(err);
      setError(msg);
      notify.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const removePost = async (post: LibraryPost) => {
    const ok = await confirmDialog({
      description: `"${post.title}" 자료를 삭제할까요? 첨부파일도 함께 정리됩니다.`,
      variant: 'destructive',
      confirmLabel: '삭제',
    });
    if (!ok) return;

    setError('');
    try {
      await fetchWithAuth(`/api/v1/library-posts/${post.post_id}`, { method: 'DELETE' });
      notify.success('자료를 삭제했습니다');
      await load();
    } catch (err) {
      const msg = formatError(err);
      setError(msg);
      notify.error(msg);
    }
  };

  const removeAttachment = async (file: DocumentFile) => {
    const ok = await confirmDialog({
      description: `"${file.original_name}" 첨부파일을 삭제할까요?`,
      variant: 'destructive',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    try {
      await fetchWithAuth(`/api/v1/attachments/${file.file_id}`, { method: 'DELETE' });
      notify.success('첨부파일을 삭제했습니다');
      await load();
    } catch (err) {
      notify.error(formatError(err));
    }
  };

  const handleDownload = async (file: DocumentFile) => {
    try {
      await downloadAttachment(file);
    } catch (err) {
      notify.error(formatError(err));
    }
  };

  return (
    <MasterConsole
      eyebrow="LIBRARY"
      title="자료실"
      description="운영 매뉴얼, 안내문, 양식 파일을 제목·내용·첨부파일로 등록합니다."
      tableTitle="등록 자료"
      tableSub={`${posts.length.toLocaleString('ko-KR')}건`}
      actions={(
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          새로고침
        </Button>
      )}
      metrics={[
        { label: '등록 자료', value: posts.length.toLocaleString('ko-KR'), unit: '건', sub: '게시글', tone: 'solar' },
        { label: '첨부파일', value: attachmentCount.toLocaleString('ko-KR'), unit: '개', sub: '자료실 연결', tone: 'info' },
        { label: '최근 등록', value: latestPost ? formatDate(latestPost.created_at) : '—', sub: latestPost?.title ?? '자료 없음', tone: latestPost ? 'pos' : 'ink' },
        { label: '쓰기 권한', value: canEdit ? '가능' : '조회', sub: canEdit ? '등록·삭제' : '다운로드만', tone: canEdit ? 'warn' : 'ink' },
      ]}
    >
      <div className="space-y-4">
        {canEdit ? (
          <section className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-[var(--ink-3)]" htmlFor="library-title">
                  제목
                </label>
                <input
                  id="library-title"
                  value={title}
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-9 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--solar-3)]"
                  placeholder="예: 2026년 입고 검수 기준"
                  disabled={saving}
                />
                <label className="block text-[11px] font-semibold text-[var(--ink-3)]" htmlFor="library-content">
                  내용
                </label>
                <textarea
                  id="library-content"
                  value={content}
                  maxLength={5000}
                  onChange={(event) => setContent(event.target.value)}
                  className="min-h-[126px] w-full resize-y rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--solar-3)]"
                  placeholder="자료 설명이나 확인해야 할 내용을 입력하세요."
                  disabled={saving}
                />
              </div>

              <div className="flex min-h-[220px] flex-col rounded-md border border-dashed border-[var(--line)] bg-[var(--bg-2)] p-3">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--ink)]">
                  <Paperclip className="h-4 w-4 text-[var(--solar-3)]" />
                  첨부파일
                </div>
                <p className="mt-1 text-[11px] leading-5 text-[var(--ink-3)]">PDF, 이미지, Office, CSV, TXT, ZIP · 파일당 100MB</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  파일 선택
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_ATTACHMENT_TYPES}
                  className="hidden"
                  onChange={(event) => addFiles(event.target.files)}
                />
                <div className="mt-3 flex-1 space-y-1.5 overflow-hidden">
                  {selectedFiles.length === 0 ? (
                    <p className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-2 text-[11px] text-[var(--ink-4)]">
                      선택된 첨부파일이 없습니다.
                    </p>
                  ) : selectedFiles.map((file, index) => (
                    <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5">
                      <FileText className="h-3.5 w-3.5 text-[var(--ink-4)]" />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink)]">{file.name}</span>
                      <span className="text-[10px] text-[var(--ink-4)]">{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        className="rounded p-1 text-[var(--ink-4)] transition hover:bg-[var(--bg-2)] hover:text-destructive"
                        onClick={() => removeSelectedFile(index)}
                        aria-label={`${file.name} 선택 해제`}
                        disabled={saving}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={resetForm} disabled={saving}>
                초기화
              </Button>
              <Button size="sm" onClick={() => void submit()} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                등록
              </Button>
            </div>
          </section>
        ) : null}

        {!canEdit && error ? <p className="text-[12px] text-destructive">{error}</p> : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-[var(--ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            자료실을 불러오는 중입니다.
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <FileText className="h-8 w-8 text-[var(--ink-4)]" />
            <p className="text-sm font-medium text-[var(--ink)]">등록된 자료가 없습니다.</p>
            <p className="text-[12px] text-[var(--ink-3)]">필요한 자료를 제목, 내용, 첨부파일로 남겨두세요.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <article key={post.post_id} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-[15px] font-semibold text-[var(--ink)]">{post.title}</h2>
                    <p className="mt-1 text-[11px] text-[var(--ink-4)]">
                      등록 {formatDate(post.created_at)}
                      {post.updated_at !== post.created_at ? ` · 수정 ${formatDate(post.updated_at)}` : ''}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-[var(--ink-4)] hover:text-destructive"
                      title="자료 삭제"
                      onClick={() => void removePost(post)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-[var(--ink-2)]">{post.content}</p>

                <div className="mt-3 border-t border-[var(--line)] pt-2">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ink-3)]">
                    <Paperclip className="h-3.5 w-3.5" />
                    첨부파일 {(post.files?.length ?? 0).toLocaleString('ko-KR')}개
                  </div>
                  {post.files?.length ? (
                    <div className="grid gap-1.5 md:grid-cols-2">
                      {post.files.map((file) => (
                        <div key={file.file_id} className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5">
                          <FileText className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-medium text-[var(--ink)]">{file.original_name}</p>
                            <p className="text-[10px] text-[var(--ink-4)]">
                              {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="다운로드"
                            onClick={() => void handleDownload(file)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-[var(--ink-4)] hover:text-destructive"
                              title="첨부파일 삭제"
                              onClick={() => void removeAttachment(file)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-2 text-[11px] text-[var(--ink-4)]">
                      첨부파일 없이 등록된 자료입니다.
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </MasterConsole>
  );
}
