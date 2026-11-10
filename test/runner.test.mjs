import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runCheck, passed } from '../.build/index.mjs';
import { fixture, write } from './helpers.mjs';
const check=(argv,timeoutMs=2000)=>({id:'test',command:argv.join(' '),argv,cwd:'.',timeoutMs});
test('runner records exit, signal, bounded output, and spawn errors',async t=>{
  const r=await fixture(t);
  let a=await runCheck(check([process.execPath,'-e','console.log("out");console.error("err");process.exit(4)']),r);
  assert.equal(a.exitCode,4);assert.equal(a.stdout,'out\n');assert.equal(a.stderr,'err\n');assert.equal(passed(a),false);
  a=await runCheck(check([process.execPath,'-e','process.stdout.write("a".repeat(200000))']),r);
  assert.equal(a.stdout.length,65536);assert.equal(a.truncated,true);assert.equal(passed(a),true);
  a=await runCheck(check(['codex-spec-nonexistent-command-abc']),r);
  assert.equal(a.failure,'spawn');assert.equal(passed(a),false);
  a=await runCheck(check([process.execPath,'-e','process.kill(process.pid,"SIGTERM")']),r);
  assert.equal(a.signal,'SIGTERM');assert.equal(passed(a),false);
});
test('timeouts and cancellation do not look like successful checks',async t=>{
  const r=await fixture(t);
  const a=await runCheck(check([process.execPath,'-e','setInterval(()=>{},1000)'],100),r);
  assert.equal(a.failure,'timeout');
  const c=new AbortController();
  setTimeout(()=>c.abort(),100);
  const b=await runCheck(check([process.execPath,'-e','setInterval(()=>{},1000)']),r,c.signal);
  assert.equal(b.failure,'interrupted');
  const d=await runCheck(check([process.execPath,'-e','process.exit(0)']),r,c.signal);
  assert.equal(d.failure,'interrupted');assert.equal(d.exitCode,null);
});
test('ordinary child descendants are terminated even when their parent exits successfully',async t=>{
  const r=await fixture(t);
  await write(r,'child.mjs','import fs from "node:fs";setTimeout(()=>fs.writeFileSync("leaked","yes"),400);');
  await write(r,'parent.mjs','import {spawn} from "node:child_process";spawn(process.execPath,["child.mjs"],{stdio:"inherit"});setTimeout(()=>process.exit(0),100);');
  const a=await runCheck(check([process.execPath,'parent.mjs']),r);
  assert.equal(passed(a),true);
  await new Promise(resolve=>setTimeout(resolve,500));
  await assert.rejects(fs.stat(path.join(r,'leaked')),/ENOENT/);
});
test('arguments are passed literally without shell interpretation',async t=>{
  const r=await fixture(t);
  const a=await runCheck(check([process.execPath,'-e','console.log(process.argv[1])','$(touch injected)']),r);
  assert.equal(a.stdout,'$(touch injected)\n');
  await assert.rejects(fs.stat(path.join(r,'injected')),/ENOENT/);
});
