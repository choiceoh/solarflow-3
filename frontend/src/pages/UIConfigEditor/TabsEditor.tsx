// Phase 4 GUI 메타 편집기 — MetaDetailConfig.tabs[] 편집기 (runtime mimicry)
//
// 설계 결정 (grilling Q7 = B 일괄)
// - 탭바 = runtime MetaDetail 의 진짜 탭 네비와 동일한 스타일 (수평)
// - 순서 변경 = drag-drop (native HTML5, ArrayEditor 패턴 차용)
// - 이름 편집 = 더블클릭 → in-place input
// - 추가 = 탭바 끝 [ + ] 인라인 버튼
// - 삭제 = hover 시 × 표시 + confirmDialog
// - 선택 = 클릭 → onSelectIdx 호출 (부모가 우측 패널에서 그 탭 메타 편집)
//
// 부모는 이 컴포넌트와 별개로 selectedIdx 를 관리. selectedIdx === idx 인 탭이
// 진하게 표시되고, 그 탭의 contentBlock / sections / visibleIf 는 우측 패널이 담당.

import { useState, type DragEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { confirmDialog } from '@/lib/dialogs';
import type { DetailTabConfig } from '@/templates/types';

export function TabsEditor({
  tabs, onChange, selectedIdx, onSelectIdx,
}: {
  tabs: DetailTabConfig[];
  onChange: (next: DetailTabConfig[]) => void;
  selectedIdx: number | null;
  onSelectIdx: (idx: number | null) => void;
}) {
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // ─── 추가 ─────────────────────────────────────────────────────────────────
  const add = () => {
    let key = 'tab_1';
    for (let i = 1; i < 1000; i++) {
      const candidate = `tab_${i}`;
      if (!tabs.some((t) => t.key === candidate)) { key = candidate; break; }
    }
    const next: DetailTabConfig = { key, label: '새 탭' };
    onChange([...tabs, next]);
    onSelectIdx(tabs.length);
    // 추가 직후 in-place rename 모드로 전환
    setTimeout(() => {
      setRenamingIdx(tabs.length);
      setRenameDraft('새 탭');
    }, 0);
  };

  // ─── 삭제 ─────────────────────────────────────────────────────────────────
  const remove = async (idx: number) => {
    const ok = await confirmDialog({
      description: `"${tabs[idx]?.label ?? ''}" 탭을 삭제할까요?`,
      variant: 'destructive',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    const next = tabs.filter((_, i) => i !== idx);
    onChange(next);
    if (selectedIdx === idx) onSelectIdx(null);
    else if (selectedIdx !== null && selectedIdx > idx) onSelectIdx(selectedIdx - 1);
  };

  // ─── 이름 편집 (in-place) ────────────────────────────────────────────────
  const startRename = (idx: number) => {
    setRenamingIdx(idx);
    setRenameDraft(tabs[idx]?.label ?? '');
  };
  const commitRename = () => {
    if (renamingIdx === null) return;
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onChange(tabs.map((t, i) => i === renamingIdx ? { ...t, label: trimmed } : t));
    }
    setRenamingIdx(null);
    setRenameDraft('');
  };
  const cancelRename = () => {
    setRenamingIdx(null);
    setRenameDraft('');
  };

  // ─── drag-drop reorder ────────────────────────────────────────────────────
  const onDragStart = (idx: number) => (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragIdx(idx);
  };
  const onDragOverTab = (idx: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (idx !== dragIdx) setDragOverIdx(idx);
  };
  const onDropTab = (idx: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const next = [...tabs];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    onChange(next);
    // selection 도 따라가게
    if (selectedIdx === dragIdx) onSelectIdx(idx);
    else if (selectedIdx !== null) {
      // 단순 케이스: drag 가 selected 를 가로질렀으면 보정
      if (dragIdx < selectedIdx && idx >= selectedIdx) onSelectIdx(selectedIdx - 1);
      else if (dragIdx > selectedIdx && idx <= selectedIdx) onSelectIdx(selectedIdx + 1);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-1 border-b overflow-x-auto px-1 py-1">
      {tabs.map((t, idx) => {
        const isActive = selectedIdx === idx;
        const isDragging = dragIdx === idx;
        const isDragOver = dragOverIdx === idx && !isDragging;
        const isHovered = hoveredIdx === idx;
        const isRenaming = renamingIdx === idx;

        return (
          <div
            key={`${idx}-${t.key}`}
            draggable={!isRenaming}
            onDragStart={onDragStart(idx)}
            onDragOver={onDragOverTab(idx)}
            onDrop={onDropTab(idx)}
            onDragEnd={onDragEnd}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={() => { if (!isRenaming) onSelectIdx(idx); }}
            onDoubleClick={() => startRename(idx)}
            className={`group relative flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-t border-b-2 cursor-pointer whitespace-nowrap transition-colors ${
              isActive
                ? 'border-foreground text-foreground bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
            } ${isDragging ? 'opacity-40' : ''} ${
              isDragOver ? 'ring-2 ring-blue-400 ring-inset' : ''
            }`}
            title="더블클릭으로 이름 변경 / 드래그로 순서 변경"
          >
            {isRenaming ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  else if (e.key === 'Escape') { cancelRename(); }
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-5 w-32 rounded border border-input bg-background px-1.5 text-xs"
              />
            ) : (
              <span>{t.label || t.key}</span>
            )}
            {/* hover 시 × 노출 (활성 탭은 항상 노출) */}
            {!isRenaming && (isHovered || isActive) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(idx); }}
                className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                aria-label={`"${t.label}" 삭제`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-t whitespace-nowrap"
        title="새 탭 추가"
      >
        <Plus className="h-3 w-3" />
        탭 추가
      </button>
    </div>
  );
}
