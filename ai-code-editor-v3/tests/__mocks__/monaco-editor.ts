// Stub monaco-editor for test environment
// Avoids CSS imports and DOM dependencies

const stubEditor = {
  create: () => ({
    getModel: () => ({
      getValue: () => '',
      getLineContent: () => '',
      getLineCount: () => 1,
      getLineMaxColumn: () => 1,
      getValueInRange: () => '',
      setValue: () => {},
    }),
    getPosition: () => ({ lineNumber: 1, column: 1 }),
    onDidChangeCursorPosition: () => ({ dispose: () => {} }),
    onDidChangeModelContent: () => ({ dispose: () => {} }),
    trigger: () => {},
    updateOptions: () => {},
  }),
  defineTheme: () => {},
  setModelLanguage: () => {},
};

const stubLanguages = {
  registerInlineCompletionsProvider: () => ({ dispose: () => {} }),
};

const stubRange = class {
  constructor() {}
};

export const editor = stubEditor;
export const languages = stubLanguages;
export const Range = stubRange;
export default { editor, languages, Range };
