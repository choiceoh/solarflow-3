import { useEffect, useState } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export type MetalSymbol = 'silver' | 'gold' | 'platinum' | 'palladium' | 'copper'

export interface MetalSnapshot {
  price_usd: number
  change_usd: number | null
  symbol: string
  source: string
  fetched_at: string
}

export function useMetalSpot(symbol: MetalSymbol, enabled = true) {
  const [data, setData] = useState<MetalSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    fetch(`${API_BASE_URL}/api/v1/public/metals/${symbol}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MetalSnapshot) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
        console.warn(`[useMetalSpot ${symbol}] fetch failed:`, e)
      })
    return () => { cancelled = true }
  }, [symbol, enabled])

  return { data, loading, error }
}
