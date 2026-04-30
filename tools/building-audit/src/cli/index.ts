import { Command } from 'commander';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanProject } from '../scanner/project-scanner.js';
import { runChecks } from '../checks/registry.js';
import { buildReport } from '../report/json-builder.js';
import { formatTerminalOutput } from '../report/terminal-formatter.js';
import { AnthropicLLMClient } from '../llm/client.js';
import type { LLMClient } from '../types/index.js';

// Import all checks to trigger registration
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

// Walk up from this file to find the nearest package.json. Works whether
// the CLI is run from compiled `dist/` or directly from `src/` via vitest.
function findPackageJson(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const candidate = join(dir, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error('package.json not found above CLI module');
}
const pkg = JSON.parse(fs.readFileSync(findPackageJson(), 'utf8')) as { version: string };

export interface CliOptions {
  mechanical?: boolean;
  full?: boolean;
  milestone?: string;
  output?: string;
  verbose?: boolean;
  conventionStart?: string;
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('building-audit')
    .description('Audit tool for multi-agent orchestration build projects')
    .version(`building-audit v${pkg.version}`, '--version', 'Print version')
    .option('--mechanical', 'Run Layer 1 (mechanical) checks only')
    .option('--full', 'Run all checks (Layer 1 + Layer 2)')
    .option('--milestone <name>', 'Scope audit to a specific milestone')
    .option('--output <path>', 'Write JSON report to file')
    .option('--verbose', 'Enable verbose logging')
    .option('--convention-start <hash>', 'Git commit hash where [TASK_ID] convention was adopted')
    .action(async (options: CliOptions) => {
      if (!options.mechanical && !options.full) {
        process.stderr.write(program.helpInformation());
        process.stderr.write('\nerror: one of --mechanical or --full is required\n');
        process.exit(2);
        return;
      }

      if (options.mechanical && options.full) {
        process.stderr.write('error: --mechanical and --full are mutually exclusive\n');
        process.exit(2);
        return;
      }

      const mode: 'mechanical' | 'full' = options.mechanical ? 'mechanical' : 'full';
      const projectPath = process.cwd();
      let exitCode = 0;

      try {
        // Step 1: Scan project
        const context = await scanProject(projectPath, options.milestone, options.conventionStart);

        // Step 2: Create LLM client if full mode
        let llmClient: LLMClient | undefined;
        if (mode === 'full') {
          try {
            llmClient = new AnthropicLLMClient();
          } catch {
            process.stderr.write('Warning: ANTHROPIC_API_KEY not set. Layer 2 checks will be skipped.\n');
          }
        }

        // Step 3: Run checks
        const { results, secretLocations } = await runChecks(context, mode, llmClient);

        // Step 4: Update LLM client with secret locations
        if (llmClient && 'setSecretLocations' in llmClient) {
          (llmClient as AnthropicLLMClient).setSecretLocations(secretLocations);
        }

        // Step 5: Build report
        const report = buildReport(
          results,
          context.parseErrors,
          mode,
          projectPath,
          options.milestone ?? null,
          secretLocations,
        );

        // Step 6: Write JSON report
        const outputPath = options.output ?? 'building-audit-report.json';
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

        // Step 7: Print terminal output
        console.log(formatTerminalOutput(report, options.verbose ?? false));

        // Step 8: Exit code based on critical findings
        exitCode = report.summary.critical > 0 ? 1 : 0;
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        exitCode = 2;
      }

      process.exit(exitCode);
    });

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
