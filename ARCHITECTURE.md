# PackMaster — Native Unraid Docker Compose Plugin

Replaces Dockge and Docker Compose Manager with a native Unraid plugin.

## Stack
- **Backend**: PHP (shell_exec to docker compose CLI) — runs on Unraid host
- **Frontend**: React 19 + Tailwind v4 + TanStack Query — built on Archy via Vite
- **Plugin**: Standard Unraid .plg installer with .txz package

## Structure
- `plugin/` — Unraid plugin files (PHP API, .page, .plg template)
- `frontend/` — React SPA (Vite + TypeScript)
- `scripts/build.sh` — builds frontend, downloads docker-compose binary, packages .txz
- `.github/workflows/release.yml` — CI: tag → build → GitHub Release

## Key Design Decisions
- PHP runs on host (root) — no container dependency, direct Docker socket access
- React SPA in iframe — CSS isolation from Unraid's UI
- Registry on flash drive — survives reboots
- docker-compose binary bundled in .txz — no external dependency on DCM
- SSE for live log streaming
