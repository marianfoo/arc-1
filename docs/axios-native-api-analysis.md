# Analysis: Replacing Axios with Native Node.js APIs

## TL;DR

**Feasible but not free.** The project already uses native `fetch()` for OAuth/BTP calls. Only `src/adt/http.ts` depends on axios. Replacing it requires ~300-400 lines of custom wrapper code and introduces one risk area (proxy support). No Node.js version blocker exists — the project already requires Node.js >=20.

---

## Node.js Version Compatibility — No Blocker

| Source | Version |
|--------|---------|
| `package.json` engines | `>=20.0.0` |
| CI test matrix (`.github/workflows/test.yml`) | 20, 22, 24 |
| Dockerfile | `node:22-alpine` |
| npm publish CI | Node 22 |

Native `fetch()` is stable since Node.js 21 (experimental in 18). With the >=20 minimum, `fetch()` is available but technically still experimental in Node 20. **Node 21+** marks it as stable. The project tests on 20, 22, and 24.

**Key API availability (Node 20+):**

- `fetch()` — available (no experimental flag needed since 18.0)
- `Headers.getSetCookie()` — available since Node 19.7
- `AbortController` — stable since Node 15
- `URL` / `URLSearchParams` — stable since Node 10

---

## Current Axios Usage

Axios is used in **exactly one file**: `src/adt/http.ts` (the ADT HTTP transport layer, ~492 lines).

### Features relied on

| Feature | Axios API | Difficulty to Replace |
|---------|-----------|----------------------|
| HTTP requests (GET/POST/PUT/DELETE) | `axios.request()` | Trivial — `fetch()` |
| Base URL composition | `baseURL` config | Trivial — string concat |
| 60s timeout | `timeout` config | Easy — `AbortController` |
| Don't throw on non-2xx | `validateStatus: () => true` | Easy — `fetch()` default behavior |
| Basic Auth | `auth` config | Easy — manual `Authorization: Basic` header |
| Custom headers per instance | instance defaults | Easy — store in class field |
| Skip TLS verification | `httpsAgent: new HttpsAgent({rejectUnauthorized: false})` | Medium — undici dispatcher |
| Cookie jar (Set-Cookie parsing) | `response.headers['set-cookie']` | Medium — `Headers.getSetCookie()` |
| **HTTP proxy (BTP Cloud Connector)** | `proxy` config | **Hard — no native fetch() proxy** |
| Error type detection | `axios.isAxiosError()` | Easy — replace with custom error class |
| Session isolation | new `axios.create()` per session | Easy — new wrapper instance |

### Axios types used

- `AxiosInstance` — private member variable
- `AxiosRequestConfig` — initial configuration
- `AxiosResponse` — response objects (`.status`, `.data`, `.headers`)

### Features NOT used

- Interceptors
- Request/response transformers
- Cancel tokens
- Stream handling
- Custom adapters
- Axios plugins

---

## The Three Risk Areas

### 1. HTTP Proxy Support (HIGH RISK)

The BTP Cloud Connector requires routing requests through a connectivity proxy:

```typescript
// Current axios config in src/adt/http.ts:130-134
axiosConfig.proxy = {
  host: config.btpProxy.host,
  port: config.btpProxy.port,
  protocol: config.btpProxy.protocol,
};
```

Native `fetch()` has **no proxy support**. Options:

- **Use `undici.ProxyAgent`** — undici is Node's built-in fetch engine, so `new undici.ProxyAgent()` works with fetch's `dispatcher` option. Zero new npm dependencies since undici ships with Node.
- **Add `https-proxy-agent`** — popular package, but adds a dependency (partially defeating the purpose).
- **Drop proxy support** — not viable, BTP Cloud Connector is a key feature.

**Verdict**: Use `undici.ProxyAgent` (ships with Node, no npm install needed). However, undici's public API stability varies across Node versions — needs testing on 20, 22, 24.

### 2. TLS Certificate Verification Skip (MEDIUM RISK)

```typescript
// Current: src/adt/http.ts:122-123
axiosConfig.httpsAgent = new HttpsAgent({ rejectUnauthorized: false });
```

With native fetch, this requires either:

- `undici.Agent({ connect: { rejectUnauthorized: false } })` as `dispatcher`
- Setting `NODE_TLS_REJECT_UNAUTHORIZED=0` (global, bad practice)

Again relies on undici's dispatcher API, which ties into the proxy solution.

### 3. Set-Cookie Header Parsing (LOW RISK)

```typescript
// Current: response.headers['set-cookie'] returns string[]
```

With `fetch()`, use `response.headers.getSetCookie()` (available Node 19.7+). The existing manual parsing logic in the cookie jar would work unchanged — just the header extraction method changes.

---

## What Already Uses Native `fetch()`

The project already migrated simpler HTTP calls away from axios:

| File | Purpose | Uses |
|------|---------|------|
| `src/adt/oauth.ts` | OAuth token exchange & refresh | `fetch()` |
| `src/adt/btp.ts` | BTP Destination/Connectivity Service | `fetch()` |
| `src/server/sinks/btp-auditlog.ts` | Audit log API | `fetch()` |

This demonstrates the team is comfortable with fetch. Only the complex SAP ADT transport remains on axios.

---

## Test Impact

All unit tests mock axios extensively (~15 test files):

```typescript
vi.mock('axios', async () => ({
  default: {
    create: vi.fn(() => ({ request: vi.fn() })),
    isAxiosError: vi.fn((err) => err?.isAxiosError === true),
  },
}));
```

Migration requires rewriting all HTTP mocks to intercept `fetch()` instead (e.g., using `vi.stubGlobal('fetch', ...)` or `msw`).

---

## Migration Effort Estimate

| Area | Lines of Code | Complexity |
|------|--------------|------------|
| Replace `AdtHttpClient` internals | ~200 LOC changed | Medium |
| Proxy + TLS via undici dispatcher | ~30 LOC | Medium-High (cross-version testing) |
| Remove `axios.isAxiosError()` checks | ~10 LOC | Trivial |
| Rewrite test mocks (~15 files) | ~200 LOC changed | Medium |
| Remove axios from package.json | 1 line | Trivial |
| **Total** | **~440 LOC** | **Medium** |

---

## Dependency Savings

| Metric | Before | After |
|--------|--------|-------|
| `axios` dep | 1.13.6 (~59KB min) | removed |
| Transitive deps removed | `follow-redirects`, `form-data`, `proxy-from-env` | — |
| `node_modules` size reduction | ~2.1MB | 0 new deps (if using undici from Node) |

---

## Conceptual Migration Example

```typescript
// Replacing the core request method in src/adt/http.ts

import { Agent as UndiciAgent, ProxyAgent } from 'undici';

// Proxy support (BTP Cloud Connector)
const dispatcher = config.btpProxy
  ? new ProxyAgent(`${config.btpProxy.protocol}//${config.btpProxy.host}:${config.btpProxy.port}`)
  : config.insecure
    ? new UndiciAgent({ connect: { rejectUnauthorized: false } })
    : undefined;

// Basic Auth (manual)
const basicAuth = config.username && config.password
  ? `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`
  : undefined;

// Timeout via AbortController
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 60000);

try {
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: controller.signal,
    // @ts-expect-error — dispatcher is a Node.js-specific fetch option
    dispatcher,
  });

  // Cookie extraction
  const setCookies = response.headers.getSetCookie();
  for (const cookie of setCookies) {
    const nameValue = cookie.split(';')[0];
    const eqIdx = nameValue.indexOf('=');
    this.cookieJar.set(nameValue.substring(0, eqIdx).trim(), nameValue.substring(eqIdx + 1).trim());
  }

  const body = await response.text();
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body };
} finally {
  clearTimeout(timeoutId);
}
```

---

## Recommendation

| Approach | Verdict |
|----------|---------|
| Full replacement now | **Possible but risky** — proxy/TLS via undici dispatcher needs cross-version validation on Node 20/22/24 |
| Hybrid (keep axios for ADT only) | **Current state** — already done, fetch used elsewhere |
| Replace after dropping Node 20 | **Safest** — undici dispatcher API is more stable in Node 22+ |

**Bottom line**: The replacement is technically feasible with zero new npm dependencies (using Node's built-in undici for proxy/TLS). The main risks are:

1. **undici dispatcher API stability across Node 20 vs 22 vs 24** — needs integration testing
2. **Test rewrite effort** — ~15 files of mock changes
3. **BTP Cloud Connector proxy** — must be validated end-to-end with a real SAP system

If the goal is to reduce dependencies, this is a good candidate — axios + transitive deps account for ~2MB of node_modules. But the safer path is to wait until Node 20 drops out of the test matrix (EOL: April 2026), then migrate using stable undici APIs.
