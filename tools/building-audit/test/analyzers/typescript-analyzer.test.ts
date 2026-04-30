import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TypeScriptAnalyzer } from '../../src/analyzers/typescript-analyzer.js';

const analyzer = new TypeScriptAnalyzer();

function readFixture(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', 'typescript', name), 'utf-8');
}

function parseFixture(name: string): ReturnType<TypeScriptAnalyzer['parseFile']> {
  const content = readFixture(name);
  return analyzer.parseFile(`test/fixtures/typescript/${name}`, content);
}

// --- Basic module analysis ---

describe('TypeScriptAnalyzer', () => {
  describe('module extraction', () => {
    it('extracts imports correctly', () => {
      const result = parseFixture('sample-module.ts');

      expect(result.imports.length).toBe(3);
      expect(result.imports[0]).toEqual({
        source: 'fs',
        specifiers: ['readFileSync'],
        line: 1,
      });
      expect(result.imports[1]).toEqual({
        source: 'path',
        specifiers: ['join', 'resolve'],
        line: 2,
      });
      expect(result.imports[2]).toEqual({
        source: './types',
        specifiers: ['Config'],
        line: 3,
      });
    });

    it('extracts exports correctly', () => {
      const result = parseFixture('sample-module.ts');

      const exportNames = result.exports.map((e) => e.name);
      expect(exportNames).toContain('Serializable');
      expect(exportNames).toContain('Cacheable');
      expect(exportNames).toContain('DataService');
      expect(exportNames).toContain('EnhancedService');
      expect(exportNames).toContain('processItems');
      expect(exportNames).toContain('generateSequence');
      expect(exportNames).toContain('main');
      expect(exportNames).toContain('Result');
      expect(exportNames).toContain('helperFn');

      const classExport = result.exports.find((e) => e.name === 'DataService');
      expect(classExport?.kind).toBe('class');

      const fnExport = result.exports.find((e) => e.name === 'processItems');
      expect(fnExport?.kind).toBe('function');

      const ifaceExport = result.exports.find((e) => e.name === 'Serializable');
      expect(ifaceExport?.kind).toBe('interface');

      const typeExport = result.exports.find((e) => e.name === 'Result');
      expect(typeExport?.kind).toBe('type');

      const defaultExport = result.exports.find((e) => e.name === 'main');
      expect(defaultExport?.kind).toBe('default');
    });

    it('extracts functions with params and return types', () => {
      const result = parseFixture('sample-module.ts');

      const processItems = result.functions.find((f) => f.name === 'processItems');
      expect(processItems).toBeDefined();
      expect(processItems!.params).toHaveLength(2);
      expect(processItems!.params[0]).toEqual({ name: 'items', type: 'string[]' });
      expect(processItems!.params[1].name).toBe('filter');
      expect(processItems!.returnType).toBe('string[]');
      expect(processItems!.isAsync).toBe(false);

      const genSeq = result.functions.find((f) => f.name === 'generateSequence');
      expect(genSeq).toBeDefined();
      expect(genSeq!.isAsync).toBe(true);
      expect(genSeq!.isGenerator).toBe(true);
      expect(genSeq!.params).toEqual([
        { name: 'start', type: 'number' },
        { name: 'end', type: 'number' },
      ]);

      const helperFn = result.functions.find((f) => f.name === 'helperFn');
      expect(helperFn).toBeDefined();
      expect(helperFn!.params).toEqual([{ name: 'x', type: 'number' }]);
      expect(helperFn!.returnType).toBe('number');
    });

    it('extracts line count', () => {
      const result = parseFixture('sample-module.ts');
      expect(result.lineCount).toBeGreaterThan(0);
    });

    it('returns empty testFunctions for non-test files', () => {
      const result = parseFixture('sample-module.ts');
      expect(result.testFunctions).toEqual([]);
    });
  });

  // --- Class extraction ---

  describe('class extraction', () => {
    it('extracts class implements and extends', () => {
      const result = parseFixture('sample-module.ts');

      const dataService = result.classes.find((c) => c.name === 'DataService');
      expect(dataService).toBeDefined();
      expect(dataService!.implements).toEqual(['Serializable', 'Cacheable']);
      expect(dataService!.extends).toBeNull();
      expect(dataService!.methods.length).toBeGreaterThan(0);

      const enhanced = result.classes.find((c) => c.name === 'EnhancedService');
      expect(enhanced).toBeDefined();
      expect(enhanced!.extends).toBe('DataService');
    });

    it('extracts class methods with correct info', () => {
      const result = parseFixture('sample-module.ts');

      const dataService = result.classes.find((c) => c.name === 'DataService')!;
      const fetchData = dataService.methods.find((m) => m.name === 'fetchData');
      expect(fetchData).toBeDefined();
      expect(fetchData!.isAsync).toBe(true);
      expect(fetchData!.params[0]).toEqual({ name: 'url', type: 'string' });
    });
  });

  // --- Interface extraction ---

  describe('interface extraction', () => {
    // PA-001: Interface with single implementation
    it('PA-001: extracts interface with single implementation', () => {
      const result = parseFixture('interface-single-impl.ts');

      expect(result.interfaces).toHaveLength(1);
      const logger = result.interfaces[0];
      expect(logger.name).toBe('Logger');
      expect(logger.extends).toEqual([]);
      expect(logger.methods).toHaveLength(2);
      expect(logger.methods[0].name).toBe('log');
      expect(logger.methods[0].params).toEqual([{ name: 'message', type: 'string' }]);
      expect(logger.methods[0].returnType).toBe('void');
      expect(logger.methods[1].name).toBe('error');

      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('ConsoleLogger');
      expect(result.classes[0].implements).toEqual(['Logger']);
    });

    // PA-002: Interface with multiple implementations
    it('PA-002: extracts interface with multiple implementations', () => {
      const result = parseFixture('interface-multi-impl.ts');

      expect(result.interfaces).toHaveLength(1);
      const storage = result.interfaces[0];
      expect(storage.name).toBe('Storage');
      expect(storage.methods).toHaveLength(3);
      expect(storage.methods.map((m) => m.name)).toEqual(['get', 'set', 'delete']);

      expect(result.classes).toHaveLength(3);
      const classNames = result.classes.map((c) => c.name);
      expect(classNames).toContain('MemoryStorage');
      expect(classNames).toContain('FileStorage');
      expect(classNames).toContain('RedisStorage');

      for (const cls of result.classes) {
        expect(cls.implements).toEqual(['Storage']);
      }
    });

    it('extracts interface extends', () => {
      const result = parseFixture('sample-module.ts');

      const cacheable = result.interfaces.find((i) => i.name === 'Cacheable');
      expect(cacheable).toBeDefined();
      expect(cacheable!.extends).toEqual(['Serializable']);
    });
  });

  // --- Test function detection ---

  describe('test function detection', () => {
    // TC-001: All-weak assertions
    it('TC-001: detects all-weak assertions', () => {
      const result = parseFixture('test-weak-assertions.ts');

      expect(result.testFunctions.length).toBe(2);

      const firstTest = result.testFunctions[0];
      expect(firstTest.name).toBe('should calculate streak correctly');
      expect(firstTest.assertions.length).toBe(3);
      for (const assertion of firstTest.assertions) {
        expect(assertion.strength).toBe('weak');
      }
      expect(firstTest.assertions.map((a) => a.method)).toEqual([
        'toBeDefined',
        'toBeTruthy',
        'toBeInstanceOf',
      ]);

      const secondTest = result.testFunctions[1];
      expect(secondTest.name).toBe('should handle empty input');
      expect(secondTest.assertions.length).toBe(2);
      expect(secondTest.assertions[0].strength).toBe('weak');
      expect(secondTest.assertions[1].method).toBe('not.toBeNull');
      expect(secondTest.assertions[1].strength).toBe('weak');
    });

    // TC-003: Mixed strong and weak assertions
    it('TC-003: detects mixed strong and weak assertions', () => {
      const result = parseFixture('test-mixed-assertions.ts');

      expect(result.testFunctions.length).toBe(2);

      const firstTest = result.testFunctions[0];
      expect(firstTest.assertions.length).toBe(3);

      const strengths = firstTest.assertions.map((a) => a.strength);
      expect(strengths).toContain('strong');
      expect(strengths).toContain('weak');

      // toBeDefined is weak, toBe and toEqual are strong
      expect(firstTest.assertions[0]).toMatchObject({ method: 'toBeDefined', strength: 'weak' });
      expect(firstTest.assertions[1]).toMatchObject({ method: 'toBe', strength: 'strong' });
      expect(firstTest.assertions[2]).toMatchObject({ method: 'toEqual', strength: 'strong' });
    });

    // TC-004: No assertions in test body
    it('TC-004: detects tests with no assertions', () => {
      const result = parseFixture('test-no-assertions.ts');

      expect(result.testFunctions.length).toBe(2);

      for (const testFn of result.testFunctions) {
        expect(testFn.assertions).toEqual([]);
      }
    });

    // TC-005: Strong assertions only
    it('TC-005: detects all-strong assertions', () => {
      const result = parseFixture('test-strong-assertions.ts');

      expect(result.testFunctions.length).toBe(3);

      for (const testFn of result.testFunctions) {
        expect(testFn.assertions.length).toBeGreaterThan(0);
        for (const assertion of testFn.assertions) {
          expect(assertion.strength).toBe('strong');
        }
      }

      // Check specific methods
      const firstTest = result.testFunctions[0];
      expect(firstTest.assertions.map((a) => a.method)).toEqual([
        'toBe', 'toBe', 'toStrictEqual',
      ]);

      // test() call should also be detected
      const thirdTest = result.testFunctions[2];
      expect(thirdTest.name).toBe('should handle edge cases');
      expect(thirdTest.assertions[0].method).toBe('toThrow');
    });
  });

  // --- File extension handling ---

  describe('file extension handling', () => {
    it('handles .ts files', () => {
      const result = parseFixture('sample-module.ts');
      expect(result.language).toBe('typescript');
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it('handles .js files', () => {
      const result = parseFixture('sample-js.js');
      expect(result.language).toBe('typescript');
      expect(result.functions.length).toBeGreaterThan(0);
      expect(result.classes.length).toBe(1);

      const appCtrl = result.classes[0];
      expect(appCtrl.name).toBe('AppController');
    });

    it('reports correct extensions', () => {
      expect(analyzer.extensions).toEqual(['.ts', '.tsx', '.js', '.jsx']);
    });
  });

  // --- Error handling ---

  describe('error handling', () => {
    it('handles malformed files gracefully without throwing', () => {
      const content = readFixture('malformed.ts');
      const result = analyzer.parseFile('test/malformed.ts', content);

      // Should not throw, should return an AnalyzedFile
      expect(result).toBeDefined();
      expect(result.filePath).toBe('test/malformed.ts');
      expect(result.lineCount).toBeGreaterThan(0);
      // With parse errors, we get an empty result
      expect(result.functions).toEqual([]);
    });

    it('handles empty files', () => {
      const result = analyzer.parseFile('test/empty.ts', '');
      expect(result).toBeDefined();
      expect(result.lineCount).toBe(1);
      expect(result.imports).toEqual([]);
      expect(result.exports).toEqual([]);
      expect(result.functions).toEqual([]);
      expect(result.testFunctions).toEqual([]);
    });
  });

  // --- Identifiers ---

  describe('identifier collection', () => {
    it('collects all identifiers from a file', () => {
      const result = parseFixture('sample-module.ts');

      expect(result.identifiers.length).toBeGreaterThan(0);
      expect(result.identifiers).toContain('readFileSync');
      expect(result.identifiers).toContain('DataService');
      expect(result.identifiers).toContain('processItems');
      expect(result.identifiers).toContain('Serializable');
      expect(result.identifiers).toContain('Config');
    });
  });
});
