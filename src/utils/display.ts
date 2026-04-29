import chalk from 'chalk';
import { ServiceInfo } from '../types';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[mGKHF]/g, '');
}

function padEnd(str: string, width: number, visibleLen?: number): string {
  const visible = visibleLen ?? stripAnsi(str).length;
  return str + ' '.repeat(Math.max(0, width - visible));
}

interface TableRow {
  service: string;
  image: string;
  port: string;
  url: string;
}

export function displayServices(services: ServiceInfo[], sandboxName: string): void {
  const seenRows = new Set<string>();
  const rows: TableRow[] = services.flatMap((s) => {
    const published = s.ports.filter((p) => p.hostPort > 0);
    if (published.length === 0) return [];
    return published
      .map((p) => ({
        service: s.name,
        image: s.image || '—',
        port: `${p.hostPort}→${p.containerPort}`,
        url: chalk.cyan(`http://localhost:${p.hostPort}`),
      }))
      .filter((row) => {
        const key = `${row.service}|${row.port}`;
        if (seenRows.has(key)) return false;
        seenRows.add(key);
        return true;
      });
  });

  if (rows.length === 0) {
    console.log(chalk.yellow('\nNo services found.'));
    return;
  }

  const headers = ['SERVICE', 'IMAGE', 'PORT', 'URL'];
  const cols = [
    Math.max(headers[0].length, ...rows.map((r) => r.service.length)),
    Math.max(headers[1].length, ...rows.map((r) => r.image.length)),
    Math.max(headers[2].length, ...rows.map((r) => r.port.length)),
    Math.max(headers[3].length, ...rows.map((r) => stripAnsi(r.url).length)),
  ];

  const totalWidth = cols.reduce((sum, w) => sum + w + 3, 1);
  const sep = chalk.gray('─'.repeat(totalWidth));

  console.log('');
  console.log(chalk.bold.green('✓ Services running'));
  if (sandboxName) {
    console.log(chalk.gray(`  Sandbox: ${sandboxName}`));
  }
  console.log('');

  console.log(sep);
  console.log(
    chalk.bold(
      ` ${padEnd(headers[0], cols[0])}   ${padEnd(headers[1], cols[1])}   ${padEnd(headers[2], cols[2])}   ${headers[3]}`
    )
  );
  console.log(sep);

  for (const row of rows) {
    const urlVisible = stripAnsi(row.url).length;
    console.log(
      ` ${padEnd(row.service, cols[0])}   ${padEnd(row.image, cols[1])}   ${padEnd(row.port, cols[2])}   ${padEnd(row.url, cols[3], urlVisible)}`
    );
  }

  console.log(sep);
  console.log('');
}
