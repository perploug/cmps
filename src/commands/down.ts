import chalk from 'chalk';
import { runDockerCompose } from '../compose/runner';
import { resolveSandboxName, unpublishAllPorts, buildPublishSpec } from '../sbx/ports';
import { loadState, clearState } from '../utils/state';

export async function down(sandboxOption?: string): Promise<void> {
  const state = loadState();

  // Resolve sandbox name: explicit flag > state > env/auto-detect
  let sandboxName: string;
  try {
    sandboxName = await resolveSandboxName(sandboxOption ?? state?.sandboxName);
  } catch (err: unknown) {
    console.error(chalk.red(`Error: ${(err as Error).message}`));
    process.exit(1);
  }

  console.log(chalk.blue(`▸ Sandbox: ${sandboxName!}`));

  // Unpublish all ports currently listed for the sandbox (source of truth)
  console.log(chalk.blue('▸ Unpublishing ports...'));
  const unpublished = await unpublishAllPorts(sandboxName!);
  if (unpublished.length > 0) {
    for (const port of unpublished) {
      console.log(chalk.green(`  ✓ ${buildPublishSpec(port)}`));
    }
  } else {
    console.log(chalk.gray('  No published ports found.'));
  }

  // Stop services — output streams transparently via stdio: inherit
  console.log('');
  const composePath = state?.composePath ?? '';
  try {
    await runDockerCompose(sandboxName!, composePath, ['down']);
  } catch (err: unknown) {
    console.error(chalk.red(`\nFailed to stop services: ${(err as Error).message}`));
    process.exit(1);
  }

  clearState();
  console.log(chalk.green('\n✓ Services stopped.'));
}
