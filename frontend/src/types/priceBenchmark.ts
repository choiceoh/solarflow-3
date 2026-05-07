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
}

export interface PriceBenchmarkAIRefreshResult {
  run_id: string
  status: PriceBenchmarkRun['status']
  inserted_count: number
  skipped_count: number
  warnings: string[]
  items: PriceBenchmark[]
}
