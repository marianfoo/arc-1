# Changelog

## [0.6.4](https://github.com/marianfoo/arc-1/compare/v0.6.3...v0.6.4) (2026-04-14)


### Bug Fixes

* add MCP Registry OCI annotation to Dockerfile ([#115](https://github.com/marianfoo/arc-1/issues/115)) ([15c4354](https://github.com/marianfoo/arc-1/commit/15c43542fc2780c30ee6969a4f29f11978a213b1))

## [0.6.3](https://github.com/marianfoo/arc-1/compare/v0.6.2...v0.6.3) (2026-04-14)


### Bug Fixes

* add mcpName for MCP Registry publishing ([#113](https://github.com/marianfoo/arc-1/issues/113)) ([bd346c5](https://github.com/marianfoo/arc-1/commit/bd346c50dcad7ae52e27cf1af7236d1b9fb114a4))

## [0.6.2](https://github.com/marianfoo/arc-1/compare/v0.6.1...v0.6.2) (2026-04-14)


### Features

* add 401 session timeout auto-retry and XML attribute escaping ([#85](https://github.com/marianfoo/arc-1/issues/85)) ([37f8839](https://github.com/marianfoo/arc-1/commit/37f8839297e6ea7ebbac36015e33793ed211140b))
* Add DOMA/DTEL write support to SAPWrite ([#86](https://github.com/marianfoo/arc-1/issues/86)) ([252d048](https://github.com/marianfoo/arc-1/commit/252d0489b8f417134b5b167972022f5c99d86c09))
* add FLP launchpad management via SAPManage ([#87](https://github.com/marianfoo/arc-1/issues/87)) ([8026a84](https://github.com/marianfoo/arc-1/commit/8026a84adbbcd84b9a342a491f2285cd1bfd1890))
* BTP Cloud Foundry deployment with SAP Cloud SDK and MTA support ([#97](https://github.com/marianfoo/arc-1/issues/97)) ([29e6685](https://github.com/marianfoo/arc-1/commit/29e6685749a2325833b55e802b9aea1f81a9b536))
* CDS write robustness and error handling improvements ([#101](https://github.com/marianfoo/arc-1/issues/101)) ([c06d884](https://github.com/marianfoo/arc-1/commit/c06d884707726bd150fda56fa94beaca9aec2464))
* DEVC package create/delete via SAPManage ([#110](https://github.com/marianfoo/arc-1/issues/110)) ([72478d3](https://github.com/marianfoo/arc-1/commit/72478d38e2f9a43dac9a1e7d891f3314f3696169))
* improve activation structured responses, inactive objects, preaudit ([#90](https://github.com/marianfoo/arc-1/issues/90)) ([b8d5db0](https://github.com/marianfoo/arc-1/commit/b8d5db09bb63aa8e120cb80efd98516b18c36631))
* MSAG (message class) read/write support ([#109](https://github.com/marianfoo/arc-1/issues/109)) ([9a80416](https://github.com/marianfoo/arc-1/commit/9a8041608aadaad0ba72ae152e6f79146ebc20ec))
* safe by default — read-only, no SQL, no data preview out of the box ([#89](https://github.com/marianfoo/arc-1/issues/89)) ([5a46c9c](https://github.com/marianfoo/arc-1/commit/5a46c9c7aae08ae2ff885a0b1865b063c696f301))
* SRVB (Service Binding) create/update/delete via SAPWrite ([#111](https://github.com/marianfoo/arc-1/issues/111)) ([3e135a8](https://github.com/marianfoo/arc-1/commit/3e135a84d2aee385e823a7bdb59f2a689cfff6f7))
* TABL create/update/delete support ([#104](https://github.com/marianfoo/arc-1/issues/104)) ([03f1ece](https://github.com/marianfoo/arc-1/commit/03f1ecea4eb365d94b53c97901a01dc9131dc993))
* transport enhancements — delete, reassign, types, recursive release (FEAT-39) ([#88](https://github.com/marianfoo/arc-1/issues/88)) ([0f7ac83](https://github.com/marianfoo/arc-1/commit/0f7ac8345a4914d05935f8ced359378c4840093c))
* transport pre-flight check for non-$TMP package writes ([#99](https://github.com/marianfoo/arc-1/issues/99)) ([36d7787](https://github.com/marianfoo/arc-1/commit/36d7787213b2c1e715b05f273efe32e4b7b9cc9f))


### Bug Fixes

* align ADT API patterns with reference abap-adt-api implementation ([#98](https://github.com/marianfoo/arc-1/issues/98)) ([9607510](https://github.com/marianfoo/arc-1/commit/9607510d0bb886d46e70bf2c620e014c37420dd9))
* enforce allowedPackages on all SAPWrite operations ([#81](https://github.com/marianfoo/arc-1/issues/81)) ([5de8b44](https://github.com/marianfoo/arc-1/commit/5de8b4443b4d090a6920cdee7c917d41bb282ab6))
* feature probe only treats 404 as unavailable, not all HTTP errors ([#95](https://github.com/marianfoo/arc-1/issues/95)) ([5119615](https://github.com/marianfoo/arc-1/commit/51196153b9a1889a5d572e31d6e15438e2bd09ca))
* RAP write guard, block CDS writes when RAP unavailable ([#93](https://github.com/marianfoo/arc-1/issues/93)) ([dea0099](https://github.com/marianfoo/arc-1/commit/dea009926d93f76301e1824bc46ee164db9bb23b))
* remove RAP write guard that blocked all CDS/DDLS writes ([#96](https://github.com/marianfoo/arc-1/issues/96)) ([5ffef19](https://github.com/marianfoo/arc-1/commit/5ffef19b3586d0c0cd9bfb3134d34d0303430398))
* transport hint false positive when corrNr present in URL path ([#100](https://github.com/marianfoo/arc-1/issues/100)) ([2026702](https://github.com/marianfoo/arc-1/commit/202670259e7e379548eb29f6a05bc360c055f4fb))
* use HEAD instead of GET for feature probing ([#94](https://github.com/marianfoo/arc-1/issues/94)) ([4a8a156](https://github.com/marianfoo/arc-1/commit/4a8a1565ecb9a56c7137003153b7f1359deef491))

## [0.6.1](https://github.com/marianfoo/arc-1/compare/v0.6.0...v0.6.1) (2026-04-10)


### Features

* add API release state tool for clean core compliance (FEAT-02) ([#77](https://github.com/marianfoo/arc-1/issues/77)) ([57e5eaf](https://github.com/marianfoo/arc-1/commit/57e5eafdc05067e7acf4052da4087f1ea0e2b3c6))
* add BSP types and Atom XML parsers for UI5 filestore ([#61](https://github.com/marianfoo/arc-1/issues/61)) ([264af14](https://github.com/marianfoo/arc-1/commit/264af14d1dcfde49a64965cdf94baba6db8b3731))
* add BSP_DEPLOY type for ABAP Repository OData queries ([#66](https://github.com/marianfoo/arc-1/issues/66)) ([90a2fc6](https://github.com/marianfoo/arc-1/commit/90a2fc6b419720b3844480f3fe943a55bd2e9ac1))
* add class hierarchy to SAPNavigate and fix doc inaccuracies ([#70](https://github.com/marianfoo/arc-1/issues/70)) ([1831808](https://github.com/marianfoo/arc-1/commit/183180828a44b7fcc3dd7db7a9944785364f6050))
* add publishServiceBinding and unpublishServiceBinding to devtools ([#62](https://github.com/marianfoo/arc-1/issues/62)) ([ced5639](https://github.com/marianfoo/arc-1/commit/ced56393c8d396f999ecba7c673abef45dbe9dc0))
* add transliteration, field hints, cache indicators ([#64](https://github.com/marianfoo/arc-1/issues/64)) ([0ce3347](https://github.com/marianfoo/arc-1/commit/0ce334712e2a40b0571b86c2ee5e3b40a13b2329))
* transport/write compatibility — CTS media types, 406/415 retry, corrNr auto-propagation ([#78](https://github.com/marianfoo/arc-1/issues/78)) ([42f0786](https://github.com/marianfoo/arc-1/commit/42f078658fe3b98143a2344e276d6d663c64f78c))


### Bug Fixes

* add pre-cleanup for stale E2E write object ([#76](https://github.com/marianfoo/arc-1/issues/76)) ([a5aa26f](https://github.com/marianfoo/arc-1/commit/a5aa26f07ee7dbde7c58b8e2f0e0a13bcdd1eb76))
* correct Accept headers and entity expansion limit for ADT APIs ([#69](https://github.com/marianfoo/arc-1/issues/69)) ([ff96ea8](https://github.com/marianfoo/arc-1/commit/ff96ea852ccb9d3136cffa3b0e8205d6cb466799))
* implement comprehensive ADT API audit reports ([#65](https://github.com/marianfoo/arc-1/issues/65)) ([9f210ab](https://github.com/marianfoo/arc-1/commit/9f210ab0f0365ea65dd9cfa261436678af299c26))
* improve LLM guidance for SAPSearch empty results and SAPContext CDS usage ([#59](https://github.com/marianfoo/arc-1/issues/59)) ([1df565a](https://github.com/marianfoo/arc-1/commit/1df565a6d68a89fec9565fa865cded82fc8f426e))


### Tests

* reliability hardening, fixtures, skip policy, coverage, try/catch, CRUD lifecycle, telemetry ([#72](https://github.com/marianfoo/arc-1/issues/72)) ([be42998](https://github.com/marianfoo/arc-1/commit/be42998f19f731939ddffad59f76e89cf8c26f55))

## [0.6.0](https://github.com/marianfoo/arc-1/compare/v0.5.0...v0.6.0) (2026-04-08)


### ⚠ BREAKING CHANGES

* simplify write safety — default $TMP, remove allowTransportableEdits, enforce package allowlist ([#56](https://github.com/marianfoo/arc-1/issues/56))

### Features

* add class metadata types and ADT metadata parser ([#55](https://github.com/marianfoo/arc-1/issues/55)) ([0b44fb7](https://github.com/marianfoo/arc-1/commit/0b44fb7e32cb5fbca389edda77b6d1ef1b7c818b))
* simplify write safety — default $TMP, remove allowTransportableEdits, enforce package allowlist ([#56](https://github.com/marianfoo/arc-1/issues/56)) ([1f6ac1d](https://github.com/marianfoo/arc-1/commit/1f6ac1da03f61d42099dccedd3e6b1f824aec091))

## [0.5.0](https://github.com/marianfoo/arc-1/compare/v0.4.4...v0.5.0) (2026-04-08)


### ⚠ BREAKING CHANGES

* SAPQuery now requires 'data' scope (was 'read'), SAPTransport requires 'write' (was 'admin')

### Features

* add J4D skills parity plan ([#47](https://github.com/marianfoo/arc-1/issues/47)) ([df7ef1f](https://github.com/marianfoo/arc-1/commit/df7ef1f98e8bcf4fa51f40af53b75d9fdd8e9672))
* add textSearch smoketest at startup and other improvments ([#45](https://github.com/marianfoo/arc-1/issues/45)) ([792ff5b](https://github.com/marianfoo/arc-1/commit/792ff5ba605ba00e1dce869768903eeb99adcc94))
* add Zod v4 runtime input validation for all MCP tools ([#52](https://github.com/marianfoo/arc-1/issues/52)) ([9eea32a](https://github.com/marianfoo/arc-1/commit/9eea32a3eec4d6a7e1276483c4aa73cc215efe52))
* two-dimensional authorization model (scopes, roles, safety) ([#48](https://github.com/marianfoo/arc-1/issues/48)) ([8ce07d1](https://github.com/marianfoo/arc-1/commit/8ce07d11389928709de01da5073d0165cbc605b7))


### Bug Fixes

* implement OAuth security review verification report(RFC 9700) ([#51](https://github.com/marianfoo/arc-1/issues/51)) ([3ef81e1](https://github.com/marianfoo/arc-1/commit/3ef81e1cd3b094a4f6645add6c866dbe2c71bf1e))
* use standard HTTP proxy for BTP connectivity ([#43](https://github.com/marianfoo/arc-1/issues/43)) ([a60dd1b](https://github.com/marianfoo/arc-1/commit/a60dd1b60145c40c02fb1be93b33c39aa3d9af54))

## [0.4.4](https://github.com/marianfoo/arc-1/compare/v0.4.3...v0.4.4) (2026-04-07)


### Bug Fixes

* use native arm64 runners instead of QEMU for Docker builds ([b65fba4](https://github.com/marianfoo/arc-1/commit/b65fba41851b0d5ae1f2d15601c4afc78b0608ae))

## [0.4.3](https://github.com/marianfoo/arc-1/compare/v0.4.2...v0.4.3) (2026-04-07)


### Bug Fixes

* use separate deps stage to avoid QEMU arm64 crash in Docker build ([cab08fa](https://github.com/marianfoo/arc-1/commit/cab08fa2085fbafb63d61e1954ae88af136d87b7))

## [0.4.2](https://github.com/marianfoo/arc-1/compare/v0.4.1...v0.4.2) (2026-04-07)


### Bug Fixes

* avoid QEMU emulation crash in arm64 Docker build ([7ea7883](https://github.com/marianfoo/arc-1/commit/7ea78838ea8bd121f6b823c0754f64ae2b69b673))

## [0.4.1](https://github.com/marianfoo/arc-1/compare/v0.4.0...v0.4.1) (2026-04-07)


### Bug Fixes

* fix npm self-upgrade in release workflow (Node 22.22.x bug) ([17b6bf3](https://github.com/marianfoo/arc-1/commit/17b6bf3bb1ffcd83684d0c9d8f37b34bc0f37aa5))

## [0.4.0](https://github.com/marianfoo/arc-1/compare/v0.3.0...v0.4.0) (2026-04-07)


### Features

* add DDIC completeness — structures, domains, data elements, transactions ([#21](https://github.com/marianfoo/arc-1/issues/21)) ([9e0fa2a](https://github.com/marianfoo/arc-1/commit/9e0fa2ad756a3a10f937531216707c8ac56c8aae))
* add DDLS support to SAPContext and include=elements to SAPRead ([#30](https://github.com/marianfoo/arc-1/issues/30)) ([6a2883e](https://github.com/marianfoo/arc-1/commit/6a2883e086bd9c44d578245a61fad1a50693f60f))
* add LLM eval harness for testing tool-call accuracy ([#33](https://github.com/marianfoo/arc-1/issues/33)) ([e8c8a65](https://github.com/marianfoo/arc-1/commit/e8c8a6511ad69bb9b95222450e0095fde391edda))
* add object caching with on-demand + pre-warmer support ([#31](https://github.com/marianfoo/arc-1/issues/31)) ([8ba2f0d](https://github.com/marianfoo/arc-1/commit/8ba2f0d1624039be03cfb39d916ee11b53f94dc8))
* add runtime diagnostics (short dumps + ABAP traces) to SAPDiagnose ([#24](https://github.com/marianfoo/arc-1/issues/24)) ([ab177fc](https://github.com/marianfoo/arc-1/commit/ab177fc0a77f34da5c3cd2c83fbf3de64b3ee928))
* DDLX, SRVB read support and batch activation for RAP completeness ([#22](https://github.com/marianfoo/arc-1/issues/22)) ([402c57b](https://github.com/marianfoo/arc-1/commit/402c57bb3b43b908a3df4e9494e0cfbd08cc436f))
* enhanced abaplint integration with system-aware presets and pre-write validation ([#37](https://github.com/marianfoo/arc-1/issues/37)) ([f17d4fa](https://github.com/marianfoo/arc-1/commit/f17d4fa03cf725dcc45918f050b2c1cd8fd2eff4))
* method-level surgery and hyperfocused mode ([#23](https://github.com/marianfoo/arc-1/issues/23)) ([dbd27b9](https://github.com/marianfoo/arc-1/commit/dbd27b9be52ee32ed8de0691e033e73ffa7c2314))
* scope-based Where-Used analysis for SAPNavigate ([#38](https://github.com/marianfoo/arc-1/issues/38)) ([f805441](https://github.com/marianfoo/arc-1/commit/f805441d03f2f1190b461d923e7e176e4f4af1bc))


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
