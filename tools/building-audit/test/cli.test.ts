import { describe, it, expect } from 'vitest';
import { createProgram } from '../src/cli/index.js';

function runCli(args: string[]): { exitCode: number | null; stdout: string; stderr: string } {
  let exitCode: number | null = null;
  let stdout = '';
  let stderr = '';

  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalConsoleLog = console.log;

  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`EXIT_${code}`);
  }) as never;

  process.stdout.write = ((chunk: string) => {
    stdout += chunk;
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string) => {
    stderr += chunk;
    return true;
  }) as typeof process.stderr.write;

  console.log = (...logArgs: unknown[]) => {
    stdout += logArgs.join(' ') + '\n';
  };

  try {
    const program = createProgram();
    program.exitOverride();
    program.configureOutput({
      writeOut: (str: string) => { stdout += str; },
      writeErr: (str: string) => { stderr += str; },
    });
    program.parse(['node', 'building-audit', ...args]);
  } catch (e: unknown) {
    const err = e as Error & { exitCode?: number };
    if (err.message?.startsWith('EXIT_')) {
      // Already captured
    } else if (err.exitCode !== undefined) {
      exitCode = err.exitCode;
    }
  } finally {
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    console.log = originalConsoleLog;
  }

  return { exitCode, stdout, stderr };
}

describe('CLI', () => {
  // CLI-003: Neither --mechanical nor --full
  it('prints usage and exits 2 when no mode flag provided', () => {
    const result = runCli([]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--mechanical');
    expect(result.stderr).toContain('--full');
  });

  // CLI-004: Both --mechanical and --full
  it('exits 2 when both --mechanical and --full provided', () => {
    const result = runCli(['--mechanical', '--full']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('mutually exclusive');
  });

  // CLI-009: --version prints version and exits
  it('prints version and exits with code 0', () => {
    const result = runCli(['--version']);
    expect(result.stdout).toContain('building-audit v1.0.0');
    expect(result.exitCode).toBe(0);
  });

  // CLI-010: --help prints usage and exits
  it('prints help and exits with code 0', () => {
    const result = runCli(['--help']);
    expect(result.stdout).toContain('--mechanical');
    expect(result.stdout).toContain('--full');
    expect(result.stdout).toContain('--milestone');
    expect(result.stdout).toContain('--output');
    expect(result.stdout).toContain('--verbose');
    expect(result.stdout).toContain('--convention-start');
    expect(result.exitCode).toBe(0);
  });
});
