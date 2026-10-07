import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureTaskReader, readTask } from '../dist/task.js';
import { packEvidence, verifyPacket } from '../dist/pack.js';
import { captureCheck } from '../dist/capture.js';

const home=fileURLToPath(new URL('../',import.meta.url));
const base=await mkdtemp(path.join(os.tmpdir(),'gibwork-demo-'));
const repo=path.join(base,'implementation');
await mkdir(repo);
await writeFile(path.join(repo,'add.mjs'),'export const add = (a, b) => a + b;\n');
await writeFile(path.join(repo,'add.test.mjs'),`import {test} from 'node:test';
import assert from 'node:assert/strict';
import {add} from './add.mjs';
test('adds positive integers',()=>assert.equal(add(2,3),5));
test('handles negatives',()=>assert.equal(add(-2,3),1));
test('handles zero',()=>assert.equal(add(0,0),0));
`);
await writeFile(path.join(repo,'.gitignore'),'checks.log\nreceipt.json\n');
const git=(...args)=>execFileSync('git',['-c','core.fsmonitor=false','-C',repo,...args],{encoding:'utf8'}).trim();
git('init','-q');git('add','.');
git('-c','user.name=Demo Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','Synthetic addition implementation');
const commit=git('rev-parse','HEAD');
const check=await captureCheck(repo,[process.execPath,'--test','add.test.mjs']);
if(check.receipt.exitCode!==0 || !check.receipt.cleanStableCheckout) throw new Error('Demo regression suite failed');
await writeFile(path.join(repo,'checks.log'),check.log);
await writeFile(path.join(repo,'receipt.json'),JSON.stringify(check.receipt,null,2)+'\n');
const fixture=JSON.parse(await readFile(path.join(home,'examples/task.json'),'utf8'));
const task=await readTask(fixtureTaskReader(fixture),fixture.id,'sdk-fixture');
const plan={artifacts:['add.mjs','add.test.mjs','receipt.json'],checks:[{name:'unit',command:'node --test add.test.mjs',exitCode:check.receipt.exitCode,commit,log:'checks.log'}],requirements:[
  {id:'code',description:'Addition implementation',artifacts:['add.mjs'],checks:['unit']},
  {id:'regression',description:'Regression cases',artifacts:['add.test.mjs'],checks:['unit']},
  {id:'recording',description:'Demo video URL/recording',artifacts:['demo.mp4'],checks:[]},
]};
const out=path.join(base,'review-packet');
const result=await packEvidence({repo,out,task,plan});
console.log('GibWork Evidence — offline SDK demo\n');
console.log('1. Read fixture task through official @gibwork/sdk tasks.get');
console.log(`   ${task.details.title}\n   No API or blockchain calls.`);
console.log(`2. Capture real regression tests in a synthetic Git repository\n   ${commit}\n   Tests: 3 passed, exit ${check.receipt.exitCode}\n   Local execution receipt included (unsigned).`);
console.log('3. Pack commit, requirement map, test log and SHA-256 hashes');
console.log(`   ${result.manifest.evidenceStatus}`);
for(const b of result.blockers) console.log(`   BLOCKER: ${b}`);
await verifyPacket(out);
console.log('4. Verify the packet: PASS');
await writeFile(path.join(out,'files/add.mjs'),'tampered file\n');
try {await verifyPacket(out); throw new Error('Tamper detection failed');} catch(e) {
  if(!e.message.includes('Integrity mismatch'))throw e;
  console.log(`5. Change a packaged file: DETECTED (${e.message})`);
}
// Restore the originally packed bytes for a deliverable that verifies cleanly.
await writeFile(path.join(out,'files/add.mjs'),await readFile(path.join(repo,'add.mjs')));
await verifyPacket(out);
console.log('\nSubmission: not sent. Eligibility, acceptance and payout: unverified.');
console.log(`\nEvidence packet: ${out}\nSynthetic repo: ${repo}`);
await writeFile(path.join(base,'plan.json'),JSON.stringify(plan,null,2)+'\n');
await mkdir(path.join(home,'demo-output'),{recursive:true});
await writeFile(path.join(home,'demo-output/latest.json'),JSON.stringify({base,repo,packet:out,commit,plan:path.join(base,'plan.json')},null,2)+'\n');
