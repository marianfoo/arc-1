# Changelog

## [0.4.0](https://github.com/marianfoo/arc-1/compare/v0.3.0...v0.4.0) (2026-04-05)


### Features

* add DDIC completeness — structures, domains, data elements, transactions ([#21](https://github.com/marianfoo/arc-1/issues/21)) ([9e0fa2a](https://github.com/marianfoo/arc-1/commit/9e0fa2ad756a3a10f937531216707c8ac56c8aae))
* add DDLS support to SAPContext and include=elements to SAPRead ([#30](https://github.com/marianfoo/arc-1/issues/30)) ([6a2883e](https://github.com/marianfoo/arc-1/commit/6a2883e086bd9c44d578245a61fad1a50693f60f))
* add LLM eval harness for testing tool-call accuracy ([#33](https://github.com/marianfoo/arc-1/issues/33)) ([e8c8a65](https://github.com/marianfoo/arc-1/commit/e8c8a6511ad69bb9b95222450e0095fde391edda))
* add runtime diagnostics (short dumps + ABAP traces) to SAPDiagnose ([#24](https://github.com/marianfoo/arc-1/issues/24)) ([ab177fc](https://github.com/marianfoo/arc-1/commit/ab177fc0a77f34da5c3cd2c83fbf3de64b3ee928))
* DDLX, SRVB read support and batch activation for RAP completeness ([#22](https://github.com/marianfoo/arc-1/issues/22)) ([402c57b](https://github.com/marianfoo/arc-1/commit/402c57bb3b43b908a3df4e9494e0cfbd08cc436f))
* method-level surgery and hyperfocused mode ([#23](https://github.com/marianfoo/arc-1/issues/23)) ([dbd27b9](https://github.com/marianfoo/arc-1/commit/dbd27b9be52ee32ed8de0691e033e73ffa7c2314))


### Bug Fixes

* post-merge consistency — SAPLint schema cleanup and objectUrlForType completeness ([#26](https://github.com/marianfoo/arc-1/issues/26)) ([214ebec](https://github.com/marianfoo/arc-1/commit/214ebec730b717acb483665e8af0f4bde5f0ed08))

## [0.3.0](https://github.com/marianfoo/arc-1/compare/v0.2.0...v0.3.0) (2026-04-01)


### Features

* direct BTP ABAP Environment connectivity via OAuth 2.0 ([#18](https://github.com/marianfoo/arc-1/issues/18)) ([b1cf86c](https://github.com/marianfoo/arc-1/commit/b1cf86c3755294f1873be80f67e480d54b1427b3))

## [0.2.0](https://github.com/marianfoo/arc-1/compare/v0.1.4...v0.2.0) (2026-03-31)


### Features

* E2E testing infrastructure, XML error cleanup, and CI hardening ([#13](https://github.com/marianfoo/arc-1/issues/13)) ([3830ff9](https://github.com/marianfoo/arc-1/commit/3830ff9))
* improve tooling based on real-world LLM feedback ([#14](https://github.com/marianfoo/arc-1/issues/14)) ([3bcb59e](https://github.com/marianfoo/arc-1/commit/3bcb59e))


### Bug Fixes

* correct Docker image name to arc-1 and fix GHCR link ([ae58467](https://github.com/marianfoo/arc-1/commit/ae58467))

## [0.1.4](https://github.com/marianfoo/arc-1/compare/v0.1.3...v0.1.4) (2026-03-31)


### Bug Fixes

* add repository field for npm OIDC provenance verification ([b3a55aa](https://github.com/marianfoo/arc-1/commit/b3a55aa))

## [0.1.3](https://github.com/marianfoo/arc-1/compare/v0.1.2...v0.1.3) (2026-03-31)


### Bug Fixes

* install npm 11.5+ for OIDC trusted publishing support ([300f846](https://github.com/marianfoo/arc-1/commit/300f846))

## [0.1.2](https://github.com/marianfoo/arc-1/compare/v0.1.1...v0.1.2) (2026-03-31)


### Bug Fixes

* restore NPM_TOKEN for publish and reorganize docs navigation ([6d76b4b](https://github.com/marianfoo/arc-1/commit/6d76b4b))
* use npm OIDC trusted publishing instead of NPM_TOKEN ([ab9f50c](https://github.com/marianfoo/arc-1/commit/ab9f50c))

## [0.1.1](https://github.com/marianfoo/arc-1/compare/v0.1.0...v0.1.1) (2026-03-31)

Initial release. Ported from [oisee/vibing-steampunk](https://github.com/oisee/vibing-steampunk).
