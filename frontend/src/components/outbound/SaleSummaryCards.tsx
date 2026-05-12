import { motion } from "motion/react"
import { Card, CardContent } from "@/components/ui/card"
import { formatNumber } from "@/lib/utils"
import { NumberTween } from "@/components/common/NumberTween"
import type { SaleListItem } from "@/types/outbound"

const cardEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
}

interface Props {
  items: SaleListItem[]
  // 서버 집계로 받은 전체 합계 — 페이지네이션된 화면에서 items 가 현재 페이지만 담는 경우 사용.
  // 미지정 시 items 기반으로 계산 (legacy / 작은 데이터셋용).
  summary?: {
    totalSupply: number
    totalVat: number
    totalAmount: number
    count: number
    issuedCount: number
  }
}

export default function SaleSummaryCards({ items, summary }: Props) {
  const totalSupply =
    summary?.totalSupply ?? items.reduce((sum, i) => sum + (i.sale.supply_amount ?? 0), 0)
  const totalVat = summary?.totalVat ?? items.reduce((sum, i) => sum + (i.sale.vat_amount ?? 0), 0)
  const totalAmount =
    summary?.totalAmount ?? items.reduce((sum, i) => sum + (i.sale.total_amount ?? 0), 0)
  const count = summary?.count ?? items.length
  const issuedCount = summary?.issuedCount ?? items.filter((i) => i.sale.tax_invoice_date).length
  const issueRate = count > 0 ? Math.round((issuedCount / count) * 100) : 0

  return (
    <motion.div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      initial="initial"
      animate="animate"
      transition={{ staggerChildren: 0.05 }}
    >
      <motion.div variants={cardEnter} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground">매출 합계 (공급가)</p>
            <p className="text-lg font-bold">
              <NumberTween value={totalSupply} format={formatNumber} />원
            </p>
            <p className="text-[10px] text-muted-foreground">
              부가세 포함: {formatNumber(totalAmount)}원
            </p>
          </CardContent>
        </Card>
      </motion.div>
      <motion.div variants={cardEnter} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground">매출 건수</p>
            <p className="text-lg font-bold">
              <NumberTween value={count} format={(n) => String(Math.round(n))} />건
            </p>
          </CardContent>
        </Card>
      </motion.div>
      <motion.div variants={cardEnter} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground">계산서 발행률</p>
            <p className="text-lg font-bold">
              <NumberTween value={issueRate} format={(n) => String(Math.round(n))} />%
            </p>
            <p className="text-[10px] text-muted-foreground">
              {issuedCount}/{count}건
            </p>
          </CardContent>
        </Card>
      </motion.div>
      <motion.div variants={cardEnter} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground">부가세 합계</p>
            <p className="text-lg font-bold">
              <NumberTween value={totalVat} format={formatNumber} />원
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
