# Life Quest

A self-hosted, gamified daily-goals dashboard. Tracks fitness, content creation,
and Security+ studying with XP, levels, streaks, achievements, and boss fights.

**v2** adds multi-user support: each user signs in through Cloudflare Access and
their progress is stored on the server (SQLite), syncing across all devices.

---

## Architecture

```
User → Cloudflare Tunnel → CF Access (auth) → nginx → index.html
                                                    → /api/* → Node API → SQLite (Docker volume)
```

- **`lifequest`** — nginx container serving `index.html` and proxying `/api/*`.
- **`api`** — Node service that verifies the Cloudflare Access JWT on every request
  and reads/writes per-user state to SQLite.
- **`cloudflared`** — Cloudflare Tunnel connector. The app has no public ports;
  all traffic comes in through the tunnel.

Per-user state is keyed by the verified email claim from the JWT.

---

## One-time setup

### 1. Cloudflare Tunnel

Cloudflare Zero Trust dashboard → **Networks → Tunnels → Create tunnel** (cloudflared).
Copy the connector token from the install screen.

Add a Public Hostname for the tunnel:
- **Subdomain**: e.g. `quest`
- **Domain**: your Cloudflare-managed domain
- **Service**: `HTTP` → `lifequest:80`

### 2. Cloudflare Access application

Zero Trust dashboard → **Access → Applications → Add an application → Self-hosted**.

- **Application domain**: `quest.yourdomain.com` (the same hostname above).
- **Session duration**: 30 days (your call).
- **Identity providers**: One-time PIN (email) is on by default. Optionally add
  Google/GitHub.
- **Policy**: `Allow` → `Include: Emails: you@..., friend@...`.

From the application's Overview tab, copy the **Application Audience (AUD) Tag**
— a long hex string. You'll need it in `.env` below.

Optional hardening (recommended):
- **Bot Fight Mode** on (Security → Bots, free).
- **Country restriction** on the policy (`Require: Country in [US, ...]`).
- **WAF rule** to challenge unusual traffic.

### 3. Find your team domain

It looks like `<team>.cloudflareaccess.com`. You can see it in the URL of your
Zero Trust dashboard. Used by the API to fetch CF's JWT signing keys.

### 4. Set environment variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
nano .env
```

```
TUNNEL_TOKEN=eyJh...                        # from step 1
CF_ACCESS_TEAM_DOMAIN=yourteam.cloudflareaccess.com
CF_ACCESS_AUD=<long hex string from step 2>
```

### 5. Bring up the stack

```bash
docker compose up -d --build
```

That's it. Visit `https://quest.yourdomain.com`, sign in with email OTP, and
the app loads.

---

## Updating after pushing changes

```bash
git pull
docker compose up -d --build
```

The `no-cache` header on `index.html` means reloads pick up the new frontend
immediately. The API container restarts when its image rebuilds.

---

## Adding / removing users

There's no signup screen — Cloudflare Access controls who can reach the app.

1. Zero Trust → Access → Applications → your app → Edit
2. Policies → add/remove emails from the Allow policy

When a new user logs in for the first time, the API returns an empty state for
their email and the frontend initializes their personal defaults.

---

## Local development (without Cloudflare)

Two options.

**Option A — open the file directly.** Open `index.html` in a browser. The app
detects there's no `/api/me` and falls back to "local mode": data stays in
`localStorage` exactly like v1.

**Option B — run the API with auth disabled.**

```bash
cd api
SKIP_AUTH=1 DB_PATH=./users.db npm install && npm start
```

Then serve `index.html` next to it (e.g. with `python3 -m http.server` from the
repo root) and proxy `/api/*` to `localhost:3000`, or just open `index.html`
and hit the API yourself. `SKIP_AUTH=1` treats every request as `dev@local`.

**Never run with `SKIP_AUTH=1` in production.**

---

## Backups

Your data lives in the Docker volume `lifequest-data` as a single SQLite file
(`/data/users.db`). To back up:

```bash
docker compose exec api sqlite3 /data/users.db ".backup /data/users.db.bak"
docker compose cp api:/data/users.db.bak ./users.db.$(date +%F).bak
```

Or just snapshot the whole volume periodically.

Each user can also Export/Import their own state as JSON from the in-app
Settings panel.

---

## File map

| File | Purpose |
| ---- | ------- |
| `index.html` | Frontend — vanilla HTML/CSS/JS, talks to `/api/state` |
| `Dockerfile` | nginx:alpine + index.html |
| `nginx.conf` | nginx config (serves static, proxies `/api/*`) |
| `api/server.js` | Node API — JWT verification + SQLite |
| `api/Dockerfile` | node:20-alpine + better-sqlite3 + jose |
| `api/package.json` | API dependencies |
| `docker-compose.yml` | Compose stack (lifequest + api + cloudflared) |
| `.env.example` | Template for tunnel token, team domain, AUD tag |
| `.gitignore` | Keeps `.env` and `*.db` out of git |
| `.dockerignore` | Keeps repo metadata out of the image |

---

## Security notes

- The API **verifies the CF Access JWT signature and AUD** on every request.
  Even if someone reached the origin directly (they can't — the tunnel doesn't
  expose any ports), they couldn't spoof the identity headers.
- The `lifequest` container does not publish any host port — it's only
  reachable through `cloudflared` over the internal Docker network.
- The API logs only `email + action + payload size`, never the state contents.
- SQLite WAL mode is on for crash-safety.

---

## Migrating from v1 (localStorage-only)

The first time you sign in to v2 with a browser that has a v1 save, the
frontend detects the empty server state and pushes your local progress up
automatically. No action required on your end.

If you want to migrate a user *from a different browser*, use the in-app
Export JSON from v1, then Import it from v2.
