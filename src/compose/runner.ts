import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { ServiceInfo, PortMapping } from '../types';

const execAsync = promisify(exec);

// Launch a sandbox with the workspace directory mounted, then return immediately.
// sbx run blocks (it attaches), so we spawn it detached and unref it.
// The workspace appears inside the sandbox at its original absolute host path.
export function launchSandboxWithMount(workspaceDir: string): void {
  const proc = spawn('sbx', ['run', 'shell', workspaceDir], {
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  proc.unref();
}

// Poll sbx ls until the sandbox name appears (or timeout).
export async function waitForSandbox(
  sandboxName: string,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execAsync('sbx ls');
      if (stdout.includes(sandboxName)) return;
    } catch {
      // sbx ls not available yet — keep waiting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Sandbox "${sandboxName}" did not become ready within ${timeoutMs / 1000}s`
  );
}

// Run a command inside the sandbox, streaming all output to the host terminal.
// Pass tty: true to allocate a pseudo-TTY so programs like docker compose
// use their compact line-overwriting progress display instead of plain output.
export function sbxExec(
  sandboxName: string,
  args: string[],
  options: { tty?: boolean } = {}
): Promise<void> {
  const flags = options.tty ? ['-t'] : [];
  return new Promise((resolve, reject) => {
    const proc = spawn('sbx', ['exec', ...flags, sandboxName, ...args], { stdio: 'inherit' });
    proc.on('error', (err) => reject(new Error(`sbx exec failed: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`sbx exec exited with code ${code}`));
    });
  });
}

// Run a command inside the sandbox and capture its stdout.
export function sbxExecCapture(sandboxName: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('sbx', ['exec', sandboxName, ...args], {
      stdio: ['inherit', 'pipe', 'inherit'],
    });
    let stdout = '';
    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`sbx exec exited with code ${code}`));
    });
  });
}

// Run docker compose inside the sandbox using the original compose file path.
// Because sbx run mounts the workspace at its absolute host path, the path
// is identical inside the sandbox — no copying or remapping needed.
export function runDockerCompose(
  sandboxName: string,
  composePath: string,
  args: string[]
): Promise<void> {
  return sbxExec(sandboxName, ['docker', 'compose', '-f', composePath, ...args], { tty: true });
}

interface ComposeContainer {
  Service: string;
  Image?: string;
  State: string;
  Publishers?: Array<{
    TargetPort: number;
    PublishedPort: number;
    Protocol: string;
  }>;
}

function parseContainerJson(raw: unknown): ServiceInfo | null {
  const c = raw as ComposeContainer;
  if (!c?.Service) return null;

  // Docker binds each port to both 0.0.0.0 (IPv4) and :: (IPv6), producing
  // duplicate Publishers entries for the same logical port. Deduplicate by
  // hostPort:containerPort so each mapping only appears once.
  const seen = new Set<string>();
  const ports: PortMapping[] = [];
  for (const p of c.Publishers ?? []) {
    if (p.PublishedPort <= 0) continue;
    const key = `${p.PublishedPort}:${p.TargetPort}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ports.push({
      hostPort: p.PublishedPort,
      containerPort: p.TargetPort,
      protocol: p.Protocol === 'udp' ? 'udp' : 'tcp',
    });
  }

  return { name: c.Service, image: c.Image ?? '', state: c.State, ports };
}

// Query running services and their actual port bindings from inside the sandbox.
export async function getRunningServices(
  sandboxName: string,
  composePath: string
): Promise<ServiceInfo[]> {
  try {
    const stdout = await sbxExecCapture(sandboxName, [
      'docker', 'compose', '-f', composePath, 'ps', '--format', 'json',
    ]);

    const byService = new Map<string, ServiceInfo>();
    for (const line of stdout.trim().split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const svc = parseContainerJson(item);
          if (!svc) continue;
          const existing = byService.get(svc.name);
          if (existing) {
            // Merge ports, avoiding duplicates
            for (const port of svc.ports) {
              const already = existing.ports.some(
                (p) => p.hostPort === port.hostPort && p.containerPort === port.containerPort
              );
              if (!already) existing.ports.push(port);
            }
          } else {
            byService.set(svc.name, svc);
          }
        }
      } catch {
        // skip unparseable lines
      }
    }
    return [...byService.values()];
  } catch {
    return [];
  }
}
