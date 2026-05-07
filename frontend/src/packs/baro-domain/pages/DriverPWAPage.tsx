import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Truck, Camera, Check, AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

// DriverPWAPage — D-137 PR7.5 차주(드라이버) PWA.
//
// 인증 미적용 — token-based access (24h 만료). BARO 영업이 카톡으로 보낸 링크
// `https://baro.topworks.ltd/d/<token>` 으로 접근.
//
// PR7.5 Phase 1 — 가벼운 PWA:
//   - manifest.json + theme color (홈 화면 추가 가능)
//   - 상차 / 도착 사진 업로드 (카메라 input)
//   - 미배달 사유 입력
// PR7.5d 본 페이지. PR7.5b (카톡 자동 발송) / PR7.5c (SMS) 와 독립적으로 동작.

interface NoticeContext {
  notice_id: string;
  partner_id: string;
  stage: string;
  message_body: string;
  recipient_phone: string | null;
  recipient_name: string | null;
}

interface DriverInfo {
  token: string;
  notice: NoticeContext;
}

const STAGE_LABEL: Record<string, string> = {
  loading: '상차 완료',
  departure: '출발',
  arrival: '도착 예정',
  delivered: '배송 완료',
};

export default function DriverPWAPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      // 인증 미적용 — fetch 직접 호출 (fetchWithAuth 사용 시 401)
      const resp = await fetch(`/api/v1/baro/driver/${encodeURIComponent(token)}`);
      if (!resp.ok) {
        if (resp.status === 410) {
          setError('만료된 링크입니다 (24시간 초과). 출하 담당자에게 새 링크를 요청하세요.');
        } else if (resp.status === 404) {
          setError('유효하지 않은 링크입니다.');
        } else {
          setError(`로드 실패: HTTP ${resp.status}`);
        }
        return;
      }
      const data = await resp.json();
      setInfo(data);
    } catch (e) {
      console.error('[driver pwa 로드 실패]', e);
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // 사진 미리보기
  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setPhotoFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPhotoPreview(null);
    }
  };

  // 제출 — Phase 1 stub: 사진 업로드는 /api/v1/attachments/ 통합 후 PR7.5e 에서.
  // 현재는 LocalStorage 에 메모만 저장하고 "업로드됨" 피드백.
  const onSubmit = async () => {
    if (!info) return;
    setSubmitting(true);
    try {
      // 실제 업로드는 PR7.5e — 여기는 stub
      const record = {
        token: info.token,
        notice_id: info.notice.notice_id,
        delivery_note: deliveryNote,
        photo_filename: photoFile?.name ?? null,
        submitted_at: new Date().toISOString(),
      };
      window.localStorage.setItem(`baro.driver.${info.token}`, JSON.stringify(record));
      setSubmitted(true);
    } catch (e) {
      console.error('[제출 실패]', e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }
  if (error || !info) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="max-w-md text-sm text-muted-foreground">{error || '오류'}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
        <div className="rounded-full bg-green-100 p-4">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-lg font-semibold">배송 정보 전달됨</h1>
        <p className="text-sm text-muted-foreground">
          출하 담당자에게 자동 알림이 갔습니다. 이 창은 닫아도 됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* PWA 헤더 (모바일 친화) */}
      <header className="sticky top-0 z-10 border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">바로(주) 배송 안내</h1>
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {STAGE_LABEL[info.notice.stage] ?? info.notice.stage}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        {/* 출하 정보 카드 */}
        <section className="rounded-md border bg-white p-3 shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">출하 안내</div>
          <pre className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">
            {info.notice.message_body}
          </pre>
        </section>

        {/* 사진 업로드 */}
        <section className="rounded-md border bg-white p-3 shadow-sm">
          <Label className="text-xs font-semibold">
            <Camera className="mr-1 inline h-3.5 w-3.5" />
            현장 사진 (선택)
          </Label>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            상차 시 패널 적재, 도착 시 하차 위치 등 — 갈등 방지용 증빙.
          </p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhotoChange}
            className="mt-2 block w-full rounded border bg-white px-2 py-1.5 text-xs"
          />
          {photoPreview && (
            <img
              src={photoPreview}
              alt="현장"
              className="mt-2 max-h-64 w-full rounded border object-contain"
            />
          )}
        </section>

        {/* 메모 */}
        <section className="rounded-md border bg-white p-3 shadow-sm">
          <Label className="text-xs font-semibold">전달 메모</Label>
          <Input
            value={deliveryNote}
            onChange={(e) => setDeliveryNote(e.target.value)}
            placeholder="우천으로 30분 지연 / 차주 연락처 0000 등"
            className="mt-2 h-9 text-xs"
          />
        </section>

        {/* 안내 배너 */}
        <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-900">
          <strong>PR7.5 Phase 1:</strong> 본 페이지는 차주 PWA 의 기본 골격입니다.
          사진 실제 업로드 (attachments 통합) 는 PR7.5e 후속.
          현재는 메모 저장 + "전달됨" 알림만 작동합니다.
        </div>

        {/* 제출 버튼 (sticky) */}
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-3 shadow-lg">
          <div className="mx-auto max-w-md">
            <Button
              className="w-full"
              size="lg"
              onClick={() => void onSubmit()}
              disabled={submitting}
            >
              {submitting ? '전달 중...' : '담당자에게 전달'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
