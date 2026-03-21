# PackMaster — Architecture

*Last updated: 2026-03-21 by Doc Night (Sonnet 4.6)*

---

## Purpose

PackMaster is a native Unraid plugin for Docker Compose stack management. It is the first public product from Wolf Enterprises — and simultaneously the internal deployment control plane for the entire Wolf ecosystem on BigRed.

**Two audiences:**
1. **Unraid community** — installs via Community Apps or `.plg` URL; manages their own Compose stacks through a modern React UI inside Unraid's Docker menu
2. **Wolf ecosystem** — `brain deploy <repo>` on Archy calls PackMaster's standalone API on BigRed:9444 to control stacks programmatically

The same codebase serves both. The standalone API server (`rc.packmaster-api`) is the seam that separates "user clicking buttons" from "OPUS deploying code."

---

## Why PackMaster Exists

The Unraid community has had two options for Docker Compose management since 2015:

- **Docker Compose Manager (DCM):** Native but dated. Only recognizes `docker-compose.yml` (not `compose.yaml`). No editor, no live logs, no discovery. Development stalled.
- **Dockge:** Beautiful UI, but runs as a container managing containers. When Docker breaks, your management tool breaks. Containers don't auto-start reliably after Unraid reboots. Stale as of March 2025.

PackMaster is native PHP running on the Unraid host with root access to the Docker socket. It cannot go down with what it manages. Modern React UI. First-class Unraid citizen.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | PHP 8 (native on Unraid Slackware — no Node/Python runtime available) |
| Frontend | React 19, TypeScript 5.9, Vite 7 |
| UI Components | Tailwind CSS v4, CodeMirror 6 (YAML + .env editing) |
| Data Fetching | TanStack Query v5 (5s polling, optimistic mutations) |
| Dev Tools | ESLint, Knip, Vitest, TypeScript strict mode |
| Build | Vite SPA → `.txz` Slackware package → `.plg` installer |
| Distribution | GitHub Releases (`.txz`) + GitHub main branch (`.plg`) |

---

## Repository Layout

```
packmaster/
├── frontend/                  # React SPA (built on Archy)
│   ├── src/
│   │   ├── App.tsx            # Root — view state router
│   │   ├── components/        # 10 view components
│   │   │   ├── dashboard.tsx       # Stack grid with search/sort
│   │   │   ├── stack-card.tsx      # Per-stack card with status + actions
│   │   │   ├── stack-detail.tsx    # Container list + action buttons
│   │   │   ├── stack-discovery.tsx # Directory scan + bulk register
│   │   │   ├── compose-editor.tsx  # CodeMirror YAML editor
│   │   │   ├── env-editor.tsx      # CodeMirror .env editor
│   │   │   ├── log-viewer.tsx      # SSE log stream with per-container filter
│   │   │   ├── confirm-dialog.tsx  # Destructive action gate
│   │   │   ├── error-boundary.tsx  # React error boundary
│   │   │   └── toast.tsx           # Toast notification system
│   │   └── lib/
│   │       ├── api.ts         # HTTP client (GET/POST wrappers, CSRF handling)
│   │       ├── hooks.ts       # TanStack Query hooks (useStacks, useStack, etc.)
│   │       ├── types.ts       # TypeScript types for all API responses
│   │       └── utils.ts       # Shared utilities
│   └── package.json
│
├── plugin/
│   ├── packmaster.plg.template  # Unraid plugin XML template (version/SHA256 substituted by build.sh)
│   └── src/                     # Files that land on the Unraid host inside the .txz
│       ├── etc/rc.d/rc.packmaster-api   # Init script for standalone API server
│       └── usr/local/emhttp/plugins/packmaster/
│           ├── api.php                  # Main API handler — all 21 endpoints
│           ├── router.php               # Standalone server router (port 9444)
│           ├── includes/helpers.php     # All business logic functions
│           ├── default.cfg              # Default configuration values
│           ├── packmaster.page          # Unraid Docker menu entry (iframe)
│           ├── packmaster.utilities.page # Unraid Settings > Utilities page (PHP form)
│           ├── icon.png                 # Plugin icon
│           └── app/                    # Built React SPA (Vite dist — copied by build.sh)
│
├── build.sh       # 6-step build: frontend → .txz → SHA256 → .plg
├── VISION.md      # Product rationale, competitive analysis, release phases, hard-won lessons
├── ARCHITECTURE.md  # This file
└── packmaster-YYYY.MM.DD*.txz  # Built packages (not committed — working artifacts)
```

---

## How It Works

### Request Flow: Browser

```
Unraid UI (port 980/9443)
  └── emhttpd serves packmaster.page
        └── <iframe src="/plugins/packmaster/app/index.html">
              └── React SPA
                    └── fetch("/plugins/packmaster/api.php?action=...")
                          └── api.php (PHP on Unraid host)
                                └── shell_exec("docker compose ...")
                                      └── Docker socket (/var/run/docker.sock)
```

The iframe exists for CSS isolation — Unraid's own styles conflict with Tailwind. The React app reads `parent.csrf_token` to include Unraid's CSRF token in every POST (as a form-encoded field, not a JSON body — see Security section for why).

### Request Flow: Programmatic (brain deploy)

```
Archy (brain CLI)
  └── curl -H "Authorization: Bearer <token>" http://BigRed:9444/api.php?action=up&name=wolf-intelligence
        └── router.php (php -S 0.0.0.0:9444)
              └── api.php (Bearer auth path — no CSRF)
                    └── shell_exec("docker compose up -d ...")
```

The standalone server (`rc.packmaster-api`) starts on plugin install. It wraps `php -S` pointed at `router.php`, which gates everything through Bearer auth and routes to `api.php`. No CSRF validation on this path — Bearer token is the auth.

---

## API Endpoints

All endpoints hit `api.php` via query param `?action=<name>`. GET endpoints are idempotent; POST endpoints mutate state.

### Stack Management
| Method | Action | Description |
|--------|--------|-------------|
| GET | `stacks` | List all registered stacks with running/total/status |
| GET | `stack&name=X` | Single stack detail: containers, compose file, has_env |
| POST | `up&name=X` | `docker compose up -d` |
| POST | `down&name=X` | `docker compose down` |
| POST | `restart&name=X` | `docker compose restart` |
| POST | `pull&name=X` | `docker compose pull` |
| POST | `update&name=X` | Pull + up -d (atomic update) |

### Compose & Env Files
| Method | Action | Description |
|--------|--------|-------------|
| GET | `compose&name=X` | Read compose file content |
| POST | `save&name=X` | Validate YAML + backup + write compose file |
| GET | `env&name=X` | Read .env file (from secrets dir or stack dir) |
| POST | `save_env&name=X` | Backup + write .env file |

### Discovery & Registry
| Method | Action | Description |
|--------|--------|-------------|
| GET | `discover` | Scan directories for compose files (shows registered status) |
| POST | `register` | Add stack(s) to registry (single or bulk) |
| POST | `unregister&name=X` | Remove stack from registry |
| GET | `registries` | List configured Docker registry auth entries |

### Watchtower Integration
| Method | Action | Description |
|--------|--------|-------------|
| GET | `watchtower_status` | Detect Watchtower: running, schedule, HTTP API, container IP |
| GET | `image_updates&name=X` | Check specific stack's images against remote registry |
| GET | `image_updates` | Return cached update results for all stacks |
| POST | `check_all_updates` | Check all stacks (hits registries — can take minutes) |
| POST | `watchtower_check` | Trigger Watchtower HTTP API update check |

### Migration
| Method | Action | Description |
|--------|--------|-------------|
| POST | `migrate&name=X` | Move stack from Dockge path to PackMaster path (down → copy → up → update registry) |

### Standalone Server
| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | None | `{"status":"ok","service":"packmaster-api"}` |
| `* /api.php` | Bearer required | Routes to api.php |

---

## Data Persistence

| Data | Location | Notes |
|------|----------|-------|
| Stack registry | `/boot/config/plugins/packmaster/registry.json` | On Unraid flash — survives reboots and Docker restarts |
| User config | `/boot/config/plugins/packmaster/packmaster.cfg` | User settings on flash |
| Default config | `/usr/local/emhttp/plugins/packmaster/default.cfg` | Plugin defaults (shipped in .txz) |
| Update cache | `/tmp/packmaster-updates.json` | Ephemeral — cleared on reboot |
| Debug log | `/tmp/packmaster-debug.log` | Only when `DEBUG_LOG=true` |
| API server PID | `/var/run/packmaster-api.pid` | Written by rc.packmaster-api |
| API server log | `/var/log/packmaster-api.log` | stdout from php -S |

**Default paths on Unraid:**
- Compose stacks: `/mnt/user/packmaster/stacks/<stack_name>/`
- Secrets (.env): `/mnt/user/packmaster/secrets/<stack_name>/.env`

The secrets/stacks split keeps `.env` files with credentials out of the compose file directories — useful if compose dirs are shared or version-controlled.

---

## Configuration

Config is INI format. The plugin merges `default.cfg` with `packmaster.cfg` (user overrides win).

| Key | Default | Description |
|-----|---------|-------------|
| `SCAN_DIRS` | `/mnt/user/packmaster/stacks` | Comma-separated dirs for stack discovery |
| `SECRETS_DIR` | `/mnt/user/packmaster/secrets` | Root dir for .env files (isolated from compose files) |
| `DEBUG_LOG` | `false` | When `true`, logs all requests to `/tmp/packmaster-debug.log` |
| `API_PORT` | `9444` | Port for standalone API server |
| `API_TOKEN` | *(not set)* | Bearer token for programmatic access — set this to enable :9444 access |

Settings are editable via Unraid's Settings > Utilities > PackMaster page (PHP form → `update.php`).

---

## Security Model

**Browser path (iframe):** CSRF via Origin/Referer header validation. PHP checks that the request host matches `$_SERVER['HTTP_HOST']`. Unraid's emhttpd login wall protects the plugin page — only authenticated Unraid users can reach `api.php` through the browser.

**Programmatic path (:9444):** Bearer token required on every request. Token stored in `packmaster.cfg` on flash. `hash_equals()` comparison (timing-safe). No CSRF check on this path — Bearer is the auth.

**Key hardening (v2026.03.19d):**
- `pm_compose_exec()` has an **allowlist**: only `up`, `down`, `restart`, `pull`, `config`, `ps`, `logs` accepted as subcommands. Any other subcommand returns an error — no shell injection via action chaining.
- **YAML validation** before saving: `docker compose config --quiet` run on a tempfile. If it fails, the save is rejected with the error detail.
- **Register path scoping**: `realpath()` check enforces `/mnt/user/` prefix. No path traversal to register system directories.
- **POST body encoding trick**: Unraid's CSRF check reads `$_POST['csrf_token']`, which only populates from `application/x-www-form-urlencoded`. The React app sends `csrf_token` + JSON payload as form fields; PHP reads JSON from `$_POST['data']`. JSON POST bodies would bypass `$_POST` entirely — this was a discovered footgun.

---

## Frontend Navigation Model

The SPA uses a simple `useState<View>` router in `App.tsx` — no React Router, no URL changes. Views:

| View | Component | How to reach |
|------|-----------|-------------|
| `dashboard` | `Dashboard` | Default, or click "PackMaster" or "All Stacks" |
| `detail` | `StackDetail` | Click a stack card |
| `editor` | `ComposeEditor` | "Edit Compose" from stack detail |
| `env` | `EnvEditor` | "Edit .env" from stack detail (conditional: only if .env exists) |
| `logs` | `LogViewer` | "View Logs" from stack detail |
| `discover` | `StackDiscovery` | "Discover" button in header |

TanStack Query polls `stacks` every 5 seconds. Individual `stack` queries also poll every 5s when a stack detail is open. Watchtower status has a 30s stale time; update cache has 60s.

---

## Build Pipeline

Build runs on Archy (not on BigRed). The output is shipped to GitHub; Unraid downloads and installs it.

```
./build.sh [VERSION]
  1. cd frontend && npm run build        → frontend/dist/
  2. Copy dist/* → plugin/src/usr/local/emhttp/plugins/packmaster/app/
  3. Assemble build/ from plugin/src/* (set permissions, fix CRLF)
  4. tar -cJf packmaster-VERSION.txz ./build/
  5. sha256sum packmaster-VERSION.txz
  6. sed VERSION + SHA256 into packmaster.plg.template → packmaster.plg
  7. rm -rf build/
```

**Distribution:**
1. Upload `.txz` to GitHub Release tagged `vVERSION`
2. Commit + push `packmaster.plg` to main — this is the install URL
3. Unraid installs via: `https://raw.githubusercontent.com/w0lf69/packmaster/main/packmaster.plg`

**Version format:** `YYYY.MM.DDx` (e.g., `2026.03.19d` — suffix a/b/c/d for same-day releases)

---

## Watchtower Integration

Optional but valuable. If Watchtower isn't running, PackMaster behaves identically — no UI changes, no errors.

**Detection:** `docker ps --filter label=com.centurylinklabs.watchtower` finds Watchtower by its self-label.

**Update checking:** `docker buildx imagetools inspect <image>` hits the remote registry to get the current index digest. Compared against the local `RepoDigest`. No Watchtower needed for update detection — this is PackMaster's own mechanism.

**Update cache:** Results written to `/tmp/packmaster-updates.json`. Dashboard reads cached results (fast). "Check for updates" button triggers fresh registry checks (slow — seconds per image, minutes for many stacks).

**Watchtower HTTP API trigger:** PackMaster can tell Watchtower to pull and recreate now via its internal container IP on port 8080. Uses `curl` from the PHP host — reaches the container IP directly without port mapping.

---

## Cross-Repo Connections

### Wolf Ecosystem (BigRed)

**`brain` CLI → PackMaster :9444:**
`brain deploy <repo>` calls PackMaster's standalone API to start/stop/update stacks on BigRed. This is why the standalone server exists — it punches through Unraid's emhttpd auth wall to give Archy programmatic deploy access. Every automated deploy in the Wolf ecosystem flows through this seam.

```
Archy:~/bin/brain deploy wolf-intelligence
  → curl -X POST http://BigRed:9444/api.php?action=up&name=wolf-intelligence \
         -H "Authorization: Bearer <API_TOKEN>"
```

The API_TOKEN is set in `/boot/config/plugins/packmaster/packmaster.cfg` on BigRed. Archy holds it as an env var or credential (check `brain x infra` for current setup).

### WolfGuard

PackMaster was the template for WolfGuard's Unraid plugin structure. The `.plg` format, `.txz` packaging, CSRF handling patterns, and Vite base path configuration were all discovered building PackMaster and are referenced by WolfGuard. If you're editing PackMaster's plugin scaffold, check whether WolfGuard has the same pattern.

### Dockge (external)

PackMaster has a `migrate` endpoint specifically to move stacks from Dockge's path structure to PackMaster's. The default `SCAN_DIRS` in `helpers.php` defaults to `/mnt/user/appdata/dockge/stacks` — this is intentional. The discovery page surfaces Dockge stacks so users can import them one-click.

---

## Hard-Won Lessons (from VISION.md)

These burned time during development and must not be re-learned:

1. **CSRF token must be form-encoded.** Unraid's `auto_prepend_file` reads `$_POST['csrf_token']` — this only populates from `application/x-www-form-urlencoded`. JSON POST bodies bypass `$_POST` entirely. The React app sends `csrf_token` as a form field with JSON payload in `data`.

2. **php://input is single-read.** If you consume it for debug logging, the handler gets an empty body. Use the `$_RAW_BODY` pattern — read once, store, reference everywhere.

3. **Vite base path must be `/plugins/packmaster/app/`.** Otherwise assets resolve to root and 404 inside the iframe.

4. **emhttpd ports are 980 (HTTP) and 9443 (HTTPS)** — not 80/443. Traefik owns those.

5. **`docker compose config --quiet` validates YAML** without running containers. Use it before writing compose files.

6. **Stack registry lives on flash** (`/boot/config/`), not in `/tmp` or a container. This is what makes PackMaster survive Docker restarts and Unraid reboots — unlike Dockge.

---

## Questions for the Board

1. **brain deploy implementation:** How exactly does `brain deploy` construct the curl call to :9444? Does it read the stack name from CODEX.json, from a hardcoded mapping, or from the repo name? The seam is documented here but the brain side isn't visible from this repo.

2. **API_TOKEN management:** Where is the :9444 Bearer token stored on Archy? Is it an env var, in brain's config, or in a secrets file? Not obvious from this repo alone — important for the security posture of the deploy pipeline.

3. **PackMaster public release checklist:** VISION.md shows the release checklist is not complete (plugin icon, GitHub README with screenshots, Community Apps submission still open). Is this blocked on anything, or just deprioritized behind Yes Chef?

4. **Watchtower token auto-detection:** The `watchtower_check` endpoint tries to read the token from Watchtower's container env vars via `docker inspect`. Is Watchtower running on BigRed with HTTP API enabled? If not, the "trigger Watchtower check" button is a dead code path in production.

5. **Secrets dir on BigRed:** Is `/mnt/user/packmaster/secrets/` actually populated on BigRed? If all stacks were registered before the secrets split landed (v2026.03.19), .env files may still be living next to compose files — the `migrate` endpoint exists for this but someone has to run it.
