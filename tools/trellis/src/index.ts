export type {
  TrellisState,
  StageRecord,
  TaskRecord,
  EventType,
  TrellisEvent,
  GateResult,
  GateCheck,
  ConfidenceAssessment,
} from "./types.js";

export {
  readState,
  writeState,
  validateTransition,
  createInitialState,
  snapshotState,
} from "./state.js";

export { generateRunId, createRunDirectory } from "./run.js";

export {
  appendEvent,
  readEvents,
  readEventsByType,
  readEventsForTask,
  nextEventNumber,
} from "./events.js";

export { writeOverride, addOverrideToState } from "./override.js";

export {
  generateMorningAfter,
  classifyResult,
  calculateDuration,
} from "./morning-after.js";

export { assessConfidence, writeConfidenceFiles } from "./confidence.js";

export type { CommitResult } from "./git.js";
export { commitProjectCode } from "./git.js";

export type { BootstrapResult } from "./bootstrap.js";
export { bootstrap } from "./bootstrap.js";

export type { BuildingPaths } from "./paths.js";
export {
  deriveProjectName,
  resolvePaths,
  resolveRunDir,
  resolveMilestoneDir,
} from "./paths.js";
