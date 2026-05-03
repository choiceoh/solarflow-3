import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testBl, testBlLine, testLc, testPo, testPoLine, testTt } from '@/test/fixtures';
import { callsFor, mockFetchWithAuth, resetAppStore, seedCompanyStore } from '@/test/mockApi';
import POListTable from './POListTable';

vi.mock('@/lib/api', () => ({
  fetchWithAuth: vi.fn(),
}));

function mockPOListApi() {
  mockFetchWithAuth((path) => {
    if (path === `/api/v1/pos/${testPo.po_id}/lines`) return [testPoLine];
    if (path === `/api/v1/lcs?po_id=${testPo.po_id}`) return [testLc];
    if (path === `/api/v1/tts?po_id=${testPo.po_id}`) return [testTt];
    if (path === `/api/v1/bls?po_id=${testPo.po_id}`) return [{ ...testBl, po_id: testPo.po_id, lc_id: testLc.lc_id }];
    if (path === `/api/v1/bls/${testBl.bl_id}/lines`) return [testBlLine];
    throw new Error(`Unexpected API call: ${path}`);
  });
}

function renderTable(props: Partial<ComponentProps<typeof POListTable>> = {}) {
  return render(
    <POListTable
      items={[testPo]}
      onDetail={vi.fn()}
      {...props}
    />,
  );
}

describe('POListTable', () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetAppStore();
  });

  it('loads PO aggregates first and lazy-loads B/L MW when expanded', async () => {
    seedCompanyStore();
    mockPOListApi();
    const onSelectBL = vi.fn();

    renderTable({ onSelectBL });

    expect(await screen.findByText('$100,000.00')).not.toBeNull();
    expect(await screen.findByText('$60,000.00')).not.toBeNull();
    expect(screen.getByText('미개설').textContent).toContain('미개설');
    expect(callsFor(`/api/v1/bls?po_id=${testPo.po_id}`)).toHaveLength(0);

    const poRow = screen.getByText(testPo.po_number).closest('tr');
    expect(poRow).not.toBeNull();
    fireEvent.click(poRow!);

    expect(await screen.findByText('MW 진행 현황')).not.toBeNull();
    expect(await screen.findByText(testBl.bl_number)).not.toBeNull();
    await waitFor(() => {
      expect(screen.getAllByText('0.64 MW').length).toBeGreaterThan(0);
    });
    expect(callsFor(`/api/v1/bls?po_id=${testPo.po_id}`)).toHaveLength(1);

    fireEvent.click(screen.getByText(testBl.bl_number));
    expect(onSelectBL).toHaveBeenCalledWith(testBl.bl_id);
  });

  it('renders an empty state when no PO exists', () => {
    render(
      <POListTable
        items={[]}
        onDetail={vi.fn()}
      />,
    );

    expect(screen.getByText('등록된 PO가 없습니다')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '새로 등록' })).toBeNull();
  });
});
