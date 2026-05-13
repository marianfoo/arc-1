---
name: sap-cap-text-polish
description: Audit and rewrite all user-visible text across a SAP CAP + Fiori Elements project — backend reject/throw messages, helper rejects, frontend toasts/dialogs/notifications, i18n bundles, CDS labels, CodeList descriptions, and CSV master-data text — to a consistent professional tone. Detects ten anti-patterns (colloquial, accusatory, tech-jargon, fragmented, mixed-language, missing ICU placeholders, PII leak, etc.) and applies only safe additive rewrites on a dedicated branch. Use when asked to "polish UI text", "improve error messages", "review user-visible messages", "fix tone of notifications", "audit i18n bundle", or to raise the language quality of a CAP application before a release.
---

# SAP CAP Text Polish

Audit every piece of **user-visible text** produced by a CAP + Fiori Elements V4 application and rewrite the ones that look unprofessional, unclear, accusatory, or leak technical detail. Output is a structured before/after report; in `fix` mode the skill applies only **safe additive** rewrites (typos, ICU placeholders, missing fallbacks, PII masking, missing i18n keys). Semantic rewrites of legal/policy text and CodeList seed changes are always flagged for human review, never applied.

The skill is **language-agnostic for detection** but **language-aware for rewriting**: it reads the project's primary locale from `CLAUDE.md`/`AGENTS.md` or from the i18n bundle filename pattern (`i18n_de.properties`, `i18n_it.properties`, ...) and rewrites in the same locale, preserving any non-primary locale variants.

## v1 Guardrails

- **Read-only by default.** `fix` is opt-in and limited to additive edits.
- **Never rewrite legal text.** GDPR notices, ToS, consent dialogs are flagged with `LEGAL_REVIEW_REQUIRED`, never edited.
- **Never change semantics.** Polishing is a form-level operation; if the original message is logically wrong, file it as `CONTENT_BUG` for human review.
- **Never rename i18n keys** that are already referenced from CDS annotations. Adding a new key is safe; renaming may break the annotation lookup.
- **PII must be masked** before any user-visible context. The skill detects unmasked IBAN, fiscal codes, VAT numbers, email addresses and either masks them via the project's existing sanitize helper or proposes the helper call as a fix.
- **Cite `file:line`** on every finding.

## Smart Defaults (apply silently, do NOT ask)

| Aspect | Default | Why |
| --- | --- | --- |
| Mode | `dry-run` (report only) | Safer; user opts into `fix` |
| Tone profile | `formal` | Enterprise SAP audience; `friendly` opt-in via argument |
| Primary locale | Detected from i18n filename pattern or project doc | Avoid asking; project state is authoritative |
| Output destination | `docs/audit/<yyyy-mm-dd>-text-polish.md` | Committed for traceability |
| Branch name | `audit/text-polish-<scope>-<yyyy-mm-dd>` | One audit per branch |
| Tone profile rules | Impersonal voice · active voice · action-oriented closure · canonical locale · ≤120 char errors · ≤250 char dialog body · ≤80 char toast · first-word + proper-noun capitalization · ICU placeholders always | Codified in this skill |
| i18n key naming | `snake_case` with category prefix (`msg_`, `dlg_`, `act_`, `lbl_`, `tooltip_`, `err_`) | Match common CAP convention |
| Diff cap per file | ≤50 lines | Keep fixes reviewable |

## Input

Single argument with format `<scope> [mode] [tone:<profile>]`:

| Argument | Meaning |
| --- | --- |
| `<scope>` | `all` (default), `<app-name>` (e.g. `manager-ui`), `srv-only` (backend reject/throw), `i18n-only` (only `webapp/i18n/i18n*.properties`) |
| `mode` | `dry-run` (default, no edits) · `fix` (apply safe rewrites on a branch) |
| `tone:formal` | Formal enterprise tone (default) |
| `tone:friendly` | Friendly-but-professional tone (allows one exclamation, slightly warmer wording) |

Examples: `all`, `manager-ui fix`, `srv-only dry-run tone:friendly`, `i18n-only fix`.

## Step 1: Discover text sources

The skill scans **eight categories** of user-visible text. For each category it produces a list of `{file, line, original_text, classification, suggested_fix}` rows.

### 1a — Backend reject messages

```bash
grep -rnE "req\.reject\([0-9]+\s*,\s*['\"`]" srv/ --include="*.ts" --include="*.js"
grep -rnE "req\.error\([0-9]+\s*,\s*['\"`]" srv/ --include="*.ts" --include="*.js"
```

### 1b — Backend throws with user-visible message

```bash
grep -rnE "throw new (Error|CdsError|RequestError)\(['\"`][A-Za-z]" srv/
```

Distinguish:
- **Internal-only** (caught by a top-level error handler and translated) → leave alone, but flag the throw site if the message itself is non-professional.
- **User-visible** (escapes to the OData response) → audit.

### 1c — Centralized reject helper

```bash
# Discover the project's centralized reject helper (varies by project)
grep -rnE "rejectSafe\(|safeReject\(|rejectWith\(" srv/ --include="*.ts" --include="*.js" | head -5
# Then scan all call sites
grep -rnE "<discovered-helper>\([^,]+,\s*[0-9]+,\s*['\"`][^'\"`]+['\"`]" srv/
```

### 1d — Frontend notification helpers

```bash
grep -rnE "_t\([^,]+,\s*['\"]\w+['\"],\s*['\"][^'\"]+['\"]" app/
grep -rnE "MessageBox\.(show|confirm|error|warning|information)\(['\"`]" app/
grep -rnE "MessageToast\.show\(['\"`]" app/
grep -rnE "req\.notify\(['\"`]" srv/
```

### 1e — i18n bundles

```bash
ls app/*/webapp/i18n/i18n*.properties
ls app/*/i18n/*.properties
```

Read each bundle; one row per key.

### 1f — CDS labels and titles

```bash
grep -rnE "@title:\s*['\"`]|@Common\.Label:\s*['\"`]|@Core\.Description:\s*['\"`]" db/ srv/ app/
```

Distinguish hardcoded string literals from `{i18n>key}` bindings. Only the former are in scope here.

### 1g — CodeList descriptions

```bash
ls db/data/*_texts.csv 2>/dev/null
ls db/data/sap.*-*.csv 2>/dev/null
```

For each CodeList CSV with a `descr` or `name` column, list rows where the description matches an anti-pattern.

### 1h — CSV master-data labels

```bash
# Discover CSV files with label/description columns
for csv in db/data/*.csv; do
  head -1 "$csv" | grep -qE "(name|label|description|descr)" && echo "$csv"
done
```

## Step 2: Classify every text

For every text found, classify it as one of:

| Classification | Meaning | Action in `fix` mode |
| --- | --- | --- |
| **OK** | Already professional | No change |
| **POLISH** | Minor refinement (punctuation, capitalization, article) | Auto-apply |
| **REWRITE** | Substantial reword needed | Propose, require review (do not auto-apply unless it's a clear typo) |
| **PII_RISK** | Contains sensitive data unmasked | Auto-apply masking helper call |
| **TECH_LEAK** | Technical detail exposed (stack trace, error code raw, SQL error) | Auto-apply mask + downgrade to operational message; log technical via `LOG.error` |
| **LEGAL_REVIEW_REQUIRED** | Privacy / consent / ToS text | Never edit; flag only |
| **CONTENT_BUG** | Message is logically wrong (says A when code does B) | Never edit; flag for human review |

## Step 3: Detect the ten anti-patterns

Apply these heuristics to every text. A row may match multiple anti-patterns; classify by the highest severity.

| # | Anti-pattern | Pattern | Severity |
| --- | --- | --- | --- |
| 1 | **Colloquial / Telegram** | "oops", "uh", "kk", "ok dai", smiley faces in non-marketing contexts | POLISH |
| 2 | **Accusatory tone** | "you did wrong", "you can't", "you must" (second person imperative) | REWRITE |
| 3 | **Unexplained tech jargon** | "404", "null pointer", "SQL error", raw stack class names, server URLs | TECH_LEAK |
| 4 | **Fragmented / incomplete** | "Error." with no context, "Failed", "Invalid" without operand | REWRITE |
| 5 | **All-caps / multiple exclamations** | `[A-Z]{5,}`, `!{2,}`, `\?{2,}` | POLISH |
| 6 | **Unexpanded acronyms** | BP, CC, SDI, FE, PO etc. used without first-occurrence expansion | POLISH |
| 7 | **Mixed locale** | EN words inside an IT/DE/etc. message (e.g. "Errore: invalid input") | REWRITE |
| 8 | **Missing ICU placeholders** | Concatenation with `+` or template literals that should be `{0}` / `{0,number,#,##0.00}` | POLISH (auto-apply) |
| 9 | **Inconsistent punctuation** | Missing final period in complete sentence, redundant punctuation | POLISH |
| 10 | **PII leak** | Unmasked IBAN, fiscal code, VAT number, full email | PII_RISK (auto-apply mask) |

Detection regex examples:

```bash
# Anti-pattern 5: all-caps or multiple exclamations
grep -rnE "[A-Z]{5,}|!{2,}|\?{2,}" app/*/webapp/i18n/

# Anti-pattern 8: concatenation that should be ICU
grep -rnE "['\"`][^'\"`]+['\"`]\s*\+\s*\w+\s*\+\s*['\"`]" srv/ app/

# Anti-pattern 10: PII
grep -rnE "IT[0-9]{2}[A-Z][0-9]{10}[0-9A-Z]{12}" srv/ app/   # IBAN IT
grep -rnE "[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]" srv/ app/   # IT fiscal code
grep -rnE "\b[\w.-]+@[\w.-]+\.\w+\b" srv/ app/ | grep -v "_sanitize\|@example\|@test"
```

## Step 4: Rewrite per tone profile

For each row classified `POLISH` or `REWRITE`, propose a rewrite that:

1. **Preserves intent.** The user must understand what happened and what to do next.
2. **Applies tone profile.** `formal` is the default:
   - Impersonal voice ("The operation cannot be completed") not second person ("You can't do this").
   - Active voice, direct ("Retry in a few minutes").
   - Action-oriented closure where applicable (give a concrete next step).
   - First-word capitalization only; locale-canonical punctuation.
   - Length caps: ≤120 char errors, ≤250 char dialog body, ≤80 char toast.
3. **Preserves placeholders.** Existing `{0}` / `{0,number,...}` / `{0,date,...}` survive; concatenations are converted to placeholders.
4. **Generates i18n key if missing.** If the text is inline (`_t(view, "key", "fallback")` with key absent from bundle), propose the new key in `snake_case` with category prefix.
5. **Localizes only the primary locale.** Other locales are noted as "needs translation"; the skill does not invent translations.

### Before / after examples

Backend error:
```diff
- req.reject(409, 'Stato fattura non valido per questa azione');
+ req.reject(409, "L'operazione non è disponibile per lo stato corrente della fattura ({0}). Verificare la fase di processo prima di riprovare.");
```

Frontend toast:
```diff
- MessageToast.show("Ok!");
+ MessageToast.show(_t(this, "msg_action_completed", "Operazione completata."));
```

Dialog confirmation:
```diff
- title: "Sei sicuro?",
- message: "Vuoi davvero eliminare?"
+ title: _t(this, "dlg_confirmDelete_title", "Conferma eliminazione"),
+ message: _t(this, "dlg_confirmDelete_msg", "L'eliminazione non è reversibile. Continuare?")
```

i18n bundle entry:
```diff
- err_invalid_input=Errore: input invalido!!!
+ err_invalid_input=Il valore inserito non è valido. Controllare il formato e riprovare.
```

PII leak fix:
```diff
- LOG.warn(`Notifica fallita per ${user.email}`);
+ LOG.warn(`Notifica fallita per ${_sanitizePII(user.email)}`);
```

ICU placeholder fix:
```diff
- MessageToast.show("Hai " + count + " messaggi");
+ MessageToast.show(_t(this, "msg_unread_count", "Hai {0} messaggi", [count]));
+ # bundle entry:
+ msg_unread_count=Hai {0} messaggi
```

## Step 5: Output report

Write to `docs/audit/<yyyy-mm-dd>-text-polish.md`:

```markdown
# Text Polish Report — <scope> — <yyyy-mm-dd>

## Summary
- Total scanned: <N> sources
- OK: <N> | POLISH: <N> | REWRITE: <N> | PII_RISK: <N> | TECH_LEAK: <N> | LEGAL_REVIEW: <N> | CONTENT_BUG: <N>

## PII / Tech Leak (urgent)
| File:line | Original | Issue | Suggested fix |
| --- | --- | --- | --- |

## REWRITE (substantial)
| File:line | Original | Rewritten | i18n key | Note |
| --- | --- | --- | --- | --- |

## POLISH (refinement)
| File:line | Before | After | Type |
| --- | --- | --- | --- |

## Bundle gaps (i18n)
| Key | Primary locale | Other locales | Used in |
| --- | --- | --- | --- |

## Stats
- Most polished file: <path>
- Tone consistency score: <0-100>%
- ICU placeholder coverage: <N/M>

## LEGAL_REVIEW (do not edit)
| File:line | Text | Reason |
| --- | --- | --- |

## CONTENT_BUG (human review)
| File:line | Text | Suspected logic mismatch |
| --- | --- | --- |
```

## Step 6: Safe fix (mode = `fix` only)

Apply **only** these safe edits:

✅ Allowed:
- Typo / capitalization fix in i18n bundle.
- Add ICU placeholder where concatenation existed; bundle key gets the new placeholder syntax.
- Mask PII with the project's `_sanitizePII` / `_sanitize*` helper. If no helper exists, propose adding one but do not edit logs yet.
- Add missing fallback in `_t(view, key, fallback)` calls.
- Add missing i18n key (bundle entry creation).
- Add final period where the sentence is complete and missing it.
- Normalize multiple exclamations / question marks down to one.
- Lowercase all-caps non-acronym words.

❌ Forbidden (always defer to human):
- Substantial REWRITE.
- Rewrite legal / privacy / consent text.
- Rename an i18n key already referenced from CDS annotations.
- Full translation across locales (the skill does primary-locale rewrites only).
- Modify CodeList CSV seed values (downstream migrations / sap-common conventions may depend on them).
- Rewrite stack-trace or technical log strings going to stdout/cloud-logging (those are operator-visible, different audience).
- Touch text inside test fixtures (`*.test.ts`, `__fixtures__/`).

### Verification after fixes

```bash
# CSV lint (if project has one)
npm run lint:csv 2>&1 | tail -10 || true

# CDS compile sanity
npx cds compile srv app > /dev/null && echo "CDS OK"

# TS typecheck scoped to apps touched
for app in $(git diff --name-only HEAD~1 -- 'app/*/webapp/' | cut -d/ -f1-2 | sort -u); do
  test -f "$app/tsconfig.json" && (cd "$app" && npm run ts-typecheck 2>&1 | tail -5)
done

# Scoped jest if backend reject messages touched
git diff --name-only HEAD~1 -- 'srv/' | grep -E '\.(ts|js)$' | xargs -I {} npx jest --findRelatedTests {} --runInBand 2>&1 | tail -10
```

## Step 7: Commit + branch (mode = `fix` only)

```bash
git checkout -b "audit/text-polish-<scope>-$(date +%Y-%m-%d)"
git add -A
git commit -m "fix(text-polish): <scope> — <N> messages reformulated [skip ci]

- <category-A>: <N> fixes
- <category-B>: <N> fixes
- PII masked: <N> sites
- ICU placeholders added: <N>
- Bundle keys added: <N>

Report: docs/audit/<yyyy-mm-dd>-text-polish.md
"
git push -u origin HEAD
```

Then optionally open a PR via `gh pr create`. Never push to `main` directly.

## BTP vs On-Premise Differences

| Aspect | BTP (CF / Kyma) | On-Premise |
| --- | --- | --- |
| Operator-visible log target | BTP Cloud Logging / Kyma Loki — JSON structured | NetWeaver SLG1 / file system |
| User-visible message channel | OData fault + UI5 MessageBox | Same |
| PII helper convention | Often `_sanitizePII` co-located with audit logger | Often inline regex, harder to discover |
| i18n bundle path | `webapp/i18n/i18n.properties` | Same |

The audit logic is identical; only the discovery of the PII helper varies.

## Error Handling

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Primary locale cannot be inferred | No `CLAUDE.md` hint and ambiguous bundle filenames | Pick English by default, mark report with "locale assumption: en" |
| PII helper not found | Project lacks centralized sanitize | Flag the gap, propose adding the helper, do not edit logs yet |
| Diff > 50 lines in a single file | Bug in detection or over-eager rewriter | Stop, emit "diff cap exceeded" finding, defer to manual review |
| CSV change requested | Out of scope for safe-fix mode | Flag in report, never auto-apply |
| Test fixture touched | Should never happen | Revert that file's changes, log it as a guardrail violation |

## What This Skill Does NOT Do

- Does **not** rewrite legal text (privacy, ToS, consent).
- Does **not** change message semantics. Form-level only.
- Does **not** rename keys already referenced by CDS annotations.
- Does **not** translate across locales (only rewrites the primary locale; non-primary locales are flagged).
- Does **not** modify CodeList CSV seeds.
- Does **not** modify test fixtures.

## When to Use This Skill

- Before a release, to raise overall language quality.
- After a translation/localization phase, to verify the primary locale stays consistent.
- After adding a new app, to bring its tone in line with the rest of the suite.
- When a stakeholder complains "the app sounds amateur".
- As a PII safety net before going live with audit logging.

## When NOT to Use

- For functional / logic bug fixing (use a code-review skill).
- For full localization to a new language (use a translation tool / professional translator).
- For marketing copy (different audience, different tone profile).
- For real-time / per-keystroke validation messages (separate UX concern, may need product input).

## Follow-up

- Pair with [`../sap-fiori-app-audit/SKILL.md`](../sap-fiori-app-audit/SKILL.md) — Step 2g of that audit produces a list of hardcoded strings; this skill fixes them.
- Pair with [`../sap-cap-security-rbac-matrix/SKILL.md`](../sap-cap-security-rbac-matrix/SKILL.md) — its PII findings hand off to this skill's PII_RISK class.
- Pair with [`../sap-cap-ci-gates-pattern/SKILL.md`](../sap-cap-ci-gates-pattern/SKILL.md) to gate the regression of PII leaks and missing ICU placeholders in CI.

## References

- [SAP UI5 — `ResourceModel` and `_t` Helper Pattern](https://sapui5.hana.ondemand.com/sdk/#/topic/91f217ce374d4dec8a4b08c8e4c0b3a4)
- [ICU MessageFormat — Placeholder Syntax](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [SAP CAP — Localized Messages](https://cap.cloud.sap/docs/guides/i18n)
- [SAP Fiori Design Guidelines — Writing](https://experience.sap.com/fiori-design-web/writing/)
- [OWASP — Sensitive Data Exposure](https://owasp.org/Top10/A02_2021-Cryptographic_Failures/)
