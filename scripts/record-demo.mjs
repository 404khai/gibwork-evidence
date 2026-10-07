// Capture actual process output as an asciicast; no simulated test results.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = fileURLToPath(new URL('../demo-output/', import.meta.url));
await mkdir(out, { recursive: true });
const events = [];
const started = performance.now();
const child = spawn(process.execPath, ['scripts/demo.mjs'], { cwd: root, stdio: ['ignore','pipe','pipe'] });
let transcript = '';
for (const stream of [child.stdout,child.stderr]) stream.on('data', data => {
  const text = data.toString(); transcript += text;
  events.push([(performance.now()-started)/1000,'o',text.replace(/\n/g,'\r\n')]);
  process.stdout.write(text);
});
const exitCode = await new Promise((resolve,reject) => {child.on('error',reject);child.on('exit',resolve);});
if(exitCode!==0) throw new Error(`Demo failed with exit ${exitCode}`);
await writeFile(out+'demo.cast', [JSON.stringify({version:2,width:100,height:35,title:'GibWork Evidence - actual offline terminal demo',env:{TERM:'xterm-256color'}}), ...events.map(e=>JSON.stringify(e))].join('\n')+'\n');
await writeFile(out+'transcript.txt',transcript);
console.log(`Saved actual terminal output and timing to ${out}demo.cast`);
