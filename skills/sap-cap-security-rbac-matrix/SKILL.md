---
name: sap-cap-security-rbac-matrix
description: Comprehensive security audit for SAP CAP applications: multi-area parallel scanning (handlers, MCP/server, file-upload, deploy/k8s, jobs/integration, CC segregation) + role and role-collection coherence matrix (xs-security ↔ Keycloak ↔ services-auth ↔ handlers ↔ frontend ↔ SoD policy) + OWASP Top 10 / OWASP API Top 10 / ASVS / NIST CSF / CIS / SAP-SOM compliance mapping. Outputs a committable security audit report with findings ranked by confidence ≥0.8. Use when asked to "audit security", "verify RBAC coherence", "check OWASP compliance", "review CAP auth posture", or "produce a security compliance report".
---

# SAP CAP Security & RBAC Matrix Audit

End-to-end security audit for enterprise SAP CAP applications: scans 6 attack-surface areas in parallel, builds a role / role-collection coherence matrix across 4 declaration layers (xs-security, Keycloak realm, CDS @restrict, handlers), and maps every finding to industry compliance frameworks (OWASP Top 10 2021, OWASP API Top 10 2023, ASVS L1-L3, NIST CSF, NIST SP 800-53, CIS K8s/Docker, SAP Secure Operations Map, GDPR, SOX 404).

Read-only audit, idempotent, ~5-10 minute run with parallel agent dispatch. Designed for pre-deployment compliance gates and quarterly security health checks.

## Smart Defaults (apply silently, do NOT ask)

| Setting | Default | Rationale |
|---|---|---|
| Scope | `all` (6 attack-surface areas + role matrix) | Default to full sweep; user narrows if needed |
| Mode | `report` (read-only) | Safe by default |
| Confidence threshold | ≥0.8 | No false-positive shipping |
| Framework citation | OWASP A0X + ASVS V_a.b + at least 1 additional control (NIST / CIS / SAP-SOM / GDPR / SOX) | Defense-in-depth across multiple frameworks |
| Output | `docs/audit/<yyyy-mm-dd>-security-matrix.md` | Committable for traceability |
| Auto-fix | Safe-only: `assertCompanyCodeAccess` injection, `_sanitize*` wrap, CDS `@restrict` CC where addition, xs-security SoD bundle fix, Keycloak realm hardening | Reversible, contained |
| Target ASVS level | L2 minimum | Enterprise SAP + financial workflows posture |
| Parallel agent dispatch | 5 area agents + 1 role agent + 1 CC segregation agent | ~5-10 min total runtime |

## Input

Optional flags:

- **scope** — `all` (default) | `security` (skip role matrix) | `roles` (only role coherence) | `cc-segregation` (only CC scoping audit) | `srv-only` | `auth-only` | `owasp` (only OWASP/Industry) | `compliance` (only matrix mapping)
- **mode** — `report` (default) | `fix` (safe-only auto-apply on dedicated branch) | `pending-only` (re-check previous findings)
- **canonical role list** — path to a project-specific role catalog file (auto-detected if not provided)
- **target frameworks** — comma list to restrict, e.g., `owasp-top10,asvs,nist-csf`

## Framework Reference (authoritative)

| Framework | Version | Scope |
|---|---|---|
| **OWASP Top 10** | 2021 | Web app generic — A01 Broken Access Control · A02 Crypto Failures · A03 Injection · A04 Insecure Design · A05 Misconfiguration · A06 Vulnerable Components · A07 ID & Auth · A08 SW & Data Integrity · A09 Logging & Monitoring · A10 SSRF |
| **OWASP API Security Top 10** | 2023 | REST/OData API — API1 BOLA · API2 Broken Auth · API3 BOPLA · API4 Resource Consumption · API5 BFLA · API6 Sensitive Business Flows · API7 SSRF · API8 Misconfig · API9 Improper Inventory · API10 Unsafe Consumption |
| **OWASP ASVS** | 4.0.3 L1-L3 | V2 Auth · V3 Session · V4 Access Control · V5 Validation · V6 Crypto · V7 Errors · V8 Data Protection · V9 Comms · V10 Code · V11 BizLogic · V12 Files · V13 API · V14 Config |
| **NIST CSF** | 2.0 | Identify · Protect · Detect · Respond · Recover |
| **NIST SP 800-53** | rev5 | AC · AU · IA · SC · SI control families |
| **CIS Kubernetes** | 1.9 | Pod security · RBAC · NetworkPolicy · Secret mgmt · Container image |
| **CIS Docker** | 1.6 | Host · Daemon · Image · Container runtime |
| **SAP Secure Operations Map** | 2024 | 12 layer: Awareness · Process · Compliance · Auth · UI · Custom Code · Roles · Audit · Sec Hardening · System Mgmt · Network · OS/DB |
| **GDPR** | EU 2016/679 | Art. 5 Data Minimization · Art. 17 Right to Erasure · Art. 25 Privacy by Design · Art. 32 Sec of Processing |
| **SOX 404** | PCAOB AS 2201 | Audit log append-only · 4-eyes SoD · Change mgmt · Access review |

## Step 1: Pre-flight + Project Detection

### 1a. Verify CAP project type

```bash
test -f package.json && grep -q '"@sap/cds"' package.json
```

If not a CAP project, stop and inform user.

### 1b. Detect security configuration files

```bash
find . -maxdepth 3 -name "xs-security.json" 2>/dev/null
find . -maxdepth 4 -name "keycloak-realm.json" -o -name "*-keycloak-realm.json" 2>/dev/null
find srv -name "services-auth.cds" -o -name "*-auth.cds" 2>/dev/null
find approuter -name "xs-app.json" 2>/dev/null
```

Note presence/absence of each file — Steps 2 and 3 adapt accordingly.

### 1c. Resolve canonical role catalog

Auto-detect roles from `xs-security.json`:

```bash
node -e "JSON.parse(require('fs').readFileSync('xs-security.json','utf8')).scopes.map(s => s.name.split('.').pop())" 2>/dev/null
```

If a `CLAUDE.md` or `docs/security.md` exists with a "canonical roles" section, prefer that as the authoritative list.

### 1d. Branch creation (if mode=fix)

```bash
git checkout -b codex/security-matrix-<scope>-$(date +%Y-%m-%d)
```

## Step 2: Parallel Area Audits (5 area agents)

Dispatch 5 parallel scans, one per attack-surface area:

### Agent S1 — Backend handlers + auth

**Scope**: `srv/handlers/*.ts` + `srv/services-auth.cds` + `srv/*.cds` (main service)

**Looks for** (frameworks: OWASP A01/A03/A04 · API1/API3/API5 · ASVS V4/V5):

- **Authorization bypass**: action handler accepting `companyCode` from `req.data` without `assertCompanyCodeAccess(req, cc)` call → A01 Broken Access Control · API1 BOLA · API5 BFLA
- **SQL injection** via template strings in `cds.run` / `db.run` → A03 · ASVS V5.3.4
- **`forUpdate` missing** in lifecycle action (TOCTOU race) → A04 Insecure Design
- **`req.reject` with `err.message` raw** instead of `rejectSafe()` → A09 · ASVS V7.4.1 (info leak)
- **CDS @restrict gap**: entity exposed without `@restrict` OR `grant: '*'` without CC scope (only SuperAdmin allowed) → API3 BOPLA · ASVS V4.2.2
- **AuditLogEntry INSERT bypassing `_sanitizePII`** → A02 · GDPR Art. 5 · ASVS V8.3.4
- **Mass assignment**: `req.data` whitelist not enforced (FE PATCH can write `@Core.Computed` / `LegalImmutable` fields) → API6 · ASVS V5.1.2

### Agent S2 — MCP + server + token

**Scope**: `srv/mcp/*.ts` + `srv/server.ts` + `srv/jobs/CronJob*.ts` + sacAnalyticsHandler.ts + ai/MCP* if present

**Looks for** (OWASP A02/A05/A07 · API2/API8/API10 · ASVS V2/V3/V14):

- **Token validation without `timingSafeEqual` HMAC** → A02 · API2 · ASVS V2.4.1 (timing-attack safe compare)
- **Fail-closed gap in production** (Swagger UI mount + MCP fail-closed + OIDC skip path exact match) → A05 · API8 · ASVS V14.3.2
- **CC whitelist enforcement** on MCP query-data (auto-inject `{ccField IN whitelist}`) → API1 · ASVS V4.2.1
- **JWT validation** (no `alg: none`, no `kid` spoofing, issuer + audience checked) → A07 · ASVS V3.5.3
- **Bearer token in URL/query** (logged → leak) → ASVS V2.2.5 (token in header only)

### Agent S3 — File upload + parsing

**Scope**: `srv/inbound/*.ts` + `srv/utils/xmlParser.ts` + `srv/extraction/**.ts` + `srv/dms/**.ts` + archive/documentHub actions

**Looks for** (OWASP A03/A10 · API7/API10 · ASVS V12/V13):

- **XXE injection** (xml2js / fast-xml-parser external entity processing) → A03 · ASVS V13.2.6
- **Zip slip / path traversal** in archive extraction → A01 · ASVS V12.3.1
- **Magic bytes bypass** (header NOT trusted, only magic bytes) → ASVS V12.1.1
- **SSRF via Document Hub resolver** (host/protocol control) → A10 · API7 · ASVS V12.6.1
- **Stream limit bypass** (size cap enforced BEFORE read, not after) → ASVS V12.1.3
- **CC propagation** on streamDocument → API1 · ASVS V4.2.1

### Agent S4 — Deploy + k8s + secrets

**Scope**: `Dockerfile*` + `k8s/*.yaml` + `xs-security.json` + `.github/workflows/*.yml` + `scripts/ci/*.sh` + `mta.yaml`

**Looks for** (OWASP A05/A06/A08 · CIS K8s/Docker · NIST SC-7/SI-2):

- **GH Actions injection** (`pull_request_target` + checkout PR head) → A08 · ASVS V14.2.1
- **SHA pinning gap** (`actions/checkout@v4` non-SHA) → A08 · NIST SR-3
- **Secret echo in workflow logs** → A02 · ASVS V2.10.4
- **K8s secret mounted as env var** (HANA/S4/MCP/OIDC password) → CIS K8s 5.4.1 · ASVS V2.10.1
- **NetworkPolicy egress ALLOW_ALL** → CIS K8s 5.3.2 · NIST SC-7
- **Container runs as root** (no `runAsNonRoot`) → CIS K8s 5.2.6 · CIS Docker 4.1
- **`tenant-mode: shared`** when single-tenant intended → API3 BOPLA · ASVS V4.3.1
- **Dockerfile `FROM <image>:latest`** (image pinning by tag) → CIS Docker 4.2

### Agent S5 — Jobs + integration + adapters

**Scope**: `srv/jobs/*.ts` + `srv/messaging/*.ts` + `srv/integration/**.ts` + `srv/notifications/**.ts` + `srv/audit/auditLogger.ts`

**Looks for** (OWASP A02/A08/A09 · API2/API10 · ASVS V6/V9 · SAP-SOM L4/L8):

- **Webhook signature missing** (Event Mesh, BPA callback, email receivers) → A08 · API10 · ASVS V14.5.3
- **system-user role bypass** (used outside documented webhook endpoints) → API5 BFLA · ASVS V4.2.1
- **Notification PII leak** (`_sanitizeNotificationComment` bypass on SMTP/Teams/Slack outbound) → A02 · GDPR Art. 5 · ASVS V8.3.4
- **Adapter factory selection bypass** (SystemParameter `*_ADAPTER` writable by non-Admin) → API3 BOPLA · A05
- **Idempotency key replay** (event format not validated) → API4 · ASVS V11.1.6
- **SMTP TLS verification disabled** (`rejectUnauthorized: false`) → A02 · ASVS V9.1.1
- **Audit log NOT append-only** at DB layer → A09 · SOX 404 · ASVS V7.3.2
- **Encryption-at-rest missing** for `IsSecret=true` SystemParameter → A02 · ASVS V6.2.1

## Step 3: Agent O1 — OWASP/Industry Orthogonal

SKIP if `scope=roles` / `auth-only`.

**Scope**: `srv/server.ts`, `approuter/xs-app.json`, `srv/handlers/*.ts`, `package.json` + `package-lock.json`, `srv/utils/paramEncryption.ts`, `.env*` / `terraform/**/secrets*`

**Categories** (cross-cutting):

1. **Security headers** [OWASP A05 · ASVS V14.4]: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cookie SameSite+Secure+HttpOnly
2. **Cryptographic failures** [A02 · ASVS V6]: Hash algo (no MD5/SHA1), RNG (`crypto.randomBytes`), JWT signature pinned, encryption-at-rest AES-256-GCM, key derivation (PBKDF2 ≥600k iter / Argon2id)
3. **IDOR / BOLA horizontal** [A01 · API1]: action handlers receiving `id` parameter without `companyCode` filter in lookup
4. **SSRF host control** [A10 · API7 · ASVS V12.6]: destination URL parametrized + host whitelist (no `0.0.0.0`/`169.254.169.254`/`localhost`)
5. **Components & supply chain** [A06 · NIST SR-3]: `npm audit --production` critical/high residue, lockfile committed, frozen-lockfile in CI
6. **Insecure design** [A04 · ASVS V1]: abuse case missing (webhook flood, race condition, replay), trust boundary unclear
7. **ID & Auth** [A07 · ASVS V2/V3]: session fixation, cookie timeout > 8h, refresh token rotation, MFA option
8. **Logging adequacy** [A09 · NIST AU-2/AU-3 · ASVS V7]: `cds.log()` vs `console.*`, auth failure logged distinguishable, SuperAdmin trail, rate-limit hit logged
9. **Hardcoded secrets** [A02 · ASVS V2.10]: regex sweep for `(api[_-]?key|secret|password|token)\s*=\s*['"][a-zA-Z0-9]{16,}['"]` in srv/scripts/terraform
10. **API inventory & misconfig** [API9/API8]: OpenAPI spec up-to-date, debug/health endpoints behind auth, CORS `*` on sensitive endpoints

## Step 4: Role + Role-Collection Coherence Matrix

SKIP if `scope=security` / `cc-segregation`.

For each canonical role identified in Step 1c, verify 4-layer declaration coherence:

### Matrix verification

| Layer | Source | Check |
|---|---|---|
| xs-security.json | `scopes[]` + `role-templates[]` + `role-collections[]` | Every canonical role has scope + template + collection |
| Keycloak realm | `roles.realm[]` + `groups[]` + `clients[].roleMappings` | Every canonical role has realm-role + matching group |
| services-auth.cds | `@restrict.to[]` + `@restrict.grant` | Every canonical role used in at least one `@restrict` |
| Handlers runtime | `req.user.is('<role>')` calls | Every role-name string matches canonical set |

### Coherence findings

| Drift type | Severity | Example |
|---|---|---|
| **Zombie role** | LOW | Role in xs-security but never in @restrict + never in handler check |
| **Orphan role check** | HIGH | Handler `req.user.is('Approver')` but no `Approver` scope in xs-security |
| **Naming drift** | HIGH | Role `Manager` in xs-security but handler checks `manager` (case mismatch) |
| **Keycloak gap** | HIGH | Role in xs-security but missing realm-role + group → cannot be assigned on-prem |
| **Collection over-bundle** | HIGH | Role collection includes mutex roles (e.g., `Approver` + `PostingOfficer` outside SOD-exempt) |

### SoD (Segregation of Duties) policy verification

For canonical role pairs declared as SoD-conflicting:

```typescript
// Expected pattern in OIDCAuthStrategy / handlers:
const SOD_EXEMPT_ROLES = ['OperationalAdmin', 'SuperAdmin', 'system-user'];
const SOD_MUTEX_PAIRS = [['Approver', 'PostingOfficer'], ...];
```

For each mutex pair, verify no role collection bundles both (unless in `SOD_EXEMPT_ROLES`).

## Step 5: CC Segregation Audit

SKIP if `scope=roles` / `auth-only` / `security`.

For multi-tenant CAP apps where each tenant has its own `CompanyCode`:

### 5a. Entity scope audit (services-auth.cds)

For every entity with `CompanyCode` column in schema:

```bash
# Find entities with CompanyCode field
grep -nE "CompanyCode\s*:\s*String" db/schema.cds 2>/dev/null

# Verify their @restrict has CC where
grep -nE "@restrict|@grant" srv/services-auth.cds | grep -B1 -A2 "<EntityName>"
```

Expected: `where: "CompanyCode = \$user.attr.CompanyCode"` for every non-SuperAdmin grant.

### 5b. Handler audit

For every action handler accepting `req.data.companyCode`:

```bash
grep -nE "req\.data\.companyCode" srv/handlers/*.ts 2>/dev/null
```

Each call must be followed (within a few lines) by `assertCompanyCodeAccess(req, ...)`. If not → finding HIGH (cross-CC mutation possible).

### 5c. Repository query audit

For repository functions:

```bash
grep -rnE "(SELECT|UPDATE|DELETE).*from\s*\(" srv/repositories/ 2>/dev/null
```

Must include `companyCode` in WHERE clause when entity has CC column. Repository function signatures should expose `companyCode` parameter (not inferred from request context, to avoid leaks).

### 5d. Cross-CC leak via association

For entities with `Association to <ParentEntity>`:

```bash
grep -rnE "Association to" db/schema.cds 2>/dev/null
```

Verify parent entity is also CC-scoped — otherwise a child query may leak parent data from other CC.

## Step 6: Compliance Matrix Mapping

For each finding from Steps 2-5, map to control framework.

### Per-finding mapping table

| ID | Severity | OWASP T10 | OWASP API | ASVS | NIST 800-53 | CIS | SAP SOM | GDPR | SOX |
|---|---|---|---|---|---|---|---|---|---|

### Coverage rollup

| Framework | Findings covered | Status |
|---|---|---|
| OWASP A01-A10 | N total | ✅ / ⚠️ / 🔴 |
| OWASP API1-API10 | N | ✅ / ⚠️ / 🔴 |
| ASVS L1 | N covered / total | ✅ |
| ASVS L2 | N covered / total | ✅ |
| ASVS L3 | N covered / total | ⚠️ |
| NIST CSF function | N control | — |
| CIS K8s/Docker | N control | — |
| SAP SOM 12 layer | N / 12 | — |

### Gap analysis (controls NOT yet verified)

Honest assessment: list framework areas the audit did NOT cover (e.g., ASVS V12.4 anti-virus integration, NIST AC-17 Remote Access).

## Step 7: Output Report

Save markdown to `docs/audit/<yyyy-mm-dd>-security-matrix.md`:

```markdown
# Security Matrix Audit — <scope> — <yyyy-mm-dd>

## Pre-flight
- Branch / sha / scope / mode

## Discovery
- Security config files detected
- Canonical roles identified: <N>
- Mode dispatched: <area agents + role agent + CC agent>

## Security Review (per area)
| Area | Status | Findings | Frameworks |

## Role Definition Matrix
(N canonical × 4 layers)

## Role Collection Matrix
(M collections × role inclusion × SoD conflicts)

## CC Segregation Matrix
(Entity × @restrict CC where × handler guard × repository CC filter)

## Findings (confidence ≥0.8)
### [HIGH] CATEGORY: file:line
- Description
- Exploit / Impact
- Framework mapping: OWASP A0X · API_Y · ASVS V_a.b · NIST CONTROL · CIS X.Y · SAP-SOM L_n
- Confidence: 0.X
- Fix: <recommendation>

## Compliance Matrix
(per-finding + coverage rollup + gap analysis)

## Checks Passed (verified clean)
<list>

## Fix Plan / Fix Applied (mode=fix)
| Severity | Item | Effort | Auto-fixable |

## Re-verification
- Cadence: monthly / quarterly / pre-deployment
- Command: `sap-cap-security-rbac-matrix` (this skill)
```

## Step 8: Apply Fixes (only when `mode=fix`)

### Safe auto-applicable

1. **`assertCompanyCodeAccess` injection** in handler that accepts `companyCode` from request (helper must already exist in `srv/utils/authGuards.ts`)
2. **`_sanitize*` wrap** on PII / notification output (helper must already exist)
3. **CDS `@restrict` CC where addition** in `services-auth.cds` for entities with CC column (CDS-only, additive)
4. **xs-security.json SoD bundle fix** — remove conflicting role from over-bundled collection
5. **Keycloak realm hardening** — add token TTL defaults, add missing realm-role for declared scope

### NOT auto-applied (manual decision required)

- Refactor handler signature
- Schema change (db/migrations)
- Action availability matrix change
- Cross-cutting adapter factory refactor
- Rename collection in xs-security (breaking change for existing bindings)
- Remove legacy role (architectural decision)

### Verification after fix

```bash
git diff --stat
npx cds compile srv app --service OrchestratorService --to edmx > /dev/null
node -e "JSON.parse(require('fs').readFileSync('xs-security.json','utf8'))"  # valid JSON
```

## BTP vs On-Premise Differences

| Aspect | BTP Cloud Foundry | Kyma | On-Premise |
|---|---|---|---|
| Auth | XSUAA | XSUAA + IAS | Keycloak / IAS / custom |
| Role mapping | xs-security.json + IAS groups | Same | Keycloak realm + groups |
| Token lifecycle | XSUAA-managed | Same | Keycloak-managed (TTL must be pinned) |
| Audit log | BTP Audit Log Service | Same | Custom adapter |
| Network isolation | Cloud Connector | NetworkPolicy + Connectivity Proxy | Firewall + VLAN |

## Error Handling

| Error | Cause | Fix |
|---|---|---|
| No `xs-security.json` found | Project uses different auth scheme | Skill skips xs-security checks, focuses on services-auth.cds + handlers |
| No canonical role catalog | Project lacks a centralized role definition | Auto-extract roles from xs-security.json scopes; warn user about role drift risk |
| Keycloak realm not found | BTP-only deployment | Skip Keycloak matrix check; flag if on-prem deployment is planned |
| Grep returns too many "matches" in handlers sweep | Permissive patterns | Tighten patterns; use `--scope srv/handlers/specific` for focused audit |
| `assertCompanyCodeAccess` helper not found | Project uses different CC guard pattern | Ask user for the helper function name + adjust check |
| Audit log entity not detected | Custom audit table name | Ask user to specify; default search pattern is `AuditLogEntry` / `audit_log` |

## What This Skill Does NOT Do

- **No penetration testing** — static audit; doesn't execute exploits
- **No runtime instrumentation** — analyzes source code, not running app
- **No SQL injection runtime test** — flags suspicious patterns, doesn't execute
- **No dependency CVE deep-scan** — basic `npm audit` only; for deep analysis use Snyk / Dependabot
- **No social engineering / phishing audit** — out of code-level scope
- **No third-party service security** (XSUAA / IAS internals) — assumes BTP managed services are secure
- **No compliance certification** — provides evidence; certification (SOC 2, ISO 27001) requires auditor sign-off

## When to Use This Skill

- **Pre-deployment gate** — quarterly compliance check before production release
- **Pre-acquisition audit** — assessing 3rd-party CAP app security posture
- **Post-incident review** — after security event, verify scope + identify similar gaps
- **Customer compliance request** — SOC 2 / ISO 27001 / GDPR evidence
- **Role refactor validation** — after adding/removing roles, verify coherence
- **OWASP/ASVS readiness** — pre-ASVS Level 2 verification audit

## When NOT to Use This Skill

- **Greenfield project before first deploy** — too early; come back after first iteration with concrete attack surface
- **Pure ABAP / non-CAP project** — use [sap-clean-core-atc](../sap-clean-core-atc/SKILL.md) instead
- **Single-user / personal project** — overkill; multi-tenant patterns don't apply
- **Real-time penetration test** — use specialized pen-test tooling

## Follow-up

After this skill produces the audit:

- **HIGH findings**: fix immediately (auto-apply where safe, manual review otherwise)
- **MEDIUM findings**: track in pending list, fix in next sprint
- **LOW findings**: document in `docs/security-backlog.md`, address opportunistically
- **Role drift**: align across 4 layers (xs-security ↔ Keycloak ↔ services-auth ↔ handlers)
- **CC segregation gap**: prioritize — cross-CC leaks are GDPR / SOX critical
- **Re-run quarterly** — cadence depends on release velocity; weekly during active feature work

Related skills:

- [sap-cap-clean-core-enforce](../sap-cap-clean-core-enforce/SKILL.md) — S/4 API Clean Core compliance (complementary)
- [sap-cap-customizing-honor](../sap-cap-customizing-honor/SKILL.md) — customizing coverage audit (complementary)
- [migrate-custom-code](../migrate-custom-code/SKILL.md) — ABAP-side ATC fixes (companion for SAP custom code)

## References

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP ASVS 4.0.3](https://github.com/OWASP/ASVS/tree/v4.0.3)
- [NIST CSF 2.0](https://www.nist.gov/cyberframework)
- [NIST SP 800-53 rev5](https://csrc.nist.gov/projects/risk-management/sp800-53-controls)
- [CIS Kubernetes Benchmark 1.9](https://www.cisecurity.org/benchmark/kubernetes)
- [CIS Docker Benchmark 1.6](https://www.cisecurity.org/benchmark/docker)
- [SAP Secure Operations Map](https://help.sap.com/docs/secure-operations-map)
- [CAP `@restrict` + XSUAA documentation](https://cap.cloud.sap/docs/guides/authorization)
