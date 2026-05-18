import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api'
import { notify, formatError } from '@/lib/notify'
import { formatUSD } from '@/lib/utils'
import { Input } from '@/components/ui/input'

interface Props {
  bankId: string
  value: number
}

/**
 * 마스터 은행 테이블의 "승인한도(USD)" 셀 인라인 편집.
 *
 * 클릭 → 인풋 전환 → Enter 저장 / Esc 취소.
 * PATCH `/api/v1/banks/:id` { lc_limit_usd } 만 보냄.
 * Postgres 트리거 (M161) 가 limit_changes 에 변경 이력 자동 기록.
 */
export default function InlineLcLimitCell({ bankId, value }: Props) {
  const [current, setCurrent] = useState(value)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(String(value))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 외부 데이터 갱신 시 (탭 전환 등) 새 prop 반영.
  useEffect(() => {
    setCurrent(value)
    setText(String(value))
  }, [value])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const cancel = () => {
    setText(String(current))
    setEditing(false)
  }

  const save = async () => {
    const num = Number(text.replace(/,/g, ''))
    if (!Number.isFinite(num) || num <= 0) {
      notify.error('한도는 양수여야 합니다')
      return
    }
    if (num === current) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await fetchWithAuth(`/api/v1/banks/${bankId}`, {
        method: 'PATCH',
        body: JSON.stringify({ lc_limit_usd: num }),
      })
      setCurrent(num)
      setEditing(false)
      notify.success(`승인한도 ${formatUSD(num)} 로 변경`)
    } catch (e) {
      notify.error(`변경 실패: ${formatError(e)}`)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
        className="group inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-gray-100"
        title="클릭하여 한도 변경"
      >
        <span>{formatUSD(current)}</span>
        <Pencil className="h-3 w-3 text-gray-300 group-hover:text-gray-500" />
      </button>
    )
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation 만 목적, 인터랙티브는 내부 input/button.
    <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Input
        ref={inputRef}
        type="number"
        step="100000"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          else if (e.key === 'Escape') cancel()
        }}
        disabled={saving}
        className="h-7 w-36"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="text-green-600 hover:text-green-700 disabled:opacity-50"
        title="저장 (Enter)"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
        title="취소 (Esc)"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
