/**
 * Dialog primitive class catalog.
 *
 * 디자인 변경(오버레이/팝업 라운드/그림자/헤더-푸터 패딩)은 이 파일에서만 한다.
 * 드래그 핸들 로직은 dialog.tsx 본문에 그대로 (구조와 분리되는 className만 추출).
 */

export const dialogClasses = {
  overlay:
    "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
  content:
    "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
  header:
    "flex flex-col gap-2 cursor-grab active:cursor-grabbing select-none",
  footer:
    "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
  title: "font-heading text-base leading-none font-medium",
  description:
    "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
  closeButton: "absolute top-2 right-2",
} as const
