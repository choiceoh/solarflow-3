// 메모 작성/수정 폼 다이얼로그 (Step 31)
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LINKED_TABLE_LABEL } from '@/types/memo';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (content: string, linkedTable?: string, linkedId?: string) => Promise<void>;
}

export default function MemoForm({ open, onClose, onSubmit }: Props) {
  const [content, setContent] = useState('');
  const [linkedTable, setLinkedTable] = useState('');
  const [linkedId, setLinkedId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit(content, linkedTable || undefined, linkedId || undefined);
      setContent('');
      setLinkedTable('');
      setLinkedId('');
      onClose();
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 메모</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>내용</Label>
            <Textarea className="mt-1" rows={5} placeholder="메모를 입력하세요..." value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>연결 대상 (선택)</Label>
              <select className="w-full mt-1 border rounded px-3 py-2 text-sm" value={linkedTable} onChange={(e) => setLinkedTable(e.target.value)}>
                <option value="">없음</option>
                {Object.entries(LINKED_TABLE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            {linkedTable && (
              <div>
                <Label>연결 ID</Label>
                <input className="w-full mt-1 border rounded px-3 py-2 text-sm" placeholder="UUID 입력" value={linkedId} onChange={(e) => setLinkedId(e.target.value)} />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!content.trim() || loading}>
            {loading ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
