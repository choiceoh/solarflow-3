import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value?: string | number | null;
  children?: ReactNode;
  className?: string;
  span?: 1 | 2 | 3 | 4;
}

export default function DetailField({ label, value, children, className, span }: Props) {
  const content = children ?? (value === undefined || value === null || value === '' ? '—' : String(value));
  const spanClass = span === 2 ? 'col-span-2' : span === 3 ? 'col-span-2 sm:col-span-3' : span === 4 ? 'col-span-2 sm:col-span-3 lg:col-span-4' : '';
  return (
    <div className={cn('min-w-0', spanClass, className)}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm break-words">{content}</div>
    </div>
  );
}
