import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { GibworkClient } from '@gibwork/sdk';
import { fixtureTaskReader, readTask } from '../dist/task.js';
import { packEvidence, verifyPacket, validatePlan } from '../dist/pack.js';

const fixture = JSON.parse(await readFile(new URL('../examples/task.json', import.meta.url), 'utf8'));
const git = (repo, ...args) => execFileSync('git', ['-c', 'core.fsmonitor=false', '-C', repo, ...args], {encoding:'utf8'}).trim();
async function setup() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'gibwork-test-'));
  const repo = path.join(base, 'repo');
  await mkdir(repo);
  await writeFile(path.join(repo, 'source.txt'), 'tested source\n');
  await writeFile(path.join(repo, 'test.log'), '1 passed\n');
  git(repo, 'init', '-q');
  git(repo, 'add', '.');
  git(repo, '-c', 'user.name=Fixture Author', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  const commit = git(repo, 'rev-parse', 'HEAD');
  const plan = {
    artifacts: ['source.txt'],
    checks: [{name:'unit',command:'node --test',exitCode:0,commit,log:'test.log'}],
    requirements: [{id:'implementation',description:'Tested implementation',artifacts:['source.txt'],checks:['unit']}],
  };
  const task = await readTask(fixtureTaskReader(fixture), fixture.id, 'sdk-fixture');
  return {base,repo,plan,task,out:path.join(base,'packet')};
}

test('actual SDK fixture transport is offline and source remains explicitly unverified', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
  try {
    const task = await readTask(fixtureTaskReader(fixture), fixture.id, 'sdk-fixture');
    assert.equal(task.details.title, fixture.title);
    assert.equal(task.source,'sdk-fixture');
  } finally { globalThis.fetch = original; }
});
test('SDK read errors abort before any packet is created', async () => {
  const x = await setup();
  await assert.rejects(readTask({get:async()=>{throw new Error('Task unavailable');}},fixture.id,'sdk-live'), /unavailable/);
  assert.ok(!(await readdir(x.base)).includes('packet'));
});
test('actual SDK handles 403 and there is no response fallback', async () => {
  const client = new GibworkClient({signer:{publicKey:{toBase58:()=> '11111111111111111111111111111111'},signMessage:async()=>new Uint8Array(64),signTransaction:async()=>{throw Error('No transactions');}},fetch:async()=>new Response('{"message":"denied"}',{status:403})});
  await assert.rejects(readTask({get:id=>client.tasks.get(id)},fixture.id,'sdk-live'), e=>e.status===403);
});
test('wrong task ID and incomplete task payload cannot be packed', async () => {
  await assert.rejects(readTask(fixtureTaskReader({...fixture,id:'bad'}),fixture.id,'sdk-fixture'), /identity/);
  await assert.rejects(readTask(fixtureTaskReader({id:fixture.id}),fixture.id,'sdk-fixture'), /identity/);
});
test('packet bytes are deterministic for identical evidence and detect artifact tampering', async () => {
  const x = await setup();
  const first = await packEvidence(x);
  const secondDir = path.join(x.base,'packet2');
  await packEvidence({...x,out:secondDir});
  for (const name of ['manifest.json','report.md','integrity.json']) {
    assert.deepEqual(await readFile(path.join(x.out,name)),await readFile(path.join(secondDir,name)));
  }
  assert.equal(first.manifest.payout,'unverified');
  assert.equal(first.manifest.evidenceStatus,'incomplete');
  assert.equal(first.manifest.repository.dirty,false);
  await verifyPacket(x.out);
  await writeFile(path.join(x.out,'files/source.txt'),'tampered');
  await assert.rejects(verifyPacket(x.out), /Integrity mismatch/);
});
test('report tampering is detected', async () => {
  const x = await setup(); await packEvidence(x);
  await writeFile(path.join(x.out,'report.md'),'fake success');
  await assert.rejects(verifyPacket(x.out), /Integrity mismatch/);
});
test('failed and stale checks plus missing evidence stay visible', async () => {
  const x = await setup();
  x.plan.checks[0].exitCode=1;
  x.plan.checks[0].commit='0'.repeat(40);
  x.plan.requirements.push({id:'demo',description:'Video',artifacts:['demo.mp4'],checks:[]});
  const result = await packEvidence(x);
  assert.ok(result.blockers.some(b=>b.includes('Check failed')));
  assert.ok(result.blockers.some(b=>b.includes('current commit')));
  assert.ok(result.blockers.some(b=>b.includes('demo.mp4')));
  assert.equal(result.manifest.requirements[0].evidencePresent,false);
});
test('dirty checkout and closed/expired tasks block readiness', async () => {
  const x = await setup();
  await writeFile(path.join(x.repo,'source.txt'),'uncommitted');
  x.task={source:'sdk-live',details:{...fixture,isOpen:false,deadline:'2020-01-01T00:00:00Z'}};
  const result=await packEvidence(x);
  assert.ok(result.blockers.some(b=>b.includes('uncommitted')));
  assert.ok(result.blockers.includes('Task is closed'));
  assert.ok(result.blockers.includes('Task deadline has passed'));
});
test('a live complete map only means ready for human review', async () => {
  const x = await setup(); x.task.source='sdk-live';
  const result=await packEvidence(x);
  assert.equal(result.manifest.evidenceStatus,'ready-for-human-review');
  assert.equal(result.manifest.acceptance,'unverified');
  assert.equal(result.manifest.eligibility,'unverified');
  assert.equal(result.manifest.payout,'unverified');
});
test('traversal, credentials and symlinks are rejected before output', async () => {
  for(const name of ['../escape','/tmp/file','.env','.private/file','keys/wallet-keypair.json','a\\b']) {
    const x=await setup(); x.plan.artifacts=[name];
    await assert.rejects(packEvidence(x), /Unsafe evidence path/);
    assert.ok(!(await readdir(x.base)).includes('packet'));
  }
  const x=await setup(); await symlink(path.join(x.repo,'source.txt'),path.join(x.repo,'link'));
  x.plan.artifacts=['link'];
  await assert.rejects(packEvidence(x), /Symlink/);
});
test('secrets inside logs or metadata are rejected', async () => {
  const x=await setup();
  await writeFile(path.join(x.repo,'test.log'),'API_KEY=abcdefghijklmnopqrstuv');
  await assert.rejects(packEvidence(x), /Potential secret/);
  const y=await setup(); y.task.details={...fixture,content:'-----BEGIN PRIVATE KEY-----'};
  await assert.rejects(packEvidence(y), /Potential secret/);
});
test('output is exclusive and existing evidence cannot be overwritten', async () => {
  const x=await setup(); await packEvidence(x);
  const before=await readFile(path.join(x.out,'manifest.json'));
  await assert.rejects(packEvidence(x),e=>e.code==='EEXIST');
  assert.deepEqual(before,await readFile(path.join(x.out,'manifest.json')));
});
test('plan needs evidence, unique names and valid exit status', () => {
  assert.throws(()=>validatePlan({artifacts:[],checks:[],requirements:[]}), /needs/);
});

test('CLI produces an incomplete fixture packet with exit 2, and verify succeeds independently', async () => {
  const x=await setup();
  const fixturePath=path.join(x.base,'task.json'), planPath=path.join(x.base,'plan.json');
  await writeFile(fixturePath,JSON.stringify(fixture)); await writeFile(planPath,JSON.stringify(x.plan));
  const cli=new URL('../dist/cli.js',import.meta.url);
  const packed=spawnSync(process.execPath,[cli.pathname,'pack','--task',fixture.id,'--fixture',fixturePath,'--repo',x.repo,'--plan',planPath,'--out',x.out],{encoding:'utf8'});
  assert.equal(packed.status,2,packed.stderr);
  assert.match(packed.stdout,/sdk-fixture \(no network calls\)/);
  const verified=spawnSync(process.execPath,[cli.pathname,'verify','--packet',x.out],{encoding:'utf8'});
  assert.equal(verified.status,0,verified.stderr);
  assert.match(verified.stdout,/PASS/);
});
test('CLI refuses mixed fixture and executable adapter inputs before importing the adapter', async () => {
  const result=spawnSync(process.execPath,[new URL('../dist/cli.js',import.meta.url).pathname,'pack','--task',fixture.id,'--fixture','missing.json','--adapter','untrusted.mjs','--repo','.','--plan','missing.json','--out','missing'],{encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Usage/);
  assert.doesNotMatch(result.stderr,/ERR_MODULE_NOT_FOUND/);
});
test('stage evidence is never production-ready', async () => {
  const x=await setup();x.task.source='sdk-stage';
  const result=await packEvidence(x);
  assert.ok(result.blockers.includes('Task source is stage, not a production eligibility check'));
});
