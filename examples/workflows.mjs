// Small, executable examples. The same acceptance tests run before and after each change.
export const workflows = {
  bug: {
    intent: 'Allow the first 100 requests and reject request 101.',
    criterion: 'The rate limit has the correct boundary',
    before: 'export const allowed = count => count < 100;\n',
    after: 'export const allowed = count => count <= 100;\n',
    test: 'import assert from "node:assert/strict";\nimport {allowed} from "./implementation.mjs";\nfor(let n=1;n<=100;n++)assert.equal(allowed(n),true,"request "+n);\nassert.equal(allowed(101),false);\n',
    baselineFails: true
  },
  refactor: {
    intent: 'Extract price calculation without changing behavior.',
    criterion: 'Totals preserve discounts and rounding',
    before: 'export function total(items,discount=0){let n=0;for(const x of items)n+=x.price*x.quantity;return Math.round(n*(1-discount)*100)/100;}\n',
    after: 'const subtotal = items => items.reduce((sum,item)=>sum+item.price*item.quantity,0);\nexport const total = (items,discount=0) => Math.round(subtotal(items)*(1-discount)*100)/100;\n',
    test: 'import assert from "node:assert/strict";\nimport {total} from "./implementation.mjs";\nassert.equal(total([]),0);\nassert.equal(total([{price:12.5,quantity:2},{price:4,quantity:3}]),37);\nassert.equal(total([{price:12.5,quantity:2},{price:4,quantity:3}],0.1),33.3);\nassert.equal(total([{price:0.1,quantity:3}]),0.3);\n',
    baselineFails: false,
    review: 'Inspect the diff for readability and confirm that the public API is unchanged.'
  },
  performance: {
    intent: 'Group 1,000 records using at most 2,000 key reads.',
    criterion: 'Grouping is correct with linear key access',
    before: 'export function group(items){const keys=[...new Set(items.map(x=>x.key))];return new Map(keys.map(k=>[k,items.filter(x=>x.key===k)]));}\n',
    after: 'export function group(items){const groups=new Map();for(const item of items){const key=item.key;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}return groups;}\n',
    test: 'import assert from "node:assert/strict";\nimport {group} from "./implementation.mjs";\nlet reads=0;\nconst items=Array.from({length:1000},(_,i)=>({id:i,get key(){reads++;return i%100;}}));\nconst result=group(items);\nassert.equal(result.size,100);\nassert.deepEqual(result.get(0).map(x=>x.id),[0,100,200,300,400,500,600,700,800,900]);\nassert.ok(reads<=2000,"key reads: "+reads);\nconsole.log("key reads:",reads);\n',
    baselineFails: true
  }
};
export function workflowSpec(w) {
  return '# '+w.intent+'\n\n## Acceptance criteria\n\n### '+w.criterion+
    '\n\nVerify: `node acceptance.mjs`\n'+(w.review?'\nReview: '+w.review+'\n':'');
}
