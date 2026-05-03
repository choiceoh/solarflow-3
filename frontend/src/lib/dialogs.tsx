import { useState } from 'react';
import { create } from 'zustand';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * 임의 호출형(imperative) 다이얼로그 — `window.confirm` / `window.prompt` 의 대체.
 * harness/UI_STANDARDS.md "## 1. 에러/토스트" 참조.
 *
 * 사용:
 *   if (!(await confirmDialog({ description: '삭제할까요?', variant: 'destructive' }))) return;
 *   const name = await promptDialog({ description: '뷰 이름:' });
 *
 * App 루트에 <DialogHost /> 가 마운트되어 있어야 한다.
 */

type ConfirmReq = {
  kind: 'confirm';
  title?: string;
  description: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
  resolve: (v: boolean) => void;
};

type PromptReq = {
  kind: 'prompt';
  title?: string;
  description: string;
  defaultValue?: string;
  confirmLabel?: string;
  resolve: (v: string | null) => void;
};

type DialogReq = ConfirmReq | PromptReq;

const useDialogStore = create<{ current: DialogReq | null }>(() => ({ current: null }));

export function confirmDialog(opts: Omit<ConfirmReq, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.setState({ current: { kind: 'confirm', resolve, ...opts } });
  });
}

export function promptDialog(opts: Omit<PromptReq, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.setState({ current: { kind: 'prompt', resolve, ...opts } });
  });
}

function close(value: boolean | string | null) {
  const cur = useDialogStore.getState().current;
  if (!cur) return;
  if (cur.kind === 'confirm') cur.resolve(value as boolean);
  else cur.resolve(value as string | null);
  useDialogStore.setState({ current: null });
}

export function DialogHost() {
  const current = useDialogStore((s) => s.current);
  if (!current) return null;
  if (current.kind === 'confirm') {
    return (
      <ConfirmDialog
        open
        onOpenChange={(o) => {
          if (!o) close(false);
        }}
        title={current.title}
        description={current.description}
        confirmLabel={current.confirmLabel}
        variant={current.variant}
        onConfirm={() => close(true)}
      />
    );
  }
  return <PromptHost req={current} />;
}

function PromptHost({ req }: { req: PromptReq }) {
  const [value, setValue] = useState(req.defaultValue ?? '');
  const submit = () => {
    if (value.trim().length === 0) return;
    close(value);
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close(null);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{req.title ?? '입력'}</DialogTitle>
          <DialogDescription>{req.description}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => close(null)}>
            취소
          </Button>
          <Button onClick={submit}>{req.confirmLabel ?? '확인'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
