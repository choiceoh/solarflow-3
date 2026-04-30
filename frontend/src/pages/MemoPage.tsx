// 독립 메모장 페이지 (Step 31)
import { useState } from 'react';
import { StickyNote, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNoteList, useNoteActions } from '@/hooks/useMemo';
import { MasterConsole } from '@/components/command/MasterConsole';
import { RailBlock, Sparkline } from '@/components/command/MockupPrimitives';
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

  const linkedCount = notes.filter((note) => note.linked_table && note.linked_id).length;
  const freeCount = notes.length - linkedCount;
  const recentNotes = notes.slice(0, 4);

  return (
    <>
      <MasterConsole
        eyebrow="NOTES"
        title="메모"
        description="업무 대상에 연결된 기록과 독립 메모를 한곳에서 관리합니다."
        tableTitle="메모 보드"
        tableSub={`${notes.length.toLocaleString()}개 메모 · ${linkedCount.toLocaleString()}개 연결`}
        actions={
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />새 메모
        </Button>
        }
        metrics={[
          { label: '전체 메모', value: notes.length.toLocaleString(), sub: '최신순', tone: 'solar', spark: [3, 5, 4, 7, notes.length || 1] },
          { label: '연결 메모', value: linkedCount.toLocaleString(), sub: '업무 객체 연결', tone: 'info' },
          { label: '독립 메모', value: freeCount.toLocaleString(), sub: '일반 기록', tone: 'warn' },
          { label: '작업 상태', value: loading ? 'LOAD' : 'OK', sub: loading ? '불러오는 중' : '동기화됨', tone: loading ? 'ink' : 'pos' },
        ]}
        rail={
          <>
            <RailBlock title="최근 메모" accent="var(--solar-3)" count={recentNotes.length}>
              <div className="space-y-2">
                {recentNotes.map((note) => (
                  <div key={note.note_id} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
                    <div className="line-clamp-2 text-[12px] font-semibold text-[var(--ink)]">{note.content}</div>
                    <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">{note.linked_table ?? 'standalone'} · {note.created_at.slice(0, 10)}</div>
                  </div>
                ))}
              </div>
            </RailBlock>
            <RailBlock title="기록 흐름" count="memo">
              <Sparkline data={[4, 6, 8, 7, 12, 15]} color="var(--solar-3)" area />
              <div className="mt-2 text-[11px] leading-5 text-[var(--ink-3)]">메모는 작성, 수정, 삭제 후 즉시 목록을 다시 불러옵니다.</div>
            </RailBlock>
          </>
        }
      >

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
      </MasterConsole>

      <MemoForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleCreate} />
    </>
  );
}
