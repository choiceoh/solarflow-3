/**
 * 박물관 표본(`is_sandbox=true`) 데이터를 폼에 바인딩할 때 readonly 모드로 잠가
 * 신입이 진짜 폼을 만져보되 망가뜨리지 못하게 한다 — Q2·Q13 결정.
 *
 * 사용법:
 *   const readOnly = useFormReadOnly(po);
 *   <Input disabled={readOnly} ... />
 *   {readOnly ? <SandboxBanner /> : null}
 *
 * 시드 데이터는 후속 PR(#2-B)에서 추가 — 마이그레이션 053으로 컬럼은 이미 준비.
 */
export interface SandboxFlag {
  is_sandbox?: boolean | null;
}

export const useFormReadOnly = (data?: SandboxFlag | null): boolean => {
  return data?.is_sandbox === true;
};
