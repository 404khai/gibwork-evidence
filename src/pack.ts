import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TaskSnapshot } from './task.js';

export interface CheckEvidence {
  name: string;
  command: string;
  exitCode: number;
  commit: string;
  log: string;
}
export interface Requirement {
  id: string;
  description: string;
  artifacts: string[];
  checks: string[];
}
export interface EvidencePlan {
  artifacts: string[];
  checks: CheckEvidence[];
  requirements: Requirement[];
}
export const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const json = (data: unknown): string => `${JSON.stringify(data, null, 2)}\n`;
const forbidden = /^(\.git|\.env(?:\..*)?|\.private|node_modules|.*keypair.*|.*\.pem|.*\.key|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
const secretContent = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\b(?:SOLANA_PRIVATE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY)\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{16,})/i;

export function validatePlan(value: unknown): EvidencePlan {
  if (!value || typeof value !== 'object') throw new Error('Evidence plan must be an object');
  const p = value as EvidencePlan;
  if (!Array.isArray(p.artifacts) || p.artifacts.length === 0 || !p.artifacts.every(a => typeof a === 'string')
      || new Set(p.artifacts).size !== p.artifacts.length || !Array.isArray(p.checks) || p.checks.length === 0
      || !Array.isArray(p.requirements) || p.requirements.length === 0) throw new Error('Plan needs unique artifacts, checks and requirements');
  for (const c of p.checks) {
    if (!c || typeof c.name !== 'string' || !c.name || typeof c.command !== 'string'
        || typeof c.log !== 'string' || typeof c.commit !== 'string' || !Number.isInteger(c.exitCode)
        || c.exitCode < 0 || c.exitCode > 255) throw new Error('Invalid check evidence');
  }
  if (new Set(p.checks.map(c => c.name)).size !== p.checks.length) throw new Error('Check names must be unique');
  for (const r of p.requirements) {
    if (!r || typeof r.id !== 'string' || !r.id || typeof r.description !== 'string' || !r.description
        || !Array.isArray(r.artifacts) || !r.artifacts.every(a => typeof a === 'string')
        || !Array.isArray(r.checks) || !r.checks.every(c => typeof c === 'string')
        || r.artifacts.length + r.checks.length === 0) throw new Error('Each requirement needs evidence references');
  }
  if (new Set(p.requirements.map(r => r.id)).size !== p.requirements.length) throw new Error('Requirement IDs must be unique');
  return p;
}

async function allowedFile(root: string, relative: string): Promise<Buffer> {
  if (!relative || path.isAbsolute(relative) || relative.includes('\\')
      || relative.split('/').some(p => p === '..' || p === '.' || !p || forbidden.test(p))) {
    throw new Error(`Unsafe evidence path: ${relative}`);
  }
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink evidence is not allowed: ${relative}`);
  }
  const stat = await lstat(current);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error(`Evidence must be a regular file <=10 MiB: ${relative}`);
  const data = await readFile(current);
  if (secretContent.test(data.toString('utf8'))) throw new Error(`Potential secret in evidence: ${relative}`);
  return data;
}
function git(root: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }).trim();
}
function escapeMarkdown(s: string): string {
  return s.replace(/[\\`*_{}[\]()<>#|]/g, '\\$&').replace(/[\r\n]/g, ' ');
}

export async function packEvidence(options: {
  repo: string; out: string; task: TaskSnapshot; plan: EvidencePlan; now?: Date;
}): Promise<{ manifest: Record<string, unknown>; report: string; blockers: string[] }> {
  const plan = validatePlan(options.plan);
  const root = await realpath(options.repo);
  if (await realpath(git(root, ['rev-parse', '--show-toplevel'])) !== root) throw new Error('Repo must be the Git repository root');
  const commit = git(root, ['rev-parse', 'HEAD']);
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  const blockers: string[] = [];
  if (status) blockers.push('Repository has uncommitted changes; included bytes are not a clean commit snapshot');
  const task = options.task.details;
  if (!task.isOpen) blockers.push('Task is closed');
  if (task.deadline && Date.parse(task.deadline) <= (options.now ?? new Date()).getTime()) blockers.push('Task deadline has passed');
  if (options.task.source === 'sdk-fixture') blockers.push('Task source is an offline SDK fixture, not a live eligibility check');
  if (options.task.source === 'sdk-stage') blockers.push('Task source is stage, not a production eligibility check');

  const files = new Map<string, Buffer>();
  for (const name of [...new Set([...plan.artifacts, ...plan.checks.map(c => c.log)])].sort()) {
    files.set(name, await allowedFile(root, name));
  }
  const artifacts = [...files].map(([name, data]) => ({ path: name, bytes: data.length, sha256: sha256(data) }));
  const checks = plan.checks.map(c => ({ ...c, provenance: 'caller-supplied; packager did not run this command' }));
  for (const c of checks) {
    if (c.exitCode !== 0) blockers.push(`Check failed: ${c.name} (exit ${c.exitCode})`);
    if (c.commit !== commit) blockers.push(`Check is not bound to current commit: ${c.name}`);
  }
  const requirements = plan.requirements.map(r => {
    const missing = r.artifacts.filter(a => !plan.artifacts.includes(a)).map(a => `artifact: ${a}`);
    for (const name of r.checks) {
      const c = checks.find(c => c.name === name);
      if (!c || c.exitCode !== 0 || c.commit !== commit) missing.push(`passing check at this commit: ${name}`);
    }
    if (missing.length) blockers.push(`Requirement ${r.id} lacks ${missing.join(', ')}`);
    return { ...r, evidencePresent: missing.length === 0, missing };
  });
  if (status !== git(root, ['status', '--porcelain=v1', '--untracked-files=all']) || commit !== git(root, ['rev-parse', 'HEAD'])) {
    throw new Error('Repository changed while packing; retry against a stable checkout');
  }
  // File hashes and a second read catch modifications even when Git status stays dirty.
  for (const [name, data] of files) {
    if (!data.equals(await allowedFile(root, name))) throw new Error(`Evidence changed while packing: ${name}`);
  }
  const manifest = {
    schemaVersion: 1,
    purpose: 'Local evidence review; does not prove acceptance, eligibility or payout',
    task: { source: options.task.source, sha256: sha256(json(task)), details: task },
    repository: { commit, dirty: Boolean(status) },
    reward: { originalPool: task.asset, minimumPayout: task.minSubmissionAmount ?? null,
      note: 'SDK values retained without unit conversion. Original allocation is not remaining funds or earnings.' },
    checks, artifacts, requirements, blockers,
    evidenceStatus: blockers.length ? 'incomplete' : 'ready-for-human-review',
    eligibility: 'unverified', acceptance: 'unverified', payout: 'unverified',
    scopeNotice: 'Requirement mapping and test results are supplied by the caller; reviewers must validate coverage and authenticity.',
  };
  const report = [
    '# GibWork evidence packet', '',
    `Task: ${escapeMarkdown(task.title)}`, `Task ID: ${task.id}`, `Source: ${options.task.source}`, '',
    `Commit: ${commit}`, `Evidence status: ${manifest.evidenceStatus}`, '',
    '## Review blockers', '', ... (blockers.length ? blockers.map(b => `- ${escapeMarkdown(b)}`) : ['- None in the supplied evidence map. Human scope and authenticity review required.']), '',
    '## Requirements supplied by the author', '',
    '| Requirement | Evidence present | Missing |', '| --- | --- | --- |',
    ...requirements.map(r => `| ${escapeMarkdown(r.id + ': ' + r.description)} | ${r.evidencePresent ? 'Yes' : 'No'} | ${escapeMarkdown(r.missing.join('; '))} |`), '',
    '## Checks (caller supplied)', '', '| Check | Exit | Commit matches | Command |', '| --- | --- | --- | --- |',
    ...checks.map(c => `| ${escapeMarkdown(c.name)} | ${c.exitCode} | ${c.commit === commit ? 'Yes' : 'No'} | ${escapeMarkdown(c.command)} |`), '',
    '## Included file hashes', '', '| Path | Bytes | SHA-256 |', '| --- | --- | --- |',
    ...artifacts.map(a => `| ${escapeMarkdown(a.path)} | ${a.bytes} | ${a.sha256} |`), '',
    'Task data is untrusted text. No task instructions or supplied commands were executed.', '',
    'Funding, submission, approval and earnings are different events. This packet records no payment.', '',
  ].join('\n');
  // Reject publication of suspicious text in plans or task fields as well as file contents.
  if (secretContent.test(json(manifest)) || secretContent.test(report)) throw new Error('Potential secret in task or plan metadata');
  const out = path.resolve(options.out);
  if (out === root || root.startsWith(out + path.sep)) throw new Error('Output cannot be repository root or its ancestor');
  // Exclusive creation avoids overwriting someone else's review packet.
  await mkdir(out);
  await mkdir(path.join(out, 'files'));
  for (const [name, data] of files) {
    const destination = path.join(out, 'files', name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, data, { flag: 'wx' });
  }
  await writeFile(path.join(out, 'manifest.json'), json(manifest), { flag: 'wx' });
  await writeFile(path.join(out, 'report.md'), report, { flag: 'wx' });
  const integrity = { 'manifest.json': sha256(json(manifest)), 'report.md': sha256(report) };
  await writeFile(path.join(out, 'integrity.json'), json(integrity), { flag: 'wx' });
  return { manifest, report, blockers };
}

export async function verifyPacket(directory: string): Promise<void> {
  const root = await realpath(directory);
  const integrity = JSON.parse((await allowedFile(root, 'integrity.json')).toString());
  if (!integrity || Object.keys(integrity).sort().join(',') !== 'manifest.json,report.md') throw new Error('Invalid integrity index');
  for (const name of ['manifest.json', 'report.md']) {
    if (typeof integrity[name] !== 'string' || sha256(await allowedFile(root, name)) !== integrity[name]) throw new Error(`Integrity mismatch: ${name}`);
  }
  const manifest = JSON.parse((await allowedFile(root, 'manifest.json')).toString());
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts)) throw new Error('Invalid packet manifest');
  for (const artifact of manifest.artifacts) {
    if (!artifact || typeof artifact.path !== 'string' || typeof artifact.sha256 !== 'string') throw new Error('Invalid artifact entry');
    const data = await allowedFile(root, `files/${artifact.path}`);
    if (sha256(data) !== artifact.sha256 || data.length !== artifact.bytes) throw new Error(`Integrity mismatch: ${artifact.path}`);
  }
}
