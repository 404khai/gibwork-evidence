import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { captureCheck } from '../dist/capture.js';

async function repo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gibwork-capture-'));
  await writeFile(path.join(root, 'source.txt'), 'original\n');
  const git = (...args) => execFileSync('git', ['-C', root, ...args]);
  git('init', '-q'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  return root;
}
test('capture records actual argv, exit, log digest and stable commit without shell expansion', async () => {
  const root = await repo();
  const argv = [process.execPath, '-e', 'console.log(process.argv[1])', '$(false); literal'];
  const result = await captureCheck(root, argv);
  assert.equal(result.log, '$(false); literal\n');
  assert.deepEqual(result.receipt.argv, argv);
  assert.equal(result.receipt.exitCode, 0);
  assert.equal(result.receipt.cleanStableCheckout, true);
  assert.equal(result.receipt.commit, result.receipt.commitAfter);
  assert.equal(result.receipt.logSha256, createHash('sha256').update(result.log).digest('hex'));
});
test('capture preserves failure and stderr rather than claiming a passing run', async () => {
  const result = await captureCheck(await repo(), [process.execPath, '-e', 'console.error("failed"); process.exit(7)']);
  assert.equal(result.receipt.exitCode, 7);
  assert.equal(result.log, 'failed\n');
});
test('capture bounds a hung process and records timeout', async () => {
  const result = await captureCheck(await repo(), [process.execPath, '-e', 'setInterval(()=>{},1000)'], 100);
  assert.equal(result.receipt.runnerError, 'ETIMEDOUT');
  assert.equal(result.receipt.exitCode, null);
});
test('capture detects a command changing the checkout', async () => {
  const result = await captureCheck(await repo(), [process.execPath, '-e', 'require("node:fs").writeFileSync("source.txt","modified")']);
  assert.equal(result.receipt.exitCode, 0);
  assert.equal(result.receipt.cleanStableCheckout, false);
  assert.match(result.receipt.statusAfter, /source.txt/);
});
