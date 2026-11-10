import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'codex-spec-package-'));
const exec=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
try {
  const packed=JSON.parse(exec('npm',['pack','--ignore-scripts','--json'],process.cwd()))[0];
  const installer=path.join(temp,'install'),project=path.join(temp,'project');
  await fs.mkdir(project,{recursive:true});
  exec('npm',['install','--prefix',installer,'--ignore-scripts','--offline','--no-audit','--no-fund',path.resolve(packed.filename)],temp);
  exec('git',['init','-q'],project);
  const bin=path.join(installer,'node_modules/codex-spec/bin/codex-spec.mjs');
  exec(process.execPath,[bin,'init'],project);
  await fs.mkdir(path.join(project,'.codex-spec/features/smoke'),{recursive:true});
  await fs.writeFile(path.join(project,'.codex-spec/features/smoke/spec.md'),'# Smoke\n\n## Acceptance\n\n### Packaged tool runs\nVerify: `node check.mjs`\n');
  await fs.writeFile(path.join(project,'check.mjs'),'console.log("package works")');
  const skill=path.join(project,'.agents/skills/spec-driven-development/scripts/codex-spec.mjs');
  const a=JSON.parse(exec(process.execPath,[skill,'verify','smoke','--json'],project));
  assert.equal(a.acceptance,'ready');
  assert.equal(a.run.results[0].stdout,'package works\n');
  console.log('Packed npm package installs offline and its copied skill verifies a fresh Git project.');
} finally { await fs.rm(temp,{recursive:true,force:true}); }
