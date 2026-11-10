import path from 'node:path';
import { createHash } from 'node:crypto';

const fail = (line, message) => { throw new Error('spec.md:' + line + ': ' + message); };
const stableId = (prefix, value) => prefix + createHash('sha256').update(value).digest('hex').slice(0, 16);

// A command line, not a shell program. Expansion/operators must live in a reviewed script.
export function parseCommand(command, line = 1) {
  if (!command.trim() || /[\0\r\n]/.test(command)) fail(line, 'Verify needs a single-line command');
  const argv = [];
  let token = '', quote = null, started = false;
  const flush = () => { if (started) argv.push(token); token = ''; started = false; };
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === '\\' && quote !== "'") {
      if (i + 1 === command.length) fail(line, 'Trailing escape in Verify command');
      const next = command[i + 1];
      if (quote === '"' && !['"', '\\', '$', '`'].includes(next)) token += char;
      else { token += next; i++; }
      started = true;
    } else if (quote) {
      if (char === quote) quote = null;
      else {
        if (quote === '"' && ['$','`'].includes(char)) fail(line, 'Shell expansion is not supported; use a script or single quotes for literal text');
        token += char;
      }
    } else if (char === '"' || char === "'") {
      quote = char; started = true;
    } else if (/\s/.test(char)) flush();
    else {
      if ('|&;<>()$`'.includes(char)) fail(line, 'Shell operators/expansion are not supported; put the command in a script');
      token += char; started = true;
    }
  }
  if (quote) fail(line, 'Unclosed quote in Verify command');
  flush();
  if (!argv[0] || argv.length > 128) fail(line, 'Verify needs an executable and at most 128 arguments');
  if (/^[A-Za-z_]\w*=/.test(argv[0]) || argv[0].startsWith('~')) {
    fail(line, 'Environment assignments and tilde expansion are not supported; use a script');
  }
  return argv;
}

function codeSpan(value, line) {
  const opening = value.match(/^`+/)?.[0];
  if (!opening || !value.endsWith(opening) || value.length <= 2 * opening.length) {
    fail(line, 'Write Verify as one inline code span, for example: Verify: `npm test`');
  }
  const command = value.slice(opening.length, -opening.length).trim();
  // Reject a second Markdown code span/trailing prose masquerading as one command.
  if (command.includes(opening)) fail(line, 'Verify must contain one code span; use a longer backtick delimiter for literal backticks');
  return command;
}

// Ignore examples and comments as executable directives, preserving original line numbers.
function visibleLines(markdown) {
  let fence = null, comment = false;
  return markdown.replace(/\r\n/g, '\n').split('\n').map((raw, index, all) => {
    const line = index + 1;
    if (fence) {
      if (new RegExp('^ {0,3}' + fence.marker + '{' + fence.length + ',}[ \\t]*$').test(raw)) fence = null;
      else if (line === all.length) fail(line, 'Unclosed fenced code block');
      return '';
    }
    let visible = '', inline = null;
    for (let i = 0; i < raw.length;) {
      if (comment) {
        const end = raw.indexOf('-->', i);
        if (end < 0) break;
        comment = false; i = end + 3;
      } else if (raw[i] === '`') {
        const ticks = raw.slice(i).match(/^`+/)[0];
        if (inline === null) inline = ticks;
        else if (inline === ticks) inline = null;
        visible += ticks; i += ticks.length;
      } else if (!inline && raw.startsWith('<!--', i)) {
        comment = true; i += 4;
      } else visible += raw[i++];
    }
    const opening = visible.match(/^ {0,3}(`{3,}|~{3,})/);
    if (opening) {
      fence = { marker: opening[1][0], length: opening[1].length };
      if (line === all.length) fail(line, 'Unclosed fenced code block');
      return '';
    }
    if (line === all.length && comment) fail(line, 'Unclosed HTML comment');
    // Four-space/tab-indented code is prose, never a directive.
    return /^( {4}|\t)/.test(visible) ? '' : visible;
  });
}

export function parseSpec(markdown, feature) {
  if (typeof markdown !== 'string' || !markdown.trim()) fail(1, 'Spec must not be empty');
  let inside = false, sections = 0, current = null;
  const entries = [];
  for (const [index, raw] of visibleLines(markdown).entries()) {
    const line = index + 1;
    const heading = raw.match(/^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    if (heading) {
      const level = heading[1].length, title = heading[2].trim();
      if (level <= 2) {
        inside = level === 2 && title.toLowerCase() === 'acceptance criteria';
        current = null;
        if (inside && ++sections > 1) fail(line, 'Use one Acceptance criteria section');
      } else if (inside && level === 3) {
        if (entries.length >= 128) fail(line, 'Use at most 128 acceptance criteria');
        current = { title, line, body: [], commands: [], options: {} };
        entries.push(current);
      } else if (inside) fail(line, 'Use ### headings for each criterion; nested headings are not supported');
      continue;
    }
    const directive = raw.match(/^ {0,3}([A-Za-z][A-Za-z -]*):[ \t]*(.*)$/);
    if (directive && (inside || /^(verify|review|timeout|directory)$/i.test(directive[1]))) {
      if (!inside || !current) fail(line, 'Put directives under a ### criterion in ## Acceptance criteria');
      const key = directive[1].toLowerCase(), value = directive[2].trim();
      if (!['verify', 'review', 'timeout', 'directory'].includes(key)) {
        fail(line, 'Unknown directive "' + directive[1] + '"; use Verify, Review, Timeout, or Directory');
      }
      if (!value) fail(line, directive[1] + ' cannot be empty');
      if (key === 'verify') current.commands.push({ argv: parseCommand(codeSpan(value, line), line), line });
      else {
        if (current.options[key] !== undefined) fail(line, 'Duplicate ' + directive[1] + ' directive');
        current.options[key] = value;
      }
    } else if (inside && raw.trim()) {
      if (!current) fail(line, 'Add a ### heading for each acceptance criterion');
      current.body.push(raw.trim());
    }
  }
  if (!sections || !entries.length) fail(1, 'Add ## Acceptance criteria with at least one ### criterion');
  const titles = new Set(), checks = new Map();
  const criteria = entries.map(entry => {
    const normalized = entry.title.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
    if (titles.has(normalized)) fail(entry.line, 'Criterion titles must be unique: ' + entry.title);
    titles.add(normalized);
    const criterion = {
      id: stableId('ac-', normalized), title: entry.title,
      description: [entry.title, ...entry.body].join('\n').trim()
    };
    const { review, timeout, directory } = entry.options;
    if (review && entry.commands.length) fail(entry.line, 'Use separate criteria for Verify and Review');
    if ((timeout || directory) && !entry.commands.length) fail(entry.line, 'Timeout and Directory require a Verify command');
    if (review) return { ...criterion, manual: review };
    if (!entry.commands.length) return { ...criterion, pending: true };
    let timeoutMs = 120000;
    if (timeout) {
      const match = timeout.match(/^(\d+)(ms|s|m)$/);
      timeoutMs = match ? Number(match[1]) * ({ ms: 1, s: 1000, m: 60000 }[match[2]]) : NaN;
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) {
        fail(entry.line, 'Timeout must be 1ms to 10m, for example 30s or 2m');
      }
    }
    const cwd = directory ?? '.';
    if (path.isAbsolute(cwd) || cwd.split(/[\\/]/).includes('..') || cwd.includes('\0')) {
      fail(entry.line, 'Directory must be a relative path inside the repository');
    }
    const ids = new Set();
    for (const { argv, line } of entry.commands) {
      const id = stableId('check-', JSON.stringify({ argv, cwd, timeoutMs }));
      if (ids.has(id)) fail(line, 'Duplicate Verify command in this criterion');
      ids.add(id);
      checks.set(id, { id, argv, cwd, timeoutMs });
      if (checks.size > 64) fail(line, 'Use at most 64 distinct verification commands');
    }
    return { ...criterion, checks: [...ids] };
  });
  return { feature, state: criteria.some(c => c.pending) ? 'draft' : 'ready', criteria, checks: [...checks.values()] };
}
