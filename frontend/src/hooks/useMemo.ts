// 메모 CRUD 훅 (Step 31)
import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';
import type { Note } from '@/types/memo';

export function useNoteList(linkedTable?: string, linkedId?: string) {
  const q = useQuery<Note[], Error>({
    queryKey: ['notes', linkedTable, linkedId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (linkedTable) params.set('linked_table', linkedTable);
      if (linkedId) params.set('linked_id', linkedId);
      const notes = await fetchWithAuth<Note[]>(`/api/v1/notes?${params}`);
      notes.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return notes;
    },
  });
  return {
    data: q.data ?? [],
    loading: q.isLoading,
    reload: async () => { await q.refetch(); },
  };
}

export function useNoteActions() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notes'] });

  const create = useCallback(async (content: string, linkedTable?: string, linkedId?: string) => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { content };
      if (linkedTable) body.linked_table = linkedTable;
      if (linkedId) body.linked_id = linkedId;
      const note = await fetchWithAuth<Note>('/api/v1/notes', {
        method: 'POST', body: JSON.stringify(body),
      });
      await invalidate();
      return note;
    } finally { setLoading(false); }
  }, [queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(async (noteId: string, content: string) => {
    setLoading(true);
    try {
      const result = await fetchWithAuth<Note>(`/api/v1/notes/${noteId}`, {
        method: 'PUT', body: JSON.stringify({ content }),
      });
      await invalidate();
      return result;
    } finally { setLoading(false); }
  }, [queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback(async (noteId: string) => {
    setLoading(true);
    try {
      await fetchWithAuth(`/api/v1/notes/${noteId}`, { method: 'DELETE' });
      await invalidate();
    } finally { setLoading(false); }
  }, [queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  return { loading, create, update, remove };
}
