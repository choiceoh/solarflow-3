import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mockFetchWithAuth } from '@/test/mockApi';
import { useAlerts } from './useAlerts';

function withQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

vi.mock('@/lib/api', () => ({
  fetchWithAuth: vi.fn(),
}));

function daysFromNow(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('useAlerts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds operational alerts from the current API response shapes', async () => {
    mockFetchWithAuth((path) => {
      if (path === '/api/v1/calc/lc-maturity-alert') {
        return {
          alerts: [
            { lc_id: 'lc-1', bank_name: '하나', amount_usd: 1000, maturity_date: daysFromNow(3), days_remaining: 3, status: 'opened' },
            { lc_id: 'lc-2', bank_name: '국민', amount_usd: 1000, maturity_date: daysFromNow(12), days_remaining: 12, status: 'opened' },
          ],
        };
      }
      if (path === '/api/v1/calc/lc-limit-timeline') {
        return { bank_summaries: [], timeline_events: [], monthly_projection: [{ month: '2026-05', projected_available: -100 }] };
      }
      if (path === '/api/v1/calc/customer-analysis') {
        return {
          items: [
            { customer_id: 'c1', customer_name: 'A사', outstanding_krw: 1000, outstanding_count: 1, oldest_outstanding_days: 75 },
            { customer_id: 'c2', customer_name: 'B사', outstanding_krw: 1000, outstanding_count: 1, oldest_outstanding_days: 45 },
            { customer_id: 'c3', customer_name: 'C사', outstanding_krw: 0, outstanding_count: 1, oldest_outstanding_days: 90 },
          ],
          summary: { total_outstanding_krw: 2000 },
        };
      }
      if (path === '/api/v1/calc/inventory') {
        return {
          items: [
            { product_id: 'p1', long_term_status: 'warning' },
            { product_id: 'p2', long_term_status: 'critical' },
          ],
          summary: { total_physical_kw: 0, total_available_kw: 0, total_incoming_kw: 0, total_secured_kw: 0 },
          calculated_at: new Date().toISOString(),
        };
      }
      if (path === '/api/v1/bls?company_id=company-1') {
        return [
          { bl_id: 'bl-1', bl_number: 'BL-1', company_id: 'company-1', manufacturer_id: 'm1', inbound_type: 'import', currency: 'USD', status: 'shipping', eta: daysFromNow(4) },
        ];
      }
      if (path === '/api/v1/orders?company_id=company-1') {
        return [
          { order_id: 'o1', company_id: 'company-1', customer_id: 'c1', order_date: daysFromNow(0), receipt_method: 'email', management_category: 'sale', fulfillment_source: 'stock', product_id: 'p1', quantity: 10, unit_price_wp: 100, remaining_qty: 10, delivery_due: daysFromNow(5), status: 'received' },
          { order_id: 'o2', company_id: 'company-1', customer_id: 'c2', order_date: daysFromNow(0), receipt_method: 'email', management_category: 'sale', fulfillment_source: 'stock', product_id: 'p1', quantity: 10, unit_price_wp: 100, remaining_qty: 10, status: 'partial' },
        ];
      }
      if (path === '/api/v1/outbounds/summary?status=active&company_id=company-1') {
        // ob-1 (sale 있으나 tax_invoice_date 없음), ob-2 (sale 자체 없음) 둘 다 미발행으로 집계
        return { total: 2, active_count: 2, cancel_pending_count: 0, cancelled_count: 0, sale_amount_sum: 0, invoice_pending_count: 2 };
      }
      throw new Error(`Unexpected API call: ${path}`);
    });

    const { result } = renderHook(() => useAlerts('company-1'), { wrapper: withQuery() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const counts = Object.fromEntries(result.current.alerts.map((alert) => [alert.type, alert.count]));
    expect(counts.lc_maturity).toBe(1);
    expect(counts.lc_shortage).toBe(1);
    expect(counts.overdue_critical).toBe(1);
    expect(counts.overdue_warning).toBe(1);
    expect(counts.no_invoice).toBe(2);
    expect(counts.eta_soon).toBe(1);
    expect(counts.longterm_critical).toBe(1);
    expect(counts.longterm_warning).toBe(1);
    expect(counts.delivery_soon).toBe(1);
    expect(counts.no_site).toBe(2);
  });
});
