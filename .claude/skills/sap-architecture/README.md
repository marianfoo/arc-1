# sap-architecture skill

Turn a natural-language description of an SAP / BTP / on-prem landscape into a polished `.drawio` diagram that matches the SAP Architecture Center visual style (https://architecture.learning.sap.com).

This skill is **dedicated** to SAP architectures — for generic diagrams (flowcharts, ER, class), use the general `drawio` skill instead.

## Why a dedicated skill?

SAP reference architectures have a very specific visual grammar — Horizon palette, Helvetica typography, 10-px grid, inline zone labels, pills floating at `parent="1"`, service icons from the bundled BTP library, straight `orthogonalEdgeStyle` edges with center-aligned endpoints. Doing this by hand or via the generic `drawio` skill consistently produces off-style diagrams: wrong palette, bent arrows, clipped labels, blank icon stencils, or text that bleeds into the blue zone fills.

This skill bundles:

- 3 pristine SAP Architecture Center **reference templates** (L2 level) to copy from
- The full **SAP BTP icon library** (99 icons) as inline-SVG data URIs
- An **icon-index** + `extract_icon.py` for fuzzy lookup
- **4 reference sheets** (levels, palette, shapes, layout) with exact hex values and style strings
- A **validator** that catches every class of polish bug — bent arrows, label overflow, missing `labelBackgroundColor`, off-palette hex, off-grid coords, duplicate ids
- An **autofix** tool that handles the mechanical issues in one pass

## Quick start

In Claude Code, just describe the landscape:

> Create an SAP architecture diagram showing a Copilot Studio MCP client calling an ARC-1 BTP Cloud Foundry app. ARC-1 authenticates via XSUAA OAuth, uses Destination Service + Cloud Connector with Principal Propagation to reach an on-prem S/4HANA system.

Claude will:

1. Recognise the SAP-architecture trigger → load this skill
2. Parse the description into level / zones / services / flow
3. Copy the closest reference template (`SAP_Cloud_Identity_Services_Authentication_L2.drawio` for trust flows, `SAP_Private_Link_Service_L2.drawio` for on-prem connectivity, `SAP_Task_Center_L2.drawio` for multi-backend aggregation)
4. Drop the right icons from the bundled library via `extract_icon.py`
5. Compose the XML
6. Run `autofix.py --write` then `validate.py`
7. Print the flow narration

### More example invocations

- "Draw my BTP deployment — CAP app with XSUAA, HANA Cloud, Destination Service to on-prem ECC."
- "Diagram the XSUAA OAuth flow between Claude Desktop, our MCP server, and on-prem ABAP."
- "Show how a user on VS Code Copilot reaches SAP BW/4HANA through Cloud Connector with Principal Propagation."
- "Make an L1 conceptual diagram of a Joule integration with Task Center pulling from S/4, SuccessFactors, and Ariba."
- "Generate an L2 ref-arch like the SAP Architecture Center style — subject: SAP Build Apps fronting a CAP service bound to SAP Event Mesh."

### When the description is vague

If you just say "draw me a BTP diagram", the skill will ask **one** clarifying question and then proceed with a sensible default. It never chains multiple questions.

## Output

- A `.drawio` file in the SAP Architecture Center style, editable in draw.io / diagrams.net
- Optionally a PNG/SVG/PDF export via the draw.io desktop CLI (embed-XML flag set so the export stays editable)
- A **flow narration** printed to the chat — numbered steps that spell out what each pill means. Paste this below the embedded image in your Markdown / Confluence page.

## How to invoke manually

The skill auto-triggers on the phrases above, but you can also invoke it explicitly:

```
Use the sap-architecture skill to draw …
```

## Files you'll edit

When Claude produces the diagram it will create one file, e.g. `docs/architecture/arc1-btp.drawio`, under the location you request. The skill's own files (templates, library, scripts, references) live under `.claude/skills/sap-architecture/` and are read-only during normal use.

## Directly using the scripts

You can run the scripts yourself when iterating on a diagram:

```bash
# List all available BTP icons (99 total)
python3 .claude/skills/sap-architecture/scripts/extract_icon.py --list

# Generate an mxCell for a specific service (fuzzy match)
python3 .claude/skills/sap-architecture/scripts/extract_icon.py "Destination Service" \
  --x 600 --y 300 --w 80 --h 96 --id svc-dest --parent 1

# Autofix mechanical issues (grid, hex case, absoluteArcSize, strokeWidth, fontFamily)
python3 .claude/skills/sap-architecture/scripts/autofix.py --write my-diagram.drawio

# Validate — exit code 0 if clean
python3 .claude/skills/sap-architecture/scripts/validate.py my-diagram.drawio

# Strict mode (warnings → errors)
python3 .claude/skills/sap-architecture/scripts/validate.py --strict my-diagram.drawio

# Machine-readable report
python3 .claude/skills/sap-architecture/scripts/validate.py --json my-diagram.drawio
```

## What the validator catches

| Check | Level |
|-------|-------|
| Malformed XML, duplicate ids, missing `mxGeometry` | error |
| Coordinates not on the 10-px grid | warning |
| `arcSize` without `absoluteArcSize=1` | warning |
| `strokeWidth` not in {1, 1.5, 2, 3, 4} | warning |
| `fontFamily` not Helvetica | warning |
| Edge label missing `labelBackgroundColor=default` | warning |
| Bent orthogonal edge (source/target centers not aligned on any axis) | error |
| Label text wider than its shape (overflow / clipping) | error |
| Sibling shape overlap (not contained, not transparent, not pill) | error |
| Hex color outside the SAP Horizon palette | warning |
| XML comments (`<!-- -->`) inside the mxfile | error |

`autofix.py` automatically fixes: grid snapping, hex case, missing `absoluteArcSize=1`, invalid `strokeWidth`, wrong `fontFamily`.

## Design rules enforced by the skill

1. **Canvas**: `1169 × 827` px (A4 landscape), `grid=1 gridSize=10`
2. **Palette**: Horizon only — `#0070F2 #EBF8FF #002A86 #00185A #475E75 #5D36FF #188918 #CC00DC #07838F #F5F6F7 #F1ECFF`
3. **Typography**: Helvetica everywhere — 24pt title / 16pt zone label / 12-14pt card / 10pt pill
4. **Zone frames**: inline top-left bold labels, `arcSize=16;absoluteArcSize=1`, `strokeWidth=1.5`
5. **Edges**: `orthogonalEdgeStyle`, endpoints must share an axis center, `labelBackgroundColor=default`
6. **Pills**: float on `parent="1"`, `arcSize=50`, `strokeWidth=1`, role-colored (green=auth, magenta=trust, teal=MCP, indigo=authz)
7. **Icons**: use the bundled inline-SVG library (never `shape=mxgraph.sap.icon;SAPIcon=…` — those render blank in many installs)
8. **Legend**: not inside the canvas — narrate in the host Markdown / Confluence page below the embedded image

## Supporting files

```
.claude/skills/sap-architecture/
├── SKILL.md                       — full 6-step workflow reference
├── README.md                      — this file
├── references/
│   ├── levels.md                  — L0/L1/L2/L3 decision guide + canvas
│   ├── palette-and-typography.md  — Horizon hex + Helvetica hierarchy
│   ├── shapes-and-edges.md        — style strings + center-alignment rule
│   └── layout.md                  — canvas skeleton + zone-by-zone placement
├── assets/
│   ├── libraries/
│   │   └── btp-service-icons-all-size-M.xml   — 99 SAP BTP service icons
│   ├── reference-examples/        — 3 pristine L2 templates
│   └── icon-index.json            — slug → {label, aliases, ready-to-paste style}
└── scripts/
    ├── build_icon_index.py        — regenerate icon-index.json
    ├── extract_icon.py            — fuzzy name → mxCell with grid-snapped geometry
    ├── validate.py                — structural + alignment + text-fit + palette
    └── autofix.py                 — grid, hex case, arcSize, strokeWidth, fontFamily
```

## Credits & research sources

The skill's conventions were cross-referenced from:

- https://architecture.learning.sap.com — the canonical SAP Architecture Center
- https://github.com/SAP/architecture-center — the source `.drawio` files for published ref-archs
- https://github.com/SAP/btp-solution-diagrams — BTP solution diagram guidelines (alternating fill, icon size, zone nesting)
- https://github.com/miyasuta/claude-drawio-btp-diagram — the center-alignment rule for straight edges
- https://github.com/lemaiwo/btp-drawio-skill — BTP icon library integration pattern

The 3 bundled reference templates were copied from `SAP/architecture-center` (their license applies inside `assets/reference-examples/`).
