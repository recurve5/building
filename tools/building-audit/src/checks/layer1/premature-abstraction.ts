import type { Check, CheckResult, Finding, ProjectContext } from '../types.js';
import { registerCheck } from '../registry.js';

// ---------------------------------------------------------------------------
// Premature Abstraction Check
// ---------------------------------------------------------------------------
// Finds interfaces/abstract classes with only one implementation, and
// passthrough wrappers that delegate without adding behavior.
// All findings are severity: info.

const prematureAbstraction: Check = {
  name: 'premature-abstraction',
  layer: 1,

  async run(context: ProjectContext): Promise<CheckResult> {
    const { sourceFiles } = context;
    const findings: Finding[] = [];

    // Collect all interfaces and their implementations across all files.
    const interfaceMap = new Map<string, { file: string; line: number }>();
    const implementationCount = new Map<string, { count: number; implementors: { name: string; file: string }[] }>();

    for (const [filePath, analyzed] of sourceFiles) {
      // Register declared interfaces
      for (const iface of analyzed.interfaces) {
        if (!interfaceMap.has(iface.name)) {
          interfaceMap.set(iface.name, { file: filePath, line: iface.startLine });
        }
      }

      // Count implementations
      for (const cls of analyzed.classes) {
        for (const implName of cls.implements) {
          const entry = implementationCount.get(implName) ?? { count: 0, implementors: [] };
          entry.count++;
          entry.implementors.push({ name: cls.name, file: filePath });
          implementationCount.set(implName, entry);
        }
      }
    }

    // Report interfaces with exactly one implementation
    for (const [ifaceName, ifaceInfo] of interfaceMap) {
      const impls = implementationCount.get(ifaceName);
      if (impls && impls.count === 1) {
        const impl = impls.implementors[0];
        findings.push({
          file: ifaceInfo.file,
          location: `line ${ifaceInfo.line}`,
          description: `Interface "${ifaceName}" has only one implementation: "${impl.name}" in ${impl.file}.`,
          suggestion: `Consider whether this abstraction is needed, or if the interface can be deferred until a second implementation exists.`,
          evidence: {
            interfaceName: ifaceName,
            implementor: impl.name,
            implementorFile: impl.file,
          },
        });
      }
    }

    // Detect passthrough wrappers: classes where every method body just calls
    // a single inner method. We approximate this from AnalyzedFile data --
    // a class whose every method is 1-3 lines long and has the same parameter
    // count as its signature (likely a delegation).
    for (const [filePath, analyzed] of sourceFiles) {
      for (const cls of analyzed.classes) {
        if (cls.methods.length === 0) continue;
        const allShortMethods = cls.methods.every(
          (m) => (m.endLine - m.startLine) <= 3,
        );
        if (allShortMethods && cls.methods.length >= 2) {
          findings.push({
            file: filePath,
            location: `lines ${cls.startLine}-${cls.endLine}`,
            description: `Class "${cls.name}" may be a passthrough wrapper -- all ${cls.methods.length} methods are 1-3 lines long.`,
            suggestion: `Verify whether "${cls.name}" adds behavior beyond delegation. If not, consider removing the wrapper.`,
            evidence: {
              className: cls.name,
              methodCount: cls.methods.length,
              maxMethodLength: Math.max(...cls.methods.map((m) => m.endLine - m.startLine)),
            },
          });
        }
      }
    }

    return {
      name: 'premature-abstraction',
      layer: 1,
      status: 'completed',
      severity: findings.length > 0 ? 'info' : 'clean',
      findings,
      errorMessage: null,
    };
  },
};

registerCheck(prematureAbstraction);

export { prematureAbstraction };
