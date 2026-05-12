import type { ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
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
  // 라벨이 바뀔 때 fade+slide 로 부드럽게 교체. 같은 라벨이면 애니메이션 트리거 안 함.
  const animKey = typeof label === "string" || typeof label === "number" ? String(label) : "label"
  return (
    <span
      title={title}
      className={cn("sf-status-pill", colorClassName ?? TONE_CLASS[tone], className)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={animKey}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 3, position: "absolute" }}
          transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
