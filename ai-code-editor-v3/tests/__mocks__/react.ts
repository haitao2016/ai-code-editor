// Stub react for zustand's optional react binding (not needed in our tests)
export function create() { return () => ({}); }
export function createStore() { return {}; }
export function useStore() { return {}; }
export function createContext() { return {}; }
export const useState = () => [null, () => {}];
export const useEffect = () => {};
export const useRef = () => ({ current: null });
export const useCallback = (fn: any) => fn;
export const useMemo = (fn: any) => fn();
export default { create };
