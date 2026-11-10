#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { workflows, workflowSpec } from '../examples/workflows.mjs';
const tool=fileURLToPath(new URL('../bin/codex-spec.mjs',import.meta.url));
const names=process.argv[2]?[process.argv[2]]:Object.keys(workflows);
for(const name of names){
  const w=workflows[name];if(!w)throw Error('Choose bug, refactor, or performance');
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'codex-spec-'+name+'-')));
  const run=(args,expected)=>{
    const r=spawnSync(process.execPath,[tool,...args],{cwd:root,encoding:'utf8'});
    process.stdout.write(r.stdout);process.stderr.write(r.stderr);
    if(r.status!==expected)throw Error(args.join(' ')+' returned '+r.status);
  };
  execFileSync('git',['init','-q'],{cwd:root});
  await fs.mkdir(path.join(root,'.codex-spec/features',name),{recursive:true});
  await fs.writeFile(path.join(root,'.gitignore'),'.codex-spec/evidence/\n.codex-spec/.verify.lock/\n');
  await fs.writeFile(path.join(root,'.codex-spec/features',name,'spec.md'),workflowSpec(w));
  await fs.writeFile(path.join(root,'implementation.mjs'),w.before);
  await fs.writeFile(path.join(root,'acceptance.mjs'),w.test);
  console.log('\n'+name.toUpperCase()+' — '+root+'\nBefore the change:');
  run(['verify',name,'--baseline'],1);
  await fs.writeFile(path.join(root,'implementation.mjs'),w.after);
  console.log('\nAfter the change:');
  run(['verify',name],w.review?1:0);
  console.log('\nRun history:');
  run(['history',name],0);
  console.log('\nEvidence and source are retained in '+root);
}
