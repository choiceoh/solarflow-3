import { useEffect, useState } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export type FxPair = 'usdkrw' | 'cnykrw'

export interface FxSnapshot {
  rate: number
  change_pct: number | null
  source: string
  fetched_at: string
}

export interface FxPoint {
  date: string
  rate: number
}

export interface FxTimeseries {
  series: FxPoint[]
  latest: number | null
  change_pct: number | null
  source: string
  fetched_at: string
}

export function useFxSpot(pair: FxPair, enabled = true) {
  const [data, setData] = useState<FxSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    fetch(`${API_BASE_URL}/api/v1/public/fx/${pair}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: FxSnapshot) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
        console.warn(`[useFxSpot ${pair}] fetch failed:`, e)
      })
    return () => { cancelled = true }
  }, [pair, enabled])

  return { data, loading, error }
}

export function useFxTimeseries(pair: FxPair, days = 30, enabled = true) {
  const [data, setData] = useState<FxTimeseries | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    fetch(`${API_BASE_URL}/api/v1/public/fx/${pair}/timeseries?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: FxTimeseries) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
        console.warn(`[useFxTimeseries ${pair}] fetch failed:`, e)
      })
    return () => { cancelled = true }
  }, [pair, days, enabled])

  return { data, loading, error }
}
