/**
 * Card primitive class catalog.
 *
 * 디자인 변경(라운드/패딩/섀도우/구분선)은 이 파일에서만 한다.
 * card.tsx 는 React 구조만 들고 있고, 실제 className 은 여기에서 export.
 */

export const cardClasses = {
  root:
    "group/card flex flex-col gap-4 overflow-hidden rounded-lg border border-border/80 bg-card py-4 text-sm text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.035)] transition-shadow has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
  header:
    "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-lg px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
  title:
    "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
  description: "text-sm text-muted-foreground",
  action: "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
  content: "px-4 group-data-[size=sm]/card:px-3",
  footer:
    "flex items-center rounded-b-lg border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
} as const
