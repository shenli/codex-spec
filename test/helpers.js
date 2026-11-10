export const commandLine = argv => argv.map(arg => "'" + arg.replaceAll("'", "'\\''") + "'").join(' ');
export function specForCheck(check) {
  return '# Example\n\n## Acceptance criteria\n\n### Required behavior\n\nRequired behavior holds.\n\n' +
    'Verify: `' + commandLine(check.argv) + '`\n' +
    (check.timeoutMs === undefined ? '' : 'Timeout: ' + check.timeoutMs + 'ms\n') +
    (check.cwd === undefined ? '' : 'Directory: ' + check.cwd + '\n');
}
