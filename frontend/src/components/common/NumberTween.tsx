import { useEffect, useRef } from 'react'
import { animate, useMotionValue, useTransform, motion, useReducedMotion } from 'motion/react'
import { sfMotion } from '@/lib/motion'

type Props = {
  value: number
  format: (n: number) => string
  duration?: number
}

/**
 * KPI 등 큰 숫자가 변경될 때 부드럽게 보간하며 표시. 새 값이 들어오면 이전 값에서
 * spring 곡선으로 카운트업/다운. 데이터 fetch 직후 0 → 실값 보간으로 "지표가
 * 살아남" 시각 단서. prefers-reduced-motion 시 즉시 set (애니메이션 무력화).
 */
export function NumberTween({ value, format, duration = 0.9 }: Props) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(value)
  const display = useTransform(mv, (latest) => format(latest))
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      if (reduce) {
        mv.set(value)
        return
      }
      mv.set(0)
    }
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, {
      duration,
      ease: sfMotion.easeOut,
    })
    return () => controls.stop()
  }, [value, duration, reduce, mv])

  return <motion.span>{display}</motion.span>
}
