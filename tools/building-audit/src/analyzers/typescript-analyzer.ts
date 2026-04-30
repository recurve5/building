import { parse, type TSESTree, AST_NODE_TYPES } from '@typescript-eslint/typescript-estree';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  AnalyzedFile,
  ImportDeclaration,
  ExportDeclaration,
  FunctionInfo,
  ClassInfo,
  InterfaceInfo,
  TestFunctionInfo,
  AssertionInfo,
  ParameterInfo,
} from '../types/index.js';
import type { LanguageAnalyzer } from './types.js';

// --- Assertion pattern loading (Decision 21) ---

interface AssertionPatterns {
  strong: string[];
  weak: string[];
}

let cachedPatterns: AssertionPatterns | null = null;

function loadAssertionPatterns(): AssertionPatterns {
  if (cachedPatterns) return cachedPatterns;

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const raw = readFileSync(join(__dirname, 'assertion-patterns.json'), 'utf-8');
    cachedPatterns = JSON.parse(raw) as AssertionPatterns;
  } catch {
    // Built-in defaults if config file not found
    cachedPatterns = {
      strong: [
        'toBe', 'toEqual', 'toStrictEqual', 'toMatchObject', 'toMatchSnapshot',
        'toThrow', 'toHaveBeenCalledWith', 'toContain', 'toContainEqual',
        'toHaveProperty', 'toThrowError',
      ],
      weak: [
        'toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeInstanceOf',
        'toBeNull', 'toBeUndefined', 'toHaveLength',
        'toBeGreaterThan', 'toBeLessThan', 'toHaveBeenCalled',
        'toHaveBeenCalledTimes',
      ],
    };
  }

  return cachedPatterns;
}

function classifyAssertion(method: string): 'strong' | 'weak' {
  const patterns = loadAssertionPatterns();
  // Strip 'not.' prefix for classification
  const baseMethod = method.startsWith('not.') ? method.slice(4) : method;
  if (patterns.strong.includes(baseMethod)) return 'strong';
  if (patterns.weak.includes(baseMethod)) return 'weak';
  // Unknown assertion methods default to weak
  return 'weak';
}

// --- AST helpers ---

function getLineNumber(node: TSESTree.Node): number {
  return node.loc.start.line;
}

function getEndLine(node: TSESTree.Node): number {
  return node.loc.end.line;
}

function extractTypeAnnotation(annotation: TSESTree.TSTypeAnnotation | undefined): string | null {
  if (!annotation) return null;
  // Use the source range to get the type text
  // We'll reconstruct a simplified version from the AST node type
  return typeNodeToString(annotation.typeAnnotation);
}

function typeNodeToString(node: TSESTree.TypeNode): string {
  switch (node.type) {
    case AST_NODE_TYPES.TSStringKeyword:
      return 'string';
    case AST_NODE_TYPES.TSNumberKeyword:
      return 'number';
    case AST_NODE_TYPES.TSBooleanKeyword:
      return 'boolean';
    case AST_NODE_TYPES.TSVoidKeyword:
      return 'void';
    case AST_NODE_TYPES.TSAnyKeyword:
      return 'any';
    case AST_NODE_TYPES.TSNullKeyword:
      return 'null';
    case AST_NODE_TYPES.TSUndefinedKeyword:
      return 'undefined';
    case AST_NODE_TYPES.TSNeverKeyword:
      return 'never';
    case AST_NODE_TYPES.TSUnknownKeyword:
      return 'unknown';
    case AST_NODE_TYPES.TSObjectKeyword:
      return 'object';
    case AST_NODE_TYPES.TSSymbolKeyword:
      return 'symbol';
    case AST_NODE_TYPES.TSBigIntKeyword:
      return 'bigint';
    case AST_NODE_TYPES.TSTypeReference:
      {
        const ref = node as TSESTree.TSTypeReference;
        const name = ref.typeName.type === AST_NODE_TYPES.Identifier
          ? ref.typeName.name
          : 'unknown';
        if (ref.typeArguments && ref.typeArguments.params.length > 0) {
          const args = ref.typeArguments.params.map(typeNodeToString).join(', ');
          return `${name}<${args}>`;
        }
        return name;
      }
    case AST_NODE_TYPES.TSArrayType:
      return `${typeNodeToString((node as TSESTree.TSArrayType).elementType)}[]`;
    case AST_NODE_TYPES.TSUnionType:
      return (node as TSESTree.TSUnionType).types.map(typeNodeToString).join(' | ');
    case AST_NODE_TYPES.TSIntersectionType:
      return (node as TSESTree.TSIntersectionType).types.map(typeNodeToString).join(' & ');
    case AST_NODE_TYPES.TSLiteralType:
      {
        const lit = (node as TSESTree.TSLiteralType).literal;
        if ('value' in lit) return String(lit.value);
        return 'literal';
      }
    case AST_NODE_TYPES.TSFunctionType:
      return 'Function';
    case AST_NODE_TYPES.TSTupleType:
      return `[${(node as TSESTree.TSTupleType).elementTypes.map(typeNodeToString).join(', ')}]`;
    case AST_NODE_TYPES.TSTypeLiteral:
      return 'object';
    default:
      return 'unknown';
  }
}

function extractParams(params: TSESTree.Parameter[]): ParameterInfo[] {
  return params.map((p) => {
    let name = 'unknown';
    let type: string | null = null;

    if (p.type === AST_NODE_TYPES.Identifier) {
      name = p.name;
      type = extractTypeAnnotation(p.typeAnnotation);
    } else if (p.type === AST_NODE_TYPES.AssignmentPattern) {
      if (p.left.type === AST_NODE_TYPES.Identifier) {
        name = p.left.name;
        type = extractTypeAnnotation(p.left.typeAnnotation);
      }
    } else if (p.type === AST_NODE_TYPES.RestElement) {
      if (p.argument.type === AST_NODE_TYPES.Identifier) {
        name = `...${p.argument.name}`;
        type = extractTypeAnnotation(p.typeAnnotation);
      }
    } else if (p.type === AST_NODE_TYPES.ObjectPattern) {
      name = '{}';
      type = extractTypeAnnotation(p.typeAnnotation);
    } else if (p.type === AST_NODE_TYPES.ArrayPattern) {
      name = '[]';
      type = extractTypeAnnotation(p.typeAnnotation);
    }

    return { name, type };
  });
}

function extractFunctionInfo(
  name: string,
  node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
): FunctionInfo {
  return {
    name,
    params: extractParams(node.params),
    returnType: node.returnType ? extractTypeAnnotation(node.returnType) : null,
    startLine: getLineNumber(node),
    endLine: getEndLine(node),
    isAsync: node.async,
    isGenerator: 'generator' in node ? node.generator : false,
  };
}

// --- Test detection ---

const TEST_CALL_NAMES = new Set(['describe', 'it', 'test']);
const TEST_FUNCTION_NAMES = new Set(['it', 'test']);

function isTestCallExpression(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  // it(...), test(...), describe(...)
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return TEST_CALL_NAMES.has(callee.name);
  }
  // it.only(...), test.skip(...), describe.each(...)
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    if (callee.object.type === AST_NODE_TYPES.Identifier) {
      return TEST_CALL_NAMES.has(callee.object.name);
    }
  }
  return false;
}

function isTestFunction(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return TEST_FUNCTION_NAMES.has(callee.name);
  }
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    if (callee.object.type === AST_NODE_TYPES.Identifier) {
      return TEST_FUNCTION_NAMES.has(callee.object.name);
    }
  }
  return false;
}

function getTestName(node: TSESTree.CallExpression): string {
  const firstArg = node.arguments[0];
  if (firstArg && firstArg.type === AST_NODE_TYPES.Literal && typeof firstArg.value === 'string') {
    return firstArg.value;
  }
  if (firstArg && firstArg.type === AST_NODE_TYPES.TemplateLiteral) {
    return firstArg.quasis.map(q => q.value.cooked ?? q.value.raw).join('...');
  }
  return '<anonymous>';
}

/**
 * Extract assertion method name from an expect().method() chain.
 * Handles: expect(...).toBe(...), expect(...).not.toBe(...)
 */
function getAssertionMethod(node: TSESTree.CallExpression): string | null {
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) return null;

  // Check for expect(...).method()
  const object = callee.object;
  const property = callee.property;

  if (property.type !== AST_NODE_TYPES.Identifier) return null;
  const methodName = property.name;

  // expect(...).toBe(...)
  if (object.type === AST_NODE_TYPES.CallExpression) {
    const innerCallee = object.callee;
    if (innerCallee.type === AST_NODE_TYPES.Identifier && innerCallee.name === 'expect') {
      return methodName;
    }
    // expect(...).not.toBe(...) — object is expect(...).not which is a MemberExpression
    // This case is handled below
  }

  // expect(...).not.toBe(...) or expect(...).resolves.toBe(...)
  if (object.type === AST_NODE_TYPES.MemberExpression) {
    const outerProp = object.property;
    const innerObj = object.object;
    if (
      outerProp.type === AST_NODE_TYPES.Identifier &&
      innerObj.type === AST_NODE_TYPES.CallExpression &&
      innerObj.callee.type === AST_NODE_TYPES.Identifier &&
      innerObj.callee.name === 'expect'
    ) {
      if (outerProp.name === 'not') {
        return `not.${methodName}`;
      }
      // resolves/rejects are chained too
      return methodName;
    }
  }

  // Node assert style: assert.strictEqual(...)
  if (object.type === AST_NODE_TYPES.Identifier && object.name === 'assert') {
    return methodName;
  }

  return null;
}

function findAssertions(body: TSESTree.Node): AssertionInfo[] {
  const assertions: AssertionInfo[] = [];

  function walk(node: TSESTree.Node): void {
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const method = getAssertionMethod(node);
      if (method) {
        assertions.push({
          method,
          strength: classifyAssertion(method),
          line: getLineNumber(node),
        });
      }
    }

    // Walk children
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object' && 'type' in item) {
              walk(item as TSESTree.Node);
            }
          }
        } else if ('type' in value) {
          walk(value as TSESTree.Node);
        }
      }
    }
  }

  walk(body);
  return assertions;
}

// --- Main analyzer ---

function collectIdentifiers(ast: TSESTree.Program): string[] {
  const ids = new Set<string>();

  function walk(node: TSESTree.Node): void {
    if (node.type === AST_NODE_TYPES.Identifier) {
      ids.add(node.name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object' && 'type' in item) {
              walk(item as TSESTree.Node);
            }
          }
        } else if ('type' in value) {
          walk(value as TSESTree.Node);
        }
      }
    }
  }

  walk(ast);
  return Array.from(ids);
}

function extractImports(ast: TSESTree.Program): ImportDeclaration[] {
  const imports: ImportDeclaration[] = [];

  for (const stmt of ast.body) {
    if (stmt.type === AST_NODE_TYPES.ImportDeclaration) {
      imports.push({
        source: stmt.source.value as string,
        specifiers: stmt.specifiers.map((s) => {
          if (s.type === AST_NODE_TYPES.ImportDefaultSpecifier) return 'default';
          if (s.type === AST_NODE_TYPES.ImportNamespaceSpecifier) return `* as ${s.local.name}`;
          return s.local.name;
        }),
        line: getLineNumber(stmt),
      });
    }
  }

  return imports;
}

function extractExports(ast: TSESTree.Program): ExportDeclaration[] {
  const exports: ExportDeclaration[] = [];

  for (const stmt of ast.body) {
    if (stmt.type === AST_NODE_TYPES.ExportNamedDeclaration) {
      if (stmt.declaration) {
        const decl = stmt.declaration;
        if (decl.type === AST_NODE_TYPES.FunctionDeclaration && decl.id) {
          exports.push({ name: decl.id.name, kind: 'function', line: getLineNumber(stmt) });
        } else if (decl.type === AST_NODE_TYPES.ClassDeclaration && decl.id) {
          exports.push({ name: decl.id.name, kind: 'class', line: getLineNumber(stmt) });
        } else if (decl.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
          exports.push({ name: decl.id.name, kind: 'interface', line: getLineNumber(stmt) });
        } else if (decl.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
          exports.push({ name: decl.id.name, kind: 'type', line: getLineNumber(stmt) });
        } else if (decl.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const d of decl.declarations) {
            if (d.id.type === AST_NODE_TYPES.Identifier) {
              exports.push({ name: d.id.name, kind: 'variable', line: getLineNumber(stmt) });
            }
          }
        }
      }
      if (stmt.specifiers) {
        for (const spec of stmt.specifiers) {
          exports.push({
            name: spec.local.type === AST_NODE_TYPES.Identifier ? spec.local.name : String(spec.local.value),
            kind: 'variable', // can't determine kind from re-exports
            line: getLineNumber(stmt),
          });
        }
      }
    } else if (stmt.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
      let name = 'default';
      if (stmt.declaration.type === AST_NODE_TYPES.Identifier) {
        name = stmt.declaration.name;
      } else if (
        (stmt.declaration.type === AST_NODE_TYPES.FunctionDeclaration ||
         stmt.declaration.type === AST_NODE_TYPES.ClassDeclaration) &&
        stmt.declaration.id
      ) {
        name = stmt.declaration.id.name;
      }
      exports.push({ name, kind: 'default', line: getLineNumber(stmt) });
    }
  }

  return exports;
}

function extractFunctions(ast: TSESTree.Program): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  for (const stmt of ast.body) {
    if (stmt.type === AST_NODE_TYPES.FunctionDeclaration && stmt.id) {
      functions.push(extractFunctionInfo(stmt.id.name, stmt));
    } else if (stmt.type === AST_NODE_TYPES.ExportNamedDeclaration && stmt.declaration) {
      if (stmt.declaration.type === AST_NODE_TYPES.FunctionDeclaration && stmt.declaration.id) {
        functions.push(extractFunctionInfo(stmt.declaration.id.name, stmt.declaration));
      }
    } else if (stmt.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
      if (stmt.declaration.type === AST_NODE_TYPES.FunctionDeclaration) {
        functions.push(extractFunctionInfo(stmt.declaration.id?.name ?? 'default', stmt.declaration));
      }
    } else if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
      for (const decl of stmt.declarations) {
        if (
          decl.id.type === AST_NODE_TYPES.Identifier &&
          decl.init &&
          (decl.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
           decl.init.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          functions.push(extractFunctionInfo(decl.id.name, decl.init));
        }
      }
    }

    // Handle exported variable declarations with arrow/function expressions
    if (
      stmt.type === AST_NODE_TYPES.ExportNamedDeclaration &&
      stmt.declaration?.type === AST_NODE_TYPES.VariableDeclaration
    ) {
      for (const decl of stmt.declaration.declarations) {
        if (
          decl.id.type === AST_NODE_TYPES.Identifier &&
          decl.init &&
          (decl.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
           decl.init.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          functions.push(extractFunctionInfo(decl.id.name, decl.init));
        }
      }
    }
  }

  return functions;
}

function extractClasses(ast: TSESTree.Program): ClassInfo[] {
  const classes: ClassInfo[] = [];

  function processClass(node: TSESTree.ClassDeclaration | TSESTree.ClassExpression, name: string): void {
    const implementsNames: string[] = [];
    if (node.implements) {
      for (const impl of node.implements) {
        if (impl.expression.type === AST_NODE_TYPES.Identifier) {
          implementsNames.push(impl.expression.name);
        }
      }
    }

    const extendsName = node.superClass?.type === AST_NODE_TYPES.Identifier
      ? node.superClass.name
      : null;

    const methods: FunctionInfo[] = [];
    for (const member of node.body.body) {
      if (member.type === AST_NODE_TYPES.MethodDefinition && member.value) {
        let methodName = '<computed>';
        if (member.key.type === AST_NODE_TYPES.Identifier) {
          methodName = member.key.name;
        } else if (member.key.type === AST_NODE_TYPES.Literal) {
          methodName = String(member.key.value);
        }
        if (member.kind === 'constructor') {
          methodName = 'constructor';
        }
        if (member.value.type === AST_NODE_TYPES.FunctionExpression) {
          methods.push(extractFunctionInfo(methodName, member.value));
        }
      }
    }

    classes.push({
      name,
      implements: implementsNames,
      extends: extendsName,
      methods,
      startLine: getLineNumber(node),
      endLine: getEndLine(node),
    });
  }

  for (const stmt of ast.body) {
    if (stmt.type === AST_NODE_TYPES.ClassDeclaration && stmt.id) {
      processClass(stmt, stmt.id.name);
    } else if (stmt.type === AST_NODE_TYPES.ExportNamedDeclaration && stmt.declaration) {
      if (stmt.declaration.type === AST_NODE_TYPES.ClassDeclaration && stmt.declaration.id) {
        processClass(stmt.declaration, stmt.declaration.id.name);
      }
    } else if (stmt.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
      if (stmt.declaration.type === AST_NODE_TYPES.ClassDeclaration) {
        processClass(stmt.declaration, stmt.declaration.id?.name ?? 'default');
      }
    }
  }

  return classes;
}

function extractInterfaces(ast: TSESTree.Program): InterfaceInfo[] {
  const interfaces: InterfaceInfo[] = [];

  function processInterface(node: TSESTree.TSInterfaceDeclaration): void {
    const extendsNames: string[] = [];
    if (node.extends) {
      for (const ext of node.extends) {
        if (ext.expression.type === AST_NODE_TYPES.Identifier) {
          extendsNames.push(ext.expression.name);
        }
      }
    }

    const methods: { name: string; params: ParameterInfo[]; returnType: string | null }[] = [];
    for (const member of node.body.body) {
      if (member.type === AST_NODE_TYPES.TSMethodSignature) {
        let name = '<computed>';
        if (member.key.type === AST_NODE_TYPES.Identifier) {
          name = member.key.name;
        }
        methods.push({
          name,
          params: extractParams(member.params),
          returnType: member.returnType ? extractTypeAnnotation(member.returnType) : null,
        });
      }
    }

    interfaces.push({
      name: node.id.name,
      extends: extendsNames,
      methods,
      startLine: getLineNumber(node),
      endLine: getEndLine(node),
    });
  }

  for (const stmt of ast.body) {
    if (stmt.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
      processInterface(stmt);
    } else if (stmt.type === AST_NODE_TYPES.ExportNamedDeclaration && stmt.declaration) {
      if (stmt.declaration.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        processInterface(stmt.declaration);
      }
    }
  }

  return interfaces;
}

function extractTestFunctions(ast: TSESTree.Program): TestFunctionInfo[] {
  const testFunctions: TestFunctionInfo[] = [];

  function walk(node: TSESTree.Node): void {
    if (node.type === AST_NODE_TYPES.CallExpression && isTestFunction(node)) {
      const name = getTestName(node);
      // The callback is typically the second argument
      const callback = node.arguments[1];
      let assertions: AssertionInfo[] = [];
      if (callback) {
        assertions = findAssertions(callback);
      }
      testFunctions.push({
        name,
        startLine: getLineNumber(node),
        endLine: getEndLine(node),
        assertions,
      });
      // Don't recurse into nested test calls
      return;
    }

    // Walk children (for describe blocks containing it/test)
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object' && 'type' in item) {
              walk(item as TSESTree.Node);
            }
          }
        } else if ('type' in value) {
          walk(value as TSESTree.Node);
        }
      }
    }
  }

  walk(ast);
  return testFunctions;
}

// --- Public API ---

export class TypeScriptAnalyzer implements LanguageAnalyzer {
  language = 'typescript';
  extensions = ['.ts', '.tsx', '.js', '.jsx'];

  parseFile(filePath: string, content: string): AnalyzedFile {
    const emptyResult: AnalyzedFile = {
      filePath,
      language: this.language,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      interfaces: [],
      testFunctions: [],
      identifiers: [],
      lineCount: content.split('\n').length,
    };

    let ast: TSESTree.Program;
    try {
      ast = parse(content, {
        loc: true,
        range: true,
        jsx: filePath.endsWith('.tsx') || filePath.endsWith('.jsx'),
        // Allow JS files to contain TS syntax for mixed codebases
        ...(filePath.endsWith('.js') || filePath.endsWith('.jsx')
          ? {}
          : {}),
      });
    } catch {
      // Graceful handling of parse errors: return what we can (line count)
      return emptyResult;
    }

    try {
      return {
        filePath,
        language: this.language,
        imports: extractImports(ast),
        exports: extractExports(ast),
        functions: extractFunctions(ast),
        classes: extractClasses(ast),
        interfaces: extractInterfaces(ast),
        testFunctions: extractTestFunctions(ast),
        identifiers: collectIdentifiers(ast),
        lineCount: content.split('\n').length,
      };
    } catch {
      // If extraction fails partway, return what we have
      return emptyResult;
    }
  }
}
