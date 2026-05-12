import { motion } from "motion/react"

// SkeletonRows — 테이블 로딩 상태에 사용. .sf-skeleton shimmer 사용.
// 행마다 너비가 살짝 다른 패턴 — 실데이터 같은 자연스러운 인상.
// 행이 위에서부터 짧게 스태거 페이드 인 — 짧은 로딩은 거의 안 보이고, 길어지면 자연스럽게 누적.
const WIDTH_PATTERN = ["100%", "92%", "96%", "88%", "100%", "90%", "94%", "86%"]

export default function SkeletonRows({
  rows = 6,
  height = 32,
}: {
  rows?: number
  height?: number
}) {
  return (
    <div className="flex flex-col gap-1.5 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          className="sf-skeleton"
          style={{ height, width: WIDTH_PATTERN[i % WIDTH_PATTERN.length] }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 + i * 0.03, duration: 0.16 }}
        />
      ))}
    </div>
  )
}
