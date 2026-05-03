// Phase 4 GUI 메타 편집기 — 우측 selection-driven 패널 framework
//
// 설계 (RULES.md #0 듀얼 product 관점)
// - Figma 우측 패널 패턴: 캔버스 좌측 + 항상-보임 280px 우측 패널.
// - 패널 내용은 selection 기반:
//   • 아무 것도 안 선택 → editor-level 컨테이너 설정 (form/list/detail 메타)
//   • 행/탭/필드 클릭 → 그 행의 L3/L4 (조건부, 검증, 보안)
// - lg breakpoint (>=1024px) 부터 항상 보임. 그보다 좁으면 토글 strip.
// - 각 편집기가 자체 selection state 관리 (이 파일은 layout / 시각 primitive 만).

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft, Settings2, X } from 'lucide-react';

// ─── 레이아웃 ──────────────────────────────────────────────────────────────
// 편집기 본문을 좌측에, 패널을 우측에. 패널은 lg 이상에서만 보임 (좁은 화면 = 패널 토글).
export function EditorWithPanel({
  children, panel, panelTitle,
}: {
  children: ReactNode;
  panel: ReactNode;
  panelTitle?: string;
}) {
  const [smallOpen, setSmallOpen] = useState(false);
  return (
    <div className="flex h-full min-h-0">
      {/* 좌측: 편집기 본문 */}
      <div className="flex-1 min-w-0 min-h-0">
        {children}
      </div>

      {/* 우측 패널 — lg 이상 항상 노출 */}
      <aside className="hidden lg:flex w-[280px] shrink-0 flex-col border-l bg-muted/20">
        {panelTitle && (
          <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-background px-3 py-2 text-xs font-semibold">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{panelTitle}</span>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {panel}
        </div>
      </aside>

      {/* 좁은 화면용 토글 — 모바일에선 floating 버튼으로 패널 오버레이 */}
      <button
        type="button"
        className="lg:hidden fixed bottom-4 right-4 z-20 rounded-full bg-foreground text-background shadow-lg p-3"
        onClick={() => setSmallOpen(true)}
        aria-label="설정 패널 열기"
      >
        <Settings2 className="h-4 w-4" />
      </button>
      {smallOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-background/95">
          <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-semibold">
            <span>{panelTitle ?? '설정'}</span>
            <button type="button" onClick={() => setSmallOpen(false)} aria-label="닫기">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-auto h-[calc(100%-37px)]">
            {panel}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 패널 헤더 (selection-driven 시 back 버튼) ────────────────────────────
export function PanelSelectionHeader({
  title, subtitle, onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-background px-2 py-2 text-xs font-semibold">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded p-0.5 hover:bg-muted"
          aria-label="뒤로 (선택 해제)"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate">{title}</div>
        {subtitle && <div className="text-[10px] font-normal text-muted-foreground truncate">{subtitle}</div>}
      </div>
    </div>
  );
}

// ─── 패널 안의 collapsible sub-group ───────────────────────────────────────
// "검증", "조건부", "보안" 등 의미 그룹화에 사용.
export function PanelGroup({
  title, defaultOpen = true, children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted/40"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── 빈 selection 상태 hint ────────────────────────────────────────────────
export function PanelEmpty({ message }: { message: string }) {
  return (
    <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
      {message}
    </div>
  );
}

// ─── selection state hook (각 편집기가 사용) ───────────────────────────────
// 편집기마다 selection 모양이 다름 (필드/섹션/컬럼/탭 등). T 로 generic.
// 외부 ESC 키 핸들러 = deselect.
export function useEditorSelection<T extends object>(): [
  T | null,
  (next: T | null) => void,
  () => void,
] {
  const [selected, setSelected] = useState<T | null>(null);
  return [selected, setSelected, () => setSelected(null)];
}
