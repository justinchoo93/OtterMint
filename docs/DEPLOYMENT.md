# OtterMint — Deployment

This app deploys to **OtterHolt**, Justin's home Unraid NAS.

> **Host source of truth: `OtterHolt.md`.**
> The authoritative description of the host stack (networks, reverse proxy,
> secrets handling, ports, and **binding agent operating rules**) is **not in
> this repo**. It lives in Justin's Obsidian **"life" vault** under
> **`interests/OtterHolt.md`**. Read it before any non-trivial host change (new
> ports, networks, secrets, Caddy edits), and update it whenever OtterMint's
> container set, paths, or network exposure change. This document covers only
> OtterMint's app-specific deploy; the host doc wins on host matters.

The pattern here mirrors the sibling `autobot-options` app
(`autobot-options/docs/DEPLOYMENT.md`) and the existing `prediction-market`
autobot on the same host.

---

## 1. Stack at a glance

| | |
| --- | --- |
| Host | OtterHolt (Unraid, LAN `10.0.0.48`) |
| SSH | `ssh otterholt` (alias in `~/.ssh/config` → `root@10.0.0.48`, key `~/.ssh/unraid`) |
| Deployment model | docker-compose, **executed through the `Dockhand` container** (the host has no compose CLI) |
| Source on NAS | git checkout at `…/ottermint/repo`, built in place (**not** rsync'd like autobot-options) |
| Image | local build on NAS as `ottermint-ottermint` (compose default `<project>-<service>`) |
| Compose project | `ottermint` (passed via `-p`; the deploy dir is `deploy/`, which would otherwise collide with prediction-market) |
| Containers | `ottermint-ottermint-1` (app, Next.js `:3000`), `ottermint-db-1` (Postgres 17) |
| DB | Postgres 17 in-container, bind-mounted volume; **never published to host** |
| Network exposure | Caddy at `https://ottermint.otterholt.net` → `ottermint:3000` over the external `proxy_net` network. App publishes **no host ports**. |
| TLS / DNS | Caddy via Cloudflare DNS challenge; `*.otterholt.net` wildcard |
| Remote access | Tailscale (see OtterHolt.md) |
| Restart policy | `restart: unless-stopped` |
| Backups | daily encrypted `pg_dump` → array (see §7) |

---

## 2. Filesystem layout on NAS

```
/mnt/user/appdata/autobot/ottermint/
├── repo/                     # git checkout, origin https://github.com/justinchoo93/OtterMint.git (branch main)
│                             #   -> the compose build context (built in place; keep it clean & fast-forward-only)
├── deploy/
│   ├── docker-compose.yml    # the REAL deploy config (differs from the repo-root template — see §3)
│   ├── .env                  # mode 600, root-only, gitignored — real Plaid/DB/ENCRYPTION values
│   └── backup.key            # mode 600 — AES key for the encrypted DB backups (§7)
└── pgdata/                   # Postgres data — bind-mounted from /mnt/cache/appdata/autobot/ottermint/pgdata
```

> The repo root `docker-compose.yml` is a **template/reference** that is manually
> synced to `deploy/docker-compose.yml` on the NAS (commit history: "sync repo
> template with NAS-proven fixes"). The NAS copy is the source of truth for a
> deploy — it builds from `../repo`, loads `./.env`, and attaches `proxy_net`.

---

## 3. Compose file (the NAS `deploy/docker-compose.yml`)

Two services, one project (`ottermint`):

- **`db`** — `postgres:17`, volume `…/pgdata`, `default` network only, healthcheck
  `pg_isready`. Not published.
- **`ottermint`** — `build: { context: ../repo }`, `env_file: ./.env`,
  `HOSTNAME=0.0.0.0`, `depends_on: db (service_healthy)`, networks
  `[default, proxy_net]`, healthcheck hits `/api/health`.

`proxy_net` is `external: true` (created by the Caddy stack). Caddy reverse-proxies
`ottermint.otterholt.net` to `ottermint:3000` over it.

---

## 4. Environment variables

`.env.example` (repo root) is the authoritative list. The real `.env` lives at
`…/ottermint/deploy/.env` on the NAS, **mode 600, never committed**. Production
values (`DATABASE_URL`, `PLAID_*` with `PLAID_ENV=production`, `ENCRYPTION_KEY`,
`POSTGRES_SUPERUSER_PASSWORD`, optional Upstash) are provided there at deploy time.

---

## 5. Deploy

### The one-liner (from your laptop)

```bash
scripts/deploy.sh
```

It pushes must already be on `origin/main` (the NAS builds `origin/main`). The
script SSHes to OtterHolt, fast-forwards `repo/`, rebuilds and recreates the app
container via Dockhand, and prints the health check. See the script for details.

### What it does, by hand

The Unraid host has **no `docker compose` CLI**. Compose ops route through the
**`Dockhand` container**, which has `docker-compose` installed and `docker.sock`
mounted. `-p ottermint` is required (deploy dir is `deploy/`).

```bash
# 0. Push your change to origin/main first (from the laptop):
git push origin main

# 1. On the NAS: fast-forward the build source.
ssh otterholt
git -C /mnt/user/appdata/autobot/ottermint/repo pull --ff-only origin main

# 2. Rebuild + recreate ONLY the app (db is left running), via Dockhand:
docker exec -w /mnt/user/appdata/autobot/ottermint/deploy Dockhand \
  docker-compose -p ottermint up -d --build ottermint

# 3. Verify (see §6).
```

Notes:
- `up --build` builds **before** swapping — if the build fails, the current
  container keeps running, so a bad build does not take prod down.
- Target the `ottermint` service so `db` is not recreated. `db` stays up; compose
  only re-checks its health gate.
- **Compose-managed, never `rebuild_container`-managed** (binding rule from
  OtterHolt.md): the Unraid `rebuild_container` action desyncs compose's project
  state. Always deploy from the deploy dir via Dockhand.

---

## 6. Verify

```bash
# container should be Up (healthy)
docker ps --filter name=ottermint-ottermint-1

# liveness + DB probe (unauthenticated)
docker exec ottermint-ottermint-1 wget -qO- http://127.0.0.1:3000/api/health
# {"status":"ok","db":"ok"}     (503 {"status":"degraded","db":"error"} if DB unreachable)
```

Then load `https://ottermint.otterholt.net` and confirm the change.

---

## 7. Backups

Daily encrypted logical dump, via the Unraid **User Scripts** entry
`ottermint-backup` (`/boot/config/plugins/user.scripts/scripts/ottermint-backup/`):

- **Schedule:** `30 3 * * *` (03:30 daily).
- **What:** `docker exec ottermint-db-1 pg_dump … | gzip | openssl enc -aes-256-cbc -pbkdf2`
  → `/mnt/user/backups/ottermint/ottermint-<ts>.sql.gz.enc` (array, different
  physical disk than the cache-resident live DB).
- **Key:** `…/ottermint/deploy/backup.key` (mode 600, on the NAS only).
- **Retention:** 14 most recent.
- **Restore:** `openssl enc -d -aes-256-cbc -pbkdf2 -pass file:backup.key -in <file> | gunzip | docker exec -i ottermint-db-1 psql -U postgres -d ottermint`.

---

## 8. Rollback

- **Bad build:** none needed — `up --build` won't swap on build failure.
- **Bad code that built:** `git -C repo checkout <good-sha>` then re-run the
  Dockhand `up --build` (or revert on `main` and redeploy).
- **Data:** restore the latest encrypted dump (§7).

---

## 9. Binding rules (from OtterHolt.md — read it there for the full set)

- **No public exposure** beyond the intended Caddy host; Tailscale-only for
  remote access to anything else.
- **Frame non-trivial host changes** before making them: meaning, steps, what
  changes, tradeoffs, alternatives, what could go wrong, confirmation.
- **Update OtterHolt.md** whenever OtterMint's container set, paths, network
  exposure, or operational pattern changes. Reality wins; fix the doc.
- **Compose-managed only** (see §5). Secrets (`.env`, `backup.key`): mode 600,
  never committed.
