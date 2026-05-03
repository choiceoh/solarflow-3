import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  /** localStorage key — `sf.inspector.section.${id}` 로 접힘 상태 영속 */
  id: string;
  title: string;
  /** 우측 hint (배지 등) */
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const KEY_PREFIX = 'sf.inspector.section.';

const readCollapsed = (id: string): boolean | null => {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(KEY_PREFIX + id);
    if (v === null) return null;
    return v === '1';
  } catch {
    return null;
  }
};

const writeCollapsed = (id: string, collapsed: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_PREFIX + id, collapsed ? '1' : '0');
  } catch {
    /* noop */
  }
};

/**
 * 인스펙터 패널의 각 카드 섹션을 collapse 가능하게 감싸는 wrapper.
 * 사용자가 첫 진입 시 압도되지 않도록 자주 안 쓰는 섹션 접힘 가능.
 * 접힘 상태 localStorage 영속.
 */
export const CollapsibleSection = ({ id, title, badge, defaultOpen = true, children }: CollapsibleSectionProps) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const stored = readCollapsed(id);
    return stored !== null ? stored : !defaultOpen;
  });

  useEffect(() => {
    writeCollapsed(id, collapsed);
  }, [id, collapsed]);

  return (
    <section className="rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
        )}
        <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        {badge}
      </button>
      {!collapsed && <div className="border-t border-slate-100 px-2 py-2 dark:border-slate-800">{children}</div>}
    </section>
  );
};
