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
  // resolver 가 sync 값을 반환해도 async 래퍼로 감싸서 항상 Promise 반환.
  // (실제 fetchWithAuth 가 Promise<T> 인데 sync return 으로 .then 호출이 깨지는 이슈 방지)
  (fetchWithAuth as unknown as MockedFetchWithAuth).mockImplementation((async (path, options) =>
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

// bun test 는 같은 file 안의 it 사이에 mock.calls 가 누적됨 — afterEach 에서 호출.
// (vitest 의 vi.clearAllMocks() 자리. 명시적으로 fetchWithAuth 만 clear 하므로
// 다른 mock 은 각 테스트 파일이 직접 처리.)
export function clearFetchWithAuthMock() {
  (fetchWithAuth as unknown as MockedFetchWithAuth).mockClear();
}
