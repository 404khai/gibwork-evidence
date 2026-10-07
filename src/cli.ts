import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fixtureTaskReader, liveTaskReader, readTask } from './task.js';
import { packEvidence, validatePlan, verifyPacket } from './pack.js';
import { captureCheck } from './capture.js';

const terminalText = (text: string): string => text.replace(/[\x00-\x1f\x7f]/g, ' ');

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(['task', 'fixture', 'adapter', 'environment', 'repo', 'plan', 'out', 'packet'].map(k => [k, { type: 'string' as const }])),
  });
  if (positionals[0] === 'capture' && values.repo && values.out && positionals.length > 1) {
    const out = path.resolve(values.out);
    // Reserve the output before running. It must be outside or Git-ignored in the checkout.
    await mkdir(out);
    const { receipt, log } = await captureCheck(values.repo, positionals.slice(1));
    await writeFile(path.join(out, 'checks.log'), log, { flag: 'wx' });
    await writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    console.log(`Captured exit: ${receipt.exitCode}; clean stable checkout: ${receipt.cleanStableCheckout}\nReceipt: ${terminalText(out)}/receipt.json`);
    process.exitCode = receipt.exitCode === 0 && !receipt.runnerError && receipt.cleanStableCheckout ? 0 : 2;
    return;
  }
  if (positionals[0] === 'verify' && values.packet) {
    await verifyPacket(values.packet);
    console.log('PASS: packet bytes match the saved integrity index (not a cryptographic author signature).');
    return;
  }
  if (positionals[0] !== 'pack' || !values.task || Boolean(values.fixture) === Boolean(values.adapter) || !values.repo || !values.plan || !values.out) {
    throw new Error('Usage: node dist/cli.js pack --task UUID (--fixture task.json | --adapter trusted-signer.mjs) --repo DIR --plan evidence.json --out NEW_DIR [--environment stage|production]\n       node dist/cli.js verify --packet DIR\n       node dist/cli.js capture --repo DIR --out NEW_DIR -- COMMAND ARGS');
  }
  if (values.environment && !['stage', 'production'].includes(values.environment)) throw new Error('Environment must be stage or production');
  const plan = validatePlan(JSON.parse(await readFile(values.plan, 'utf8')));
  let task;
  if (values.fixture) {
    const fixture: unknown = JSON.parse(await readFile(values.fixture, 'utf8'));
    task = await readTask(fixtureTaskReader(fixture), values.task, 'sdk-fixture');
  } else {
    // Explicit owner-selected executable adapter, never a path from task content.
    // It exposes a WalletSigner, not a private key argument or environment var.
    const adapter = await import(pathToFileURL(path.resolve(values.adapter!)).href);
    if (typeof adapter.createSigner !== 'function') throw new Error('Trusted adapter must export createSigner()');
    const signer = await adapter.createSigner();
    const production = values.environment === 'production';
    task = await readTask(liveTaskReader(signer, production ? 'production' : 'stage'), values.task, production ? 'sdk-live' : 'sdk-stage');
  }
  const result = await packEvidence({ repo: values.repo, out: values.out, task, plan });
  console.log(`Task: ${terminalText(task.details.title)}\nSource: ${task.source}${task.source === 'sdk-fixture' ? ' (no network calls)' : ' (read-only SDK request)'}\nPacket: ${terminalText(values.out)}`);
  console.log(`Evidence status: ${result.manifest.evidenceStatus}`);
  for (const blocker of result.blockers) console.log(`BLOCKER: ${terminalText(blocker)}`);
  console.log('No submission or payment was made.');
  process.exitCode = result.blockers.length ? 2 : 0;
}

main().catch((error: unknown) => {
  // Do not print arbitrary API bodies, request headers, or task contents.
  console.error(error instanceof Error
    ? error.name.startsWith('Gibwork') ? `SDK task read failed (${error.name}); no packet created.` : terminalText(error.message)
    : 'Evidence packing failed');
  process.exitCode = 1;
});
