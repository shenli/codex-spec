import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflows, workflowSpec } from '../examples/workflows.mjs';
import { verify, markdownReport, gateExit } from '../.build/index.mjs';
import { fixture, write, specPath } from './helpers.mjs';

for(const [name,w] of Object.entries(workflows))test(name+' workflow uses the same acceptance test before and after implementation',async t=>{
  const root=await fixture(t);
  await write(root,specPath,workflowSpec(w));
  await write(root,'implementation.mjs',w.before);
  await write(root,'acceptance.mjs',w.test);
  const baseline=await verify(root,'example',{baseline:true});
  assert.equal(baseline.checks,w.baselineFails?'failed':'passed');
  assert.equal(gateExit(baseline),1);
  await write(root,'implementation.mjs',w.after);
  const current=await verify(root,'example');
  assert.equal(current.checks,'passed');
  assert.equal(current.acceptance,w.review?'needs-review':'ready');
  assert.equal(gateExit(current,'checks'),0);
  if(w.baselineFails)assert.equal(current.baseline.recovered.length,1);
  else assert.equal(current.baseline,null);
  const report=markdownReport(current);
  assert.match(report,new RegExp(w.criterion));assert.match(report,/Evidence/);
});
