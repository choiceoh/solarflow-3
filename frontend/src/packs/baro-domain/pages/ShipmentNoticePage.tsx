import { useMemo, useState } from 'react';
import { Bell, Copy, Check, Truck, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

// ShipmentNoticePage — D-131 출하 알림 메시지 빌더 (BARO 전용).
//
// PR7 Phase 1 frontend-only.
// BARO 영업이 매일 시공업체에 보내는 "○○현장 모듈 N장, 오후 2시 도착예정" 같은
// 메시지를 form 입력 → 3가지 템플릿(상차/출발/도착) 자동 생성 → 클립보드 복사 →
// 영업이 직접 카톡에 붙여넣기.
//
// 작성 시간 5분 → 30초로 단축이 1차 목표. 외부 카톡/SMS API 통합은 PR7.5.
// 드라이버 PWA(상차·도착 사진 업로드)도 PR7.5 분리.

type Stage = 'loading' | 'departure' | 'arrival';

interface NoticeForm {
  partner_name: string; // 거래처명 (예: 햇살에너지)
  site_name: string; // 현장명 (선택)
  product_name: string; // 모듈/인버터 모델
  quantity: string; // 수량
  truck_no: string; // 차량 번호
  driver_name: string; // 차주명 (선택)
  driver_phone: string; // 차주 연락처 (선택)
  expected_arrival: string; // 도착예정 datetime
  notes: string; // 추가 메모
}

const EMPTY_FORM: NoticeForm = {
  partner_name: '',
  site_name: '',
  product_name: '',
  quantity: '',
  truck_no: '',
  driver_name: '',
  driver_phone: '',
  expected_arrival: '',
  notes: '',
};

const STAGE_LABEL: Record<Stage, string> = {
  loading: '상차 완료',
  departure: '출발',
  arrival: '도착 예정',
};

function buildMessage(stage: Stage, f: NoticeForm): string {
  const partnerLine = f.partner_name ? `${f.partner_name}님 안녕하세요.` : '안녕하세요.';
  const siteSuffix = f.site_name ? ` (${f.site_name})` : '';
  const productLine = f.product_name && f.quantity
    ? `${f.product_name} ${f.quantity}장${siteSuffix}`
    : '주문하신 자재';
  const truckLine = f.truck_no ? `차량 ${f.truck_no}` : '운송 차량';
  const driverLine = f.driver_name && f.driver_phone
    ? `차주 ${f.driver_name} (${f.driver_phone})`
    : f.driver_phone
      ? `차주 연락처 ${f.driver_phone}`
      : '';
  const etaLine = f.expected_arrival
    ? `도착 예정: ${f.expected_arrival.replace('T', ' ')}`
    : '';
  const notesLine = f.notes ? f.notes : '';

  switch (stage) {
    case 'loading':
      return [
        partnerLine,
        '',
        `${productLine} 상차가 완료되었습니다.`,
        truckLine + (driverLine ? ` · ${driverLine}` : '') + ' 곧 출발합니다.',
        etaLine,
        notesLine && '',
        notesLine,
        '',
        '받으실 준비 부탁드립니다. 감사합니다.',
        '— 바로(주)',
      ].filter(Boolean).join('\n');

    case 'departure':
      return [
        partnerLine,
        '',
        `${productLine} 출발했습니다.`,
        truckLine + (driverLine ? ` · ${driverLine}` : ''),
        etaLine,
        notesLine && '',
        notesLine,
        '',
        '도착 시 차주 연락드립니다. 감사합니다.',
        '— 바로(주)',
      ].filter(Boolean).join('\n');

    case 'arrival':
      return [
        partnerLine,
        '',
        `${productLine} 곧 도착합니다.`,
        etaLine || '약 10~30분 내 도착 예정입니다.',
        truckLine + (driverLine ? ` · ${driverLine}` : ''),
        '',
        '하차 인력·장비 대기 부탁드립니다.',
        notesLine && '',
        notesLine,
        '',
        '— 바로(주)',
      ].filter(Boolean).join('\n');
  }
}

export default function ShipmentNoticePage() {
  const [form, setForm] = useState<NoticeForm>(EMPTY_FORM);
  const [copiedStage, setCopiedStage] = useState<Stage | null>(null);

  const update = <K extends keyof NoticeForm>(key: K, value: NoticeForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const messages = useMemo(
    () => ({
      loading: buildMessage('loading', form),
      departure: buildMessage('departure', form),
      arrival: buildMessage('arrival', form),
    }),
    [form],
  );

  const copy = async (stage: Stage) => {
    try {
      await navigator.clipboard.writeText(messages[stage]);
      setCopiedStage(stage);
      window.setTimeout(() => setCopiedStage(null), 2000);
    } catch (e) {
      console.error('[클립보드 복사 실패]', e);
    }
  };

  const reset = () => setForm(EMPTY_FORM);

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">출하 알림 메시지</h1>
          <span className="text-xs text-muted-foreground">
            거래처 카톡에 붙여넣을 메시지 3종(상차/출발/도착) 자동 생성.
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={reset}>
          초기화
        </Button>
      </div>

      {/* 안내 배너 */}
      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span>
          PR7 Phase 1 — 메시지 빌더만. 카톡 자동 발송 / 드라이버 PWA(상차·도착 사진) /
          배차 보드 연동은 PR7.5 (외부 API 키 + 모바일 흐름 필요).
        </span>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[420px_1fr]">
        {/* 좌측 입력 폼 */}
        <section className="flex min-h-0 flex-col gap-2 overflow-auto rounded-md border bg-card p-3">
          <div className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">출하 정보</h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FormField label="거래처명 *" col={2}>
              <Input
                value={form.partner_name}
                onChange={(e) => update('partner_name', e.target.value)}
                placeholder="햇살에너지"
                className="h-8 text-xs"
              />
            </FormField>
            <FormField label="현장명">
              <Input
                value={form.site_name}
                onChange={(e) => update('site_name', e.target.value)}
                placeholder="화성 1공장"
                className="h-8 text-xs"
              />
            </FormField>
            <FormField label="도착 예정">
              <Input
                type="datetime-local"
                value={form.expected_arrival}
                onChange={(e) => update('expected_arrival', e.target.value)}
                className="h-8 text-xs"
              />
            </FormField>
            <FormField label="모델 *" col={2}>
              <Input
                value={form.product_name}
                onChange={(e) => update('product_name', e.target.value)}
                placeholder="JKM635 (Tiger Neo 635W)"
                className="h-8 text-xs"
              />
            </FormField>
            <FormField label="수량 (장) *">
              <Input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => update('quantity', e.target.value)}
                placeholder="30"
                className="h-8 text-xs"
              />
            </FormField>
            <FormField label="차량 번호">
              <Input
                value={form.truck_no}
                onChange={(e) => update('truck_no', e.target.value)}
                placeholder="12가1234"
                className="h-8 text-xs"
              />
            </FormField>
            <FormField label="차주명">
              <Input
                value={form.driver_name}
                onChange={(e) => update('driver_name', e.target.value)}
                placeholder="홍길동"
                className="h-8 text-xs"
              />
            </FormField>
            <FormField label="차주 연락처">
              <Input
                value={form.driver_phone}
                onChange={(e) => update('driver_phone', e.target.value)}
                placeholder="010-1234-5678"
                className="h-8 text-xs"
              />
            </FormField>
            <FormField label="추가 메모" col={2}>
              <Input
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="우천 시 도착 지연될 수 있습니다"
                className="h-8 text-xs"
              />
            </FormField>
          </div>

          <div className="mt-1 text-[10px] text-muted-foreground">
            * 표시 항목만 채워도 메시지 생성됨. 빈 필드는 메시지에서 자동 생략.
          </div>
        </section>

        {/* 우측 메시지 미리보기 */}
        <section className="flex min-h-0 flex-col gap-2 overflow-auto">
          {(['loading', 'departure', 'arrival'] as const).map((stage) => (
            <div key={stage} className="rounded-md border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {STAGE_LABEL[stage]}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {messages[stage].length}자
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={copiedStage === stage ? 'default' : 'outline'}
                  onClick={() => void copy(stage)}
                >
                  {copiedStage === stage ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      복사
                    </>
                  )}
                </Button>
              </div>
              <pre className="whitespace-pre-wrap rounded-sm bg-muted/30 p-2 text-xs leading-relaxed">
                {messages[stage]}
              </pre>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function FormField({
  label,
  col = 1,
  children,
}: {
  label: string;
  col?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div className={col === 2 ? 'col-span-2' : 'col-span-1'}>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
