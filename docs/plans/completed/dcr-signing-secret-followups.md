# DCR signing-secret follow-ups: coexistence warning + MTA template

## Overview

Two small follow-ups to PR #267 (`feat: stable DCR signing key + 0/negative TTL = infinite`). Both surface configuration intent that would otherwise be silent:

1. **`validateConfig` warning** when `ARC1_DCR_SIGNING_SECRET` is set but `SAP_XSUAA_AUTH=false`. The secret is only consumed by the XSUAA OAuth proxy path; without XSUAA, it is dead weight that adds attack surface (env var leaks via `printenv`, `docker inspect`, crash dumps). A startup warning surfaces the misconfiguration without blocking legitimate staged-rollout patterns (set the secret first, flip `SAP_XSUAA_AUTH=true` after verification).
2. **`mta-overrides.mtaext.example` DCR section** documenting `ARC1_OAUTH_DCR_TTL_SECONDS` for operators and explicitly steering them away from putting `ARC1_DCR_SIGNING_SECRET` in the MTA extension. `cf set-env` survives `cf deploy`; MTA properties get rewritten on every deploy, defeating the whole point of the dedicated signing secret.

Both are opt-in observability / UX improvements. Defaults unchanged, no breaking changes, no behavior change for users who already configured PR #267 correctly.

## Context

### Current State

`src/server/config.ts:548` (`validateConfig`) has fail-fast checks for OIDC issuer/audience symmetry, PP+cookie coexistence, BTP+cookie/PP coexistence, and a soft `console.error('[warn] …')` for SAML+BTP. There is no check for `dcrSigningSecret`, so setting `ARC1_DCR_SIGNING_SECRET=…` with `SAP_XSUAA_AUTH=false` silently no-ops — the secret is parsed into `config.dcrSigningSecret` and then never read by `src/server/http.ts:244` (which only constructs the OAuth provider when `xsuaaAuth && xsuaaCredentials`).

`mta-overrides.mtaext.example` documents 17 properties (destinations, PP, safety flags, public URL, CORS, tool mode, cache warmup, diagnostics, system type, SAP client/language, TLS) but has no entry for any of the OAuth DCR properties introduced by PR #212 / PR #267 — operators reading the template have no signal that these exist or how to configure them. The signing-secret-via-`cf set-env` recommendation lives only in the PR body and `docs_page/xsuaa-setup.md`.

`docs_page/enterprise-auth.md:440` ("SAP Auth Coexistence Rules") lists four startup-time validation rules. None reference DCR.

### Target State

After this plan:

1. `validateConfig` emits `[warn] ARC1_DCR_SIGNING_SECRET is set but SAP_XSUAA_AUTH=false — the secret is unused. Unset it to reduce attack surface, or enable XSUAA OAuth proxy mode (SAP_XSUAA_AUTH=true).` to `stderr` via `console.error`, **without throwing**. Startup continues. The check is gated on `config.dcrSigningSecret` being a non-empty string.
2. `mta-overrides.mtaext.example` has a new commented section "OAuth Dynamic Client Registration (DCR)" with:
   - `ARC1_OAUTH_DCR_TTL_SECONDS: "0"` example (commented), with a one-paragraph rationale referencing the Copilot CLI / Cursor non-auto-re-register failure mode.
   - An explicit note that `ARC1_DCR_SIGNING_SECRET` is intentionally **not** in the template — use `cf set-env arc1-mcp-server ARC1_DCR_SIGNING_SECRET "$(openssl rand -base64 48)"` instead, with a one-line explanation of why (`cf set-env` survives `cf deploy`; MTA properties are rewritten on each deploy).
3. `docs_page/enterprise-auth.md` "SAP Auth Coexistence Rules" list gains rule 5 documenting the new warning.

### Key Files

| File | Role |
|------|------|
| `src/server/config.ts` | Defines `validateConfig()` (line 548); existing patterns at lines 549–591 use `throw new Error` for hard errors and `console.error('[warn] …')` for soft warnings. |
| `src/server/types.ts` | Owns `ServerConfig` with `dcrSigningSecret?: string` (line 94) and `xsuaaAuth: boolean` (line 73). No type change needed — this plan only adds validation logic. |
| `tests/unit/server/config.test.ts` | Existing `describe('validateConfig')` block at line 730. The `disableSaml2` test at line 834 is the canonical pattern for testing soft warnings (uses `vi.spyOn(console, 'error')`). |
| `mta-overrides.mtaext.example` | Tracked template; operators copy to a gitignored `mta-overrides.mtaext` and fill in landscape values. |
| `docs_page/enterprise-auth.md` | "SAP Auth Coexistence Rules" section at line 440 lists the existing four validation rules. |
| `docs_page/xsuaa-setup.md` | "Stable DCR signing key (recommended)" section already documents the `cf set-env` recipe; will gain a one-line cross-reference to the new warning. |

### Design Principles

1. **Warn, don't throw.** The misconfiguration is operationally harmless (no security regression — the unused secret cannot be exploited unless XSUAA is enabled, and at that point it would be doing its job). Throwing would block legitimate staged-rollout patterns. Match the existing soft-warning pattern at `src/server/config.ts:588` (`console.error('[warn] …')`), not the hard-throw pattern.
2. **One single warning message, named-env-var grounded.** The message must name the env var (`ARC1_DCR_SIGNING_SECRET`) and the gate (`SAP_XSUAA_AUTH`) so an operator can act on it without reading code.
3. **Don't validate length in this plan.** Concern #3 from the PR #267 review (minimum-length check on `dcrSigningSecret`) is a separate question with its own threshold debate — out of scope here.
4. **Don't put `ARC1_DCR_SIGNING_SECRET` in the MTA template.** The template is committed to source control; even a commented placeholder primes operators to fill it in there, which defeats the cross-deploy stability the secret is designed to provide. The template must explicitly steer users to `cf set-env`.
5. **Keep doc updates minimal.** This is a follow-up to PR #267, not a doc rewrite. Update the existing "Coexistence Rules" list in `enterprise-auth.md` and add a one-line cross-reference in `xsuaa-setup.md`. Do not introduce new sections.

## Development Approach

Foundation first (the `validateConfig` check + tests in `config.ts` / `config.test.ts`), then operational docs (`mta-overrides.mtaext.example`, `enterprise-auth.md`, `xsuaa-setup.md`), then final verification. The code change is ~5 lines and one branch; the three doc files are independent. Total scope: 4 tasks.

Tests use `vi.spyOn(console, 'error').mockImplementation(() => undefined)` exactly as the existing `disableSaml2` test at `tests/unit/server/config.test.ts:834` — capture the stderr write, assert content via `expect.stringContaining(...)`, restore in `finally`.

## Validation Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`

### Task 1: Add `validateConfig` warning for `dcrSigningSecret` without `xsuaaAuth`

**Files:**
- Modify: `src/server/config.ts`
- Modify: `tests/unit/server/config.test.ts`

This task adds the startup warning when `ARC1_DCR_SIGNING_SECRET` is set but `SAP_XSUAA_AUTH=false`. The secret is silently ignored in that mode today; the warning surfaces the dead config so an operator can either unset it or enable XSUAA. Match the existing soft-warning pattern at `src/server/config.ts:587` (`console.error('[warn] …')` — same channel as the `disableSaml2` warning so tests can assert on `console.error`).

- [x] Add a new check at the end of `validateConfig()` in `src/server/config.ts` (after the `disableSaml2` warning at ~line 587): if `config.dcrSigningSecret` is truthy AND `config.xsuaaAuth === false`, call `console.error('[warn] ARC1_DCR_SIGNING_SECRET is set but SAP_XSUAA_AUTH=false — the secret is unused. Unset it to reduce attack surface, or enable XSUAA OAuth proxy mode (SAP_XSUAA_AUTH=true).');`. Do not throw. Do not gate this on any other field.
- [x] Add unit tests (~3 tests) inside the existing `describe('validateConfig')` block in `tests/unit/server/config.test.ts` (block starts at line 730; place new tests adjacent to the `disableSaml2` test at line 834 since they share the `vi.spyOn(console, 'error')` pattern):
  1. **warns when `dcrSigningSecret` is set and `xsuaaAuth=false`**: spy on `console.error`, call `validateConfig({ ...DEFAULT_CONFIG, dcrSigningSecret: 'some-secret', xsuaaAuth: false })`, assert no throw and that `console.error` was called with a string containing `'ARC1_DCR_SIGNING_SECRET is set but SAP_XSUAA_AUTH=false'`. Restore the spy in `finally`.
  2. **does not warn when `dcrSigningSecret` is set and `xsuaaAuth=true`**: spy on `console.error`, call `validateConfig({ ...DEFAULT_CONFIG, dcrSigningSecret: 'some-secret', xsuaaAuth: true })`, assert no call to `console.error` with the DCR-warning substring. (Use `expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining('ARC1_DCR_SIGNING_SECRET'))` so the assertion ignores unrelated stderr noise from other potential warnings.) Restore in `finally`.
  3. **does not warn when `dcrSigningSecret` is unset**: spy on `console.error`, call `validateConfig({ ...DEFAULT_CONFIG, xsuaaAuth: false })` (default has `dcrSigningSecret` undefined), assert no call to `console.error` with the DCR-warning substring. Restore in `finally`.
- [x] Run `npm test -- tests/unit/server/config.test.ts` — all `validateConfig` tests must pass, including the new three.

### Task 2: Document OAuth DCR config in `mta-overrides.mtaext.example`

**Files:**
- Modify: `mta-overrides.mtaext.example`

This task adds a new commented section that surfaces the DCR-related env vars to operators. The signing secret intentionally does NOT appear as a property — only as a one-paragraph note steering users to `cf set-env`, because MTA properties get rewritten by every `cf deploy` (defeating the whole purpose of `ARC1_DCR_SIGNING_SECRET`).

- [x] Insert a new section after the existing "Networking / public URL" section (between the `ARC1_PUBLIC_URL` block and the `ARC1_ALLOWED_ORIGINS` "CORS" block). The new section header is `# ── OAuth Dynamic Client Registration (DCR) ────────────────────`.
- [x] Under that header, add a commented `ARC1_OAUTH_DCR_TTL_SECONDS: "0"` example with this rationale comment immediately above it (each line prefixed with `# `):
  - "Lifetime of an OAuth DCR `client_id` in seconds. Default: 30 days (matches typical OAuth refresh-token lifetimes). Positive values clamped to `[60s, 90d]`."
  - "Set to `\"0\"` to disable expiration entirely — recommended when your MCP clients (Copilot CLI, Cursor) don't auto-re-register on `invalid_client` and a finite TTL would just produce periodic outages."
- [x] Immediately below the `ARC1_OAUTH_DCR_TTL_SECONDS` block, add a `# NOTE:` comment block (no actual property line — only comments) explaining that `ARC1_DCR_SIGNING_SECRET` is intentionally NOT listed here. The note must cover:
  - The recommended setup command: `cf set-env arc1-mcp-server ARC1_DCR_SIGNING_SECRET "$(openssl rand -base64 48)"`.
  - Why `cf set-env` (not MTA properties): env vars set via `cf set-env` survive `cf deploy`; properties under `modules[*].properties` in MTA are rewritten on every deploy, which would rotate the signing secret and invalidate every cached `client_id` — defeating the whole purpose.
  - A pointer to `docs_page/xsuaa-setup.md` for the full rationale.
- [x] Verify the file still parses as valid YAML: `python3 -c "import yaml; yaml.safe_load(open('mta-overrides.mtaext.example'))" && echo OK`. Comments don't affect parsing, but verify defensively to catch any accidental indentation slip in the new section.
- [x] Run `npm test` — no test should regress (no test reads this file, but the typecheck/lint isn't relevant here either, so this is a sanity check that nothing else broke).

### Task 3: Update auth-coexistence docs

**Files:**
- Modify: `docs_page/enterprise-auth.md`
- Modify: `docs_page/xsuaa-setup.md`

This task aligns user-facing docs with the new validation rule and cross-references the warning from the "Stable DCR signing key" recipe.

- [x] In `docs_page/enterprise-auth.md`, find the numbered list under the `### SAP Auth Coexistence Rules` heading (starts at ~line 440, currently has 4 items ending with the `SAP_DISABLE_SAML=true` rule). Append a new item 5:
  - `5. `ARC1_DCR_SIGNING_SECRET` set without `SAP_XSUAA_AUTH=true` emits a warning (startup continues, secret is unused).`
- [x] In `docs_page/xsuaa-setup.md`, find the `### Stable DCR signing key (recommended)` section. Immediately after the `cf restage arc1-mcp-server` code block, add a one-line note: `ARC-1 emits a `[warn]` to stderr if `ARC1_DCR_SIGNING_SECRET` is set without `SAP_XSUAA_AUTH=true` — surfaces a misconfiguration where the secret would be unused.`
- [x] Run `npm run lint` — Biome runs against `.md` files only via formatter, not linter, so this should be a no-op. The check is defensive.

### Task 4: Final verification

**Files:**
- Review: all modified files
- Review: git diff

This task is the standard ralphex final-verification step plus an end-to-end manual check that the warning actually fires under the right conditions.

- [x] Run full test suite: `npm test` — all tests pass (expect ~2832 tests, up by 3 from the PR #267 baseline of 2829).
- [x] Run typecheck: `npm run typecheck` — no errors.
- [x] Run lint: `npm run lint` — no errors.
- [x] Manually verify the warning fires under the right conditions by running:
  - `ARC1_DCR_SIGNING_SECRET=test SAP_XSUAA_AUTH=false node -e "require('./dist/server/config.js').parseArgs([]); require('./dist/server/config.js').validateConfig({ ...require('./dist/server/types.js').DEFAULT_CONFIG, dcrSigningSecret: 'test', xsuaaAuth: false });" 2>&1 | grep ARC1_DCR_SIGNING_SECRET`
  - Expected: a `[warn] ARC1_DCR_SIGNING_SECRET is set but SAP_XSUAA_AUTH=false …` line printed to stderr. (You will need to `npm run build` first to populate `dist/`.)
  - Then re-run with `xsuaaAuth: true` and confirm **no** warning is printed.
- [x] Verify the diff for accidental scope creep (no unrelated docs, no length-check additions, no API surface changes beyond the single `console.error` line).
- [x] Move this plan to `docs/plans/completed/`.
