# Dependency Security — Tier 3: Active Supply-Chain Defense

## Overview

Tier 1 (`dependency-security-tier1-foundation.md`) closed *known-vulnerable* dependencies. Tier 2 (`dependency-security-tier2-attestation.md`) closed *artifact authenticity*. Tier 3 closes the remaining gap: **unknown-vulnerable** and **actively malicious** dependencies — packages that don't yet appear in CVE databases because they were just published, or because they're typo-squats / takeover-victims that pass `npm audit` cleanly.

The 2024 polyfill.io takeover, the `event-stream` / `flatmap-stream` 2018 attack, and the recurring xz-style supply-chain compromises share a pattern: a previously-trusted package gets a malicious update, and traditional CVE-based scanners miss it for days or weeks. This is the gap Tier 3 addresses.

The plan adds three controls:
1. **Socket.dev Pull Request review** — a free-for-OSS GitHub App that checks every PR for malicious behaviors (install scripts, network exfiltration, telemetry, suspicious permissions, typo-squat similarity to popular packages) at the *PR submission* moment, before merge.
2. **Verified GitHub-native baselines** — secret scanning, push protection, and Dependabot alerts confirmed enabled and audited; their absence is the failure mode that lets a `.env` slip into a public commit and gets the API key compromised within minutes.
3. **Vulnerability triage SLA & policy** — operationalizes Tier 1's `SECURITY.md` with concrete triage timelines, escalation paths, and a quarterly review cadence. Without this, security PRs pile up in Dependabot's queue and silently rot.

The plan also formalizes deliberate non-adoptions: **Renovate** (Dependabot is enough — no monorepo, no auto-merge complexity), **Snyk** (covered by CodeQL + Dependabot + Trivy + Socket; commercial licensing not justified at current scale), and **SLSA Level 3** (Cosign + npm provenance from Tier 2 give us SLSA Level 2; Level 3 needs a hardened, isolated builder that's not warranted yet). The decision memo lives in `docs_page/security-guide.md` so future maintainers don't re-litigate.

Design decisions:
- **Socket.dev as PR check, not auto-block.** Socket flags suspicious behaviors with severity ratings; some are true positives (typo-squat), some are false positives (a legitimate package that happens to call `child_process`). Configure as advisory at first; promote to blocking only after a 30-day false-positive review.
- **No Dependabot auto-merge.** Auto-merging Dependabot patches is appealing — but ARC-1 ships SAP credentials handling, and a transitive dep silently regressing the JWT verifier is a worst-case scenario. Maintainer review for every dep update is the cost of being trustworthy. Re-evaluate if PR volume becomes a real problem.
- **Triage SLA is tied to Tier 1 SECURITY.md.** That file already promises response times; Tier 3 adds the *internal* process (who, when, how) that makes those promises credible.
- **Defense-in-depth, not duplicate-coverage.** Socket complements Tier 1's npm audit + Dependency Review (CVE-based) by catching behavioral signals (CVE-free malicious code). Don't pay for two CVE scanners.
- **Tier 1 + Tier 2 are hard prerequisites.** Without Tier 1's CodeQL + Dependabot, Socket has nothing to layer on. Without Tier 2's Cosign + Scorecard, the trust story has gaps that Socket alone won't close.

## Context

### Current State

- After Tier 1 + Tier 2 land: Dependabot, npm audit gate, Dependency Review Action, CodeQL, Trivy, SHA-pinned third-party actions, SECURITY.md, CycloneDX SBOM, Cosign image signing, npm provenance, OpenSSF Scorecard are all in place.
- **No Socket.dev integration.** The repo is not protected against malicious-package-via-PR.
- **GitHub native security features are not centrally documented.** Some are likely on by default (secret scanning was made default for public repos in 2023), but no `docs_page/security-guide.md` section confirms which are enabled and how to verify.
- **No vulnerability triage SLA or process doc.** `SECURITY.md` (added in Tier 1) promises external-facing SLAs but does not document the internal triage process, on-call rotation (single-maintainer project — process is "alert the maintainer"), or quarterly review.
- **No formalized non-adoption decisions.** Future maintainers may re-evaluate Renovate, Snyk, SLSA L3 without context. Without a documented decision, the next maintainer might add Snyk on top of Tier 1+2 and pay $X/year for marginal improvement.
- The roadmap's last security ID after Tier 2 is `SEC-12`. This plan adds `SEC-13`.

### Target State

- Socket.dev GitHub App is installed on `marianfoo/arc-1`. Every PR that adds or updates a dependency receives a Socket bot comment with severity ratings. The default policy is **advisory** (warn, don't block); a 30-day review cycle decides which severities to promote to blocking.
- A `.github/socket.yml` configuration file customizes which Socket alert categories are surfaced and at what severity (e.g., `malware: critical`, `install-scripts: high`, `telemetry: medium`, `unknown-license: low`).
- `docs_page/security-guide.md` has a new section "Active Supply-Chain Defense (Tier 3)" with:
  - How Socket.dev integrates and how to read its PR comments.
  - A confirmed list of enabled GitHub-native features (Dependabot alerts, secret scanning, push protection, Private Vulnerability Reporting) with verification commands and screenshots.
  - The internal vulnerability triage SLA: severity → response time → escalation. This complements (does not replace) the external `SECURITY.md`.
  - A "Why we don't use X" section covering Renovate, Snyk, SLSA Level 3 with explicit reasoning, sized for revisitation in 2027 or when the project crosses 1.0.
- `docs/security-triage-process.md` (new) — internal-facing checklist for the maintainer when a Dependabot/Socket/Scorecard alert fires. Linked from `docs_page/security-guide.md` §15.4.
- A quarterly calendar reminder (manual, in maintainer's calendar) to run a one-page security review: open Dependabot alerts, Scorecard score change, Socket alert volume, time-to-fix metrics. Document the review checklist in `docs/security-triage-process.md`.
- `docs_page/roadmap.md` adds `SEC-13` completed entry. `compare/00-feature-matrix.md` extends §4.1 with Socket.dev row. `README.md` and `CLAUDE.md` updates are minor.

### Key Files

| File | Role |
|------|------|
| `.github/socket.yml` | NEW — Socket.dev policy configuration |
| `docs_page/security-guide.md` | New "Active Supply-Chain Defense" section |
| `docs/security-triage-process.md` | NEW — internal triage runbook |
| `docs_page/roadmap.md` | New `SEC-13` completed entry |
| `compare/00-feature-matrix.md` | New Socket.dev row in §4.1 |
| `README.md` | Update supply-chain bullet (no new badge) |
| `CLAUDE.md` | Reference triage runbook in security-related Key Files row |

### Design Principles

1. **Behavioral, not just CVE-based.** Tier 1's `npm audit` and Dependency Review are CVE-based. Tier 3's Socket.dev is behavior-based (install scripts, network calls, eval-like patterns). Both are needed; one alone is incomplete.
2. **Default to advisory.** PR checks that block on behavioral heuristics generate false positives that train maintainers to bypass them. Start advisory, promote to blocking after a calibration period and only for the highest-confidence categories (`malware`, known-`takeover`).
3. **No auto-merge for security updates.** Counterintuitive — but auto-merging a Dependabot security PR can introduce a regression that breaks `applyAuthHeader` or the JWT verifier. A maintainer review is the cost of trustworthiness.
4. **Document non-adoption.** Future maintainers should read once, decide once. A "Why we don't use X" subsection prevents drift toward over-tooling.
5. **Process matters.** External SLAs (SECURITY.md from Tier 1) only work if the internal triage process backs them up. A solo-maintainer project still benefits from a documented checklist — it forces consistency and is the substrate for any future co-maintainer onboarding.

## Development Approach

This plan is mostly configuration and documentation; no source code changes. Verification has two parts: (1) confirm Socket.dev fires on a synthetic PR (e.g., a draft PR adding a known-suspicious package like `colors-next` or any deprecated/typo-squat candidate, then close without merging), (2) confirm the documentation reads cleanly and the triage runbook is actionable. The non-adoption section is reviewed as a code-review item — the rationale should withstand "but what if X" pushback.

## Validation Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`

### Task 1: Install Socket.dev GitHub App and Configure Policy

**Files:**
- Create: `.github/socket.yml`

Socket.dev is a free-for-OSS GitHub App that posts a PR comment summarizing supply-chain risks for any package added or updated in the PR. Categories include `malware`, `install-scripts`, `network`, `telemetry`, `obfuscated-code`, `typo-squat`, `unknown-license`, `deprecated`, etc. The configuration file `.github/socket.yml` lets the maintainer choose which categories to surface and at what severity.

- [ ] Install the Socket.dev GitHub App at `https://github.com/apps/socket-security` and grant it access to `marianfoo/arc-1`. The free OSS plan is sufficient — no paid features are used in this plan. Document this manual install step in the PR description so the reviewer confirms post-merge.
- [ ] Create `.github/socket.yml` with:
  ```yaml
  version: 2
  projectIgnorePaths:
    - tests/**
    - tests/fixtures/**
    - docs/**
    - docs_page/**
    - compare/**
    - scripts/**
    - dist/**
    - site/**
  issueRules:
    malware: error
    didYouMean: warn
    troll: error
    suspiciousStarActivity: warn
    knownMalware: error
    typeSquat: error
    deprecated: warn
    installScripts: warn
    networkAccess: warn
    telemetry: warn
    obfuscatedCode: warn
    suspiciousString: warn
    bidi: error
    license:
      action: warn
      allow:
        - MIT
        - Apache-2.0
        - BSD-2-Clause
        - BSD-3-Clause
        - ISC
        - CC0-1.0
        - 0BSD
        - Unlicense
        - MPL-2.0
        - BlueOak-1.0.0
        - CC-BY-4.0
      deny:
        - GPL-2.0
        - GPL-3.0
        - AGPL-3.0
        - LGPL-2.1
        - LGPL-3.0
  ```
  Severity legend (Socket convention): `error` = blocks (becomes a failing check), `warn` = comments but doesn't block, `monitor` = silent log. Set the highest-confidence categories (`malware`, `knownMalware`, `typeSquat`, `troll`, `bidi`) to `error` from day one — these are unambiguous. Everything else starts at `warn`.
- [ ] After app install + config merge, open a draft PR that adds an obviously-suspicious package (e.g., `npm install --save colors-next` if still available, or any package recently flagged on `https://socket.dev/`) and confirm Socket posts a PR comment with the expected severity. Close the draft without merging. Document the test in the PR description so the reviewer can re-run.
- [ ] Schedule a 30-day calibration window (calendar reminder): after 30 days, review Socket's signal-to-noise ratio. If `installScripts` or `networkAccess` produced zero false positives in 30 days, promote them from `warn` to `error`. Document this calibration policy in `docs/security-triage-process.md` (Task 3).
- [ ] Validate YAML.
- [ ] Run `npm test` — all tests must pass.

### Task 2: Verify and Document GitHub Native Security Features

**Files:**
- Modify: `docs_page/security-guide.md`

GitHub provides several supply-chain security features that are either default-on (secret scanning for public repos), default-off-but-enabled-in-Tier-1 (Dependabot alerts), or default-off-and-not-enabled (push protection on the maintainer's account). Document the canonical state and verification commands so an operator can audit "what is GitHub doing for us automatically."

- [ ] Verify, via repository settings or `gh api`:
  - `gh api repos/marianfoo/arc-1/vulnerability-alerts` → expect 204 (enabled by Tier 1).
  - `gh api repos/marianfoo/arc-1 --jq '.security_and_analysis'` → expect `secret_scanning.status == 'enabled'`, `secret_scanning_push_protection.status == 'enabled'`, `dependabot_security_updates.status == 'enabled'`.
  - If any are `disabled`, enable them via repo settings UI (`https://github.com/marianfoo/arc-1/settings/security_analysis`) and re-verify. Capture the final state.
- [ ] Verify the maintainer account has push protection at the user level (`https://github.com/settings/security_analysis`) — this catches secrets pushed to *any* repo the maintainer commits to, including private forks. Document the recommendation; cannot be enforced via repo settings.
- [ ] Verify Private Vulnerability Reporting is enabled (Tier 1 task). `gh api repos/marianfoo/arc-1 --jq '.security_and_analysis.private_vulnerability_reporting.status'` → expect `'enabled'`.
- [ ] In `docs_page/security-guide.md`, add the section **`## 15. Active Supply-Chain Defense`** (after §14 from Tier 2). Subsections:
  - `### 15.1 Socket.dev PR review` — what Socket checks, how to read PR comments, the severity rules from `.github/socket.yml`, and the calibration policy.
  - `### 15.2 GitHub-native security features (verified enabled)` — table:
    | Feature | Verification | Status |
    |---|---|---|
    | Secret scanning | `gh api repos/marianfoo/arc-1 --jq '.security_and_analysis.secret_scanning.status'` | enabled |
    | Push protection | (same query, `secret_scanning_push_protection.status`) | enabled |
    | Dependabot alerts | `gh api repos/marianfoo/arc-1/vulnerability-alerts` (HTTP 204) | enabled |
    | Dependabot security updates | `gh api repos/marianfoo/arc-1 --jq '.security_and_analysis.dependabot_security_updates.status'` | enabled |
    | Private vulnerability reporting | (same query, `private_vulnerability_reporting.status`) | enabled |
  - `### 15.3 Vulnerability triage SLA` — internal-facing SLAs that complement `SECURITY.md`. Reference `docs/security-triage-process.md` (created in Task 3).
  - `### 15.4 Why we don't use X` — three subsections:
    - **Renovate**: "Dependabot covers our needs; Renovate adds value primarily for monorepos and complex auto-merge rules. Re-evaluate when ARC-1 has multiple distinct npm packages or sub-projects, or if Dependabot's grouping proves insufficient."
    - **Snyk**: "Tier 1+2+3 stack covers CVE detection (npm audit, Dependency Review), code scanning (CodeQL), container scanning (Trivy), and behavioral analysis (Socket.dev). Snyk would primarily add a different vuln database and a single-vendor dashboard. The added cost is not justified at current scale; revisit if a customer or partner contract specifically requires Snyk Open Source or Snyk Container."
    - **SLSA Level 3**: "Tier 2 gives us approximate SLSA Level 2: provenance + signing on a hosted builder (GitHub Actions). Level 3 requires a hardened, isolated, ephemeral builder with non-falsifiable provenance — not warranted at current scale and would require migrating off GitHub-hosted runners. Re-evaluate when ARC-1 reaches 1.0 or has enterprise customers requiring SLSA L3 attestation."
- [ ] Run `npm test` — all tests must pass.

### Task 3: Add Internal Vulnerability Triage Runbook

**Files:**
- Create: `docs/security-triage-process.md`

`SECURITY.md` (Tier 1) is the external-facing policy. This task creates the internal runbook: when a Dependabot/Socket/Scorecard alert fires, what does the maintainer do, in what order, with what timeline. The runbook is also the substrate for onboarding any future co-maintainer.

- [ ] Create `docs/security-triage-process.md` with these sections:
  - **Purpose**: "Internal runbook for handling supply-chain security signals (Dependabot alerts, Socket.dev PR comments, OpenSSF Scorecard regressions, externally-reported vulnerabilities). Complements the external-facing `/SECURITY.md`."
  - **Severity definitions** (matching SECURITY.md):
    - Critical: actively exploited, full compromise possible. Response: same-day patch.
    - High: full compromise possible under realistic conditions, no known active exploit. Response: within 14 days.
    - Moderate: limited compromise (info disclosure, DoS, lateral). Response: within 60 days.
    - Low: edge-case or theoretical. Response: best-effort, batched into the next routine release.
  - **Signal sources & triage entry points**:
    - Dependabot alert: GitHub Security tab → click alert → assess severity → either accept Dependabot's auto-PR (default) or open issue if Dependabot can't auto-fix.
    - Socket.dev PR comment: read severity, open issue if non-PR-context (e.g., `npm audit` finds a transitive that Socket flagged), otherwise the PR comment is the discussion.
    - OpenSSF Scorecard regression: the score moves down between weekly runs → triage which check regressed → open issue.
    - External report (via SECURITY.md): see SECURITY.md for SLA.
  - **Triage workflow** (numbered steps):
    1. Assign severity within 3 business days (matches SECURITY.md SLA).
    2. Decide remediation path: (a) accept Dependabot PR, (b) manual update, (c) defer with documented rationale, (d) replace dependency, (e) escalate.
    3. For "defer": add to a `## Known Vulnerabilities (deferred)` section in the next CHANGELOG/release notes with reason and revisit date.
    4. Verify the fix lands and the alert is auto-closed by GitHub (Dependabot closes its own alerts; Socket closes when the offending dep version is gone).
  - **Quarterly review checklist** (to be run on the first business day of each quarter):
    - Open Dependabot alerts: count, oldest age, severity distribution.
    - Scorecard score: current vs. last quarter; drilldown on any regression.
    - Socket.dev metrics: alert volume, true-positive rate.
    - Time-to-fix: median age of patched alerts in the quarter.
    - Action items: list of follow-ups.
  - **Escalation paths**:
    - Public advisory needed → use GitHub Security Advisory (GHSA) → publish from the Security tab.
    - SAP-system-side compromise (PP CA key, etc.) → see SECURITY.md "PP CA Key Compromise" section.
    - Critical 0-day in `arc-1` itself → publish patched release within 14 days (matches SECURITY.md SLA), backport to prior supported minor if applicable.
  - **Roles** (currently solo-maintainer):
    - Primary: maintainer (`@marianfoo`).
    - Backup: none currently. If a backup is added, document handoff procedure.
- [ ] Run `npm run lint` to confirm Markdown is valid.
- [ ] Run `npm test` — all tests must pass.

### Task 4: Update Documentation

**Files:**
- Modify: `docs_page/security-guide.md` (already extended in Task 2 — finalize cross-references)
- Modify: `docs_page/roadmap.md`
- Modify: `compare/00-feature-matrix.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

Wire the Tier 3 controls into the canonical artifacts so future maintainers and operators can find them.

- [ ] In `docs_page/security-guide.md` §15.3, replace the placeholder reference with an explicit link to `docs/security-triage-process.md` (created in Task 3). Verify the link resolves under `mkdocs build` (mkdocs uses repo-relative paths).
- [ ] In `docs_page/roadmap.md`:
  - In the "Overview: Completed" table, add a new row: `| [SEC-13](#sec-13) | Active Supply-Chain Defense (Socket.dev PR review, GitHub native features verified, internal triage runbook, non-adoption decisions documented) | <today's YYYY-MM-DD> | Security |`.
  - In the "Details: Completed" section, add a new `<a id="sec-13"></a>` block: status, summary, four sub-deliverables (Socket.dev install, GitHub feature verification, triage runbook, non-adoption memo), and a link to `docs/security-triage-process.md`.
  - Update "Last Updated".
- [ ] In `compare/00-feature-matrix.md`:
  - Extend §4.1 "Supply-Chain Security" with new rows: Socket.dev PR review, secret scanning + push protection (verified), vulnerability triage SLA, non-adoption memo. Score ARC-1 ✅; competitors based on facts (most score ❌).
  - Update "_Last updated:_".
- [ ] In `README.md`, update the existing "Supply-chain security" bullet (extended in Tier 2) to read: "Dependabot, npm audit, Dependency Review, CodeQL, Trivy, Cosign keyless image signing, CycloneDX SBOM, npm provenance, OpenSSF Scorecard, **Socket.dev PR review**, secret scanning + push protection. See [security guide §13–15](docs_page/security-guide.md#13-dependency--supply-chain-security)."
- [ ] In `CLAUDE.md`, in the "Key Files for Common Tasks" table, add:
  - `| Configure Socket.dev policy or supply-chain alert behavior | \`.github/socket.yml\`, \`docs/security-triage-process.md\` (triage runbook), \`docs_page/security-guide.md\` §15 |`
  - `| Triage a security alert | \`docs/security-triage-process.md\` (internal runbook), \`SECURITY.md\` (external policy) |`
- [ ] Run `npm run lint` and `npm test` — all tests pass.

### Task 5: Final Verification

- [ ] Run full test suite: `npm test` — all tests pass.
- [ ] Run `npm run typecheck` — no errors.
- [ ] Run `npm run lint` — no errors.
- [ ] Confirm Socket.dev GitHub App is installed on `marianfoo/arc-1` (visible at `https://github.com/marianfoo/arc-1/settings/installations`).
- [ ] Confirm `.github/socket.yml` is read by Socket — the next PR that touches `package.json` or `package-lock.json` should produce a Socket comment that respects the configured `issueRules`.
- [ ] Confirm `gh api repos/marianfoo/arc-1 --jq '.security_and_analysis'` returns enabled status for: secret_scanning, secret_scanning_push_protection, dependabot_security_updates, private_vulnerability_reporting.
- [ ] Confirm `docs/security-triage-process.md` is reachable from `docs_page/security-guide.md` §15.3 link.
- [ ] Confirm `docs_page/security-guide.md` §13–15 build correctly via `mkdocs build`.
- [ ] Confirm `docs_page/roadmap.md` has SEC-11, SEC-12, SEC-13 entries linked correctly.
- [ ] Confirm `compare/00-feature-matrix.md` §4.1 has all three tiers' rows and the "_Last updated:_" date is current.
- [ ] Schedule a calendar reminder for the **30-day Socket calibration review** (Task 1) and the **first quarterly security review** (Task 3 runbook).
- [ ] Move this plan to `docs/plans/completed/dependency-security-tier3-defense.md`.
