// useServerSort — server-side 정렬 state (백엔드에 sort/order 쿼리 파라미터로 전달).
// 기존 useSort 가 client-side 라 fetchAll 한 데이터 메모리 정렬이라면, 이건 page=1 으로 reset 하면서
// 백엔드 호출 query 만 갱신.
//
// SortableTH 와 시그니처 호환 — { sortKey, direction, onSort } props.

import { useCallback, useMemo, useState } from "react"
import type { SortingState } from "@/lib/columnSort"
import type { SortDirection } from "./useSort"

export interface ServerSortState {
  field: string | null
  direction: SortDirection
}

export function useServerSort(
  defaultField: string,
  defaultDirection: Exclude<SortDirection, null> = "desc",
  onChange?: () => void,
) {
  const [state, setState] = useState<ServerSortState>({
    field: defaultField,
    direction: defaultDirection,
  })

  const sorting = useMemo<SortingState>(
    () => (state.field ? [{ id: state.field, desc: state.direction !== "asc" }] : []),
    [state],
  )

  const toggle = useCallback(
    (field: string) => {
      setState((prev) => {
        let next: ServerSortState
        if (prev.field !== field) next = { field, direction: "desc" }
        else if (prev.direction === "desc") next = { field, direction: "asc" }
        else next = { field: defaultField, direction: defaultDirection }
        return next
      })
      // page reset 등 부수효과 — 호출 측에서 setPage(1) 호출하도록 onChange 콜.
      if (onChange) onChange()
    },
    [defaultField, defaultDirection, onChange],
  )

  const onSortingChange = useCallback(
    (next: SortingState) => {
      const first = next[0]
      setState(
        first
          ? { field: first.id, direction: first.desc ? "desc" : "asc" }
          : { field: defaultField, direction: defaultDirection },
      )
      if (onChange) onChange()
    },
    [defaultField, defaultDirection, onChange],
  )

  const headerProps = useCallback(
    (field: string) => ({
      sortKey: field,
      direction: state.field === field ? state.direction : null,
      onSort: toggle,
    }),
    [state, toggle],
  )

  return {
    sortField: state.field,
    sortDirection: state.direction,
    sorting,
    onSortingChange,
    /** ListTable 의 controlled-mode useSort 에 그대로 넘기는 toggle 함수. */
    onSort: toggle,
    headerProps,
    /** API query 에 그대로 전달할 sort/order 값. */
    queryParams: (state.field
      ? { sort: state.field, order: (state.direction === "asc" ? "asc" : "desc") as "asc" | "desc" }
      : {}) as { sort?: string; order?: "asc" | "desc" },
  }
}
