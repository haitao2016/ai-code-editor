// ============================================================
// Preview & Linter Feature Tests — linter rules, status bar
// ============================================================
import { describe, it, expect } from 'vitest';

// ─── Types ─────────────────────────────────────────────────
interface LinterProblem {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  ruleId: string;
}

// ─── Recreated linter logic from src/features/preview.ts ──────

function runLinterLogic(
  filePath: string,
  content: string,
  language: string
): LinterProblem[] {
  const problems: LinterProblem[] = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // max-len: Line too long
    if (line.length > 120) {
      problems.push({
        file: filePath,
        line: lineNum,
        column: 120,
        message: `Line too long (${line.length} > 120)`,
        severity: 'warning',
        ruleId: 'max-len',
      });
    }

    // JS/TS specific rules
    if (['javascript', 'typescript'].includes(language)) {
      const trimmed = line.trim();

      // semi: Missing semicolons
      if (
        trimmed &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('import') &&
        !trimmed.startsWith('export') &&
        !trimmed.endsWith('{') &&
        !trimmed.endsWith('}') &&
        !trimmed.endsWith(';') &&
        !trimmed.endsWith(':') &&
        !trimmed.endsWith(',') &&
        !trimmed.endsWith('(') &&
        !trimmed.startsWith('if') &&
        !trimmed.startsWith('else') &&
        !trimmed.startsWith('for') &&
        !trimmed.startsWith('while') &&
        !trimmed.startsWith('function')
      ) {
        problems.push({
          file: filePath,
          line: lineNum,
          column: trimmed.length,
          message: 'Missing semicolon',
          severity: 'warning',
          ruleId: 'semi',
        });
      }

      // no-console: console.log in production
      if (trimmed.includes('console.log')) {
        problems.push({
          file: filePath,
          line: lineNum,
          column: trimmed.indexOf('console.log') + 1,
          message: 'Unexpected console statement',
          severity: 'warning',
          ruleId: 'no-console',
        });
      }

      // no-var: var usage
      if (trimmed.match(/^var\s+/)) {
        problems.push({
          file: filePath,
          line: lineNum,
          column: 1,
          message: 'Use const or let instead of var',
          severity: 'warning',
          ruleId: 'no-var',
        });
      }
    }
  });

  return problems;
}

// ================================================================
describe('Preview/Linter — max-len rule', () => {
  it('should detect lines exceeding 120 chars', () => {
    const longLine = 'x'.repeat(121);
    const problems = runLinterLogic('test.ts', longLine, 'typescript');
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].ruleId).toBe('max-len');
    expect(problems[0].severity).toBe('warning');
  });

  it('should not flag lines at exactly 120 chars', () => {
    const line = 'x'.repeat(120);
    const problems = runLinterLogic('test.ts', line, 'typescript');
    const maxLenProblems = problems.filter((p) => p.ruleId === 'max-len');
    expect(maxLenProblems.length).toBe(0);
  });

  it('should not flag short lines', () => {
    const problems = runLinterLogic('test.ts', 'const x = 1;', 'typescript');
    const maxLenProblems = problems.filter((p) => p.ruleId === 'max-len');
    expect(maxLenProblems.length).toBe(0);
  });
});

describe('Preview/Linter — semi rule', () => {
  it('should flag lines missing semicolons', () => {
    const problems = runLinterLogic('test.ts', 'const x = 1', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(1);
  });

  it('should not flag lines ending with semicolon', () => {
    const problems = runLinterLogic('test.ts', 'const x = 1;', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag lines ending with curly brace', () => {
    const problems = runLinterLogic('test.ts', 'if (x) {', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag lines ending with closing curly brace', () => {
    const problems = runLinterLogic('test.ts', '}', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag comment lines', () => {
    const problems = runLinterLogic('test.ts', '// this is a comment', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag import statements', () => {
    const problems = runLinterLogic('test.ts', 'import React from "react"', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag export statements', () => {
    const problems = runLinterLogic('test.ts', 'export default App', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag if/else/for/while/function statements', () => {
    const lines = ['if (x)', 'else', 'for (let i = 0; i < 10; i++)', 'while (true)', 'function foo()'];
    const content = lines.join('\n');
    const problems = runLinterLogic('test.ts', content, 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag lines ending with colon', () => {
    const problems = runLinterLogic('test.ts', 'switch(x):', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag lines ending with comma', () => {
    const problems = runLinterLogic('test.ts', '  name: "test",', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag lines ending with open paren', () => {
    const problems = runLinterLogic('test.ts', 'function foo(', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });

  it('should not flag empty lines', () => {
    const problems = runLinterLogic('test.ts', '\n\n', 'typescript');
    const semiProblems = problems.filter((p) => p.ruleId === 'semi');
    expect(semiProblems.length).toBe(0);
  });
});

describe('Preview/Linter — no-console rule', () => {
  it('should flag console.log statements', () => {
    const problems = runLinterLogic('test.ts', 'console.log("debug")', 'typescript');
    const consoleProblems = problems.filter((p) => p.ruleId === 'no-console');
    expect(consoleProblems.length).toBe(1);
  });

  it('should not flag lines without console.log', () => {
    const problems = runLinterLogic('test.ts', 'const log = "not console"', 'typescript');
    const consoleProblems = problems.filter((p) => p.ruleId === 'no-console');
    expect(consoleProblems.length).toBe(0);
  });

  it('should flag console.log in comments (line still contains it)', () => {
    const problems = runLinterLogic('test.ts', '// console.log("debug")', 'typescript');
    const consoleProblems = problems.filter((p) => p.ruleId === 'no-console');
    // The rule checks the trimmed content, which includes the commented line
    // But the rule doesn't check for comments for no-console
    expect(consoleProblems.length).toBe(1);
  });
});

describe('Preview/Linter — no-var rule', () => {
  it('should flag var declarations', () => {
    const problems = runLinterLogic('test.ts', 'var x = 1;', 'typescript');
    const varProblems = problems.filter((p) => p.ruleId === 'no-var');
    expect(varProblems.length).toBe(1);
    expect(varProblems[0].message).toBe('Use const or let instead of var');
  });

  it('should not flag const declarations', () => {
    const problems = runLinterLogic('test.ts', 'const x = 1;', 'typescript');
    const varProblems = problems.filter((p) => p.ruleId === 'no-var');
    expect(varProblems.length).toBe(0);
  });

  it('should not flag let declarations', () => {
    const problems = runLinterLogic('test.ts', 'let x = 1;', 'typescript');
    const varProblems = problems.filter((p) => p.ruleId === 'no-var');
    expect(varProblems.length).toBe(0);
  });

  it('should only match var at start of line', () => {
    const problems = runLinterLogic('test.ts', '// variable', 'typescript');
    const varProblems = problems.filter((p) => p.ruleId === 'no-var');
    expect(varProblems.length).toBe(0);
  });
});

describe('Preview/Linter — language-specific behavior', () => {
  it('should only apply JS/TS rules to JavaScript', () => {
    const content = 'const x = 1\nconsole.log(x)\nvar y = 2';
    const problems = runLinterLogic('test.js', content, 'javascript');
    // Should have semi (x = 1 missing semicolon), no-console, no-var
    expect(problems.filter((p) => p.ruleId === 'no-console').length).toBe(1);
    expect(problems.filter((p) => p.ruleId === 'no-var').length).toBe(1);
  });

  it('should not apply JS/TS rules to non-JS files', () => {
    const content = 'const x = 1\nconsole.log(x)\nvar y = 2';
    const problems = runLinterLogic('test.md', content, 'markdown');
    const jsRules = ['semi', 'no-console', 'no-var'];
    const jsProblems = problems.filter((p) => jsRules.includes(p.ruleId));
    expect(jsProblems.length).toBe(0);
  });

  it('should apply max-len to all file types', () => {
    const longLine = 'x'.repeat(121);
    const problems = runLinterLogic('test.md', longLine, 'markdown');
    expect(problems.some((p) => p.ruleId === 'max-len')).toBe(true);
  });
});

describe('Preview/Linter — multiple rules per line', () => {
  it('should detect multiple issues on one line', () => {
    const longContent = 'console.log(' + 'x'.repeat(120) + ')';
    const problems = runLinterLogic('test.ts', longContent, 'typescript');
    const ruleIds = problems.map((p) => p.ruleId);
    // Should have both max-len and no-console
    expect(ruleIds).toContain('max-len');
    expect(ruleIds).toContain('no-console');
  });
});

describe('Preview/Linter — problem structure', () => {
  it('should create problems with correct structure', () => {
    const problems = runLinterLogic('src/app.ts', 'console.log(x)', 'typescript');
    const problem = problems.find((p) => p.ruleId === 'no-console')!;
    expect(problem.file).toBe('src/app.ts');
    expect(problem.line).toBe(1);
    expect(problem.column).toBeGreaterThan(0);
    expect(problem.severity).toBe('warning');
    expect(problem.ruleId).toBe('no-console');
  });

  it('should set correct line numbers for multi-line files', () => {
    const content = '// header\n\nvar x = 1;\nconsole.log(x);';
    const problems = runLinterLogic('test.ts', content, 'typescript');
    const varProblem = problems.find((p) => p.ruleId === 'no-var')!;
    const consoleProblem = problems.find((p) => p.ruleId === 'no-console')!;
    expect(varProblem.line).toBe(3);
    expect(consoleProblem.line).toBe(4);
  });
});
