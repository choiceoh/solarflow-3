/**
 * FloatingMwEaCalculator — 화면 우하단 떠다니는 용량↔장수 계산기
 *
 * 기능:
 *   - 모듈 출력(Wp) 직접 입력
 *   - 용량(kW/MW) ↔ 장수(EA) 양방향: ↕ 버튼으로 입력 방향 전환
 *   - 1,000 kW 미만 → kW, 이상 → MW 자동 표시
 *
 * primaryField: 'cap' | 'ea'
 *   'cap' → 용량 입력, 장수 자동계산(읽기전용)
 *   'ea'  → 장수 입력, 용량 자동계산(읽기전용)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Calculator, X, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type PrimaryField = 'cap' | 'ea';
type CapUnit = 'kW' | 'MW';

function roundEa(v: number) { return Math.round(v); }
function roundCap(kw: number): { str: string; unit: CapUnit } {
  if (kw >= 1000) return { str: String(Math.round(kw / 1000 * 100) / 100), unit: 'MW' };
  return { str: String(Math.round(kw * 10) / 10), unit: 'kW' };
}

export default function FloatingMwEaCalculator() {
  const [open, setOpen]                 = useState(false);
  const [specWp, setSpecWp]             = useState<number>(635);
  const [specInput, setSpecInput]       = useState<string>('635');
  const [primaryField, setPrimaryField] = useState<PrimaryField>('cap');

  // 용량: 내부는 항상 kW
  const [capStr, setCapStr]   = useState<string>('');
  const [capUnit, setCapUnit] = useState<CapUnit>('kW');
  const [eaStr, setEaStr]     = useState<string>('');

  const panelRef   = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const capInputRef = useRef<HTMLInputElement>(null);
  const eaInputRef  = useRef<HTMLInputElement>(null);

  /* ── 바깥 클릭 닫기 ── */
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  /* ── ESC 닫기 ── */
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open]);

  /* ── 용량(kW) → 장수 계산 ── */
  const computeEaFromCapKw = useCallback((kw: number, wp: number) => {
    if (wp <= 0 || kw <= 0) { setEaStr(''); return; }
    setEaStr(String(roundEa(kw * 1000 / wp)));
  }, []);

  /* ── 장수 → 용량(kW) 계산 ── */
  const computeCapFromEa = useCallback((ea: number, wp: number) => {
    if (wp <= 0 || ea <= 0) { setCapStr(''); return; }
    const kw = ea * wp / 1000;
    const { str, unit } = roundCap(kw);
    setCapStr(str);
    setCapUnit(unit);
  }, []);

  /* ── Wp 변경 시 현재 primary 방향 재계산 ── */
  const applySpec = (wp: number) => {
    setSpecWp(wp);
    setSpecInput(String(wp));
    if (wp <= 0) return;
    if (primaryField === 'cap') {
      const n = parseFloat(capStr);
      if (Number.isFinite(n) && n > 0) {
        computeEaFromCapKw(capUnit === 'MW' ? n * 1000 : n, wp);
      }
    } else {
      const n = parseFloat(eaStr);
      if (Number.isFinite(n) && n > 0) computeCapFromEa(n, wp);
    }
  };

  const onChangeSpec = (v: string) => {
    setSpecInput(v);
    const n = parseFloat(v);
    if (Number.isFinite(n) && n > 0) applySpec(n);
  };

  /* ── 용량 입력 핸들러 (primary='cap' 일 때만 활성) ── */
  const onChangeCap = (v: string) => {
    setCapStr(v);
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) { setEaStr(''); return; }
    computeEaFromCapKw(capUnit === 'MW' ? n * 1000 : n, specWp);
  };

  /* ── 장수 입력 핸들러 (primary='ea' 일 때만 활성) ── */
  const onChangeEa = (v: string) => {
    setEaStr(v);
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) { setCapStr(''); setCapUnit('kW'); return; }
    computeCapFromEa(n, specWp);
  };

  /* ── ↕ 스왑: 입력 방향 전환 ── */
  const swap = () => {
    const next: PrimaryField = primaryField === 'cap' ? 'ea' : 'cap';
    setPrimaryField(next);
    // 전환 후 새 입력 필드에 포커스
    setTimeout(() => {
      if (next === 'ea') eaInputRef.current?.focus();
      else capInputRef.current?.focus();
    }, 0);
  };

  const reset = () => {
    setCapStr(''); setEaStr(''); setCapUnit('kW'); setPrimaryField('cap');
  };

  /* ── 공용 필드 스타일 ── */
  const inputCls  = 'h-9 flex-1 bg-background';
  const resultCls = 'h-9 flex-1 bg-muted text-muted-foreground cursor-default select-text';

  /* ── 용량 섹션 ── */
  const CapSection = (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        용량
        {primaryField === 'cap' && (
          <span className="ml-1.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">입력</span>
        )}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          ref={capInputRef}
          type="number"
          step={capUnit === 'MW' ? 0.01 : 1}
          min={0}
          value={capStr}
          readOnly={primaryField !== 'cap'}
          onChange={(e) => primaryField === 'cap' && onChangeCap(e.target.value)}
          className={primaryField === 'cap' ? inputCls : resultCls}
          placeholder="0"
        />
        <span className={`w-8 shrink-0 text-center text-xs font-semibold tabular-nums ${
          capUnit === 'MW' ? 'text-primary' : 'text-muted-foreground'
        }`}>
          {capUnit}
        </span>
      </div>
    </div>
  );

  /* ── 장수 섹션 ── */
  const EaSection = (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        장수 (EA)
        {primaryField === 'ea' && (
          <span className="ml-1.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">입력</span>
        )}
      </Label>
      <Input
        ref={eaInputRef}
        type="number"
        step={1}
        min={0}
        value={eaStr}
        readOnly={primaryField !== 'ea'}
        onChange={(e) => primaryField === 'ea' && onChangeEa(e.target.value)}
        className={primaryField === 'ea' ? inputCls : resultCls}
        placeholder="0"
      />
    </div>
  );

  return (
    <>
      {/* 트리거 버튼 */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="MW 장수 계산기 열기"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 flex h-10 items-center gap-1.5 rounded-full bg-primary px-3 text-primary-foreground shadow-lg hover:shadow-xl transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Calculator className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium whitespace-nowrap">MW↔장수</span>
      </button>

      {/* 계산기 패널 */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="용량 장수 변환 계산기"
          className="fixed bottom-20 right-5 z-50 w-72 rounded-lg border bg-background shadow-2xl"
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">용량 ↔ 장수 변환</h3>
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-muted focus:outline-none"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 px-4 py-3">
            {/* 모듈 출력 (Wp) */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">모듈 출력 (Wp)</Label>
              <Input
                type="number"
                min={1}
                value={specInput}
                onChange={(e) => onChangeSpec(e.target.value)}
                className="h-8 text-sm"
                placeholder="예: 635, 730, 750"
              />
            </div>

            {/* 용량 */}
            {CapSection}

            {/* ↕ 스왑 버튼 */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                aria-label="입력 방향 전환"
                onClick={swap}
                className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* 장수 */}
            {EaSection}

            {/* 하단 */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-muted-foreground">
                {primaryField === 'cap' ? '용량 → 장수' : '장수 → 용량'} · {specWp}Wp
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={reset}>
                초기화
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
