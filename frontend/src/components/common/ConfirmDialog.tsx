import { AlertTriangle, HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onConfirm: () => void;
  loading?: boolean;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title = '확인',
  description = '정말 실행하시겠습니까?',
  onConfirm,
  loading,
  confirmLabel,
  variant = 'default',
}: ConfirmDialogProps) {
  const isDestructive = variant === 'destructive';
  const Icon = isDestructive ? AlertTriangle : HelpCircle;
  const iconBg = isDestructive ? 'var(--sf-neg-bg)' : 'var(--sf-info-bg)';
  const iconColor = isDestructive ? 'var(--sf-neg)' : 'var(--sf-info)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: iconBg, color: iconColor }}
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1 whitespace-pre-line">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            취소
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? '처리 중...' : (confirmLabel ?? '확인')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
