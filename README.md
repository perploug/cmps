# cmps

A CLI tool that launches Docker Compose files inside [Docker AI Sandboxes (SBX)](https://docs.docker.com/ai/sandboxes/), automatically publishing the right ports so services are reachable from your host.

## Install

```bash
npm install -g @stupidhorse/cmps
```

Or run locally from the repo:

```bash
npm run build
node dist/index.js
```

or, link it

```bash
npm run build
npm link
```

## Commands

### `cmps up [file]`

Starts services defined in a Compose file, publishes their ports to the SBX sandbox, and prints a table of running services with clickable URLs.

`file` can be a local path or an OCI artifact reference:

```bash
cmps up                                      # auto-detect compose file in current directory
cmps up ./path/to/compose.yml               # explicit local file
cmps up oci://registry.example.com/app:1.0  # OCI artifact
```

**Local file — what it does:**

1. Locates the compose file (`compose.yml`, `compose.yaml`, `docker-compose.yml`, or `docker-compose.yaml`)
2. Creates an SBX sandbox (`sbx run shell <dir>`) with the compose directory mounted, if one isn't already running
3. Runs `docker compose up -d` inside the sandbox — output streams directly to your terminal
4. Queries actual running ports with `docker compose ps`
5. Publishes each port via `sbx ports <sandbox> --publish HOST:CONTAINER`
6. Saves state to `~/.cmps/state.json` so `cmps down` can clean up correctly
7. Prints the service table

**OCI artifact — what it does:**

Same flow, except the compose file is pulled directly by Docker Compose from the registry. The **current working directory** is mounted as the sandbox workspace (making `.env` files and local assets available), and the sandbox name is derived from it.

```bash
# Runs the compose stack from an OCI artifact, mounting the current directory
cmps up oci://registry.example.com/myapp:latest

# With an explicit sandbox
cmps up oci://registry.example.com/myapp:latest --sandbox my-sandbox
```

**Example output:**

```
▸ Sandbox:      shell-myapp
▸ Compose file: oci://registry.example.com/myapp:latest
[+] Running 2/2
 ✔ Container myapp-web-1  Started
 ✔ Container myapp-api-1  Started

▸ Publishing ports...
  ✓ 8080:80
  ✓ 3000:3000

✓ Services running
  Sandbox: shell-myapp

────────────────────────────────────────────────
 SERVICE   IMAGE              PORT        URL
────────────────────────────────────────────────
 web       nginx:latest       8080→80     http://localhost:8080
 api       node:18-alpine     3000→3000   http://localhost:3000
────────────────────────────────────────────────
```

### `cmps down`

Stops services and unpublishes all sandbox ports.

```bash
cmps down                        # uses sandbox recorded in state
cmps down --sandbox my-sandbox   # explicit sandbox
```

**What it does:**

1. Queries `sbx ports <sandbox>` for the live list of published ports and unpublishes them all
2. Runs `docker compose down` inside the sandbox — output streams to your terminal
3. Clears the saved state

## Sandbox lifecycle

When `cmps up` runs and no sandbox is found, it creates one automatically:

```
sbx run shell <workspace-dir>
```

The sandbox name defaults to `shell-<directory-name>` (e.g. `shell-myapp`). For OCI references, the current working directory is used as the workspace.

To use a specific existing sandbox instead:

```bash
cmps up --sandbox my-sandbox
export SANDBOX_NAME=my-sandbox  # or set permanently
```

## Sandbox name detection

`cmps` determines the sandbox name by checking these sources in order:

| Priority | Source                                                            |
| -------- | ----------------------------------------------------------------- |
| 1        | `--sandbox <name>` flag                                           |
| 2        | `SANDBOX_NAME` environment variable                               |
| 3        | `SBX_SANDBOX_NAME` environment variable                           |
| 4        | `SBX_NAME` environment variable                                   |
| 5        | Auto-detect via `sbx ls` (used if exactly one sandbox is running) |
| 6        | Derived from workspace directory: `shell-<dirname>`               |

## Compose file discovery

`cmps up` (with no file argument) searches the current directory in this order:

1. `compose.yml`
2. `compose.yaml`
3. `docker-compose.yml`
4. `docker-compose.yaml`

## Development

```bash
npm install
npm run build   # compile TypeScript → dist/
npm test        # run Jest tests
npm run dev     # run via ts-node (no build step)
```

## Requirements

- Node.js 18+
- `sbx` CLI installed and in PATH
- Docker with Compose plugin (`docker compose`) available inside the sandbox
