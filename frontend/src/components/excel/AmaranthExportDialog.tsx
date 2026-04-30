// 아마란스10 ERP 내보내기 다이얼로그 (Step 29C)
// 비유: 기간 선택 → 아마란스 양식 .xlsx 다운로드

import { useState } from 'react';
import { Download, UploadCloud } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { fetchBlobWithAuth, fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';

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

interface UploadJobResponse {
  duplicate: boolean;
  job: {
    job_id: string;
    row_count: number;
    status: string;
  };
}

export default function AmaranthExportDialog({ type, open, onClose }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [loading, setLoading] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [packageLoading, setPackageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const label = type === 'inbound' ? '입고' : '출고';

  const queryParams = () => {
    const params = new URLSearchParams({ from, to });
    if (selectedCompanyId && selectedCompanyId !== 'all') {
      params.set('company_id', selectedCompanyId);
    }
    return params;
  };

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    setJobMessage(null);
    try {
      const params = queryParams();
      const res = await fetchBlobWithAuth(`/api/v1/export/amaranth/${type}?${params}`);

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

  const handleCreateJob = async () => {
    if (type !== 'outbound') return;
    setJobLoading(true);
    setError(null);
    setJobMessage(null);
    try {
      const result = await fetchWithAuth<UploadJobResponse>(
        `/api/v1/export/amaranth/outbound/jobs?${queryParams()}`,
        { method: 'POST' },
      );
      if (result.duplicate) {
        setJobMessage(`동일한 업로드 작업이 이미 있습니다 (${result.job.row_count}건)`);
      } else {
        setJobMessage(`업로드 작업을 만들었습니다 (${result.job.row_count}건)`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 작업 생성 실패');
    } finally {
      setJobLoading(false);
    }
  };

  const handleDownloadRPAPackage = async () => {
    setPackageLoading(true);
    setError(null);
    setJobMessage(null);
    try {
      const res = await fetchBlobWithAuth('/api/v1/export/amaranth/rpa-package');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'solarflow-amaranth-rpa-windows.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '자동화 설치 파일 다운로드 실패');
    } finally {
      setPackageLoading(false);
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
          {jobMessage && <p className="text-xs text-emerald-700">{jobMessage}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          {type === 'outbound' && (
            <>
              <Button variant="outline" size="sm" onClick={handleDownloadRPAPackage} disabled={packageLoading || loading || jobLoading}>
                <Download className="mr-1.5 h-4 w-4" />
                {packageLoading ? '받는 중...' : '자동화 받기'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCreateJob} disabled={jobLoading || loading || packageLoading}>
                <UploadCloud className="mr-1.5 h-4 w-4" />
                {jobLoading ? '작업 생성 중...' : '업로드 작업'}
              </Button>
            </>
          )}
          <Button size="sm" onClick={handleExport} disabled={loading}>
            <Download className="mr-1.5 h-4 w-4" />
            {loading ? '내보내는 중...' : '내보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
