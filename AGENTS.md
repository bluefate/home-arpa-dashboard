# Agent guide — HomeArpaDashboard

This file is for coding agents and humans automating home-lab service registration.

HomeArpaDashboard is a **private LAN** tool. Do not expose it to the public internet. Never commit `API_KEY`, `.env`, or real LAN secrets into git.

## Goal (local / WIP app)

Register a developer machine’s app under **`*.dev.home.arpa`** so it is reachable as:

```text
https://<name>.dev.home.arpa
```

(no port in the URL). Use **`proxy: true`** (default). On a fully configured instance, **one API call** updates the registry, Pi-hole Local DNS, and Caddy routes.

## Prerequisites

1. HomeArpaDashboard is running (`BASE`, e.g. `https://home.home.arpa`).
2. You have `API_KEY` (Bearer). You do **not** need the Pi-hole password — that is operator-only in server env.
3. App listens on a **LAN IP** (not `127.0.0.1`) and a known **port**.

### Confirm automation is on

```bash
curl -sS "$BASE/api/health"
```

Expect:

- `integrations.pihole.enabled: true`
- `integrations.caddySnippet.enabled: true` (and ideally reload configured)

If either is `false`, stop and tell the lab operator — registration alone will not publish DNS/HTTPS.

### Obtain `API_KEY`

- From the instance `.env` / secrets (`API_KEY=…`), or ask the lab admin.
- Never invent a key or commit it.

## Register (single step when automation is on)

```bash
export BASE='https://home.home.arpa'
export API_KEY='…'

curl -sS -X POST "$BASE/api/services" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "myapp",
    "zone": "dev.home.arpa",
    "ip": "192.168.1.50",
    "port": 5174,
    "title": "My Vite app",
    "group": "Development",
    "proxy": true,
    "protocol": "https"
  }'
```

Check the JSON `integrations` object:

- `dns.ok` / not skipped → Pi-hole updated
- `caddy.ok` / not skipped → snippet written (and reloaded if admin URL is set)

Then:

```bash
curl -sS "$BASE/api/services?zone=dev.home.arpa"
```

Open `https://myapp.dev.home.arpa` (trust the lab local CA if prompted).

| Field | Rule |
|---|---|
| `name` | DNS label → `name.zone` |
| `zone` | `dev.home.arpa` for WIP |
| `ip` | LAN Network IP from the app (Vite “Network” line) |
| `port` | Required when `proxy: true` |
| `proxy` | `true` for portless HTTPS via Caddy |
| `protocol` | Public URL scheme (`https`); backend is HTTP to Caddy |

## UI alternative

`$BASE/dev.html` — same fields; leave **Proxy via Caddy** checked. OpenAPI: `$BASE/api/docs`.

## Update / delete

`POST /api/services` upserts by hostname. Or `PATCH` / `DELETE` `/api/services/:id` with Bearer auth.

## Agent checklist

- [ ] `/api/health` shows Pi-hole + Caddy snippet enabled
- [ ] LAN IP, not localhost; `zone=dev.home.arpa`; `proxy: true`; `port` set
- [ ] Response `integrations` dns/caddy succeeded
- [ ] Service listed in `GET /api/services?zone=dev.home.arpa`
- [ ] Did not commit or log `API_KEY`

## Do not

- Do not ask the developer for `PIHOLE_PASSWORD` (server-side only).
- Do not add manual Caddy blocks when snippet automation is enabled — the API owns `*.dev.home.arpa` routes.
- Do not use `.local` or public `.dev` as the zone.

## Zones

| Zone | Use | Typical routing |
|---|---|---|
| `home.arpa` | Stable / shared | Often hand-managed in the main Caddyfile |
| `dev.home.arpa` | Laptop / WIP | Auto snippet + Pi-hole |