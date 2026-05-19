// L2-005: Judgment prompt templates consume actual candidate shapes
// INT-006: Layer 2 candidate dump with judgment prompt produces well-formed output
//
// Decision 17: coupling between templates and candidate shapes is tested here.

import { describe, it, expect } from 'vitest';
import { JUDGMENT_PROMPTS } from '../../src/bridge/judgment-prompts.js';
import type { CandidateDump } from '../../src/types/index.js';

// ---------------------------------------------------------------------------
// Realistic candidate data matching each check's dumpCandidates output
// ---------------------------------------------------------------------------

const GHOST_REFACTOR_DUMP: CandidateDump = {
  check: 'ghost-refactor',
  count: 2,
  candidates: [
    {
      commit: { hash: 'abc1234', message: 'Rewrite auth module', insertions: 350, deletions: 280 },
      task: { taskNumber: 3, shortName: 'add-login-page', whatToBuild: 'Build the login page with email/password form' },
    },
    {
      commit: { hash: 'def5678', message: 'Refactor data layer', insertions: 500, deletions: 100 },
      task: { taskNumber: 5, shortName: 'add-dashboard', whatToBuild: null },
    },
  ],
};

const CLEAN_SLATE_BIAS_DUMP: CandidateDump = {
  check: 'clean-slate-bias',
  count: 1,
  candidates: [
    {
      name: 'formatDate',
      fileA: 'src/utils/date.ts',
      fileB: 'src/components/calendar/helpers.ts',
      signatureA: 'formatDate(date: Date): string',
      signatureB: 'formatDate(d: Date, locale: string): string',
    },
  ],
};

const DEEP_HERESY_DUMP: CandidateDump = {
  check: 'deep-heresy',
  count: 1,
  candidates: [
    {
      decisionNumber: 4,
      decisionText: 'Remove Redux store entirely',
      rationale: 'Redux adds unnecessary complexity for this app size. Use React context instead.',
      filePath: 'src/store/index.ts',
      content: 'import { createStore } from "redux";\nconst store = createStore(rootReducer);',
      matchedKeywordCount: 5,
    },
  ],
};

const DOCUMENT_HERESY_DUMP: CandidateDump = {
  check: 'document-heresy',
  count: 1,
  candidates: [
    {
      decisionNumber: 7,
      decisionText: 'Kill the WebSocket approach',
      rationale: 'Server-sent events are simpler and sufficient for our one-way data flow.',
      filePath: 'docs/architecture.md',
      content: '## Real-time Updates\n\nThe system uses WebSocket connections to push updates to clients in real-time.',
      matchedTermCount: 4,
    },
  ],
};

const PERFORMANCE_CRITICAL_DUMP: CandidateDump = {
  check: 'performance-critical',
  count: 1,
  candidates: [
    {
      entryPoint: 'handleRequest',
      filePath: 'src/api/handler.ts',
      chain: ['handleRequest', 'validateInput', 'queryDatabase', 'formatResponse'],
      ioOperations: ['queryDatabase', 'validateInput (async)'],
      depth: 4,
    },
  ],
};

const REACT_FLUIDITY_DUMP: CandidateDump = {
  check: 'react-fluidity',
  count: 2,
  candidates: [
    {
      file: 'src/components/List.tsx',
      line: 42,
      pattern: 'setState-in-loop',
      snippet: 'items.forEach(item => {\n  setCount(prev => prev + 1);\n});',
      componentContext: 'src/components/List.tsx',
    },
    {
      file: 'src/components/ScrollTracker.tsx',
      line: 15,
      pattern: 'unthrottled-event',
      snippet: "window.addEventListener('scroll', () => {\n  setPosition(window.scrollY);\n});",
      componentContext: 'src/components/ScrollTracker.tsx',
    },
  ],
};

const REFACTORING_SIGNALS_DUMP: CandidateDump = {
  check: 'refactoring-signals',
  count: 1,
  candidates: [
    {
      couplingHotspots: [
        { file: 'src/core/engine.ts', taskCount: 5 },
        { file: 'src/utils/helpers.ts', taskCount: 4 },
      ],
      averageFunctionLength: 28.5,
      totalFunctions: 47,
      structuralConcerns: [
        { taskNumber: 6, text: 'The coupling between notification and widget systems is growing. Implication: consider splitting the shared state.' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// L2-005: Templates consume actual candidate shapes without throwing
// ---------------------------------------------------------------------------

describe('L2-005: Judgment prompt templates consume actual candidate shapes', () => {
  it('has exactly 7 keys, one per Layer 2 check', () => {
    const keys = Object.keys(JUDGMENT_PROMPTS).sort();
    expect(keys).toEqual([
      'clean-slate-bias',
      'deep-heresy',
      'document-heresy',
      'ghost-refactor',
      'performance-critical',
      'react-fluidity',
      'refactoring-signals',
    ]);
  });

  it('ghost-refactor template produces non-empty string', () => {
    const result = JUDGMENT_PROMPTS['ghost-refactor'](GHOST_REFACTOR_DUMP);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('clean-slate-bias template produces non-empty string', () => {
    const result = JUDGMENT_PROMPTS['clean-slate-bias'](CLEAN_SLATE_BIAS_DUMP);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('deep-heresy template produces non-empty string', () => {
    const result = JUDGMENT_PROMPTS['deep-heresy'](DEEP_HERESY_DUMP);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('document-heresy template produces non-empty string', () => {
    const result = JUDGMENT_PROMPTS['document-heresy'](DOCUMENT_HERESY_DUMP);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('performance-critical template produces non-empty string', () => {
    const result = JUDGMENT_PROMPTS['performance-critical'](PERFORMANCE_CRITICAL_DUMP);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('react-fluidity template produces non-empty string', () => {
    const result = JUDGMENT_PROMPTS['react-fluidity'](REACT_FLUIDITY_DUMP);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('refactoring-signals template produces non-empty string', () => {
    const result = JUDGMENT_PROMPTS['refactoring-signals'](REFACTORING_SIGNALS_DUMP);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('ghost-refactor template includes candidate data', () => {
    const result = JUDGMENT_PROMPTS['ghost-refactor'](GHOST_REFACTOR_DUMP);
    expect(result).toContain('abc1234');
    expect(result).toContain('add-login-page');
    expect(result).toContain('+350');
  });

  it('clean-slate-bias template includes candidate data', () => {
    const result = JUDGMENT_PROMPTS['clean-slate-bias'](CLEAN_SLATE_BIAS_DUMP);
    expect(result).toContain('formatDate');
    expect(result).toContain('src/utils/date.ts');
    expect(result).toContain('src/components/calendar/helpers.ts');
  });

  it('deep-heresy template includes candidate data', () => {
    const result = JUDGMENT_PROMPTS['deep-heresy'](DEEP_HERESY_DUMP);
    expect(result).toContain('Decision 4');
    expect(result).toContain('Remove Redux store entirely');
    expect(result).toContain('src/store/index.ts');
  });

  it('document-heresy template includes candidate data', () => {
    const result = JUDGMENT_PROMPTS['document-heresy'](DOCUMENT_HERESY_DUMP);
    expect(result).toContain('Decision 7');
    expect(result).toContain('Kill the WebSocket approach');
    expect(result).toContain('docs/architecture.md');
  });

  it('performance-critical template includes candidate data', () => {
    const result = JUDGMENT_PROMPTS['performance-critical'](PERFORMANCE_CRITICAL_DUMP);
    expect(result).toContain('handleRequest');
    expect(result).toContain('queryDatabase');
    expect(result).toContain('src/api/handler.ts');
  });

  it('react-fluidity template includes candidate data', () => {
    const result = JUDGMENT_PROMPTS['react-fluidity'](REACT_FLUIDITY_DUMP);
    expect(result).toContain('setState-in-loop');
    expect(result).toContain('src/components/List.tsx');
    expect(result).toContain('unthrottled-event');
  });

  it('refactoring-signals template includes metrics data', () => {
    const result = JUDGMENT_PROMPTS['refactoring-signals'](REFACTORING_SIGNALS_DUMP);
    expect(result).toContain('src/core/engine.ts');
    expect(result).toContain('touched by 5 tasks');
    expect(result).toContain('28.5');
    expect(result).toContain('47');
  });
});

// ---------------------------------------------------------------------------
// INT-006: Judgment prompts include XRD judgment questions
// ---------------------------------------------------------------------------

describe('INT-006: Judgment prompts include XRD judgment questions', () => {
  it('ghost-refactor includes judgment question', () => {
    const result = JUDGMENT_PROMPTS['ghost-refactor'](GHOST_REFACTOR_DUMP);
    expect(result).toContain('Was this rewrite necessary to accomplish the task\'s stated goal');
  });

  it('clean-slate-bias includes judgment question', () => {
    const result = JUDGMENT_PROMPTS['clean-slate-bias'](CLEAN_SLATE_BIAS_DUMP);
    expect(result).toContain('Could one implementation be eliminated by extending the other');
  });

  it('deep-heresy includes judgment question', () => {
    const result = JUDGMENT_PROMPTS['deep-heresy'](DEEP_HERESY_DUMP);
    expect(result).toContain('Does this code reintroduce a killed decision');
  });

  it('document-heresy includes judgment question', () => {
    const result = JUDGMENT_PROMPTS['document-heresy'](DOCUMENT_HERESY_DUMP);
    expect(result).toContain('Does the code contradict the documented decision');
  });

  it('performance-critical includes judgment question', () => {
    const result = JUDGMENT_PROMPTS['performance-critical'](PERFORMANCE_CRITICAL_DUMP);
    expect(result).toContain('Is this a performance risk on the critical path');
  });

  it('react-fluidity includes judgment question', () => {
    const result = JUDGMENT_PROMPTS['react-fluidity'](REACT_FLUIDITY_DUMP);
    expect(result).toContain('Does this component have unnecessary re-renders');
  });

  it('refactoring-signals includes judgment question', () => {
    const result = JUDGMENT_PROMPTS['refactoring-signals'](REFACTORING_SIGNALS_DUMP);
    expect(result).toContain('Does this codebase need refactoring before the next milestone');
  });
});

// ---------------------------------------------------------------------------
// Edge case: count === 0 handled gracefully
// ---------------------------------------------------------------------------

describe('Zero-candidate edge cases', () => {
  const ZERO_CHECKS = [
    'ghost-refactor',
    'clean-slate-bias',
    'deep-heresy',
    'document-heresy',
    'performance-critical',
    'react-fluidity',
    'refactoring-signals',
  ] as const;

  for (const checkName of ZERO_CHECKS) {
    it(`${checkName} handles count=0 gracefully`, () => {
      const dump: CandidateDump = { check: checkName, count: 0, candidates: [] };
      const result = JUDGMENT_PROMPTS[checkName](dump);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  }

  it('react-fluidity handles not-a-react-project context', () => {
    const dump: CandidateDump = {
      check: 'react-fluidity',
      count: 0,
      candidates: [],
      context: { reason: 'not-a-react-project' },
    };
    const result = JUDGMENT_PROMPTS['react-fluidity'](dump);
    expect(result).toContain('Not a React project');
  });
});
