import { buildPublishSpec, parsePortsListing, resolveSandboxName } from '../../src/sbx/ports';
import { PortMapping } from '../../src/types';

describe('buildPublishSpec', () => {
  it('builds a tcp spec without /tcp suffix', () => {
    const port: PortMapping = { hostPort: 8080, containerPort: 80, protocol: 'tcp' };
    expect(buildPublishSpec(port)).toBe('8080:80');
  });

  it('builds a udp spec with /udp suffix', () => {
    const port: PortMapping = { hostPort: 5353, containerPort: 53, protocol: 'udp' };
    expect(buildPublishSpec(port)).toBe('5353:53/udp');
  });

  it('matches the sbx ports --publish argument format for tcp', () => {
    const port: PortMapping = { hostPort: 3000, containerPort: 3000, protocol: 'tcp' };
    expect(`sbx ports my-sandbox --publish ${buildPublishSpec(port)}`).toBe(
      'sbx ports my-sandbox --publish 3000:3000'
    );
  });

  it('handles high port numbers', () => {
    const port: PortMapping = { hostPort: 65535, containerPort: 65535, protocol: 'tcp' };
    expect(buildPublishSpec(port)).toBe('65535:65535');
  });
});

// ──────────────────────────────────────────────────────────────

describe('parsePortsListing', () => {
  it('parses simple HOST:CONTAINER lines', () => {
    expect(parsePortsListing('8080:80\n3000:3000')).toEqual([
      { hostPort: 8080, containerPort: 80, protocol: 'tcp' },
      { hostPort: 3000, containerPort: 3000, protocol: 'tcp' },
    ]);
  });

  it('parses lines with /tcp suffix', () => {
    expect(parsePortsListing('8080:80/tcp')).toEqual([
      { hostPort: 8080, containerPort: 80, protocol: 'tcp' },
    ]);
  });

  it('parses lines with /udp suffix', () => {
    expect(parsePortsListing('5353:53/udp')).toEqual([
      { hostPort: 5353, containerPort: 53, protocol: 'udp' },
    ]);
  });

  it('parses Docker-style 0.0.0.0:HOST->CONTAINER/tcp lines', () => {
    expect(parsePortsListing('0.0.0.0:8080->80/tcp')).toEqual([
      { hostPort: 8080, containerPort: 80, protocol: 'tcp' },
    ]);
  });

  it('ignores blank lines and headers', () => {
    const input = `SANDBOX   HOST_PORT   CONTAINER_PORT\n\n8080:80\n`;
    const result = parsePortsListing(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ hostPort: 8080, containerPort: 80, protocol: 'tcp' });
  });

  it('returns empty array for empty output', () => {
    expect(parsePortsListing('')).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────

describe('resolveSandboxName', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  });

  it('returns the explicit argument immediately', async () => {
    const name = await resolveSandboxName('my-explicit-sandbox');
    expect(name).toBe('my-explicit-sandbox');
  });

  it('trims whitespace from the explicit argument', async () => {
    const name = await resolveSandboxName('  trimmed-sandbox  ');
    expect(name).toBe('trimmed-sandbox');
  });

  it('returns SANDBOX_NAME env var when no explicit arg', async () => {
    process.env.SANDBOX_NAME = 'env-sandbox';
    delete process.env.SBX_SANDBOX_NAME;
    delete process.env.SBX_NAME;

    const name = await resolveSandboxName();
    expect(name).toBe('env-sandbox');
  });

  it('returns SBX_SANDBOX_NAME when SANDBOX_NAME is unset', async () => {
    delete process.env.SANDBOX_NAME;
    process.env.SBX_SANDBOX_NAME = 'sbx-name';
    delete process.env.SBX_NAME;

    const name = await resolveSandboxName();
    expect(name).toBe('sbx-name');
  });

  it('returns SBX_NAME as the last env fallback', async () => {
    delete process.env.SANDBOX_NAME;
    delete process.env.SBX_SANDBOX_NAME;
    process.env.SBX_NAME = 'sxb-fallback';

    const name = await resolveSandboxName();
    expect(name).toBe('sxb-fallback');
  });

  it('explicit argument takes priority over env vars', async () => {
    process.env.SANDBOX_NAME = 'env-sandbox';
    const name = await resolveSandboxName('explicit-wins');
    expect(name).toBe('explicit-wins');
  });
});
