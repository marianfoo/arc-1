---
name: sap-architecture
description: Use this skill WHENEVER the user wants to create, generate, draw, design, or author an SAP architecture diagram, SAP BTP solution diagram, SAP Cloud Foundry / Kyma / ABAP environment landscape, Cloud Connector topology, SAP S/4HANA landscape, Fiori / SAP Build / Joule architecture, subaccount diagram, MCP-to-SAP deployment diagram, XSUAA auth flow, Principal Propagation diagram, or anything that should match the visual style of https://architecture.learning.sap.com / SAP Architecture Center. Input is a text description of the topology; output is a pixel-polished `.drawio` file (and optionally a PNG export) that matches the canonical SAP Horizon look — correct palette, Helvetica typography, 10-px grid, SAP BTP service icons, straight arrows, no clipped labels.
---

# SAP Architecture Diagram

Take a natural-language description of an SAP / BTP / on-prem landscape and produce a polished draw.io file in the SAP Architecture Center visual style. Every artifact it emits is validated against the same rules SAP follows in the published reference architectures.

## When to use

Trigger on any of:

- "Create an SAP architecture diagram for …"
- "Draw my BTP deployment"
- "Diagram the XSUAA auth flow"
- "Show how ARC-1 connects on-prem SAP via Cloud Connector"
- "Make an L0/L1/L2/L3 SAP ref-arch for …"
- "Like the SAP Architecture Center style"

For generic diagrams (flowcharts, ER, class) **without** an SAP angle, use the general `drawio` skill instead.

## The 6-step workflow

Follow this sequence exactly — each step produces input for the next, and each gate catches different classes of bug.

### 1. Parse the description → plan

Before touching XML, write out (in your head or as a hidden scratch pad):

1. **Level** — pick L0 / L1 / L2 / L3. Default is **L2**. See `references/levels.md` for signals.
2. **Zones** — list the landscape columns needed, typically 2–4 of: `User / MCP Client`, `SAP BTP`, `On-Premise`, `Third-party / Hyperscaler`.
3. **Services** — for each zone list the concrete cards (service name, role, vendor). Flag which BTP services need the official icon from the bundled library.
4. **Flow** — number the steps 1..N. Pick a pill color per step from the semantic palette (auth=green, trust=magenta, MCP=teal, authz=indigo).
5. **Accent / focus app** — the "star" of the diagram (ARC-1, Joule, user's own app). Uses the purple accent.

Keep this plan short — a 10-line bullet list is plenty. Don't skip it: diagrams built without a plan drift off-grid and end up with bent arrows.

### 2. Pick a reference template

Copy the closest bundled `.drawio` from `assets/reference-examples/` into the target location:

| Reference | Best for |
|-----------|----------|
| `SAP_Cloud_Identity_Services_Authentication_L2.drawio` | Identity / OAuth / trust / sign-in flows (IAS ↔ XSUAA, SSO) |
| `SAP_Private_Link_Service_L2.drawio` | Subaccount → hyperscaler private network, destination + connectivity |
| `SAP_Task_Center_L2.drawio` | BTP service consuming multiple backend systems via Destination Service |

Preserve the title band, zone containers, legend (if any), SAP logo, and canvas size (`1169 × 827`). Rename `<diagram name="…">` to your subject. Delete the inner cards and edges but keep ONE of each as a styling template.

**Do not draw from scratch.** Starting from a pristine template is the single highest-fidelity trick in this skill.

### 3. Place BTP service icons from the bundled library

For every BTP service in your plan, look up the icon:

```bash
python3 .claude/skills/sap-architecture/scripts/extract_icon.py "Destination Service" \
  --x 600 --y 300 --w 80 --h 96 --id svc-dest --parent 1
```

The script:
- Fuzzy-matches the service name against the 99-icon index (`assets/icon-index.json`)
- Emits a ready-to-paste `<mxCell>` with the exact SVG data URI the SAP library ships
- Snaps `x/y/w/h` to the 10-px grid

To list all available icons: `extract_icon.py --list`

Common service → canonical library name hints: "Destination Service" → `sap-destination-service`, "XSUAA" / "Authorization & Trust" → `sap-authorization-and-trust-management-service`, "Cloud Connector" → `cloud-connector`, "Audit Log" → `sap-audit-log-service`.

### 4. Compose the XML

Build the full `.drawio` file following these references:

- `references/layout.md` — canvas, zones, title band, network bar
- `references/palette-and-typography.md` — exact hex values and font sizes
- `references/shapes-and-edges.md` — zone / card / pill / edge style strings

Rules that matter most (from research — these are the ones every junior attempt gets wrong):

1. **Centers must align for straight edges.** For an `orthogonalEdgeStyle` edge between A and B to render without a kink, either `A.centerX == B.centerX` or `A.centerY == B.centerY`. See `shapes-and-edges.md`.
2. **`absoluteArcSize=1` next to every `arcSize`.** Without it, 16 is percent and zones get 130-px-radius corners.
3. **`labelBackgroundColor=default` on every edge label.** Else text bleeds into the `#EBF8FF` BTP fill.
4. **All x/y/w/h integers, multiples of 10.** No `239.9999…` garbage.
5. **Font family: Helvetica.** No Arial, no default sans-serif.
6. **Inline top-left zone labels.** Never a separate header tab.
7. **Pills float on `parent="1"`**, not as children of a zone.
8. **Don't draw a legend inside the canvas.** SAP ref-arch puts the narration in the hosting Markdown page.

### 5. Validate & autofix — MANDATORY

Before reporting the diagram as done, run:

```bash
python3 .claude/skills/sap-architecture/scripts/autofix.py --write my-diagram.drawio
python3 .claude/skills/sap-architecture/scripts/validate.py my-diagram.drawio
```

**Autofix** handles the mechanical issues: grid snapping, hex case, missing `absoluteArcSize=1`, wrong `strokeWidth`, wrong `fontFamily`.

**Validate** catches everything the LLM can't easily self-police:

- XML well-formedness + duplicate ids + missing `mxGeometry`
- Bent-arrow detection (centers not aligned)
- Label overflow (text wider than its shape)
- Edge labels missing `labelBackgroundColor`
- Palette deviations
- Sibling overlap (ignores pills / transparent cells / contained children)

**Do not skip this step.** The validator replaces five rounds of "look at the screenshot and tell me what's wrong". If it reports any error, fix it and re-run. Warnings are acceptable if the user has explicitly asked for something off-convention; otherwise fix them.

### 6. Export (if requested) + narrate the flow

If the user asked for a PNG/SVG/PDF, export with:

```bash
"/Applications/draw.io.app/Contents/MacOS/draw.io" -x -f png -e -b 10 -s 2 \
  -o my-diagram.drawio.png my-diagram.drawio
```

(`drawio` binary on Linux, `/mnt/c/Program Files/draw.io/draw.io.exe` on WSL2, `draw.io.exe` on Windows. `-e` embeds the XML so the PNG is still editable; `-s 2` is 2× scale; `-b 10` is a 10-px border.)

Finally, print the **flow narration** — a numbered list that spells out what each pill means. SAP Architecture Center puts this in the Markdown page **below** the embedded image, never inside the canvas. Example:

> **Flow**
> 1. User signs in to **SAP Cloud Identity Services (IAS)**. (green pill)
> 2. IAS federates the assertion to **XSUAA** via SAML / OIDC trust. (magenta TRUST pill)
> 3. Claude Desktop calls the **ARC-1 MCP endpoint** with the XSUAA JWT. (teal MCP TOOL CALL pill)
> 4. ARC-1 resolves the user's destination via **BTP Destination Service**.
> 5. **Cloud Connector** opens an mTLS tunnel to the on-prem **SAP ABAP system** using Principal Propagation (PP). (green mTLS · PP pill)

## Supporting files

```
.claude/skills/sap-architecture/
├── SKILL.md                       (this file)
├── README.md                      — user-facing documentation / examples
├── references/
│   ├── levels.md                  — L0 / L1 / L2 / L3 decision guide + canvas conventions
│   ├── palette-and-typography.md  — Horizon hex values + Helvetica hierarchy
│   ├── shapes-and-edges.md        — style strings + center-alignment rule
│   └── layout.md                  — canvas skeleton + zone-by-zone placement
├── assets/
│   ├── libraries/
│   │   └── btp-service-icons-all-size-M.xml  — 100 SAP BTP service icons
│   ├── reference-examples/        — 3 pristine L2 SAP ref-arch templates
│   └── icon-index.json            — slug → library label + ready-to-paste mxCell style
└── scripts/
    ├── build_icon_index.py        — regenerate icon-index.json after library refresh
    ├── extract_icon.py            — fuzzy service name → mxCell with grid-snapped geometry
    ├── validate.py                — structural + alignment + text-fit + palette checks
    └── autofix.py                 — mechanical fixes (grid, hex case, arcSize, strokeWidth)
```

## Anti-patterns — do NOT

- **Don't** use `shape=mxgraph.sap.icon;SAPIcon=<Name>` stencils. They render as blank frames in many installations. Use the bundled inline SVG library.
- **Don't** improvise palette values. Colors not listed in `palette-and-typography.md` trigger validator warnings.
- **Don't** skip validation. Visual polish is not optional; the validator is the polish gate.
- **Don't** put a legend inside the canvas. Narrate in the host Markdown page instead.
- **Don't** forget `labelBackgroundColor=default` on edge labels — it's the single most common bug.
- **Don't** pick a canvas size other than 1169 × 827 unless the user explicitly asks for a poster-sized rendering.
- **Don't** draw from scratch when a reference template is close — always start from the most-similar pristine `.drawio`.

## When the description is vague

If the user says "make me a BTP deployment diagram" with nothing else, ask ONE clarifying question:

> What's the subject app or flow? e.g. "CAP app with XSUAA + HANA Cloud reading from on-prem ECC".

Then proceed. Don't ask more than one question — producing a reasonable default and letting the user iterate beats a long back-and-forth.
