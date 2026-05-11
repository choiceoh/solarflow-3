export interface PriceBenchmark {
  benchmark_id: string
  run_id?: string | null
  source_key: string
  source_name: string
  metric_key: string
  metric_label: string
  value_date: string
  period_label?: string | null
  market_region: string
  basis: string
  currency: string
  price_usd_w?: number | null
  price_cny_w?: number | null
  price_krw_w?: number | null
  cargo_min_mw?: number | null
  cargo_max_mw?: number | null
  quarter_label?: string | null
  project_segment?: string | null
  technology?: string | null
  confidence?: number | null
  source_url?: string | null
  raw_excerpt?: string | null
  notes?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface PriceBenchmarkRun {
  run_id: string
  status: 'running' | 'completed' | 'partial' | 'failed'
  provider?: string | null
  model?: string | null
  source_keys?: string[]
  requested_by?: string | null
  started_at: string
  finished_at?: string | null
  inserted_count: number
  skipped_count: number
  error_message?: string | null
  warnings?: string[]
  evidence?: unknown[]
}

export interface PriceBenchmarkAIRefreshResult {
  run_id: string
  status: PriceBenchmarkRun['status']
  inserted_count: number
  skipped_count: number
  warnings: string[]
  items: PriceBenchmark[]
}

export interface PriceForecastStrategyObservation {
  source_key: string
  source_name: string
  metric_key: string
  metric_label: string
  value_date: string
  market_region: string
  basis: string
  price_usd_w?: number | null
  price_cny_w?: number | null
  price_krw_w?: number | null
  confidence?: number | null
}

export interface PriceForecastStrategyRunInput {
  status: PriceBenchmarkRun['status']
  started_at?: string | null
  source_keys: string[]
  warnings: string[]
}

export interface PriceForecastStrategyRequest {
  unit: 'usd'
  observations: PriceForecastStrategyObservation[]
  own_purchase_usd_w?: number | null
  own_purchase_date?: string | null
  runs: PriceForecastStrategyRunInput[]
}

export interface PriceForecastMarketSnapshot {
  latest_cmm_usd_w?: number | null
  latest_floor_usd_w?: number | null
  latest_tender_usd_w?: number | null
  cmm_trend_pct?: number | null
  purchase_vs_cmm_pct?: number | null
  cmm_vs_floor_pct?: number | null
}

export interface PriceForecastScenario {
  key: string
  label: string
  horizon_months: number
  low_usd_w?: number | null
  base_usd_w?: number | null
  high_usd_w?: number | null
  drivers: string[]
}

export interface PriceForecastSourceQuality {
  source_key: string
  source_name: string
  score: number
  status: 'ok' | 'watch' | 'stale' | string
  latest_date?: string | null
  observation_count: number
  avg_confidence?: number | null
  warning_count: number
  note: string
}

export interface PriceForecastStrategyResponse {
  action_key: string
  action_label: string
  tone: 'positive' | 'warning' | 'neutral' | string
  confidence_score: number
  one_month_view: string
  three_month_view: string
  six_month_view: string
  note: string
  basis: string[]
  market: PriceForecastMarketSnapshot
  scenarios: PriceForecastScenario[]
  source_quality: PriceForecastSourceQuality[]
  calculated_at: string
}
