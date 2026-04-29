import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parsePortString, parseComposeFile, findComposeFile } from '../../src/compose/parser';

describe('parsePortString', () => {
  it('parses a bare numeric port', () => {
    expect(parsePortString(80)).toEqual({ containerPort: 80, protocol: 'tcp' });
  });

  it('parses "HOST:CONTAINER" string', () => {
    expect(parsePortString('8080:80')).toEqual({
      hostPort: 8080,
      containerPort: 80,
      protocol: 'tcp',
    });
  });

  it('parses container-only string', () => {
    expect(parsePortString('80')).toEqual({ containerPort: 80, protocol: 'tcp' });
  });

  it('parses "HOST:CONTAINER/tcp" string', () => {
    expect(parsePortString('8080:80/tcp')).toEqual({
      hostPort: 8080,
      containerPort: 80,
      protocol: 'tcp',
    });
  });

  it('parses udp protocol', () => {
    expect(parsePortString('5353:53/udp')).toEqual({
      hostPort: 5353,
      containerPort: 53,
      protocol: 'udp',
    });
  });

  it('parses "IP:HOST:CONTAINER" format (ignores IP)', () => {
    expect(parsePortString('127.0.0.1:8080:80')).toEqual({
      hostPort: 8080,
      containerPort: 80,
      protocol: 'tcp',
    });
  });

  it('parses long-form object with published port', () => {
    expect(parsePortString({ target: 80, published: 8080, protocol: 'tcp' })).toEqual({
      hostPort: 8080,
      containerPort: 80,
      protocol: 'tcp',
    });
  });

  it('parses long-form object without published port', () => {
    expect(parsePortString({ target: 80 })).toEqual({
      hostPort: undefined,
      containerPort: 80,
      protocol: 'tcp',
    });
  });

  it('parses long-form object with udp', () => {
    expect(parsePortString({ target: 53, published: 53, protocol: 'udp' })).toEqual({
      hostPort: 53,
      containerPort: 53,
      protocol: 'udp',
    });
  });

  it('returns null for object without target', () => {
    expect(parsePortString({ published: 8080 })).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────

describe('parseComposeFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmps-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses services with string ports', () => {
    const content = `
services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
  api:
    image: node:18-alpine
    ports:
      - "3000:3000"
`;
    const filePath = path.join(tmpDir, 'docker-compose.yml');
    fs.writeFileSync(filePath, content);

    const result = parseComposeFile(filePath);
    expect(result.services).toHaveLength(2);

    const web = result.services.find((s) => s.name === 'web')!;
    expect(web.image).toBe('nginx:latest');
    expect(web.ports).toEqual([{ hostPort: 8080, containerPort: 80, protocol: 'tcp' }]);

    const api = result.services.find((s) => s.name === 'api')!;
    expect(api.ports).toEqual([
      { hostPort: 3000, containerPort: 3000, protocol: 'tcp' },
    ]);
  });

  it('parses services with long-form ports', () => {
    const content = `
services:
  web:
    image: nginx
    ports:
      - target: 80
        published: 8080
        protocol: tcp
`;
    const filePath = path.join(tmpDir, 'compose.yml');
    fs.writeFileSync(filePath, content);

    const result = parseComposeFile(filePath);
    expect(result.services[0].ports).toEqual([
      { hostPort: 8080, containerPort: 80, protocol: 'tcp' },
    ]);
  });

  it('handles services without ports', () => {
    const content = `
services:
  db:
    image: postgres:15
`;
    const filePath = path.join(tmpDir, 'compose.yml');
    fs.writeFileSync(filePath, content);

    const result = parseComposeFile(filePath);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].ports).toEqual([]);
  });

  it('handles build-only services (no image)', () => {
    const content = `
services:
  app:
    build: .
    ports:
      - "8080:8080"
`;
    const filePath = path.join(tmpDir, 'compose.yml');
    fs.writeFileSync(filePath, content);

    const result = parseComposeFile(filePath);
    expect(result.services[0].image).toBeUndefined();
    expect(result.services[0].ports).toHaveLength(1);
  });

  it('returns empty services for empty file', () => {
    const filePath = path.join(tmpDir, 'compose.yml');
    fs.writeFileSync(filePath, 'services: {}');

    const result = parseComposeFile(filePath);
    expect(result.services).toEqual([]);
  });

  it('returns empty services when services key is missing', () => {
    const filePath = path.join(tmpDir, 'compose.yml');
    fs.writeFileSync(filePath, 'version: "3"');

    const result = parseComposeFile(filePath);
    expect(result.services).toEqual([]);
  });

  it('preserves the absolute file path in result', () => {
    const filePath = path.join(tmpDir, 'compose.yml');
    fs.writeFileSync(filePath, 'services: {}');

    const result = parseComposeFile(filePath);
    expect(path.isAbsolute(result.filePath)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────

describe('findComposeFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmps-find-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds docker-compose.yml', () => {
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.yml'), 'services: {}');
    expect(findComposeFile(tmpDir)).toBe(path.join(tmpDir, 'docker-compose.yml'));
  });

  it('finds compose.yml', () => {
    fs.writeFileSync(path.join(tmpDir, 'compose.yml'), 'services: {}');
    expect(findComposeFile(tmpDir)).toBe(path.join(tmpDir, 'compose.yml'));
  });

  it('finds docker-compose.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.yaml'), 'services: {}');
    expect(findComposeFile(tmpDir)).toBe(path.join(tmpDir, 'docker-compose.yaml'));
  });

  it('finds compose.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'compose.yaml'), 'services: {}');
    expect(findComposeFile(tmpDir)).toBe(path.join(tmpDir, 'compose.yaml'));
  });

  it('prefers compose.yml over docker-compose.yml (first match wins)', () => {
    fs.writeFileSync(path.join(tmpDir, 'compose.yml'), 'services: {}');
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.yml'), 'services: {}');
    expect(findComposeFile(tmpDir)).toBe(path.join(tmpDir, 'compose.yml'));
  });

  it('throws when no compose file is present', () => {
    expect(() => findComposeFile(tmpDir)).toThrow('No compose file found');
  });
});
