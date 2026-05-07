import type { Mock } from 'bun:test';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { testCompany } from './fixtures';

// Bun test 의 mock.module() 로 fetchWithAuth 자체가 mock 으로 교체된 상태 가정.
// 호출처 테스트 파일에서 mock.module('@/lib/api', () => ({ fetchWithAuth: mock() })) 선언 필요.
// 여기서는 그 mock 핸들에 implementation 을 채워주는 헬퍼.
type MockedFetchWithAuth = Mock<typeof fetchWithAuth>;

export function resetAppStore() {
  useAppStore.setState({
    selectedCompanyId: 'all',
    companies: [],
    companiesLoaded: false,
  });
}

export function seedCompanyStore(selectedCompanyId = testCompany.company_id) {
  useAppStore.setState({
    selectedCompanyId,
    companies: [testCompany],
    companiesLoaded: true,
  });
}

export function mockFetchWithAuth(resolver: (path: string, options?: RequestInit) => unknown) {
  (fetchWithAuth as unknown as MockedFetchWithAuth).mockImplementation(((path, options) =>
    resolver(path, options)) as typeof fetchWithAuth);
}

export function parseJsonBody(options?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(options?.body ?? '{}')) as Record<string, unknown>;
}

export function callsFor(path: string) {
  return (fetchWithAuth as unknown as MockedFetchWithAuth).mock.calls.filter(
    ([calledPath]) => calledPath === path,
  );
}
