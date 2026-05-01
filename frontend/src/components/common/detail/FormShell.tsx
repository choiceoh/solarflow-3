import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  variant: 'dialog' | 'inline';
  /** dialog 모드 전용. inline에서는 무시되며 부모가 마운트로 가시성을 제어. */
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  /** dialog 모드 전용. inline에서는 무시되며 부모 DetailSection의 title을 사용. */
  title: string;
  /** dialog 모드 전용. DialogContent에 적용될 추가 클래스 (폭/높이/스크롤). */
  dialogContentClassName?: string;
  children: ReactNode;
}

/**
 * 폼 외곽 셸 — dialog 모드는 모달, inline 모드는 부모 카드 안에서 본문만 렌더.
 *
 * inline 모드는 부모(예: <DetailSection title="...">)가 카드/제목/스타일을 제공하므로
 * open/title/dialogContentClassName 모두 무시된다.
 */
export default function FormShell({
  variant,
  open = true,
  onOpenChange,
  title,
  dialogContentClassName = 'sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto',
  children,
}: Props) {
  if (variant === 'inline') {
    return <div className="space-y-3">{children}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
