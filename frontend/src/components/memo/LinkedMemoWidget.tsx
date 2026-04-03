// 상세 페이지 하단 연결 메모 위젯 (Step 31)
import { useState } from 'react';
import { StickyNote, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useNoteList, useNoteActions } from '@/hooks/useMemo';
import MemoCard from './MemoCard';

interface Props {
  linkedTable: string;
  linkedId: string;
}

export default function LinkedMemoWidget({ linkedTable, linkedId }: Props) {
  const { data: notes, reload } = useNoteList(linkedTable, linkedId);
  const { create, update, remove } = useNoteActions();
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    await create(newContent, linkedTable, linkedId);
    setNewContent('');
    setAdding(false);
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
    <div className="mt-4 border-t pt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium flex items-center gap-1.5">
          <StickyNote className="h-4 w-4" />메모 ({notes.length})
        </h4>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />메모 추가
        </Button>
      </div>

      {adding && (
        <div className="mb-3 space-y-2">
          <Textarea className="text-sm" rows={3} placeholder="메모 입력..." value={newContent} onChange={(e) => setNewContent(e.target.value)} />
          <div className="flex gap-1">
            <Button size="sm" onClick={handleAdd} disabled={!newContent.trim()}>저장</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewContent(''); }}>취소</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {notes.map((note) => (
          <MemoCard key={note.note_id} note={note} onUpdate={handleUpdate} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
