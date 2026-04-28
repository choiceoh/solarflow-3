// 아마란스10 ERP 내보내기 다이얼로그 (Step 29C)
// 비유: 기간 선택 → 아마란스 양식 .xlsx 다운로드

import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';

interface Props {
  type: 'inbound' | 'outbound';
  open: boolean;
  onClose: () => void;
}

// 기본값: 이번 달 1일 ~ 오늘
function defaultFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export default function AmaranthExportDialog({ type, open, onClose }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = type === 'inbound' ? '입고' : '출고';

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const params = new URLSearchParams({ from, to });
      const res = await fetch(
        `${API_BASE_URL}/api/v1/export/amaranth/${type}?${params}`,
        { headers },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: '내보내기 실패' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `amaranth_${type}_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '내보내기 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>아마란스 {label} 내보내기</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="from">시작일</Label>
              <DateInput id="from" value={from} onChange={setFrom} />
            </div>
            <div>
              <Label htmlFor="to">종료일</Label>
              <DateInput id="to" value={to} onChange={setTo} />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={handleExport} disabled={loading}>
            <Download className="mr-1.5 h-4 w-4" />
            {loading ? '내보내는 중...' : '내보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
