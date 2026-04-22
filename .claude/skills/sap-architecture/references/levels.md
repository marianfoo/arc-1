# SAP Architecture Center diagram levels

SAP publishes four levels. Pick one based on the audience implied by the description. If the user didn't specify, **default to L2** — it's the level of every reference template we ship.

| Level | Audience | Shows | Hides | Typical shapes |
|-------|----------|-------|-------|----------------|
| **L0 — Marketecture** | Executives, sales, business stakeholders. | One concept per box. Logos, arrows, outcome wording. | Anything technical. | 3–6 hero cards on an empty canvas. |
| **L1 — Conceptual** | Solution / enterprise architects, pre-sales. | Named SAP services, trust zones, coarse data flow. | Protocol names, host names, auth details. | Service cards grouped by zone (BTP vs on-prem), plain arrows. |
| **L2 — Logical** | Lead developers, cloud architects, integration architects. | Services, accounts, roles, protocols, trust/auth pills. | Hostnames, subnets, cert names. | Full 3–4 zone landscape with pills on edges. **This is the default.** |
| **L3 — Physical** | Platform / SRE. | Hostnames, subnets, certificates, specific HTTP routes, port numbers. | — | Landscape layout with annotations, often one diagram per environment. |

## Signals in the description

Infer the level from what the user describes:

- **L0 signal** — "for management", "overview", "one-slide story", no service/protocol names used, emphasis on outcomes ("customers can…").
- **L1 signal** — "landscape", "conceptual", names services but no protocols, may say "at a glance".
- **L2 signal** — mentions services **and** auth method, "flow diagram", "how the request travels", "OAuth / trust / PP / mTLS", ≥1 numbered step in the prose.
- **L3 signal** — hostnames, CIDRs, cert file names, "production", "UAT", "rollout".

## Canvas & tab naming

- **All four levels** use `pageWidth="1169" pageHeight="827"` (A4 landscape in px). Do not improvise a larger canvas — the published style assumes this size.
- `grid="1" gridSize="10"` — show the grid while authoring, snap everything to 10 px.
- `<diagram name="…">` tab stem matches the output filename, suffixed with the level: `Product_Name_L2`, `ARC1_BTP_Deployment_L2`.
- `page="1"`, `pageScale="1"`, `math="0"`, `shadow="0"`, `background="none"` (default white).

## Flow narration

Numbered flow steps (1 → 2 → 3 …) are drawn as **small coloured circular pills on the diagram** (see `shapes-and-edges.md`), but the full prose ("Step 1: User signs in to SAP Cloud Identity Services…") lives **below the embedded image** in the host document (Markdown), **not** in a text block inside the canvas. This mirrors https://architecture.learning.sap.com — the canvas stays clean, the page carries the narrative.

When the output is a standalone `.drawio` (no host document), print the flow narration to stdout at the end of the run so the user can paste it into Confluence / MkDocs.
