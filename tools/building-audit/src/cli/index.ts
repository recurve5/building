import { Command, InvalidArgumentError } from 'commander';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

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
    .action((options: CliOptions) => {
      if (!options.mechanical && !options.full) {
        process.stderr.write(program.helpInformation());
        process.stderr.write('\nerror: one of --mechanical or --full is required\n');
        process.exit(2);
      }

      if (options.mechanical && options.full) {
        process.stderr.write('error: --mechanical and --full are mutually exclusive\n');
        process.exit(2);
      }

      // Pipeline wiring happens in Task 027.
      // For now, print a placeholder message.
      console.log(`building-audit: mode=${options.mechanical ? 'mechanical' : 'full'}`);
    });

  return program;
}

export function run(argv: string[] = process.argv): void {
  const program = createProgram();
  program.parse(argv);
}
