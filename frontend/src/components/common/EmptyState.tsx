import { motion } from "motion/react"
import { Inbox, AlertTriangle, AlertCircle, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export type EmptyStateTone = "default" | "warn" | "error"

interface EmptyStateProps {
  message?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  icon?: LucideIcon
  /** 시각 톤 — error 는 적색, warn 은 황색. 기본은 차분한 회색. */
  tone?: EmptyStateTone
}

const ICON_BY_TONE: Record<EmptyStateTone, LucideIcon> = {
  default: Inbox,
  warn: AlertTriangle,
  error: AlertCircle,
}

const ICON_TONE_CLASS: Record<EmptyStateTone, string> = {
  default: "sf-tone-muted",
  warn: "sf-tone-warn",
  error: "sf-tone-neg",
}

// 빈 상태 — mockup의 차분한 well + 미세 hierarchy 패턴
export default function EmptyState({
  message = "데이터가 없습니다",
  description,
  actionLabel,
  onAction,
  icon,
  tone = "default",
}: EmptyStateProps) {
  const Icon = icon ?? ICON_BY_TONE[tone]
  return (
    <motion.div
      className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center"
      role={tone === "error" ? "alert" : undefined}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <motion.div
        className={`mb-1 flex h-11 w-11 items-center justify-center rounded-full ${ICON_TONE_CLASS[tone]}`}
        aria-hidden="true"
        initial={{ scale: 0.85 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.04, type: "spring", stiffness: 380, damping: 24 }}
      >
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </motion.div>
      <p className="sf-text-ink-2 text-sm font-medium">{message}</p>
      {description && (
        <p className="sf-text-ink-3 max-w-xs text-xs leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </motion.div>
  )
}
