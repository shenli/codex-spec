#!/usr/bin/env node
import { createSpec } from './lib/contract.mjs';
import { repositoryRoot } from './lib/workspace.mjs';
import { verify, status, exitCodeFor, VERSION } from './lib/workflow.mjs';

const help = `codex-spec — spec contracts and verification evidence

  spec <feature-slug> <intent>   Scaffold a draft contract; never overwrite
  verify <feature-slug>         Run reviewed acceptance checks, write evidence.json
  status <feature-slug>         Validate evidence against the current workspace
  --version                     Print version
  --help                        Show help

Run from a Git working tree. Node.js >=22; verify requires macOS/Linux.
verify/status print JSON. Exit: 0 verified, 1 not verified, 2 invalid/error.
Implementation runs in Codex using $spec-driven-development.
`;

async function main(args) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
      console.log(help); return;
    }
    if (args.length === 1 && args[0] === '--version') { console.log(VERSION); return; }
    const [command, feature, ...rest] = args;
    if (!['spec', 'verify', 'status'].includes(command)) {
      throw new Error('Unknown command: ' + command + '. See --help');
    }
    if (!feature || (command === 'spec' ? rest.length !== 1 : rest.length !== 0)) {
      throw new Error('Invalid arguments. Quote the intent as one argument; see --help');
    }
    const root = await repositoryRoot();
    if (command === 'spec') {
      const directory = await createSpec(root, feature, rest[0]);
      console.log(JSON.stringify({ feature, status: 'draft', directory }, null, 2));
    } else {
      const result = command === 'verify' ? await verify(root, feature, { signal: controller.signal }) : await status(root, feature);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = exitCodeFor(result.status);
    }
  } catch (error) {
    console.error(JSON.stringify({ status: 'invalid', reason: error.message }));
    process.exitCode = 2;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
await main(process.argv.slice(2));
