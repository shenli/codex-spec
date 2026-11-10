import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const cliPath = fileURLToPath(new URL('../bin/codex-spec.mjs', import.meta.url));
export const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
export async function write(root, name, value) {
  const p = path.join(root,name); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p,value);
}
export const contract = (body = 'Verify: `node check.mjs`') => '# Example\n\n## Acceptance criteria\n\n### Expected outcome\n\nThe observable outcome is correct.\n\n' + body + '\n';
export async function fixture(t, body) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'codex-spec-test-')));
  t?.after(() => fs.rm(root, {recursive:true,force:true}));
  git(root,'init','-q'); git(root,'config','user.name','Test'); git(root,'config','user.email','test@example.invalid');
  await write(root,'.gitignore','.codex-spec/evidence/\n.codex-spec/.verify.lock/\nnode_modules/\n');
  await write(root,'.codex-spec/features/example/spec.md',contract(body));
  await write(root,'check.mjs','console.log("checked");\n');
  git(root,'add','.');git(root,'commit','-qm','fixture');
  return root;
}
export const cli = (root, ...args) => spawnSync(process.execPath,[cliPath,...args],{cwd:root,encoding:'utf8',timeout:30000});
export const specPath = '.codex-spec/features/example/spec.md';
