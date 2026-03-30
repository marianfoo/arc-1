# mario-andreschak/mcp-abap-abap-adt-api

> **Repository**: https://github.com/mario-andreschak/mcp-abap-abap-adt-api
> **Language**: TypeScript | **License**: ISC | **Stars**: ~107
> **Status**: Dormant (last commit Feb 2025, ~13 months inactive)
> **Relationship**: Thin MCP wrapper around `abap-adt-api` npm package (by Marcello Urbani)

---

## Project Overview

A 1:1 MCP wrapper around the `abap-adt-api` npm package (v6.2.0). Every method of that library is exposed as an individual MCP tool, resulting in ~95+ tools with no intent-based abstraction. Uses a BaseHandler pattern with 26 domain-specific handler files.

## Architecture

```
src/
  index.ts           # AbapAdtServer (extends MCP Server), large switch router
  lib/logger.ts      # Logging utility
  types/tools.ts     # ToolDefinition interface
  handlers/          # 26 handler files, each extending BaseHandler
    BaseHandler.ts   # Abstract base with rate limiting, metrics, error handling
    ...26 domain handlers...
```

**Key dependency**: `abap-adt-api` v6.2.0 by Marcello Urbani -- the entire project delegates to this library.

## Tool Inventory (~95+ tools)

### Auth (3): login, logout, dropSession
### Object Management (5): objectStructure, searchObject, findObjectPath, objectTypes, reentranceTicket
### Source (2): getObjectSource, setObjectSource
### Lock (2): lock, unLock
### Deletion (1): deleteObject
### Activation (3): activateObjects, activateByName, inactiveObjects
### Registration (3): objectRegistrationInfo, validateNewObject, createObject
### Transport (15): transportInfo, createTransport, hasTransportConfig, transportConfigurations, getTransportConfiguration, setTransportsConfig, createTransportsConfig, userTransports, transportsByConfig, transportDelete, transportRelease, transportSetOwner, transportAddUser, systemUsers, transportReference
### Class (3): classIncludes, classComponents, createTestInclude
### Code Analysis (14): syntaxCheckCode, syntaxCheckCdsUrl, codeCompletion, findDefinition, usageReferences, syntaxCheckTypes, codeCompletionFull, runClass, codeCompletionElement, usageReferenceSnippets, fixProposals, fixEdits, fragmentMappings, abapDocumentation
### Unit Tests (4): unitTestRun, unitTestEvaluation, unitTestOccurrenceMarkers, createTestInclude
### ATC (10): atcCustomizing, atcCheckVariant, createAtcRun, atcWorklists, atcUsers, atcExemptProposal, atcRequestExemption, isProposalMessage, atcContactUri, atcChangeContact
### Git/abapGit (10): gitRepos, gitExternalRepoInfo, gitCreateRepo, gitPullRepo, gitUnlinkRepo, stageRepo, pushRepo, checkRepo, remoteRepoInfo, switchRepoBranch
### Debugger (13): debuggerListeners, debuggerListen, debuggerDeleteListener, debuggerSetBreakpoints, debuggerDeleteBreakpoints, debuggerAttach, debuggerSaveSettings, debuggerStackTrace, debuggerVariables, debuggerChildVariables, debuggerStep, debuggerGoToStack, debuggerSetVariableValue
### Refactoring (3): extractMethodEvaluate, extractMethodPreview, extractMethodExecute
### Rename (3): renameEvaluate, renamePreview, renameExecute
### Discovery (7): featureDetails, collectionFeatureDetails, findCollectionByUrl, loadTypes, adtDiscovery, adtCoreDiscovery, adtCompatibiliyGraph
### DDIC (4): annotationDefinitions, ddicElement, ddicRepositoryAccess, packageSearchHelp
### Query (2): tableContents, runQuery
### Feed (2): feeds, dumps
### Node (2): nodeContents, mainPrograms
### PrettyPrinter (3): prettyPrinterSetting, setPrettyPrinterSetting, prettyPrinter
### Revision (1): revisions
### Service Binding (3): publishServiceBinding, unPublishServiceBinding, bindingDetails
### Trace (9): tracesList, tracesListRequests, tracesHitList, tracesDbAccess, tracesStatements, tracesSetParameters, tracesCreateConfiguration, tracesDeleteConfiguration, tracesDelete

## Authentication

| Method | Supported |
|--------|-----------|
| Basic Auth | Yes |
| OIDC/OAuth/JWT | **No** |
| BTP | **No** |
| API Key | **No** |

## Safety/Security

**None.** No read-only mode, no operation filtering, no package restrictions, no audit logging.

## Transport (MCP Protocol)

stdio only. No HTTP or SSE.

## Testing

**Zero tests.** Jest is configured but no test specs exist.

## Known Issues

| Issue | Description | Relevant to ARC-1? |
|-------|-------------|-------------------|
| #4, #6, #9 | getObjectSource truncates large source files | Yes -- verify ARC-1 handles large sources |
| #11 | JSON parse errors in responses | Yes -- ensure robust XML/JSON parsing |
| #10 | Requests XSUAA OAuth 2.0 support | ARC-1 already has OIDC |
| ~95 tools | LLMs struggle with tool selection | ARC-1 solved with intent-based routing |
| No caching | Every request hits SAP | ARC-1 has SQLite + memory cache |

---

## Features This Project Has That ARC-1 Lacks

| Feature | Priority | Effort | Place in ARC-1 or mcp-sap-docs? |
|---------|----------|--------|--------------------------------|
| ABAP Debugger (13 tools) | Low | 5d | ARC-1 -- complex, needs WebSocket |
| Full ATC management (10 tools) | Medium | 3d | ARC-1 -- exemption mgmt useful |
| abapGit integration (10 tools) | Medium | 3d | ARC-1 -- repo management |
| Trace/perf analysis (9 tools) | Medium | 2d | ARC-1 -- extend SAPDiagnose |
| Refactoring -- extract method | High | 2d | ARC-1 -- reduces manual edits |
| Refactoring -- rename | High | 2d | ARC-1 -- reduces manual edits |
| Service binding mgmt | Medium | 1d | ARC-1 -- RAP development |
| PrettyPrinter | Medium | 0.5d | ARC-1 -- code formatting |
| DDIC exploration (annotations, elements) | Medium | 1d | ARC-1 -- extend SAPRead |
| Revision history | Medium | 1d | ARC-1 -- version comparison |
| Fix proposals / fix edits | High | 2d | ARC-1 -- auto-fix from ATC |
| abapDocumentation | Medium | 0.5d | mcp-sap-docs |
| Reentrance ticket | Low | 0.5d | ARC-1 -- GUI launch support |
| ADT compatibility graph | Low | 0.5d | ARC-1 -- feature detection |

## Features ARC-1 Has That This Project Lacks

HTTP Streamable, OIDC/JWT auth, BTP support, principal propagation, API key auth, safety system (read-only, op filter, pkg filter), caching (SQLite + memory), abaplint integration, audit logging, MCP elicitation, Docker/npm distribution, 320+ unit tests, intent-based routing (11 tools vs 95+).

---

## Changelog & Relevance Tracker

| Date | Change | Relevant? | Action for ARC-1 | Status |
|------|--------|-----------|-------------------|--------|
| 2025-02-27 | Last commit (unknown change) | N/A | Project appears abandoned | -- |
| | | | | |

_Last updated: 2026-03-30_
