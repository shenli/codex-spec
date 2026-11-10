import { Lexer, type Token, type Tokens } from 'marked';
import { parse as shellParse } from 'shell-quote';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Feature, SpecError, type Spec, type Criterion, type Check } from './model.js';

export const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const id = (prefix: string, value: string): string => prefix + hash(value).slice(0, 20);
const plain = (tokens: Token[]): string => tokens.map(t => {
  if (t.type === 'html') return '';
  if ('tokens' in t && Array.isArray(t.tokens)) return plain(t.tokens as Token[]);
  if ('text' in t && typeof t.text === 'string') return t.text;
  return t.raw;
}).join('');
function commandArgs(command: string, line: number): string[] {
  if (!command.trim() || /[\0\r\n]/.test(command)) throw new SpecError('Use a single-line command', line);
  // shell-quote tolerates unfinished quotes; a contract must not.
  let quote = '', escaped = false;
  for (const ch of command) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && quote !== "'") { escaped = true; continue; }
    if (ch === '`' && quote !== "'") throw new SpecError('Command substitution is not supported', line);
    if (quote) { if (ch === quote) quote = ''; }
    else if (ch === "'" || ch === '"') quote = ch;
  }
  if (quote || escaped) throw new SpecError('Unclosed quote or trailing escape in command', line);
  let parts: ReturnType<typeof shellParse>;
  try {
    parts = shellParse(command, () => { throw new Error('Environment expansion is not supported'); });
  } catch (error) {
    throw new SpecError(String(error instanceof Error ? error.message : error), line);
  }
  if (!parts.length || parts.some(p => typeof p !== 'string')) {
    throw new SpecError('Use one executable command; put pipes, globs, and shell operators in a script', line);
  }
  const argv = parts as string[];
  if (!argv[0] || argv.length > 128 || /^[A-Za-z_]\w*=/.test(argv[0]) || argv[0].startsWith('~')) {
    throw new SpecError('Use an executable with arguments; put environment setup in a script', line);
  }
  return argv;
}
interface Draft {
  title: string; line: number; body: string[]; commands: { command: string; argv: string[] }[];
  review: string | null; cwd: string; timeoutMs: number; options: Set<string>;
}
export function parseSpec(source: string, feature: string): Spec {
  Feature.parse(feature);
  if (Buffer.byteLength(source) > 1024 * 1024) throw new SpecError('Spec exceeds 1 MiB');
  const markdown = source.replace(/\r\n/g, '\n');
  const tokens = Lexer.lex(markdown, { gfm: true });
  let inside = false, sections = 0, current: Draft | null = null, title = feature, offset = 0;
  const drafts: Draft[] = [];
  function body(token: Token, line: number): void {
    if (token.type === 'code' || token.type === 'html' || token.type === 'blockquote') return;
    if (token.type === 'list') {
      for (const item of (token as Tokens.List).items) for (const child of item.tokens) body(child, line);
      return;
    }
    if (!('text' in token) || typeof token.text !== 'string') return;
    for (const [i, raw] of token.text.split('\n').entries()) {
      const inline = Lexer.lexInline(raw), readable = plain(inline).trim();
      const match = readable.match(/^([A-Za-z][A-Za-z -]*):\s*(.*)$/);
      const label = match?.[1]?.toLowerCase();
      const reserved = label !== undefined && ['verify', 'review', 'directory', 'timeout'].includes(label);
      if (!inside) {
        if (reserved) throw new SpecError('Put checks under a criterion in ## Acceptance criteria', line + i);
        continue;
      }
      if (!current) {
        if (readable) throw new SpecError('Give each criterion a ### heading', line + i);
        continue;
      }
      if (!match || ['given', 'when', 'then', 'note', 'notes'].includes(label ?? '')) {
        if (readable) current.body.push(raw);
        continue;
      }
      if (!reserved) throw new SpecError('Unknown directive "' + match[1] + '"; use Verify, Review, Directory, or Timeout', line + i);
      const value = match[2]?.trim() ?? '';
      if (!value) throw new SpecError(match[1] + ' cannot be empty', line + i);
      if (label === 'verify') {
        const code = inline.filter(t => t.type === 'codespan') as Tokens.Codespan[];
        const others = inline.filter(t => t.type !== 'codespan');
        if (code.length !== 1 || plain(others).trim().toLowerCase() !== 'verify:') {
          throw new SpecError('Write Verify: followed by one inline-code command', line + i);
        }
        current.commands.push({ command: code[0]!.text, argv: commandArgs(code[0]!.text, line + i) });
      } else {
        if (current.options.has(label!)) throw new SpecError('Duplicate ' + match[1], line + i);
        current.options.add(label!);
        if (label === 'review') current.review = value;
        if (label === 'directory') {
          if (path.isAbsolute(value) || value.split(/[\\/]/).includes('..') || value.includes('\0')) {
            throw new SpecError('Directory must stay inside the repository', line + i);
          }
          current.cwd = value;
        }
        if (label === 'timeout') {
          const duration = value.match(/^(\d+)(ms|s|m)$/);
          const ms = duration ? Number(duration[1]) * ({ ms: 1, s: 1000, m: 60000 }[duration[2] as 'ms' | 's' | 'm']) : NaN;
          if (!Number.isInteger(ms) || ms < 1 || ms > 600000) throw new SpecError('Timeout must be 1ms to 10m', line + i);
          current.timeoutMs = ms;
        }
      }
    }
  }
  for (const token of tokens) {
    const start = markdown.indexOf(token.raw, offset);
    if (start >= 0) offset = start;
    const line = markdown.slice(0, offset).split('\n').length;
    offset += token.raw.length;
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading, text = plain(heading.tokens).trim();
      if (heading.depth === 1) title = text;
      if (heading.depth <= 2) {
        inside = heading.depth === 2 && /^acceptance(?: criteria)?$/i.test(text);
        current = null;
        if (inside && ++sections > 1) throw new SpecError('Use one Acceptance criteria section', line);
      } else if (inside && heading.depth === 3) {
        if (!text) throw new SpecError('Criterion needs a title', line);
        current = { title: text, line, body: [], commands: [], review: null, cwd: '.', timeoutMs: 120000, options: new Set() };
        drafts.push(current);
      } else if (inside && current) current.body.push(token.raw.trim());
    } else body(token, line);
  }
  if (!sections || !drafts.length) throw new SpecError('Add ## Acceptance criteria with ### headings for the outcomes you need');
  if (drafts.length > 128) throw new SpecError('Use at most 128 criteria');
  const titles = new Set<string>(), checks = new Map<string, Check>();
  const criteria: Criterion[] = drafts.map(d => {
    const normalized = d.title.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
    if (titles.has(normalized)) throw new SpecError('Criterion titles must be unique', d.line);
    titles.add(normalized);
    if (!d.commands.length && (d.options.has('directory') || d.options.has('timeout'))) {
      throw new SpecError('Directory and Timeout require a Verify command', d.line);
    }
    const refs = new Set<string>();
    for (const c of d.commands) {
      const checkId = id('check-', JSON.stringify([c.argv, d.cwd, d.timeoutMs]));
      checks.set(checkId, { id: checkId, command: c.command, argv: c.argv, cwd: d.cwd, timeoutMs: d.timeoutMs });
      refs.add(checkId);
    }
    return { id: id('ac-', normalized), title: d.title, description: d.body.join('\n').trim(),
      line: d.line, checks: [...refs], review: d.review };
  });
  if (checks.size > 64) throw new SpecError('Use at most 64 distinct checks');
  return { feature, title, hash: hash(source), criteria, checks: [...checks.values()] };
}
