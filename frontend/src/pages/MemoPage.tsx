// 독립 메모장 페이지 (Step 31)
import { useState } from 'react';
import { StickyNote, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNoteList, useNoteActions } from '@/hooks/useMemo';
import MemoCard from '@/components/memo/MemoCard';
import MemoForm from '@/components/memo/MemoForm';

export default function MemoPage() {
  const { data: notes, loading, reload } = useNoteList();
  const { create, update, remove } = useNoteActions();
  const [formOpen, setFormOpen] = useState(false);

  const handleCreate = async (content: string, linkedTable?: string, linkedId?: string) => {
    await create(content, linkedTable, linkedId);
    reload();
  };

  const handleUpdate = async (noteId: string, content: string) => {
    await update(noteId, content);
    reload();
  };

  const handleDelete = async (noteId: string) => {
    await remove(noteId);
    reload();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <StickyNote className="h-5 w-5" />메모
        </h1>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />새 메모
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      ) : notes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <StickyNote className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p>메모가 없습니다</p>
          <p className="text-xs mt-1">새 메모를 작성해보세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {notes.map((note) => (
            <MemoCard key={note.note_id} note={note} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <MemoForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleCreate} />
    </div>
  );
}
