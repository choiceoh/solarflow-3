// 메모 CRUD 훅 (Step 31)
import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import type { Note } from '@/types/memo';

export function useNoteList(linkedTable?: string, linkedId?: string) {
  const [data, setData] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (linkedTable) params.set('linked_table', linkedTable);
      if (linkedId) params.set('linked_id', linkedId);
      const notes = await fetchWithAuth<Note[]>(`/api/v1/notes?${params}`);
      // 최신순 정렬
      notes.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setData(notes);
    } catch { setData([]); }
    setLoading(false);
  }, [linkedTable, linkedId]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

export function useNoteActions() {
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (content: string, linkedTable?: string, linkedId?: string) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { content };
      if (linkedTable) body.linked_table = linkedTable;
      if (linkedId) body.linked_id = linkedId;
      const note = await fetchWithAuth<Note>('/api/v1/notes', {
        method: 'POST', body: JSON.stringify(body),
      });
      return note;
    } finally { setLoading(false); }
  }, []);

  const update = useCallback(async (noteId: string, content: string) => {
    setLoading(true);
    try {
      return await fetchWithAuth<Note>(`/api/v1/notes/${noteId}`, {
        method: 'PUT', body: JSON.stringify({ content }),
      });
    } finally { setLoading(false); }
  }, []);

  const remove = useCallback(async (noteId: string) => {
    setLoading(true);
    try {
      await fetchWithAuth(`/api/v1/notes/${noteId}`, { method: 'DELETE' });
    } finally { setLoading(false); }
  }, []);

  return { loading, create, update, remove };
}
