// ============================================================
// Code Snippets Tests
// ============================================================
import { describe, it, expect } from 'vitest';

// Test the snippet data structure and logic directly
interface Snippet {
  name: string;
  label: string;
  description: string;
  language: string;
  insertText: string;
}

describe('Code Snippets System', () => {
  const testSnippets: Snippet[] = [
    {
      name: 'clg', label: 'clg', description: 'Console log',
      language: 'javascript',
      insertText: 'console.log(${1:value});$0',
    },
    {
      name: 'rfc', label: 'rfc', description: 'React FC',
      language: 'typescript',
      insertText: 'import React from \'react\';\n\nconst ${1:Name}: React.FC = () => {\n\treturn <div>${2}</div>;\n};$0',
    },
    {
      name: 'flex', label: 'flex', description: 'Flexbox center',
      language: 'css',
      insertText: 'display: flex;\njustify-content: center;\nalign-items: center;$0',
    },
    {
      name: 'html5', label: 'html5', description: 'HTML5 boilerplate',
      language: 'html',
      insertText: '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n</head>\n<body>\n\t$1\n</body>\n</html>$0',
    },
    {
      name: 'todo', label: 'todo', description: 'TODO comment',
      language: 'plaintext',
      insertText: '// TODO: ${1:description}$0',
    },
  ];

  function groupSnippetsByLanguage(snippets: Snippet[]): Map<string, Snippet[]> {
    const grouped = new Map<string, Snippet[]>();
    for (const s of snippets) {
      if (!grouped.has(s.language)) grouped.set(s.language, []);
      grouped.get(s.language)!.push(s);
    }
    return grouped;
  }

  it('should group snippets by language', () => {
    const grouped = groupSnippetsByLanguage(testSnippets);
    expect(grouped.size).toBe(5);
    expect(grouped.get('javascript')?.length).toBe(1);
    expect(grouped.get('typescript')?.length).toBe(1);
    expect(grouped.get('css')?.length).toBe(1);
  });

  it('should have valid snippet names', () => {
    for (const s of testSnippets) {
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.name.length).toBeLessThanOrEqual(10);
    }
  });

  it('should have insert text with snippet placeholders', () => {
    for (const s of testSnippets) {
      expect(typeof s.insertText).toBe('string');
      // All snippets should have $0 terminator
      expect(s.insertText).toContain('$0');
    }
  });

  it('should cover multiple languages', () => {
    const languages = new Set(testSnippets.map((s) => s.language));
    expect(languages.has('javascript')).toBe(true);
    expect(languages.has('typescript')).toBe(true);
    expect(languages.has('css')).toBe(true);
    expect(languages.has('html')).toBe(true);
  });

  it('should have descriptions for all snippets', () => {
    for (const s of testSnippets) {
      expect(typeof s.description).toBe('string');
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it('should match label and name for trigger-based snippets', () => {
    for (const s of testSnippets) {
      // Short snippets use name as the trigger label
      if (s.name.length <= 5) {
        expect(s.label).toBe(s.name);
      }
    }
  });
});
