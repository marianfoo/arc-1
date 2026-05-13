---
name: sap-cap-ci-gates-pattern
description: Library of five reusable CI gate patterns for SAP CAP projects — bidirectional CSV ↔ code consistency, catalog raise-coverage, released-state / API-availability drift detection, convention-matrix drift, and CSV schema lint. Each pattern is a small portable shell script with a clear contract (inputs, exit codes, output format) that plugs into GitHub Actions, GitLab CI, Jenkins, or BTP CI/CD pipelines. Use when asked to "add a CI gate", "build a drift-detection check", "enforce CSV/code parity", "prevent orphan catalog entries", "set up CI for a CAP project", or to harden a project against regressions of a structural invariant.
---

# SAP CAP — CI Gates Pattern Library

This skill is a **library of reusable CI gate patterns** for SAP CAP projects, not a runner. It teaches the agent to **build** five small portable shell-based gates that catch the most common classes of regression in CAP+Fiori projects, and to wire them into a CI pipeline (GitHub Actions, GitLab CI, Jenkins, or BTP CI/CD).

Each gate follows a deliberate contract:
- One concern per gate.
- POSIX `sh` or `bash` only; no Node/Python dependency unless the project already requires it.
- Idempotent: same repo state → same exit code.
- Exit `0` = pass, `1` = fail (CI-blocking), `2` = warning (non-blocking, prints but allows continue).
- Output: structured (TSV / JSON-lines) so humans and automation can read it.

The skill is **descriptive** (it explains the patterns) and **generative** (in `apply` mode it writes the scripts and the workflow YAML into the project).

## v1 Guardrails

- **Generates scripts only.** Never edits production code, never opens PRs.
- **Idempotent generation.** Re-running `apply` overwrites the gate scripts only if `--force` is passed; otherwise it skips existing files.
- **Pattern-first, project-second.** The skill teaches the pattern; the user chooses which patterns apply to their project. Do not apply all five if some are irrelevant.
- **Cite exit codes and output format** in the generated scripts so CI logs are self-explanatory.

## Smart Defaults (apply silently, do NOT ask)

| Aspect | Default | Why |
| --- | --- | --- |
| Mode | `describe` (explain patterns, generate nothing) | Safer; user opts into `apply` |
| Script location | `scripts/ci/` | Common convention |
| CI provider | GitHub Actions (`.github/workflows/`) | Most common in CAP open-source |
| Shell | `bash` with `set -euo pipefail` | Portable + safe defaults |
| Exit semantics | `0` pass · `1` fail · `2` warn | Aligns with standard CI runners |
| Output format | Plain text for humans, optional `--json` flag for automation | Easier to triage in CI logs |

## Input

Single optional argument with format `<pattern> [mode]`:

| Argument | Meaning |
| --- | --- |
| (empty) | Describe all five patterns; generate nothing |
| `bidirectional` · `raise-coverage` · `availability-drift` · `convention-drift` · `csv-lint` | Describe one specific pattern |
| `all apply` | Generate all five gates into `scripts/ci/` + a workflow YAML |
| `<pattern> apply` | Generate only that one pattern |

Examples: (no arg) · `bidirectional apply` · `all apply`.

## The Five Patterns

### Pattern 1 — Bidirectional CSV ↔ Code Consistency

**Intent.** When a project uses a settings table seeded via CSV (e.g. SystemParameter pattern), each parameter must have a consumer in code, and each `params.X` read in code must have a CSV seed. Otherwise the admin UI surfaces dead settings, or the code reads from a setting the admin doesn't know exists.

**Inputs.**
- CSV file: e.g. `db/data/sap.<namespace>-Settings.csv` with a column representing the key (often the first column, e.g. `Key`).
- Code paths: `srv/` and any subset where settings are consumed.
- Reader pattern: typically `params.X`, `cfg.X`, `<helper>.get(...).<X>`, or similar — discovered from the project.

**Algorithm.**
1. Extract CSV keys → `csv-keys.txt`.
2. Grep code for keys read from settings → `code-keys.txt`.
3. `comm -23 code-keys.txt csv-keys.txt` → **inverse orphans** (code reads, CSV missing).
4. `comm -23 csv-keys.txt code-keys.txt` → **forward orphans** (CSV seeds, no consumer).
5. Apply an allowlist (some seed keys are intentionally consumed by external systems and won't appear in code).
6. Exit `1` if either list is non-empty (minus allowlist).

**Skeleton (`scripts/ci/check-settings-bidirectional.sh`).**

```bash
#!/usr/bin/env bash
set -euo pipefail

CSV="${1:-db/data/<project>-Settings.csv}"
CODE_DIR="${2:-srv}"
KEY_COL="${3:-1}"  # column index in the CSV (1-based)
ALLOWLIST="${4:-scripts/ci/settings-allowlist.txt}"

# Extract CSV keys (skip header)
awk -F',' -v col="$KEY_COL" 'NR>1 && $col!="" {print $col}' "$CSV" | sort -u > /tmp/csv-keys.txt

# Extract code-read keys — adapt the regex to the project's reader pattern
grep -rohE "(p|params|cfg|config)\??\.([A-Z][A-Z0-9_]+)" "$CODE_DIR" --include="*.ts" --include="*.js" 2>/dev/null \
  | grep -oE "[A-Z][A-Z0-9_]+" \
  | sort -u > /tmp/code-keys.txt

# Optional allowlist (one key per line)
test -f "$ALLOWLIST" || : > /tmp/allowlist.txt
cat "${ALLOWLIST:-/tmp/allowlist.txt}" 2>/dev/null | sort -u > /tmp/allowlist-keys.txt || : > /tmp/allowlist-keys.txt

INV=$(comm -23 /tmp/code-keys.txt /tmp/csv-keys.txt | comm -23 - /tmp/allowlist-keys.txt)
FWD=$(comm -23 /tmp/csv-keys.txt /tmp/code-keys.txt | comm -23 - /tmp/allowlist-keys.txt)

INV_N=$(echo -n "$INV" | grep -c . || true)
FWD_N=$(echo -n "$FWD" | grep -c . || true)

echo "Inverse orphans (code reads, CSV missing): $INV_N"
echo "$INV" | head -50
echo
echo "Forward orphans (CSV seeds, code missing): $FWD_N"
echo "$FWD" | head -50

test "$INV_N" -eq 0 -a "$FWD_N" -eq 0
```

**Tuning.** The regex on line 16 is the only project-specific part. Map it to your project's reader signature.

### Pattern 2 — Catalog Raise-Coverage

**Intent.** When a project has a "rule catalog" (e.g. `ProcessStepCheck` codes, validation rules, error categories), each catalog entry that is active must be **raised** from at least one place in code; otherwise the catalog is lying.

**Inputs.**
- Catalog CSV: e.g. `db/data/sap.<namespace>-ProcessStepCheck.csv` with a column `Code` and a column `IsActive` (or equivalent).
- Code paths: `srv/`.
- Raise pattern: typically a helper like `raiseCatalogException(...)`, `raiseError(code, ...)`, or `req.reject(code, ...)`.

**Algorithm.**
1. Extract active codes from CSV → `active-codes.txt`.
2. Grep code for `<raiseHelper>(.*CODE_X)` matches → `raised-codes.txt`.
3. `comm -23 active-codes.txt raised-codes.txt` → unraised codes.
4. Exit `1` if non-empty.

**Skeleton.** Identical structure to Pattern 1; the regex on the grep is the only difference. Allowlist is supported (some codes are raised dynamically via configuration).

### Pattern 3 — Released-State / API-Availability Drift

**Intent.** SAP CAP projects often consume S/4HANA APIs that have a **release state** (C1 released, C2 sandbox, C3 deprecated). When a project pins a service catalog with an `availability` array per edition (e.g. `Public Cloud`, `Private Cloud`, `On-Premise`), drift between the local pin and the upstream `SAP/abap-atc-cr-cv-s4hc` repository (or equivalent ABAP API Release State source) must be caught.

**Inputs.**
- Local service catalog file: e.g. `srv/integration/s4CompatibilityPolicy.js` exporting `services[]` with `{name, availability, probeObject}`.
- Upstream source: `SAP/abap-atc-cr-cv-s4hc` repository (or analogous).
- Cache directory for the upstream snapshot.

**Algorithm.**
1. Refresh local cache of the upstream API Release State (clone or pull).
2. For each entry in the local catalog, query the upstream for the matching object + edition.
3. If upstream marks the object as **deprecated** for an edition the local catalog still claims as available, raise a finding.
4. If upstream marks the object as **available** for an edition the local catalog doesn't list, raise an informational finding (potentially missed capability).
5. Exit `1` on deprecation drift, `2` on missed-capability drift.

**Skeleton outline.** Detailed implementation lives in [`../sap-cap-clean-core-enforce/SKILL.md`](../sap-cap-clean-core-enforce/SKILL.md); this pattern is the **CI scheduling** of that audit. Typical wrapper:

```bash
#!/usr/bin/env bash
set -euo pipefail

CATALOG="${1:-srv/integration/<catalog>.js}"
UPSTREAM_CACHE="${2:-.cache/abap-atc-cr-cv-s4hc}"

# Refresh cache (idempotent)
if [ -d "$UPSTREAM_CACHE/.git" ]; then
  (cd "$UPSTREAM_CACHE" && git pull --ff-only --quiet)
else
  git clone --depth 1 --quiet https://github.com/SAP/abap-atc-cr-cv-s4hc "$UPSTREAM_CACHE"
fi

# Invoke the matrix audit (delegates to sap-cap-clean-core-enforce logic)
node scripts/ci/check-availability-drift.js "$CATALOG" "$UPSTREAM_CACHE" "${3:---format=tsv}"
```

The `.js` companion script reads the local catalog and compares each entry against the upstream — pseudocode in [`../sap-cap-clean-core-enforce/SKILL.md`](../sap-cap-clean-core-enforce/SKILL.md).

### Pattern 4 — Convention / Matrix Drift Detection

**Intent.** When a project codifies a convention in an ADR or matrix document (e.g. "every cap-js plugin in `package.json` must be documented in ADR 0011 with status `Adopted` / `Deferred` / `Not-applicable`"), CI must enforce the two-way binding: package change without ADR change = drift; ADR change without package change = also drift.

**Inputs.**
- Source A: e.g. `package.json` dependencies matching a prefix (`@cap-js/*`).
- Source B: e.g. `docs/adr/0011-*.md` containing a table or YAML block enumerating the plugins.

**Algorithm.**
1. Extract plugin names from Source A.
2. Extract plugin names from Source B.
3. Symmetric difference → drift list.
4. Exit `1` if non-empty.

**Skeleton.**

```bash
#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-package.json}"
ADR="${2:-docs/adr/<matrix-adr>.md}"
PREFIX="${3:-@cap-js/}"

# From package.json: every dependency matching PREFIX
node -e "const p = require('./$PKG'); const all = {...(p.dependencies||{}), ...(p.devDependencies||{})}; Object.keys(all).filter(k => k.startsWith('$PREFIX')).forEach(k => console.log(k))" | sort -u > /tmp/pkg-list.txt

# From ADR: every plugin name appearing as an inline-code segment matching PREFIX
grep -oE "\`$PREFIX[a-z-]+\`" "$ADR" | tr -d '`' | sort -u > /tmp/adr-list.txt

DRIFT_PKG_ONLY=$(comm -23 /tmp/pkg-list.txt /tmp/adr-list.txt)
DRIFT_ADR_ONLY=$(comm -13 /tmp/pkg-list.txt /tmp/adr-list.txt)

DPO=$(echo -n "$DRIFT_PKG_ONLY" | grep -c . || true)
DAO=$(echo -n "$DRIFT_ADR_ONLY" | grep -c . || true)

echo "In package.json but missing from ADR: $DPO"
echo "$DRIFT_PKG_ONLY"
echo
echo "In ADR but missing from package.json: $DAO"
echo "$DRIFT_ADR_ONLY"

test "$DPO" -eq 0 -a "$DAO" -eq 0
```

### Pattern 5 — CSV Schema Lint

**Intent.** Catch CSV seed corruption before it reaches deployment: missing columns, type mismatches, FK referential integrity violations, duplicate primary keys.

**Inputs.**
- CSV files under `db/data/`.
- Schema definition: the corresponding entity in `db/schema.cds`.

**Algorithm.**
1. For each CSV file `<entity>.csv`:
   - Read the header row.
   - Find the entity in `db/schema.cds`; build a column → type map.
   - Verify CSV header matches entity columns (set equality).
   - For each row: type-check each cell (UUID, Integer, Decimal, Date/DateTime, Boolean, String length).
   - Check primary key uniqueness.
   - For FK columns, verify referent exists in the referent CSV.
2. Exit `1` on any violation.

**Skeleton outline.** This pattern usually requires Node because CSV + CDS introspection is non-trivial in pure shell. Use the project's `@sap/cds` library directly via the Node API (no shell-out to user-provided strings):

```javascript
// scripts/ci/check-csv-lint.js
const cds = require('@sap/cds');
const fs = require('fs');
const path = require('path');

(async () => {
  const csn = await cds.load(['db', 'srv']);
  const csvDir = 'db/data';
  const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));
  let failures = 0;

  for (const f of files) {
    // entity name encoded in filename: <namespace>-<EntityName>.csv
    const entityName = /-([A-Z]\w+)\.csv$/.exec(f)?.[1];
    if (!entityName) continue;
    const entity = Object.values(csn.definitions).find(d => d.name?.endsWith('.' + entityName) && d.kind === 'entity');
    if (!entity) { console.error('Schema not found for', f); failures++; continue; }

    const content = fs.readFileSync(path.join(csvDir, f), 'utf8').trim().split('\n');
    const header = content[0].split(',');
    const expected = Object.keys(entity.elements).filter(k => !entity.elements[k].virtual);

    // Header set equality
    const missing = expected.filter(k => !header.includes(k));
    const extra = header.filter(k => !expected.includes(k) && k !== 'IsActiveEntity');
    if (missing.length || extra.length) {
      console.error(`[${f}] header mismatch — missing: ${missing}; extra: ${extra}`);
      failures++;
    }

    // Type-check rows (subset of types)
    for (let i = 1; i < content.length; i++) {
      const cells = content[i].split(',');
      header.forEach((col, idx) => {
        const def = entity.elements[col];
        if (!def) return;
        const v = cells[idx];
        if (def.type === 'cds.UUID' && v && !/^[0-9a-f-]{36}$/i.test(v)) {
          console.error(`[${f}:${i+1}] ${col} not a UUID: ${v}`);
          failures++;
        }
        if (def.type === 'cds.Integer' && v && !/^-?\d+$/.test(v)) {
          console.error(`[${f}:${i+1}] ${col} not an Integer: ${v}`);
          failures++;
        }
        // ... extend for Decimal / Boolean / Date / String length
      });
    }
  }

  process.exit(failures > 0 ? 1 : 0);
})();
```

Wrap with a bash script that invokes it and surfaces the exit code.

## Wiring into GitHub Actions

The generated workflow runs every gate on every PR. Use a job matrix so a single failing gate doesn't cancel the others.

```yaml
# .github/workflows/ci-gates.yml
name: CI Gates
on:
  pull_request:
  push:
    branches: [main]

jobs:
  gates:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        gate:
          - { name: bidirectional,        cmd: "bash scripts/ci/check-settings-bidirectional.sh" }
          - { name: raise-coverage,       cmd: "bash scripts/ci/check-catalog-raise-coverage.sh" }
          - { name: availability-drift,   cmd: "bash scripts/ci/check-availability-drift.sh" }
          - { name: convention-drift,     cmd: "bash scripts/ci/check-convention-drift.sh" }
          - { name: csv-lint,             cmd: "node scripts/ci/check-csv-lint.js" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - name: ${{ matrix.gate.name }}
        run: ${{ matrix.gate.cmd }}
```

For GitLab CI, mirror the matrix as `parallel:matrix:`. For BTP CI/CD, define one task per gate referencing the same scripts.

## Step 1: Describe mode (default)

If `mode` is empty or `describe`:

1. Read `package.json`, `db/data/`, `db/schema.cds`, `docs/adr/` to detect which patterns apply.
2. For each applicable pattern, print:
   - Pattern name and intent
   - Sources detected in the project
   - Suggested script filename
   - Skeleton inputs (e.g., `KEY_COL=2` if a non-default CSV layout)
3. Recommend an order: csv-lint first (fastest), bidirectional + raise-coverage second (catch most regressions), availability-drift third (slowest, needs upstream clone), convention-drift last (cheapest but project-specific).

Do **not** write files in describe mode.

## Step 2: Apply mode

If `mode = apply`:

1. Discover the inputs:
   - Settings CSV: scan `db/data/` for a file whose entity in `db/schema.cds` has a `Key` or `Code` column and a `Value` column → propose as Pattern 1 source.
   - Catalog CSV: scan for an entity with `Code` + `IsActive` columns → Pattern 2 source.
   - S/4 catalog: scan `srv/integration/` or similar for a file exporting `services[]` with `availability` → Pattern 3 source.
   - Plugin matrix ADR: scan `docs/adr/` for files referencing inline-code packages → Pattern 4 source.
2. For each pattern that has inputs:
   - Write the script to `scripts/ci/`.
   - Make it executable (`chmod +x`).
3. Generate or update `.github/workflows/ci-gates.yml`, preserving any existing jobs.
4. Print a summary: scripts generated, sources used, exit-code semantics, recommended allowlist files to seed.
5. Do **not** commit or push. The user reviews the generated files and decides.

## BTP vs On-Premise Differences

| Aspect | BTP | On-Premise |
| --- | --- | --- |
| CI runner | GitHub Actions / BTP CI/CD | Jenkins / GitLab self-hosted / Azure DevOps |
| Node availability in runner | Standard | May require image with Node pre-installed |
| Upstream API source for Pattern 3 | `SAP/abap-atc-cr-cv-s4hc` public repo | Often the same; on-prem may also use ATC results from internal SAP system |
| Workflow scheduling | Cron-friendly via `on: schedule:` | Cron jobs in scheduler |

The gate scripts are identical across providers; only the YAML wrapper differs.

## Error Handling

| Symptom | Cause | Action |
| --- | --- | --- |
| Pattern 1 has no inputs | Project doesn't use a settings table | Skip pattern, mark not-applicable |
| Pattern 3 cannot reach upstream | Network restricted on runner | Cache upstream snapshot weekly via cron, point gate at the cache |
| Regex over-matches | Reader pattern misidentified | Tune the grep regex; add unit test for the gate itself |
| Allowlist not used | Legitimate orphans flagged | Seed allowlist, document the reason in `scripts/ci/<gate>-allowlist.txt` |
| Generated YAML conflicts with existing | Workflow file already present | Merge manually, do not overwrite without `--force` |

## What This Skill Does NOT Do

- Does **not** run the gates against the codebase (use the gate scripts directly or run the [`../sap-cap-stack-audit-full/SKILL.md`](../sap-cap-stack-audit-full/SKILL.md)).
- Does **not** invent new patterns; the five are the canonical set for CAP projects.
- Does **not** commit or push generated files.
- Does **not** edit production code.
- Does **not** maintain the allowlists; that's a project responsibility.

## When to Use This Skill

- When setting up CI for a new CAP project.
- When a regression of a structural invariant was caught manually and you want to automate prevention.
- When porting CI from another stack (Jenkins → GitHub Actions) and want the equivalent gates.
- As a follow-up to one of the audit skills, to lock in the audit's findings as enforced gates.

## When NOT to Use

- For functional tests / integration tests (different concern; use the test framework).
- For lint / format gates (use existing tools — ESLint, Prettier, UI5 linter).
- For security scans (use the security ecosystem — CodeQL, Snyk, etc., or the [`../sap-cap-security-rbac-matrix/SKILL.md`](../sap-cap-security-rbac-matrix/SKILL.md)).
- For performance benchmarks (different concern).

## Follow-up

- Pair each generated gate with the audit skill that discovers the underlying issues:
  - Pattern 1 ↔ [`../sap-cap-customizing-honor/SKILL.md`](../sap-cap-customizing-honor/SKILL.md)
  - Pattern 3 ↔ [`../sap-cap-clean-core-enforce/SKILL.md`](../sap-cap-clean-core-enforce/SKILL.md)
  - Patterns 2 / 4 / 5 ↔ project-specific audits surfaced by [`../sap-cap-stack-audit-full/SKILL.md`](../sap-cap-stack-audit-full/SKILL.md)
- When a gate becomes noisy, examine the allowlist before relaxing the gate itself — noisy gates often mean the project's reader pattern has drifted, not that the gate is wrong.
- Schedule Pattern 3 (availability-drift) on a weekly cron, not per-PR — the upstream clone is expensive.

## Battle-Tested Patterns Referenced

This skill encodes patterns from [`../sap-cap-fiori-battle-tested-patterns/SKILL.md`](../sap-cap-fiori-battle-tested-patterns/SKILL.md) as enforced CI gates. The patterns each gate locks in:

- **5.5 Bidirectional CSV ↔ code consistency** ↔ Gate Pattern 1.
- **6.4 / 6.5 Exception auto-dispatch ordering / Orphan workflow cleanup** ↔ Gate Pattern 2 (catalog raise-coverage prevents dead catalog entries that would break auto-dispatch).
- **3.1 / 3.10 `cds run` does NOT mount UI5 apps** + Clean Core Level A compliance ↔ Gate Pattern 3 (availability drift catches consumed Tier-2 services that lose released state).
- **2.8 `cap-js` plugin matrix discipline** ↔ Gate Pattern 4 (convention/matrix drift between `package.json` and ADR doc).
- **5.4 Master-data references must be value-list-bound** ↔ Gate Pattern 5 partial (CSV schema lint with FK referential integrity).

A noisy gate (false positives) usually signals a **drift in the project's reader pattern**, not a gate bug. Tune the regex in Pattern 1's skeleton (line 16 of `check-settings-bidirectional.sh`) before relaxing the gate.

## Recommended Companion Plugins

| Plugin / Skill | Why for CI gate generation |
|---|---|
| `sap-cap-capire` | Pattern 5 (CSV schema lint) uses `cds.load` to introspect the model; capire docs cover edge cases |
| `sap-docs` | Pattern 3 (availability drift) cross-references `SAP/abap-atc-cr-cv-s4hc` and Help Portal Communication Scenario docs |
| `context7` | GitHub Actions workflow syntax, bash safe-defaults, ICU MessageFormat (when CSV-derived strings carry placeholders) |

See [`../sap-cap-fiori-battle-tested-patterns/SKILL.md#category-8--ecosystem-plugin-landscape`](../sap-cap-fiori-battle-tested-patterns/SKILL.md) for the full companion plugin map.

## References

- [SAP CAP — Deployment Guide](https://cap.cloud.sap/docs/guides/deployment/)
- [SAP API Release State — `SAP/abap-atc-cr-cv-s4hc`](https://github.com/SAP/abap-atc-cr-cv-s4hc)
- [GitHub Actions — Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Bash — `set -euo pipefail` Safe Defaults](https://gist.github.com/mohanpedala/1e2ff5661761d3abd0385e8223e16425)
- [SAP CAP — Reference Tests and Custom Tests](https://cap.cloud.sap/docs/node.js/cds-test)
