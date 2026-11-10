import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { verify, status, gateExit, recordReview, history, loadRun, snapshot, lock, startRun, hash } from '../.build/index.mjs';
import { fixture, write, contract, git, specPath } from './helpers.mjs';

test('passing evidence persists with raw results and immutable history',async t=>{
  const r=await fixture(t), a=await verify(r,'example');
  assert.equal(a.acceptance,'ready');assert.equal(gateExit(a),0);
  assert.equal(a.run.results[0].stdout,'checked\n');
  const old=await fs.readFile(path.join(r,'.codex-spec/evidence/example/runs',a.run.id+'.json'));
  const b=await verify(r,'example');
  assert.notEqual(b.run.id,a.run.id);assert.equal((await history(r,'example')).length,2);
  assert.deepEqual(await fs.readFile(path.join(r,'.codex-spec/evidence/example/runs',a.run.id+'.json')),old);
});
test('committing the same tree preserves freshness; contents, modes, and spec changes invalidate it',async t=>{
  const r=await fixture(t);
  await write(r,'new.mjs','export default 1;');
  await verify(r,'example');
  git(r,'add','.');git(r,'commit','-qm','same content');
  assert.equal((await status(r,'example')).freshness,'current');
  await fs.chmod(path.join(r,'new.mjs'),0o755);
  assert.equal((await status(r,'example')).freshness,'stale');
  await fs.chmod(path.join(r,'new.mjs'),0o644);
  await write(r,'untracked.txt','new');
  assert.equal((await status(r,'example')).freshness,'stale');
  await fs.rm(path.join(r,'untracked.txt'));
  await fs.rm(path.join(r,'new.mjs'));
  await verify(r,'example');
  git(r,'add','-u');git(r,'commit','-qm','delete same tree');
  assert.equal((await status(r,'example')).freshness,'current');
  await write(r,specPath,contract('Review: inspect'));
  assert.equal((await status(r,'example')).acceptance,'stale');
});
test('ignored feature specs are still fingerprinted',async t=>{
  const r=await fixture(t);git(r,'rm','--cached',specPath);
  await write(r,'.gitignore','.codex-spec/\n');await verify(r,'example');
  await write(r,specPath,contract('Review: changed'));assert.equal((await status(r,'example')).freshness,'stale');
});
test('checks that mutate workspace cannot create current evidence',async t=>{
  const r=await fixture(t);
  await write(r,'check.mjs','import fs from "node:fs"; fs.writeFileSync("side-effect","changed");');
  const a=await verify(r,'example');
  assert.equal(a.checks,'passed');assert.equal(a.acceptance,'stale');assert.equal(gateExit(a,'checks'),1);
});
test('missing criterion blocks all commands',async t=>{
  const r=await fixture(t);await write(r,specPath,contract()+'\n### Unwired\nNeeds work.\n');
  const a=await verify(r,'example');assert.equal(a.acceptance,'blocked');assert.equal(a.run.results.length,0);
});
test('new failing and invalid runs replace old success',async t=>{
  const r=await fixture(t);await verify(r,'example');
  await write(r,'check.mjs','process.exit(7)');
  const a=await verify(r,'example');assert.equal(a.checks,'failed');assert.equal(gateExit(a),1);
  await write(r,specPath,'# Broken');const b=await verify(r,'example');
  assert.equal(b.acceptance,'invalid');assert.equal(gateExit(b),2);
  assert.equal((await history(r,'example')).length,3);
});
test('independent review stays pending until explicit decision, and expires on any new run or input',async t=>{
  const r=await fixture(t,'Verify: `node check.mjs`\nReview: Inspect UI and attach review URL.');
  let a=await verify(r,'example');assert.equal(a.acceptance,'needs-review');assert.equal(gateExit(a,'checks'),0);
  a=await recordReview(r,'example','approve','Reviewer','PR #12 review');
  assert.equal(a.acceptance,'ready');assert.equal(a.review,'approved');assert.equal(a.decision.source,'local');
  await write(r,'changed','yes');
  a=await status(r,'example');assert.equal(a.review,'pending');assert.equal(a.decision,null);
  await assert.rejects(recordReview(r,'example','approve','R','stale'),/current/);
  a=await verify(r,'example');assert.equal(a.review,'pending');
  a=await recordReview(r,'example','reject','Reviewer','Fix focus order');
  assert.equal(a.acceptance,'changes-requested');
  await write(r,'check.mjs','process.exit(1)');await verify(r,'example');
  await assert.rejects(recordReview(r,'example','approve','R','not enough'),/failing/);
});
test('manual-only work cannot satisfy automated gate',async t=>{
  const r=await fixture(t,'Review: Compare screenshots');
  let a=await verify(r,'example');assert.equal(a.checks,'none');assert.equal(gateExit(a,'checks'),1);
  a=await recordReview(r,'example','approve','Designer','review completed');assert.equal(gateExit(a),0);
});
test('baseline observes failure then pass without granting acceptance or overstating test quality',async t=>{
  const r=await fixture(t);await write(r,'check.mjs','process.exit(1)');
  const b=await verify(r,'example',{baseline:true});assert.equal(b.acceptance,'blocked');assert.equal(gateExit(b,'checks'),1);
  await write(r,'check.mjs','process.exit(0)');
  const a=await verify(r,'example');assert.equal(a.acceptance,'ready');assert.equal(a.baseline.runId,b.run.id);
  assert.equal(a.baseline.recovered.length,1);
});
test('a passing or infrastructure-failing baseline proves no recovered check',async t=>{
  const r=await fixture(t);await verify(r,'example',{baseline:true});await write(r,'other','changed');
  assert.equal((await verify(r,'example')).baseline,null);
});
test('concurrent runs and interrupted running markers fail closed',async t=>{
  const r=await fixture(t);await verify(r,'example');
  await lock(r,async()=>{
    assert.equal((await status(r,'example')).acceptance,'blocked');
    await assert.rejects(verify(r,'example'),/locked/);
  });
  await startRun(r,'example',randomUUID(),new Date().toISOString());
  assert.equal((await status(r,'example')).acceptance,'invalid');
});
test('corrupted evidence never reuses a pass',async t=>{
  const r=await fixture(t),a=await verify(r,'example');
  const file=path.join(r,'.codex-spec/evidence/example/runs',a.run.id+'.json');
  await fs.appendFile(file,' ');
  assert.equal((await status(r,'example')).acceptance,'invalid');
});
test('strict schemas and exact contract mappings reject altered evidence even with updated checksum',async t=>{
  const r=await fixture(t),a=await verify(r,'example');
  const base=path.join(r,'.codex-spec/evidence/example');
  const file=path.join(base,'runs',a.run.id+'.json');
  const obj=JSON.parse(await fs.readFile(file,'utf8'));
  obj.spec.criteria[0].checks=[];
  const raw=JSON.stringify(obj);await fs.writeFile(file,raw);
  await fs.writeFile(path.join(base,'latest.json'),JSON.stringify({state:'finished',id:a.run.id,hash:hash(raw)}));
  assert.equal((await status(r,'example')).acceptance,'invalid');
});
test('runtime or verifier mismatch invalidates freshness',async t=>{
  const r=await fixture(t),a=await verify(r,'example');
  const base=path.join(r,'.codex-spec/evidence/example'),file=path.join(base,'runs',a.run.id+'.json');
  const obj=JSON.parse(await fs.readFile(file,'utf8'));obj.runtime.node='v0.0.0';
  const raw=JSON.stringify(obj);await fs.writeFile(file,raw);
  await fs.writeFile(path.join(base,'latest.json'),JSON.stringify({state:'finished',id:a.run.id,hash:hash(raw)}));
  assert.equal((await status(r,'example')).freshness,'stale');
});
test('metadata symlinks and linked working directories are refused',async t=>{
  const r=await fixture(t);
  await fs.symlink('/tmp',path.join(r,'.codex-spec/evidence'));
  await assert.rejects(verify(r,'example'),/Symlink/);
  await fs.unlink(path.join(r,'.codex-spec/evidence'));
  await fs.symlink('/tmp',path.join(r,'linked'));
  await write(r,specPath,contract('Verify: `node check.mjs`\nDirectory: linked'));
  assert.equal((await verify(r,'example')).acceptance,'invalid');
});
test('symlink targets and submodule entries cannot silently escape fingerprints',async t=>{
  const r=await fixture(t);await fs.symlink('check.mjs',path.join(r,'link'));
  const a=await snapshot(r,'example');await fs.unlink(path.join(r,'link'));await fs.symlink('elsewhere',path.join(r,'link'));
  assert.notEqual((await snapshot(r,'example')).digest,a.digest);
  git(r,'update-index','--add','--cacheinfo','160000',git(r,'rev-parse','HEAD').trim(),'module');
  await assert.rejects(snapshot(r,'example'),/Submodule/);
});

test('missing executables are infrastructure errors, not ordinary test failures',async t=>{
  const r=await fixture(t,'Verify: `codex-spec-missing-executable-xyz`');
  const a=await verify(r,'example');assert.equal(a.acceptance,'invalid');assert.equal(gateExit(a),2);
});
