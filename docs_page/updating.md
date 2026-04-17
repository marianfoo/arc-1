# Updating ARC-1

## Before you update

1. **Check the changelog** — review [CHANGELOG.md](https://github.com/marianfoo/arc-1/blob/main/CHANGELOG.md) or the [Releases page](https://github.com/marianfoo/arc-1/releases) for breaking changes.
2. **Pin to a version** — in production, use exact version tags (`:0.7.0`), never `:latest`. Prevents surprise upgrades.
3. **Test first** — update a dev/staging instance before production. Verify MCP clients still connect and tools work as expected.
4. **Read the startup auth line after upgrade** — a drift-free instance will log the same `auth: MCP=[...] SAP=[...]` summary before and after. If it's different, the upgrade changed something you didn't expect.

---

## npx / npm

`npx` always pulls the latest version. To pin:

```bash
# Latest
npx arc-1@latest

# Pinned
npx arc-1@0.7.0

# Global install
npm install -g arc-1@0.7.0
```

Verify:

```bash
npx arc-1 --version
```

If you pin in MCP client config, update the `args`:

```json
{ "command": "npx", "args": ["-y", "arc-1@0.7.0"] }
```

---

## Docker (standalone)

```bash
# 1. Pull the new image
docker pull ghcr.io/marianfoo/arc-1:0.7.0

# 2. Stop & remove the running container
docker stop arc1 && docker rm arc1

# 3. Start with the new image (same env vars / config)
docker run -d --name arc1 -p 8080:8080 \
  --env-file .env \
  ghcr.io/marianfoo/arc-1:0.7.0

# 4. Verify
docker logs arc1 | head -20
curl -s http://localhost:8080/mcp
```

**Downtime:** brief interruption between stop and start. For zero-downtime, run two containers behind a reverse proxy (nginx / Traefik) and switch traffic after health check.

**Rollback:** start the previous image.

```bash
docker stop arc1 && docker rm arc1
docker run -d --name arc1 -p 8080:8080 --env-file .env ghcr.io/marianfoo/arc-1:0.6.8
```

---

## BTP Cloud Foundry

CF supports rolling updates natively — no manual stop/start.

### Step 1 — update image tag in `manifest.yml`

```yaml
applications:
  - name: arc1-mcp-server
    docker:
      image: ghcr.io/marianfoo/arc-1:0.7.0   # ← update this
```

### Step 2 — rolling push

```bash
cf push arc1-mcp-server --strategy rolling
```

Starts a new instance with the new image, waits for health checks, then stops the old one. MCP clients see no interruption.

### Step 3 — verify

```bash
cf app arc1-mcp-server
cf logs arc1-mcp-server --recent | grep "auth:"
curl -s https://arc1-mcp-server.cfapps.us10.hana.ondemand.com/mcp
```

### Rollback

```bash
# Option 1 — re-push previous tag
# Update manifest.yml back, then:
cf push arc1-mcp-server --strategy rolling

# Option 2 — previous droplet
cf rollback arc1-mcp-server
```

### BTP specifics

- **Destination Service / Cloud Connector:** infrastructure config, not part of the image. No action on version bump.
- **XSUAA bindings:** persist across restages. No re-binding needed.
- **New required env vars in the release?** Set before pushing:
  ```bash
  cf set-env arc1-mcp-server NEW_VAR value
  cf push arc1-mcp-server --strategy rolling
  ```
- **Scaled > 1 instance (`cf scale -i 2`):** rolling update handles each instance sequentially.

---

## git clone (development)

```bash
git pull origin main
npm ci
npm run build
npm start    # or: npm run dev
```

---

## Monitoring after an update

Every release should behave identically for an unchanged config. Verify:

1. **Startup logs** — errors, deprecation warnings, and the `auth:` summary line
2. **Tool listing** — expected tools visible to the MCP client
3. **Basic operation** — one `SAPRead` or `SAPSearch` succeeds
4. **Auth flow** — if using OIDC / XSUAA, verify a token-authenticated request
5. **Package scope** — write to an allowed package, confirm write to a disallowed package is rejected

---

## Release cadence

Automated via [release-please](https://github.com/googleapis/release-please):

- `feat:` commits → minor bump
- `fix:` commits → patch bump
- `feat!:` / `BREAKING CHANGE:` → major bump
- `chore:` / `docs:` / `ci:` → no release

Published simultaneously to **npm** (`arc-1`) and **GHCR** (`ghcr.io/marianfoo/arc-1`).
