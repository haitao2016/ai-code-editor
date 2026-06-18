// Stub zustand/middleware for test environment
export function persist(fn: any, options?: any): any {
  return fn;
}
export { persist as devtools, persist as subscribeWithSelector };
