import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type StatusPillTone = "neutral" | "info" | "positive" | "warning" | "negative" | "solar"

interface StatusPillProps {
  label: ReactNode
  tone?: StatusPillTone
  /**
   * Legacy escape hatch while domain status maps migrate to tone.
   * Prefer tone or sf-tone-* classes for new code.
   */
  colorClassName?: string
  className?: string
  title?: string
}

const TONE_CLASS: Record<StatusPillTone, string> = {
  neutral: "sf-tone-muted",
  info: "sf-tone-info",
  positive: "sf-tone-pos",
  warning: "sf-tone-warn",
  negative: "sf-tone-neg",
  solar: "sf-tone-solar",
}

export default function StatusPill({
  label,
  tone = "neutral",
  colorClassName,
  className,
  title,
}: StatusPillProps) {
  return (
    <span
      title={title}
      className={cn("sf-status-pill", colorClassName ?? TONE_CLASS[tone], className)}
    >
      {label}
    </span>
  )
}
