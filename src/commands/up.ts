import * as path from 'path';
import chalk from 'chalk';
import { findComposeFile } from '../compose/parser';
import {
  launchSandboxWithMount,
  waitForSandbox,
  runDockerCompose,
  getRunningServices,
} from '../compose/runner';
import { resolveSandboxName, publishPort, buildPublishSpec, listPublishedPorts } from '../sbx/ports';
import { displayServices } from '../utils/display';
import { saveState } from '../utils/state';

function deriveSandboxName(composeDir: string): string {
  return `shell-${path.basename(composeDir)}`;
}

export async function up(composePath?: string, sandboxOption?: string): Promise<void> {
  const isOci = composePath?.startsWith('oci://') ?? false;

  let resolvedPath: string;
  let sandboxName: string;

  // For OCI refs, mount the current working directory (gives docker compose
  // access to .env files etc. and provides the name for sandbox derivation).
  const workspaceDir = isOci ? process.cwd() : (() => {
    try {
      resolvedPath = composePath ? path.resolve(composePath) : findComposeFile();
    } catch (err: unknown) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
    return path.dirname(resolvedPath!);
  })();

  if (isOci) {
    resolvedPath = composePath!;
  }

  try {
    sandboxName = await resolveSandboxName(sandboxOption);
  } catch {
    sandboxName = deriveSandboxName(workspaceDir);
    console.log(chalk.blue(`▸ No sandbox found — creating: ${sandboxName}`));
    launchSandboxWithMount(workspaceDir);
    console.log(chalk.blue('▸ Waiting for sandbox to be ready...'));
    try {
      await waitForSandbox(sandboxName, 60_000);
    } catch (err: unknown) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  }

  console.log(chalk.blue(`▸ Sandbox:      ${sandboxName!}`));
  console.log(chalk.blue(`▸ Compose file: ${resolvedPath!}`));

  // Start services — output streams transparently via stdio: inherit
  try {
    await runDockerCompose(sandboxName!, resolvedPath!, ['up', '-d']);
  } catch (err: unknown) {
    console.error(chalk.red(`\nFailed to start services: ${(err as Error).message}`));
    process.exit(1);
  }

  // Discover actual running ports from inside the sandbox
  const services = await getRunningServices(sandboxName!, resolvedPath!);
  const _seenPorts = new Set<string>();
  const portsWithHost = services
    .flatMap((s) => s.ports)
    .filter((p) => {
      if (p.hostPort <= 0) return false;
      const key = `${p.hostPort}:${p.containerPort}`;
      if (_seenPorts.has(key)) return false;
      _seenPorts.add(key);
      return true;
    });

  // Publish ports via sbx ports, then verify via listing
  if (portsWithHost.length > 0) {
    console.log(chalk.blue('\n▸ Publishing ports...'));
    for (const port of portsWithHost) {
      const ok = await publishPort(sandboxName!, port);
      const spec = buildPublishSpec(port);
      if (ok) {
        console.log(chalk.green(`  ✓ ${spec}`));
      } else {
        console.log(chalk.yellow(`  ⚠ ${spec} — not confirmed in port listing`));
      }
    }
  }

  // Use the live port listing as the source of truth for saved state
  const confirmedPorts = await listPublishedPorts(sandboxName!);

  // Persist state for cmps down
  saveState({
    composePath: resolvedPath!,
    sandboxName: sandboxName!,
    services,
    publishedPorts: confirmedPorts,
    startedAt: new Date().toISOString(),
  });

  displayServices(services, sandboxName!);
}
