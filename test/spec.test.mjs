import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec, incomplete } from '../.build/index.mjs';
import { contract } from './helpers.mjs';

test('readable Markdown compiles mappings, quoted argv, scope, and combined review', () => {
  const s = parseSpec(contract('- **Verify:** `node "test file.mjs" --name "a b"`\n- Review: Check the keyboard flow.\n- Directory: web\n- Timeout: 30s'),'example');
  assert.deepEqual(s.checks[0].argv,['node','test file.mjs','--name','a b']);
  assert.equal(s.checks[0].cwd,'web'); assert.equal(s.checks[0].timeoutMs,30000);
  assert.equal(s.criteria[0].review,'Check the keyboard flow.');
  assert.equal(incomplete(s).length,0);
});
test('shared commands execute once; stable IDs survive criterion reordering', () => {
  const a=contract()+'\n### Another outcome\nVerify: `node check.mjs`\n';
  const s=parseSpec(a,'example');
  assert.equal(s.checks.length,1); assert.equal(s.criteria[0].checks[0],s.criteria[1].checks[0]);
  const changed=parseSpec(a.replace('The observable outcome is correct.','Better explanation.'),'example');
  assert.equal(s.criteria[0].id,changed.criteria[0].id); assert.notEqual(s.hash,changed.hash);
});
test('fences, comments, and quoted examples never become checks', () => {
  const s=parseSpec(contract('<!-- Verify: `node fake.mjs` -->\n\n> Verify: `node quoted.mjs`\n\n```md\nVerify: `node fenced.mjs`\n```\n\nReview: Inspect it.'),'example');
  assert.equal(s.checks.length,0);assert.equal(s.criteria[0].review,'Inspect it.');
});
test('unwired outcomes remain incomplete, never implied acceptance', () => {
  assert.equal(incomplete(parseSpec(contract('A concrete outcome.'),'example')).length,1);
});
for(const [name,body] of [
  ['unquoted command','Verify: node check.mjs'],
  ['unclosed quote','Verify: `node "unfinished`'],
  ['trailing escape','Verify: `node abc\\`'],
  ['pipe','Verify: `node check.mjs | cat`'],
  ['chain','Verify: `node check.mjs && true`'],
  ['glob','Verify: `node *.mjs`'],
  ['expansion','Verify: `node $HOME`'],
  ['command substitution','Verify: `node $(id)`'],
  ['assignment','Verify: `A=1 node check.mjs`'],
  ['redirect','Verify: `node check.mjs > result`'],
  ['comment','Verify: `node check.mjs # skipped`'],
  ['escape directory','Verify: `node check.mjs`\nDirectory: ../outside'],
  ['timeout too large','Verify: `node check.mjs`\nTimeout: 11m'],
  ['duplicate setting','Review: One\nReview: Two'],
  ['unknown directive','Verfy: `node check.mjs`'],
  ['orphan timeout','Review: Inspect\nTimeout: 1s']
]) test('rejects '+name,()=>assert.throws(()=>parseSpec(contract(body),'example'),/spec.md:/));
test('rejects repeated headings and misplaced directives',()=>{
  assert.throws(()=>parseSpec(contract()+'\n### EXPECTED outcome\nReview: inspect','example'),/unique/);
  assert.throws(()=>parseSpec('Verify: `node x`\n'+contract(),'example'),/Put checks/);
  assert.throws(()=>parseSpec(contract()+'\n## Acceptance\n### Another\nReview: inspect','example'),/one Acceptance/);
  assert.throws(()=>parseSpec('# Missing','example'),/Acceptance/);
});
test('literal special characters can be quoted, including dollars in single quotes',()=>{
  const s=parseSpec(contract('Verify: `node check.mjs \'$literal\' "a*b" "a;b"`'),'example');
  assert.deepEqual(s.checks[0].argv,['node','check.mjs','$literal','a*b','a;b']);
});
