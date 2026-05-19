// Side-effect-only module: importing this file registers all 16 checks
// (9 Layer 1 + 7 Layer 2) with the check registry.
// Replicates the import block from cli/index.ts so both CLI and bridge
// modules share the same registration path.

import '../checks/layer1/test-cheat.js';
import '../checks/layer1/scope-creep.js';
import '../checks/layer1/dependency-grab.js';
import '../checks/layer1/premature-abstraction.js';
import '../checks/layer1/surface-heresy.js';
import '../checks/layer1/confidence-bluff.js';
import '../checks/layer1/fragility-metrics.js';
import '../checks/layer1/resource-drain.js';
import '../checks/layer1/unoptimized-defaults.js';
import '../checks/layer2/ghost-refactor.js';
import '../checks/layer2/clean-slate-bias.js';
import '../checks/layer2/deep-heresy.js';
import '../checks/layer2/document-heresy.js';
import '../checks/layer2/performance-critical.js';
import '../checks/layer2/react-fluidity.js';
import '../checks/layer2/refactoring-signals.js';
