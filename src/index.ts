#!/usr/bin/env node
import { Command } from 'commander';
import { up } from './commands/up';
import { down } from './commands/down';

const program = new Command();

program
  .name('cmps')
  .description('Docker Compose launcher for Docker AI Sandboxes (SBX)')
  .version('1.0.0');

program
  .command('up [file]')
  .description(
    'Copy a compose file into the sandbox, start services, publish ports, and list URLs'
  )
  .option('-s, --sandbox <name>', 'SBX sandbox name (overrides SANDBOX_NAME env var)')
  .action(async (file: string | undefined, opts: { sandbox?: string }) => {
    await up(file, opts.sandbox);
  });

program
  .command('down')
  .description('Stop services, unpublish sandbox ports, and clean up')
  .option('-s, --sandbox <name>', 'SBX sandbox name (overrides SANDBOX_NAME env var)')
  .action(async (opts: { sandbox?: string }) => {
    await down(opts.sandbox);
  });

program.parse();
