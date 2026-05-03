import { toast } from 'sonner';

/**
 * 알 수 없는 형태의 에러 객체를 사용자에게 보여줄 한 줄 메시지로 정규화.
 * PostgREST/Go 게이트웨이는 대부분 Error 인스턴스를 던진다.
 */
export function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return '알 수 없는 오류가 발생했습니다';
}

/**
 * 토스트 단일 진입점. harness/UI_STANDARDS.md "## 1. 에러/토스트" 참조.
 *
 * 비동기 변이 결과는 토스트, 폼 검증은 인라인, 페이지 단위 로딩 실패는 ErrorState.
 * 변이 에러 토스트는 queryClient 의 글로벌 onError 가 자동 처리하므로
 * notify.error 를 직접 부르는 일은 거의 없다 (글로벌 핸들러를 우회해야 할 때만).
 */
export const notify = {
  success: (msg: string) => toast.success(msg),
  error: (msg: string) => toast.error(msg, { duration: 5000 }),
  info: (msg: string) => toast.info(msg),
  warning: (msg: string) => toast.warning(msg, { duration: 5000 }),
  promise: toast.promise,
};
