// Re-export check-related types from the central types module.
// Individual checks import from here for convenience.

export type {
  Check,
  CheckResult,
  CandidateDump,
  Finding,
  SecretLocation,
  ProjectContext,
  LLMClient,
} from '../types/index.js';
