import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture, write, cli, specPath, contract, cliPath } from './helpers.mjs';

test('CLI prints useful human results, clean JSON, reports, and history',async t=>{
  const r=await fixture(t);
  assert.equal(cli(r,'check','example').status,0);
  const a=cli(r,'verify','example','--json');
  assert.equal(a.status,0,a.stderr);assert.equal(JSON.parse(a.stdout).acceptance,'ready');assert.match(a.stderr,/Checking:/);
  assert.match(cli(r,'status','example').stdout,/READY/);
  const report=cli(r,'report','example');assert.equal(report.status,0);assert.match(report.stdout,/# Verification/);
  assert.match(report.stdout,/Expected outcome/);
  assert.equal(JSON.parse(cli(r,'history','example','--json').stdout).length,1);
  assert.equal(JSON.parse(cli(r,'status','--json').stdout).length,1);
});
test('CLI exit gates keep pending review separate from automated checks',async t=>{
  const r=await fixture(t,'Verify: `node check.mjs`\nReview: Inspect the interaction.');
  assert.equal(cli(r,'verify','example').status,1);
  assert.equal(cli(r,'status','example','--gate','checks').status,0);
  assert.equal(cli(r,'review','example','--decision','approve').status,2);
  const a=cli(r,'review','example','--decision','approve','--reviewer','Alice','--note','PR 12 review','--json');
  assert.equal(a.status,0,a.stderr);assert.equal(JSON.parse(a.stdout).review,'approved');
  assert.equal(cli(r,'verify','example','--baseline','--gate','checks').status,1);
});
test('invalid options, names, and incomplete contracts return actionable failures',async t=>{
  const r=await fixture(t);
  for(const args of [['missing'],['status','../escape'],['status','example','--baseline'],['status','example','--gate','whatever'],['spec','new','too','many']]){
    assert.equal(cli(r,...args).status,2,args.join(' '));
  }
  assert.equal(cli(r,'spec','new-feature','A useful outcome').status,0);
  assert.equal(cli(r,'check','new-feature').status,1);
  assert.equal(cli(r,'verify','new-feature').status,1);
  assert.equal(cli(r,'spec','new-feature','Duplicate').status,2);
  assert.equal(cli(r,'--version').stdout.trim(),'2.0.0');
  assert.match(cli(r,'--help').stdout,/--baseline/);
  await write(r,specPath,contract('Verfy: bad'));
  assert.equal(cli(r,'check','example').status,2);
});
test('init installs a portable skill, preserves AGENTS, and refuses silent overwrite',async t=>{
  const r=await fixture(t);await write(r,'AGENTS.md','Existing project rules.\n');
  let a=cli(r,'init','--json');assert.equal(a.status,0,a.stderr);assert.equal(JSON.parse(a.stdout).installed,true);
  assert.equal(await fs.readFile(path.join(r,'AGENTS.md'),'utf8'),'Existing project rules.\n');
  const target=path.join(r,'.agents/skills/spec-driven-development');
  const standalone=path.join(target,'scripts/codex-spec.mjs');
  const b=spawnSync(process.execPath,[standalone,'verify','example','--json'],{cwd:r,encoding:'utf8'});
  assert.equal(b.status,0,b.stderr);assert.equal(JSON.parse(b.stdout).acceptance,'ready');
  a=cli(r,'init','--json');assert.equal(JSON.parse(a.stdout).installed,false);
  await fs.appendFile(path.join(target,'SKILL.md'),'\nLocal changes\n');
  assert.equal(cli(r,'init').status,2);
  assert.match(await fs.readFile(path.join(target,'SKILL.md'),'utf8'),/Local changes/);
});
test('CLI cancellation persists interrupted evidence and releases the lock',async t=>{
  const {spawn}=await import('node:child_process');
  const r=await fixture(t);await write(r,'check.mjs','console.log("started");setInterval(()=>{},1000)');
  const child=spawn(process.execPath,[cliPath,'verify','example','--json'],{cwd:r,stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>{err+=c;if(err.includes('Checking:'))child.kill('SIGINT');});
  const exit=await new Promise(resolve=>child.on('close',resolve));
  assert.equal(exit,1);assert.equal(JSON.parse(out).run.results[0].failure,'interrupted');
  await assert.rejects(fs.stat(path.join(r,'.codex-spec/.verify.lock')),/ENOENT/);
});
