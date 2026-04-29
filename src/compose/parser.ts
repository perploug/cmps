import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ParsedPortMapping {
  hostPort?: number;
  containerPort: number;
  protocol: 'tcp' | 'udp';
}

export interface ParsedService {
  name: string;
  image?: string;
  build?: string | object;
  ports: ParsedPortMapping[];
}

export interface ParsedCompose {
  services: ParsedService[];
  filePath: string;
}

const COMPOSE_FILE_NAMES = [
  'compose.yml',
  'compose.yaml',
  'docker-compose.yml',
  'docker-compose.yaml',
];

export function findComposeFile(dir: string = process.cwd()): string {
  for (const name of COMPOSE_FILE_NAMES) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No compose file found in ${dir}.\nLooked for: ${COMPOSE_FILE_NAMES.join(', ')}`
  );
}

export function parsePortString(port: string | number | object): ParsedPortMapping | null {
  if (typeof port === 'number') {
    return { containerPort: port, protocol: 'tcp' };
  }

  if (typeof port === 'object' && port !== null) {
    const p = port as Record<string, unknown>;
    if (!p.target) return null;
    return {
      hostPort: p.published !== undefined ? Number(p.published) : undefined,
      containerPort: Number(p.target),
      protocol: p.protocol === 'udp' ? 'udp' : 'tcp',
    };
  }

  if (typeof port === 'string') {
    const [portPart, rawProto] = port.split('/');
    const protocol: 'tcp' | 'udp' = rawProto === 'udp' ? 'udp' : 'tcp';
    const parts = portPart.split(':');
    const containerPort = parseInt(parts[parts.length - 1], 10);
    if (isNaN(containerPort)) return null;

    if (parts.length === 1) {
      return { containerPort, protocol };
    }
    // Handles both "HOST:CONTAINER" and "IP:HOST:CONTAINER"
    const hostPort = parseInt(parts[parts.length - 2], 10);
    return {
      hostPort: isNaN(hostPort) ? undefined : hostPort,
      containerPort,
      protocol,
    };
  }

  return null;
}

export function parseComposeFile(filePath: string): ParsedCompose {
  const absPath = path.resolve(filePath);
  const content = fs.readFileSync(absPath, 'utf-8');
  const raw = yaml.load(content) as Record<string, unknown>;

  if (!raw?.services || typeof raw.services !== 'object') {
    return { services: [], filePath: absPath };
  }

  const services: ParsedService[] = Object.entries(
    raw.services as Record<string, unknown>
  ).map(([name, cfg]) => {
    const config = cfg as Record<string, unknown> | null;
    const ports: ParsedPortMapping[] = [];

    if (Array.isArray(config?.ports)) {
      for (const p of config.ports) {
        const mapping = parsePortString(p as string | number | object);
        if (mapping) ports.push(mapping);
      }
    }

    return {
      name,
      image: typeof config?.image === 'string' ? config.image : undefined,
      build: config?.build as string | object | undefined,
      ports,
    };
  });

  return { services, filePath: absPath };
}
