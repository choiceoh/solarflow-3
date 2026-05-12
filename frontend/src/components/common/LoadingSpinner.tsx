import { motion } from "motion/react"
import { cn } from "@/lib/utils"

// 솔라 액센트 스피너 — mockup 톤에 맞춰 warm-line + solar-top 회전.
// 로딩이 짧으면 깜빡임처럼 보이지 않게 mount 후 120ms 지연 후 페이드 인.
export default function LoadingSpinner({
  className,
  label = "로딩 중",
}: {
  className?: string
  label?: string
}) {
  return (
    <motion.div
      className={cn("flex items-center justify-center p-8", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.12, duration: 0.18 }}
    >
      <div
        className="h-5 w-5 animate-spin rounded-full border-2"
        style={{
          borderColor: "var(--sf-line-2)",
          borderTopColor: "var(--sf-solar)",
        }}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </motion.div>
  )
}
