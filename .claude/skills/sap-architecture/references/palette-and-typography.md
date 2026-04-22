# SAP Horizon palette & typography

All values confirmed against `SAP/architecture-center` and `SAP/btp-solution-diagrams`. **Always emit hex uppercase** (autofix will normalise it, but the source should be correct).

## Palette (single family — never mix generic pastels)

| Role | Stroke | Fill | Text |
|------|--------|------|------|
| Primary SAP blue frame (BTP zone, subaccount outer) | `#0070F2` | `#EBF8FF` | `#002A86` |
| White service card inside BTP zone | `#0070F2` | `#FFFFFF` | `#00185A` |
| Light-blue tile (bound services, inner cards) | `#0070F2` | `#EBF8FF` | `#00185A` |
| Neutral frame (MCP client, inner Subaccount) | `#475E75` | `#FFFFFF` | `#475E75` (label), `#00185A` (content) |
| On-Premise / 3rd Party frame | `#475E75` | `#F5F6F7` | `#475E75` |
| SAP ABAP system card (focus target) | `#002A86` | `#FFFFFF` | `#00185A` |
| Accent — focus app (ARC-1, Joule, the "star") | `#5D36FF` | `#F1ECFF` | `#00185A` |
| Success pill (HTTPS, TRUST, Sign-in, mTLS) | `#188918` | `#F5FAE5` | `#266F3A` |
| Authorization pill / indigo accent | `#470BED` | `#F1ECFF` | `#00185A` |
| Trust pill (magenta) | `#CC00DC` | `#FFF0FA` | `#CC00DC` |
| Teal pill (MCP tool call) | `#07838F` | `#DAFDF5` | `#07838F` |
| Default connector stroke (internal) | `#475E75` | — | `#475E75` |
| Authenticated connector stroke | `#188918` | — | `#266F3A` |
| ADT / SAP ABAP connector stroke | `#002A86` | — | `#002A86` |
| Muted caption text | — | — | `#556B82` |
| Primary body text | — | — | `#1D2D3E` |

### Alternating fill by nesting level (important)

Nested zones alternate fill / no-fill to create visual depth (quoted from `SAP/btp-solution-diagrams/guideline/docs/btp_guideline/diagr_comp/areas.md`):

- **L0 outer zone**: `#EBF8FF` fill
- **L1 inner zone**: `#FFFFFF` fill (no-fill)
- **L2 inner zone**: `#EBF8FF` fill
- **L3 inner zone**: `#FFFFFF` fill (no-fill)

## Typography — Helvetica everywhere

| Role | Size | Weight (fontStyle) | Color |
|------|------|--------------------|-------|
| Diagram title | 24 | bold (`1`) | `#002A86` |
| Subtitle | 14 | regular (`0`) | `#475E75` |
| Zone / container label ("SAP BTP", "On-Premise", "MCP Client") | 16 | bold (`1`) | `#475E75` or `#00185A` |
| Feature-group heading inside a big card | 18 | bold (`1`) | `#00185A` |
| Sub-section label ("Bound BTP Services", "ROLE COLLECTIONS") | 14 / 11 | bold (`1`) | `#00185A` or accent |
| Service card title | 12–14 | bold (`1`) | `#00185A` |
| Service card caption / inline helper | 11 | regular (`0`) | `#556B82` |
| Pill label | 10 | bold (`1`, uppercase for TRUST, Sign-in) | pill text color |
| Edge label (non-pill) | 10 | regular (`0`) | `#475E75` or zone color |

Secondary / muted body copy uses `#556B82`. Primary body copy uses `#1D2D3E`. Never use black — it's too harsh against the blue palette.

## Hex normalisation

The SAP source is inconsistent (`#475e75` and `#475E75` coexist in reference `.drawio` files). Emit uppercase — `autofix.py` will normalise any surviving lowercase.

## Don't

- Don't use draw.io's default palette (`#dae8fc`, `#d5e8d4`, `#f8cecc`, `#6c8ebf`). The validator flags these.
- Don't mix Horizon with Fiori quick-style colors — stick to one palette.
- Don't use pure black. `#1D2D3E` reads as "black" but harmonises with the blues.
