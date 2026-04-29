import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { PortMapping } from '../types';

const execAsync = promisify(exec);

export function buildPublishSpec(port: PortMapping): string {
  const base = `${port.hostPort}:${port.containerPort}`;
  return port.protocol === 'udp' ? `${base}/udp` : base;
}

// Parse the output of `sbx ports <sandbox>` into PortMappings.
// Tries arrow format first (0.0.0.0:8080->80/tcp), then colon format (8080:80).
export function parsePortsListing(output: string): PortMapping[] {
  const ports: PortMapping[] = [];
  for (const line of output.trim().split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Arrow format: [IP:]HOST->CONTAINER[/PROTOCOL]
    let match = trimmed.match(/(\d+)->(\d+)(?:\/(tcp|udp))?/);
    if (match) {
      ports.push({
        hostPort: parseInt(match[1], 10),
        containerPort: parseInt(match[2], 10),
        protocol: (match[3] as 'tcp' | 'udp') ?? 'tcp',
      });
      continue;
    }

    // Colon format: HOST:CONTAINER[/PROTOCOL]
    // Negative lookbehind on [.\d] prevents matching IP octets (e.g. 0.0.0.0:8080)
    match = trimmed.match(/(?<![.\d])(\d+):(\d+)(?:\/(tcp|udp))?/);
    if (match) {
      ports.push({
        hostPort: parseInt(match[1], 10),
        containerPort: parseInt(match[2], 10),
        protocol: (match[3] as 'tcp' | 'udp') ?? 'tcp',
      });
    }
  }
  return ports;
}

// List all ports currently published for a sandbox.
export async function listPublishedPorts(sandboxName: string): Promise<PortMapping[]> {
  try {
    const { stdout } = await execAsync(`sbx ports ${sandboxName}`);
    return parsePortsListing(stdout);
  } catch {
    return [];
  }
}

// Try to auto-detect a single running sandbox from `sbx ls`.
async function autoDetectSandbox(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('sbx ls');
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return null;

    const sandboxes = lines
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.split(/\s+/)[0]);

    if (sandboxes.length === 1) return sandboxes[0];
    return null;
  } catch {
    return null;
  }
}

// Resolve sandbox name from: explicit flag → env vars → sbx ls auto-detect.
export async function resolveSandboxName(explicit?: string): Promise<string> {
  if (explicit?.trim()) return explicit.trim();

  for (const key of ['SANDBOX_NAME', 'SBX_SANDBOX_NAME', 'SBX_NAME']) {
    const val = process.env[key]?.trim();
    if (val) return val;
  }

  const detected = await autoDetectSandbox();
  if (detected) {
    console.log(chalk.blue(`▸ Auto-detected sandbox: ${detected}`));
    return detected;
  }

  throw new Error(
    'Could not determine sandbox name.\n' +
      'Pass --sandbox <name> or set the SANDBOX_NAME environment variable.'
  );
}

// Publish a port and verify it appears in `sbx ports <sandbox>`.
export async function publishPort(
  sandboxName: string,
  port: PortMapping
): Promise<boolean> {
  const spec = buildPublishSpec(port);
  try {
    await execAsync(`sbx ports ${sandboxName} --publish ${spec}`);
  } catch {
    return false;
  }
  // Verify the port is actually listed
  const listed = await listPublishedPorts(sandboxName);
  return listed.some(
    (p) => p.hostPort === port.hostPort && p.containerPort === port.containerPort
  );
}

// Unpublish all ports currently listed for a sandbox.
// Uses the live listing rather than saved state so it's always accurate.
export async function unpublishAllPorts(sandboxName: string): Promise<PortMapping[]> {
  const listed = await listPublishedPorts(sandboxName);
  const unpublished: PortMapping[] = [];
  for (const port of listed) {
    try {
      await execAsync(`sbx ports ${sandboxName} --unpublish ${buildPublishSpec(port)}`);
      unpublished.push(port);
    } catch {
      // best-effort
    }
  }
  return unpublished;
}
