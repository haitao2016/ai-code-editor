// Test setup — mock browser APIs for Node environment

// Mock localStorage
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};

// Mock document.documentElement for theme tests
(globalThis as any).document = {
  documentElement: {
    style: {
      _props: {} as Record<string, string>,
      setProperty: (key: string, value: string) => {
        (document as any).documentElement.style._props[key] = value;
      },
      getPropertyValue: (key: string) => {
        return (document as any).documentElement.style._props[key] || '';
      },
    },
  },
};

// Mock HTMLElement
(globalThis as any).HTMLElement = class {
  style: Record<string, string> = {};
  textContent: string = '';
  innerHTML: string = '';
};
