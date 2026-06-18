// Stub zustand for test environment — avoids react dependency
// Provides a minimal create() that mimics zustand's vanilla API

export function create<T>(initializer: (set: any, get: any) => T): any {
  let state = initializer(
    (partial: any) => {
      if (typeof partial === 'function') {
        state = { ...state, ...partial(state) };
      } else {
        state = { ...state, ...partial };
      }
    },
    () => state
  );
  return Object.assign(() => {}, {
    getState: () => state,
    setState: (partial: any) => {
      if (typeof partial === 'function') state = { ...state, ...partial(state) };
      else state = { ...state, ...partial };
    },
    subscribe: () => () => {},
  });
}

export default { create };
