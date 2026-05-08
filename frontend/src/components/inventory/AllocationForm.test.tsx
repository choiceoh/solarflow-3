import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  testAllocation,
  testBl,
  testBlLine,
  testCompany,
  testInventoryItem,
  testManufacturer,
  testPartner,
  testProduct,
} from '@/test/fixtures';
import { callsFor, clearFetchWithAuthMock, mockFetchWithAuth, parseJsonBody, resetAppStore, seedCompanyStore } from '@/test/mockApi';
import AllocationForm from './AllocationForm';

mock.module('@/lib/api', () => ({
  fetchWithAuth: mock(() => {}),
}));

function mockAllocationApi({ withBls = true } = {}) {
  mockFetchWithAuth((path) => {
    if (path === '/api/v1/partners') return [testPartner];
    if (path === '/api/v1/products') return [testProduct];
    if (path === `/api/v1/bls?manufacturer_id=${testManufacturer.manufacturer_id}`) return withBls ? [testBl] : [];
    if (path === `/api/v1/bls/${testBl.bl_id}/lines`) return [testBlLine];
    if (path === `/api/v1/inventory/allocations?company_id=${testCompany.company_id}&product_id=${testProduct.product_id}`) return [];
    if (path === `/api/v1/inventory/allocations/${testAllocation.alloc_id}`) return { ok: true };
    if (path === '/api/v1/inventory/allocations') return { alloc_id: 'created-alloc' };
    throw new Error(`Unexpected API call: ${path}`);
  });
}

async function selectPartner() {
  fireEvent.click(await screen.findByText('거래처 검색'));
  const searchInput = await screen.findByPlaceholderText('검색...');
  fireEvent.keyDown(searchInput, { key: 'Enter' });
  await screen.findByText(testPartner.partner_name);
}

describe('AllocationForm', () => {
  afterEach(() => {
    clearFetchWithAuthMock();
    resetAppStore();
  });

  it('keeps the dialog header and footer fixed while the form body scrolls', async () => {
    seedCompanyStore();
    mockAllocationApi({ withBls: false });

    render(
      <AllocationForm
        open
        onOpenChange={mock(() => {})}
        onSaved={mock(() => {})}
        invItems={[]}
      />,
    );

    expect(await screen.findByText('가용재고 사용 예약')).not.toBeNull();

    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content?.className).toContain('max-h-[90vh]');
    expect(content?.className).toContain('flex');
    expect(content?.className).toContain('flex-col');
    expect(content?.className).toContain('p-0');
    expect(content?.className).toContain('gap-0');

    const header = content?.querySelector('[data-slot="dialog-header"]');
    expect(header?.className).toContain('shrink-0');

    const footer = content?.querySelector('[data-slot="dialog-footer"]');
    expect(footer?.className).toContain('shrink-0');
    expect(footer?.className).toContain('border-t');

    const scrollArea = Array.from(content?.querySelectorAll('div') ?? []).find((node) => (
      node.className.includes('overflow-y-auto') && node.textContent?.includes('용도')
    ));
    expect(scrollArea?.className).toContain('flex-1');
    expect(scrollArea?.className).toContain('overflow-y-auto');
  });

  it('parses customer order number from edit notes and saves it back as a notes tag', async () => {
    seedCompanyStore();
    mockAllocationApi();

    render(
      <AllocationForm
        open
        onOpenChange={mock(() => {})}
        onSaved={mock(() => {})}
        invItems={[testInventoryItem]}
        editData={testAllocation}
      />,
    );

    const orderNoInput = await screen.findByDisplayValue('CUST-OLD');
    expect(await screen.findByDisplayValue('기존 메모')).not.toBeNull();
    expect(await screen.findByText(testPartner.partner_name)).not.toBeNull();

    fireEvent.change(orderNoInput, { target: { value: 'CUST-NEW' } });
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));

    await waitFor(() => expect(callsFor(`/api/v1/inventory/allocations/${testAllocation.alloc_id}`).length).toBe(1));
    const [, options] = callsFor(`/api/v1/inventory/allocations/${testAllocation.alloc_id}`)[0];
    expect(options?.method).toBe('PUT');
    expect(parseJsonBody(options)).toMatchObject({
      company_id: testCompany.company_id,
      product_id: testProduct.product_id,
      customer_name: testPartner.partner_name,
      notes: '[발주번호:CUST-NEW] 기존 메모',
      bl_id: testBl.bl_id,
      source_type: 'stock',
    });
  });

  it('splits a new reservation into stock and incoming allocations with one group id', async () => {
    seedCompanyStore();
    mockAllocationApi({ withBls: false });
    const splitItem = {
      ...testInventoryItem,
      available_kw: 635,
      available_incoming_kw: 635,
      incoming_kw: 635,
      total_secured_kw: 1270,
    };

    render(
      <AllocationForm
        open
        onOpenChange={mock(() => {})}
        onSaved={mock(() => {})}
        prefilledProductId={testProduct.product_id}
        invItems={[splitItem]}
      />,
    );

    await screen.findByText('현재고 가용');
    await selectPartner();
    fireEvent.change(screen.getByPlaceholderText('예) 33,000'), { target: { value: '1500' } });
    await waitFor(() => expect(screen.getAllByText('현재고').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText('미착품').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: '예약 등록' }));

    await waitFor(() => {
      const postCalls = callsFor('/api/v1/inventory/allocations').filter(([, options]) => options?.method === 'POST');
      expect(postCalls).toHaveLength(2);
    });
    const bodies = callsFor('/api/v1/inventory/allocations')
      .filter(([, options]) => options?.method === 'POST')
      .map(([, options]) => parseJsonBody(options));

    expect(bodies.map((body) => body.source_type)).toEqual(['stock', 'incoming']);
    expect(bodies.map((body) => body.quantity)).toEqual([1000, 500]);
    expect(bodies[0].group_id).toBeTruthy();
    expect(bodies[0].group_id).toBe(bodies[1].group_id);
    expect(bodies[0]).toMatchObject({
      company_id: testCompany.company_id,
      product_id: testProduct.product_id,
      purpose: 'sale',
      customer_name: testPartner.partner_name,
    });
  });
});
