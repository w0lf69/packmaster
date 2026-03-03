# PackMaster — Vision & Roadmap

**First public release from Wolf Enterprises.**
Built by OPUS & Dino. For the Unraid community.

---

## Why PackMaster Exists

The Unraid community has been asking for native Docker Compose management since 2015. Eleven years. Two solutions emerged — both inadequate:

**Docker Compose Manager (DCM):** Native plugin, but the UI is dated PHP forms. Only recognizes `docker-compose.yml` (not `compose.yaml`). No file editing. No live logs. No stack discovery. Containers don't integrate with Unraid's Docker tab. Development stalled.

**Dockge:** Beautiful UI, but runs as a container managing containers. When Docker breaks, your management tool breaks with it. Containers don't auto-start reliably after Unraid reboots. Exists outside Unraid's UI on a separate port. No update notifications. Combined log view with no per-container filtering. Development slowed — last release March 2025.

**PackMaster** is native PHP running on the Unraid host. Root access. Direct Docker socket. Can never go down with what it manages. Modern React UI in the Unraid iframe. First-class citizen.

---

## Competitive Analysis

| Feature | DCM | Dockge | PackMaster V1 | PackMaster V2 |
|---------|-----|--------|---------------|---------------|
| Native Unraid plugin | Yes | No (container) | Yes | Yes |
| Survives Docker failures | Yes | No | Yes | Yes |
| Modern UI | No | Yes | Yes | Yes |
| compose.yaml support | No (.yml only) | Yes | Yes (all 4 formats) | Yes |
| Live log streaming | No | Yes (combined only) | Yes (SSE, per-container) | Yes |
| YAML syntax highlighting | No | Yes (Monaco) | No (textarea) | Yes (CodeMirror) |
| Stack discovery | No | No | Yes (auto-scan) | Yes |
| Bulk registration | No | N/A | Yes | Yes |
| Compose file editing | No | Yes | Yes (with backup) | Yes (enhanced) |
| Update notifications | No | No | No | Yes (Watchtower) |
| Auto-update integration | No | No | No | Yes (Watchtower) |
| docker run converter | No | Yes | No | Phase 3 |
| .env file management | No | Plaintext only | No | Phase 3 |
| Unraid UI integration | Partial | None | Iframe | Iframe |
| Reliable auto-start | Yes | Broken on Unraid | N/A (native) | N/A (native) |
| GHCR private registry | Manual | Bind-mount token | Native (/root/.docker) | Native |
| Per-container filtering | N/A | No | Yes | Yes |
| Multi-host management | No | Yes (agents) | No | No (single host focus) |

---

## Release Phases

### V1 — Foundation (DONE)
What shipped today. Functional compose management in Unraid's native UI.

- PHP API: 13 endpoints (stacks, stack detail, up/down/restart/pull/update, logs SSE, compose read/write, register/unregister, discover, registries)
- React SPA: Dashboard grid, stack cards with status, stack detail with container list, compose editor with Ctrl+S and backup-on-save, live log viewer with pause/filter, stack discovery with bulk register
- Unraid integration: .page in Docker menu, .plg installer, CSRF token handling, flash-persistent registry
- Build pipeline: Vite build on Archy, .txz packaging, .plg generation with SHA256

### V2 — The Differentiator (NEXT)
What makes PackMaster worth switching to. The features nobody else has.

#### Watchtower Integration (Optional)
The killer feature. Non-destructive — if Watchtower isn't running, PackMaster works identically.

**Detection:**
- PHP checks for running Watchtower container via `docker ps --filter name=watchtower --format json`
- Reads Watchtower config: API token, schedule, monitored containers
- Detects Watchtower's HTTP API availability (`WATCHTOWER_HTTP_API_UPDATE=true`)

**Display:**
- "Update available" badge on stack cards when newer images exist
- Per-container update status in stack detail view
- Watchtower monitoring status per stack (enabled/disabled via labels)
- Last check timestamp, next scheduled check

**Actions:**
- One-click "Check for updates" — triggers Watchtower HTTP API
- One-click "Update now" — Watchtower pull + recreate for specific stack
- Toggle Watchtower monitoring per-stack (add/remove `com.centurylinklabs.watchtower.enable` label)

**Configuration:**
- Settings panel: Watchtower container name (default: "watchtower"), API token
- Auto-detect if possible (inspect container env vars from Docker socket)
- Status indicator: "Watchtower connected" / "Not detected" / "API not enabled"

**PHP Endpoints (new):**
| Method | Action | What |
|--------|--------|------|
| GET | `watchtower_status` | Detect Watchtower, return config/connection state |
| GET | `updates` | Check image digests, return stacks with available updates |
| POST | `watchtower_check` | Trigger Watchtower HTTP API update check |
| POST | `watchtower_update` | Trigger update for specific stack via Watchtower |
| POST | `watchtower_toggle` | Enable/disable Watchtower monitoring for a stack |

#### CodeMirror YAML Editor
Replace textarea with CodeMirror 6 + `@codemirror/lang-yaml`:
- Syntax highlighting
- Line numbers
- Auto-indent
- Bracket matching
- YAML validation (red squiggles on bad syntax)
- Search/replace (Ctrl+F)
- Same Ctrl+S save, same backup-on-save

#### UI Polish
- Stack sorting (by name, status, update available)
- Search/filter stacks on dashboard
- Confirmation dialogs for destructive actions (down, unregister)
- Toast notifications for action results (success/failure)
- Loading states on action buttons (spinner while pulling)
- Error boundary with friendly message

### V3 — Community Features (FUTURE)
After public release feedback.

- `docker run` to `compose.yaml` converter (Dockge's crowd-pleaser)
- `.env` file editor alongside compose.yaml (with secrets masking)
- Stack templates (one-click deploy common stacks)
- Stack health monitoring (restart policies, healthcheck status)
- Export/import stack configurations
- Backup/restore registry and compose files

---

## Technical Decisions

**Why PHP, not Node/Python:**
Unraid's emhttp is PHP. Every plugin that integrates with the Unraid UI is PHP. No Node.js or Python runtime on Unraid's Slackware base. PHP runs natively with zero dependencies. This isn't a choice — it's the only option for a real Unraid plugin.

**Why iframe, not inline PHP:**
CSS isolation. Unraid's UI has its own styles that conflict with Tailwind. The iframe creates a clean boundary. This is the same pattern used by other modern Unraid plugins.

**Why React SPA, not server-rendered PHP:**
Modern interactivity (real-time status polling, SSE log streaming, optimistic mutations) requires a JS frontend. React + TanStack Query gives us this with a proven stack. Built on Archy, shipped as static assets — no runtime dependency on BigRed.

**Why Watchtower integration, not built-in update checking:**
Watchtower already handles image digest comparison, registry auth (GHCR, DockerHub, private), and scheduled polling. That's complex infrastructure code. Building it into a PHP plugin would be fragile and redundant. Watchtower is the standard — meet users where they are.

**Why optional, not required:**
Not every Unraid user runs Watchtower. PackMaster must work perfectly without it. The Watchtower integration is a reward for good practice, not a gate.

---

## Public Release Checklist

- [ ] V2 features complete (Watchtower + CodeMirror + polish)
- [ ] Dino daily-drives for 1 week minimum
- [ ] Plugin icon designed
- [ ] GitHub repo: README with screenshots, install instructions, feature list
- [ ] GitHub Release: tagged version with .txz + .plg
- [ ] Unraid forum: support thread in Plugin Support
- [ ] Community Apps: submission via CA form
- [ ] Documentation: install guide, Watchtower setup guide, FAQ

---

## What We Learned Building This

Things that would stop most people from building Unraid plugins:

1. **Slackware .txz packaging** — no documentation. We copied from WolfGuard.
2. **.plg XML format** — learned by reading other plugins, not docs.
3. **CSRF protection** — Unraid's `auto_prepend_file` silently kills POST requests without `csrf_token`. No error, no log, just silence. We discovered this by adding debug logging and seeing zero POST requests hitting the server.
4. **emhttp ports** — Unraid's management UI runs on port 980 (HTTP) and 9443 (HTTPS), not 80/443. Traefik owns those.
5. **Vite base path** — Assets in an iframe need `base: "/plugins/packmaster/app/"` or paths resolve to root and 404.
6. **php://input is single-read** — consuming it for debug logging meant the actual handler got empty body. Use `$_RAW_BODY` pattern.
7. **Form-encoded POST required** — Unraid's CSRF check reads `$_POST['csrf_token']`, which only populates from `application/x-www-form-urlencoded`. JSON POST bodies bypass `$_POST` entirely. Solution: send csrf_token + JSON payload as form fields, read JSON from `$_POST['data']`.

These lessons are documented here so the next person who wants to build a modern Unraid plugin doesn't have to discover them the hard way.

---

*Built by OPUS & Dino. Wolf Enterprises. 2026.*
