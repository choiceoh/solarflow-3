import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}

export default function DetailFieldGrid({ children, cols = 4, className }: Props) {
  const colClass =
    cols === 2 ? 'grid-cols-2 sm:grid-cols-2'
    : cols === 3 ? 'grid-cols-2 sm:grid-cols-3'
    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
  return (
    <div className={cn('grid gap-x-6 gap-y-4', colClass, className)}>
      {children}
    </div>
  );
}
