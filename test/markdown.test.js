import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec, parseCommand } from '../.agents/skills/spec-driven-development/scripts/lib/markdown.mjs';

const spec = body => '# Example\n\n## Acceptance criteria\n\n' + body;
const criterion = (title = 'Expected behavior', command = 'npm test') =>
  '### ' + title + '\n\nAn observable outcome.\n\nVerify: `' + command + '`\n';

test('readable criteria compile to command mappings and defaults without authored metadata', () => {
  const result = parseSpec(spec(criterion('Rate limit', 'node --test test/rate-limit.test.js') +
    '\n' + criterion('Compatibility')), 'rate-limiter');
  assert.equal(result.feature, 'rate-limiter');
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.checks[0].argv, ['node', '--test', 'test/rate-limit.test.js']);
  assert.equal(result.checks[0].cwd, '.');
  assert.equal(result.checks[0].timeoutMs, 120000);
  assert.equal(result.criteria[0].title, 'Rate limit');
  assert.deepEqual(result.criteria[0].checks, [result.checks[0].id]);
});

test('generated criterion IDs survive reordering and repeated checks run only once', () => {
  const first = parseSpec(spec(criterion('One') + criterion('Two')), 'example');
  const second = parseSpec(spec(criterion('Two') + criterion('One')), 'example');
  assert.equal(first.criteria[0].id, second.criteria[1].id);
  assert.equal(first.criteria[1].id, second.criteria[0].id);
  assert.equal(first.checks.length, 1);
  assert.equal(first.checks[0].id, second.checks[0].id);
});

test('commands support quotes, apostrophes, escaped spaces and empty arguments', () => {
  assert.deepEqual(parseCommand('node "a file.js" \'a literal $HOME\' a\\ b ""'),
    ['node', 'a file.js', 'a literal $HOME', 'a b', '']);
  assert.deepEqual(parseCommand("echo 'can'\\''t'"), ['echo', "can't"]);
  assert.deepEqual(parseCommand('node -e "console.log(\\"ok\\")"'), ['node', '-e', 'console.log("ok")']);
  assert.deepEqual(parseCommand('echo "\\\\path\\q"'), ['echo', '\\path\\q']);
});

test('unsupported shell syntax, unmatched quotes and empty executables fail explicitly', () => {
  for (const command of ['', '"" arg', 'echo "open', "echo 'open", 'echo trailing\\',
    'npm test && npm run lint', 'echo hi | cat', 'echo $(whoami)', 'echo "$HOME"', 'echo `whoami`',
    'echo > out', 'A=1 npm test', '~/bin/check', 'echo x\0y', 'echo\nhi']) {
    assert.throws(() => parseCommand(command), /spec.md:1:/, command);
  }
});

test('missing commands derive a blocked draft, while manual review stays explicit', () => {
  const draft = parseSpec(spec('### Outcome\n\nSomething observable.\n'), 'example');
  assert.equal(draft.state, 'draft'); assert.equal(draft.criteria[0].pending, true);
  assert.deepEqual(draft.checks, []);
  const manual = parseSpec(spec('### Design approval\n\nReview: Maintainer reviews the API diff.\n'), 'example');
  assert.equal(manual.criteria[0].manual, 'Maintainer reviews the API diff.');
  assert.deepEqual(manual.checks, []);
});

test('multiple commands and optional directory/timeouts stay local to the criterion', () => {
  const result = parseSpec(spec(criterion('One') + 'Verify: `npm run lint`\nDirectory: web app\nTimeout: 30s\n' +
    criterion('Two')), 'example');
  assert.equal(result.criteria[0].checks.length, 2);
  assert.equal(result.checks[0].cwd, 'web app');
  assert.equal(result.checks[0].timeoutMs, 30000);
  assert.equal(result.checks[2].cwd, '.');
  assert.equal(result.checks[2].timeoutMs, 120000);
  assert.equal(parseSpec(spec(criterion() + 'Timeout: 2m'), 'x').checks[0].timeoutMs, 120000);
});

test('examples, comments and indented code never become executable criteria or checks', () => {
  const text = '# Example\n\n```markdown\n## Acceptance criteria\n### Fake\nVerify: `bad`\n```\n' +
    '<!-- ## Acceptance criteria\n### Hidden\nVerify: `bad` -->\n' +
    '## Acceptance criteria\n### Real\nReview: Inspect the result.\n\n' +
    '~~~sh\nVerify: `bad`\n### Also fake\n~~~\n    Verify: `bad`\n' +
    '<!-- Verify: `bad` -->\n';
  const result = parseSpec(text, 'example');
  assert.equal(result.criteria.length, 1);
  assert.equal(result.criteria[0].title, 'Real');
  assert.deepEqual(result.checks, []);
});

test('Markdown line endings, closing heading hashes, and case are handled consistently', () => {
  const result = parseSpec('# Example\r\n\r\n## ACCEPTANCE CRITERIA ##\r\n### Outcome ###\r\nverify: `npm test`\r\n', 'example');
  assert.equal(result.criteria[0].title, 'Outcome');
  assert.equal(result.checks.length, 1);
});

test('literal backticks can use a longer inline-code delimiter', () => {
  const result = parseSpec(spec('### Output\nVerify: ``node -e \'console.log(`literal`)\'``'), 'example');
  assert.equal(result.checks[0].argv[2], 'console.log(`literal`)');
});

test('empty, malformed or ambiguous Markdown cannot silently pass partial coverage', () => {
  const invalid = [
    '', '# No acceptance section', '## Acceptance criteria',
    spec('A requirement without a heading.\n' + criterion()),
    spec(criterion() + '## Acceptance criteria\n' + criterion('Another')),
    spec(criterion('One') + criterion('ONE')),
    spec(criterion() + 'Review: Also review this.'),
    spec(criterion() + 'Verify: `npm test`'),
    spec(criterion() + 'Verfy: `npm run lint`'),
    spec(criterion() + 'Verify: npm run lint'),
    spec(criterion() + 'Verify: `npm run lint` trailing prose'),
    spec(criterion() + 'Timeout: 0s'),
    spec(criterion() + 'Timeout: 601s'),
    spec(criterion() + 'Timeout: 30'),
    spec(criterion() + 'Timeout: 1s\nTimeout: 2s'),
    spec(criterion() + 'Directory: /tmp'),
    spec(criterion() + 'Directory: ../outside'),
    spec('### Missing command\nTimeout: 1s'),
    spec(criterion() + '#### Nested criterion\nVerify: `npm run lint`'),
    spec(criterion() + '## Notes\nVerify: `npm run lint`'),
    spec('Verify: `npm test`'),
    spec('### Empty directive\nVerify:'),
    spec('### Empty review\nReview:'),
    spec(criterion() + '```\nunclosed'),
    spec(criterion() + '<!-- unclosed')
  ];
  for (const input of invalid) assert.throws(() => parseSpec(input, 'example'), /spec.md:\d+:/, input);
});

test('criterion and check limits are enforced before execution', () => {
  assert.throws(() => parseSpec(spec(Array.from({ length: 129 }, (_, i) => criterion('Outcome ' + i)).join('\n')), 'x'), /128/);
  assert.throws(() => parseSpec(spec(Array.from({ length: 65 }, (_, i) => criterion('Outcome ' + i, 'node check' + i)).join('\n')), 'x'), /64/);
});

test('HTML-like content inside inline commands is preserved byte for byte', () => {
  const result = parseSpec(spec(criterion('Markup', 'node -e \'console.log("<!--literal-->")\'')), 'example');
  assert.equal(result.checks[0].argv[2], 'console.log("<!--literal-->")');
});
