// Minimal ambient declaration for `bun:test`. Avoids pulling in @types/bun,
// which augments globals like `fetch` with Bun-only methods (`preconnect`)
// and breaks app code that types fetch wrappers as `typeof fetch`.
// Surface area limited to what tests actually import.
declare module "bun:test" {
  type AnyFn = (...args: never[]) => unknown

  export interface Mock<T extends AnyFn = AnyFn> {
    (...args: Parameters<T>): ReturnType<T>
    mock: { calls: Parameters<T>[]; results: { value: ReturnType<T> }[] }
    mockImplementation(fn: T): Mock<T>
    mockReturnValue(value: ReturnType<T>): Mock<T>
    mockResolvedValue(value: Awaited<ReturnType<T>>): Mock<T>
    mockReset(): void
    mockClear(): void
  }

  export function mock<T extends AnyFn>(fn?: T): Mock<T>
  export namespace mock {
    function module(specifier: string, factory: () => unknown): void
    function restore(): void
  }

  type TestFn = (() => void | Promise<void>) | ((done: () => void) => void)

  interface TestApi {
    (name: string, fn: TestFn): void
    skip(name: string, fn?: TestFn): void
    only(name: string, fn: TestFn): void
    todo(name: string, fn?: TestFn): void
  }

  interface DescribeApi {
    (name: string, fn: () => void): void
    skip(name: string, fn?: () => void): void
    only(name: string, fn: () => void): void
    todo(name: string, fn?: () => void): void
  }

  export const describe: DescribeApi
  export const it: TestApi
  export const test: TestApi
  export function beforeAll(fn: TestFn): void
  export function beforeEach(fn: TestFn): void
  export function afterAll(fn: TestFn): void
  export function afterEach(fn: TestFn): void

  // Jest-compatible expect — keep loose, jest-dom matchers extend via @testing-library/jest-dom.
  // biome-ignore lint/suspicious/noExplicitAny: matcher API is open-ended
  export function expect(value: unknown): any
}
