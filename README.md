# Life Quest

A self-hosted, gamified daily-goals dashboard. Tracks fitness, content creation,
and Security+ studying with XP, levels, streaks, achievements, and boss fights.

Single-file vanilla HTML/CSS/JS — no build step, no backend, no database.
Saves to the browser's `localStorage`.

---

## Run it locally

Just open `index.html` in a browser. That's it.

```powershell
# Windows
start index.html
```

```bash
# macOS / Linux
xdg-open index.html   # or: open index.html
```

---

## Deploy on Proxmox via Docker

The deployment is a static nginx container. You can run it from a Proxmox LXC
or a small VM. The steps assume Docker + Docker Compose are installed.

### 1. Get the code onto the host

```bash
git clone https://github.com/<your-username>/<your-repo>.git life-quest
cd life-quest
```

### 2. Build and start

```bash
docker compose up -d --build
```

The app is now live at `http://<proxmox-host-ip>:8080`.

The container restarts automatically (`restart: unless-stopped`). To stop it:

```bash
docker compose down
```

### 3. Update after pushing changes

```bash
git pull
docker compose up -d --build
```

A no-cache header on `index.html` means reloading the browser will pick up the
new build immediately — no clearing cache.

---

## Set up the Cloudflare Tunnel

The tunnel gives you a public HTTPS URL pointing at the local container, with
no port-forwarding on your router.

### A. Create the tunnel in Cloudflare

1. Go to <https://one.dash.cloudflare.com/> -> **Networks** -> **Tunnels**.
2. Click **Create a tunnel** -> **Cloudflared** -> name it (e.g. `lifequest`).
3. On the install screen, **copy the connector token** (the long string after
   `--token` in the install command). You don't need to actually run that
   command — you'll use the token via Docker.
4. Go to the **Public Hostname** tab in the tunnel settings and add:
   - **Subdomain**: e.g. `quest`
   - **Domain**: your Cloudflare-managed domain
   - **Service**: `HTTP` -> `lifequest:80`
     (if running cloudflared in the same compose file as the app — Docker's
     internal DNS resolves the service name `lifequest`)
   - If you're running cloudflared outside Docker, use `http://localhost:8080`
     instead.

### B. Run cloudflared

**Option 1 — alongside the app in Docker Compose (easiest):**

1. Copy `.env.example` to `.env` and paste your token:

   ```bash
   cp .env.example .env
   nano .env   # set TUNNEL_TOKEN=eyJ...
   ```

2. Open `docker-compose.yml` and uncomment the `cloudflared:` block.

3. Bring the stack up:

   ```bash
   docker compose up -d
   ```

**Option 2 — as a system service on the Proxmox host/LXC:**

```bash
# Install cloudflared (Debian/Ubuntu)
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Install as a system service using your token
sudo cloudflared service install eyJ...your-token...

# Verify
sudo systemctl status cloudflared
```

In this case, point the tunnel's public hostname at `http://localhost:8080`.

### C. Visit your URL

`https://quest.yourdomain.com` -> your dashboard, available anywhere.

---

## Initial GitHub push

Run from this directory:

```bash
git init
git add .
git commit -m "Initial commit: Life Quest"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

The `.gitignore` already excludes `.env` and your exported save files, so the
tunnel token won't leak.

---

## Backups

Your save data lives in `localStorage` in the browser you use to view the app.
Use the **Export JSON** button in the Settings panel to download a snapshot;
**Import** to restore. Drop these into cloud storage or a Git repo for safety.

---

## Caveat: per-browser storage

`localStorage` is scoped to the **origin** (scheme + host + port) **and the
browser**. Practical consequences:

- Phone and desktop will have **separate save files** (same URL, different
  browsers).
- Clearing site data wipes your progress.
- Switching browsers means starting over.

The in-app Export/Import is the manual workaround. If this becomes annoying,
add a small backend (a tiny Node/Go service with a JSON file on disk would do
it) so all clients read/write to the server. See **Future: cross-device sync**
below.

---

## Optional: Alternative deploy without Docker

If you'd rather skip Docker, this whole thing is just one file. From a Proxmox
LXC:

```bash
sudo apt update && sudo apt install -y nginx
sudo cp index.html /var/www/html/index.html
sudo cp nginx.conf /etc/nginx/sites-available/lifequest
sudo ln -sf /etc/nginx/sites-available/lifequest /etc/nginx/sites-enabled/lifequest
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

(You may need to tweak `nginx.conf` — the bundled one is written for the
Docker `conf.d/default.conf` location.)

---

## Future: cross-device sync

If/when you want phone + desktop to share data, the smallest change is:

1. Add a tiny HTTP server next to nginx (Node/Go/Python — anything) that
   exposes `GET /api/state` and `POST /api/state` reading/writing a JSON file.
2. In `index.html`, replace `localStorage.getItem/setItem` calls with `fetch()`
   calls against `/api/state`.
3. Put basic auth or a Cloudflare Access policy in front so only you can hit
   the API.

Open an issue or just ask Claude to add this when you're ready.

---

## File map

| File | Purpose |
| ---- | ------- |
| `index.html` | The whole app — HTML, CSS, JS in one file |
| `Dockerfile` | nginx:alpine + the HTML |
| `nginx.conf` | nginx server block (cache + security headers) |
| `docker-compose.yml` | Compose stack (app + optional cloudflared) |
| `.env.example` | Template for `TUNNEL_TOKEN` |
| `.gitignore` | Keeps `.env` and save exports out of git |
| `.dockerignore` | Keeps repo metadata out of the image |
