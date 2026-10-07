import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';

/** Run only the explicit owner's argv. Never consume commands from a task or plan. */
export async function captureCheck(repo: string, argv: string[], timeoutMs = 30_000) {
  if (!argv.length || argv.some(a => typeof a !== 'string' || a.includes('\0'))) throw new Error('Explicit command argv required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('Timeout must be 1–60000 ms');
  const root = await realpath(repo);
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }).trim();
  if (await realpath(git('rev-parse', '--show-toplevel')) !== root) throw new Error('Repo must be the Git repository root');
  const commit = git('rev-parse', 'HEAD');
  const statusBefore = git('status', '--porcelain=v1', '--untracked-files=all');
  const startedAt = new Date().toISOString();
  const run = spawnSync(argv[0]!, argv.slice(1), { cwd: root, shell: false, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
  const log = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const commitAfter = git('rev-parse', 'HEAD');
  const statusAfter = git('status', '--porcelain=v1', '--untracked-files=all');
  const receipt = {
    schemaVersion: 1, provenance: 'local execution capture; unsigned and author-controlled',
    argv, commit, commitAfter, startedAt, finishedAt: new Date().toISOString(),
    exitCode: run.status, signal: run.signal, runnerError: (run.error as NodeJS.ErrnoException | undefined)?.code ?? null,
    statusBefore, statusAfter, cleanStableCheckout: !statusBefore && !statusAfter && commit === commitAfter,
    logSha256: createHash('sha256').update(log).digest('hex'),
    logFormat: 'stdout followed by stderr; stream timing not preserved',
  };
  return { receipt, log };
}
