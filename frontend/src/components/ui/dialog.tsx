import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { dialogClasses } from "./dialog-variants"

// DialogHeader → DialogContent 드래그 핸들러 전달용 Context
const DragHandleContext = React.createContext<(e: React.MouseEvent) => void>(() => {});

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(dialogClasses.overlay, className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  // 드래그 offset (px). 다이얼로그가 마운트될 때마다 초기화됨.
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const dragging = React.useRef(false);
  // origin: 드래그 시작 시점의 마우스 위치 + pos 스냅샷 (ref로 관리 → 클로저 문제 없음)
  const origin = React.useRef({ mx: 0, my: 0, px: 0, py: 0 });
  // pos를 ref로도 유지 → handleHeaderMouseDown deps 없이 최신값 참조
  const posRef = React.useRef({ x: 0, y: 0 });
  React.useEffect(() => { posRef.current = pos; }, [pos]);

  // 헤더 mousedown → 드래그 시작 (버튼/입력 요소는 제외)
  const handleHeaderMouseDown = React.useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(
      'button, input, select, textarea, [role="combobox"], [role="option"], [role="listbox"], a, label'
    )) return;
    e.preventDefault();
    dragging.current = true;
    origin.current = {
      mx: e.clientX,
      my: e.clientY,
      px: posRef.current.x,
      py: posRef.current.y,
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: origin.current.px + ev.clientX - origin.current.mx,
        y: origin.current.py + ev.clientY - origin.current.my,
      });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []); // deps 없음 — refs로 최신값 참조

  return (
    <DragHandleContext.Provider value={handleHeaderMouseDown}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(dialogClasses.content, className)}
          style={{
            transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
          }}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className={dialogClasses.closeButton}
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DragHandleContext.Provider>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const handleMouseDown = React.useContext(DragHandleContext);
  return (
    <div
      data-slot="dialog-header"
      className={cn(dialogClasses.header, className)}
      onMouseDown={handleMouseDown}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(dialogClasses.footer, className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(dialogClasses.title, className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(dialogClasses.description, className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
