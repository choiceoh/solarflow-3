// 포스트잇 스타일 메모 카드 (Step 31)
import { useState } from 'react';
import { Pencil, Trash2, Link2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Note } from '@/types/memo';
import { LINKED_TABLE_LABEL, LINKED_TABLE_ROUTE } from '@/types/memo';

interface Props {
  note: Note;
  onUpdate: (noteId: string, content: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
}

export default function MemoCard({ note, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const navigate = useNavigate();

  const handleSave = async () => {
    await onUpdate(note.note_id, content);
    setEditing(false);
  };

  const linkedLabel = note.linked_table ? LINKED_TABLE_LABEL[note.linked_table] : null;
  const linkedRoute = note.linked_table ? LINKED_TABLE_ROUTE[note.linked_table] : null;

  return (
    <Card className="bg-yellow-50 border-yellow-200 hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-2">
        {editing ? (
          <div className="space-y-2">
            <Textarea className="text-sm" value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
            <div className="flex gap-1">
              <Button size="sm" onClick={handleSave}>저장</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setContent(note.content); }}>취소</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap line-clamp-6">{note.content}</p>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-yellow-200">
          <span>{new Date(note.created_at).toLocaleDateString('ko-KR')}</span>
          <div className="flex items-center gap-1">
            {linkedLabel && linkedRoute && (
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => navigate(linkedRoute)}>
                <Link2 className="h-3 w-3 mr-0.5" />{linkedLabel}
                <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
              </Button>
            )}
            {!editing && (
              <>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditing(true)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => onDelete(note.note_id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
