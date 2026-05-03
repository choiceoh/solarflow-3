/**
 * Table primitive class catalog.
 *
 * 디자인 변경(헤더 높이/셀 패딩/행 hover/footer 톤)은 이 파일에서만 한다.
 * 글로벌 sticky thead, tabular-nums 등은 src/index.css 의 .sf-page 스코프에서 별도 처리.
 */

export const tableClasses = {
  container: "relative w-full overflow-x-auto",
  root: "w-full caption-bottom text-sm",
  header: "[&_tr]:border-b",
  body: "[&_tr:last-child]:border-0",
  footer: "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
  row: "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
  head: "h-10 px-2 text-left align-middle font-medium truncate text-foreground [&:has([role=checkbox])]:pr-0",
  cell: "p-2 align-middle truncate [&:has([role=checkbox])]:pr-0",
  caption: "mt-4 text-sm text-muted-foreground",
} as const
