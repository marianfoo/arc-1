# ARC-1 Architecture

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Clients["MCP Clients"]
        CC[Claude Code]
        CD[Claude Desktop]
        Other[Other MCP Clients]
    end

    subgraph VSP["arc1 - Go Binary"]
        direction TB

        subgraph Entry["Entry Points"]
            MCP[MCP Server<br/>JSON-RPC / stdio + HTTP Streamable]
            CLI[CLI Mode<br/>search · source · export · debug]
            LUA[Lua Scripting<br/>REPL · Scripts]
        end

        subgraph Auth["Authentication Layer"]
            APIKEY[API Key<br/>VSP_API_KEY]
            OIDC[OIDC/JWT Validator<br/>EntraID · Cognito · Keycloak]
            PRM[RFC 9728 Metadata<br/>/.well-known/oauth-protected-resource]
        end

        subgraph Core["internal/mcp/server.go"]
            direction LR
            Tools[11 Intent-Based Tools]
        end

        subgraph Safety["Safety Layer"]
            RO[Read-Only Mode]
            PF[Package Filter]
            TF[Transport Filter]
            OF[Operation Filter]
            TE[Transportable<br/>Edit Guard]
        end

        subgraph ADTLib["pkg/adt/ — ADT Client Library"]
            direction TB
            subgraph Read["Read"]
                client[client.go<br/>Search · Get*]
                cds[cds.go<br/>CDS Dependencies]
            end
            subgraph Write["Write"]
                crud[crud.go<br/>Lock · Create · Update · Delete]
                workflows[workflows.go<br/>GetSource · WriteSource · Grep*]
            end
            subgraph DevTools["DevTools"]
                devtools[devtools.go<br/>Syntax · Activate · Tests · ATC]
                codeintel[codeintel.go<br/>FindDef · FindRefs · Completion]
            end
            subgraph Debug["Debugger"]
                dbg[debugger.go<br/>Breakpoints · Listen · Attach · Step]
                amdp[amdp_debugger.go<br/>HANA SQLScript Debug]
            end
            subgraph Extras["Extras"]
                ui5[ui5.go<br/>UI5/BSP Apps]
                features[features.go<br/>System Probing]
            end
        end

        subgraph Transport["Transport Layer"]
            HTTP[http.go<br/>CSRF · Sessions · Auth]
            WS[WebSocket Client<br/>ZADT_VSP APC]
        end

        subgraph Packages["Supporting Packages"]
            DSL[pkg/dsl/<br/>Fluent API · YAML Workflows]
            Cache[pkg/cache/<br/>Memory · SQLite]
            Script[pkg/scripting/<br/>Lua VM · Bindings]
        end

        subgraph Embedded["Embedded Assets"]
            ABAP[embedded/abap/<br/>ZADT_VSP Source]
            Deps[embedded/deps/<br/>abapGit ZIPs]
        end
    end

    subgraph SAP["SAP System"]
        ADT[ADT REST API<br/>/sap/bc/adt/*]
        APC[ZADT_VSP<br/>WebSocket APC]
        HANA[HANA DB<br/>AMDP Debug]
    end

    CC & CD & Other <-->|"JSON-RPC / stdio or HTTP"| MCP
    CLI --> Core
    LUA --> Core
    MCP --> Auth
    Auth --> Core
    Core --> Safety
    Safety --> ADTLib
    ADTLib --> Transport
    HTTP <-->|HTTPS| ADT
    WS <-->|WebSocket| APC
    amdp <-->|WebSocket| HANA
    DSL --> ADTLib
    Script --> ADTLib
```

## Request Flow

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as MCP Server
    participant Safety as Safety Layer
    participant ADT as ADT Client
    participant HTTP as HTTP Transport
    participant SAP as SAP System

    Client->>Server: Tool Call (JSON-RPC)
    Server->>Safety: Check permissions

    alt Blocked
        Safety-->>Server: Denied (read-only / package / operation)
        Server-->>Client: Error result
    else Allowed
        Safety->>ADT: Execute operation
        ADT->>HTTP: HTTP request
        HTTP->>HTTP: Add CSRF token + cookies
        HTTP->>SAP: HTTPS / WebSocket
        SAP-->>HTTP: Response
        HTTP-->>ADT: Parsed response
        ADT-->>Server: Result
        Server-->>Client: Tool result (JSON)
    end
```

## Write Operation Flow (EditSource)

```mermaid
sequenceDiagram
    participant AI as AI Assistant
    participant VSP as arc1
    participant SAP as SAP System

    AI->>VSP: EditSource(url, old_string, new_string)

    VSP->>SAP: GET source
    SAP-->>VSP: Current source code

    VSP->>VSP: Find & replace (uniqueness check)

    VSP->>SAP: POST syntax check
    SAP-->>VSP: OK / Errors

    alt Syntax Errors
        VSP-->>AI: Error (no changes saved)
    else Syntax OK
        VSP->>SAP: POST lock
        VSP->>SAP: PUT source
        VSP->>SAP: POST unlock
        VSP->>SAP: POST activate
        VSP-->>AI: Success
    end
```

## Tool Categories

```mermaid
flowchart LR
    subgraph Search["Search (3)"]
        SO[SearchObject]
        GO[GrepObjects]
        GP[GrepPackages]
    end

    subgraph Read["Read (10)"]
        GS[GetSource]
        GT[GetTable]
        GTC[GetTableContents]
        RQ[RunQuery]
        GPk[GetPackage]
        GFG[GetFunctionGroup]
        GCD[GetCDSDependencies]
        GCI[GetClassInfo]
        GMs[GetMessages]
        CS[CompareSource]
    end

    subgraph Write["Write (5)"]
        WS[WriteSource]
        ES[EditSource]
        IF[ImportFromFile]
        EF[ExportToFile]
        MO[MoveObject]
    end

    subgraph Dev["Dev (5)"]
        SC[SyntaxCheck]
        UT[RunUnitTests]
        ATC[RunATCCheck]
        LO[LockObject]
        UO[UnlockObject]
    end

    subgraph Intel["Intelligence (2)"]
        FD[FindDefinition]
        FR[FindReferences]
    end

    subgraph Debug["Debugger (6)"]
        DL[Listen]
        DA[Attach]
        DD[Detach]
        DS[Step]
        DGS[GetStack]
        DGV[GetVariables]
    end

    subgraph System["System (5)"]
        SI[GetSystemInfo]
        IC[GetInstalledComponents]
        CG[GetCallGraph]
        OS[GetObjectStructure]
        GF[GetFeatures]
    end

    subgraph Diag["Diagnostics (6)"]
        LD[ListDumps]
        GD[GetDump]
        LT[ListTraces]
        GTr[GetTrace]
        STS[GetSQLTraceState]
        LST[ListSQLTraces]
    end

    subgraph Git["Git (2)"]
        GiT[GitTypes]
        GiE[GitExport]
    end

    subgraph Reports["Reports (4)"]
        RR[RunReport]
        GV[GetVariants]
        GTE[GetTextElements]
        STE[SetTextElements]
    end

    subgraph Install["Install (3)"]
        IV[InstallZADTVSP]
        IA[InstallAbapGit]
        LDp[ListDependencies]
    end
```

## Dual Transport: HTTP + WebSocket

```mermaid
flowchart LR
    subgraph VSP["ARC-1"]
        HTTP[HTTP Client<br/>pkg/adt/http.go]
        WS[WebSocket Client<br/>pkg/adt/websocket.go]
    end

    subgraph SAP["SAP System"]
        ADT[ADT REST API<br/>/sap/bc/adt/*]
        APC[ZADT_VSP APC Handler<br/>/sap/bc/apc/ws/zadt_vsp]
    end

    HTTP -->|"CRUD · Search · Read<br/>Syntax · Activate · Debug"| ADT
    WS -->|"RFC Calls · Breakpoints<br/>Git Export · Reports<br/>AMDP Debug"| APC

    subgraph WSServices["WebSocket Domains"]
        direction TB
        RFC[rfc — Function Calls]
        BRK[debug — Breakpoints]
        GIT[git — abapGit Export]
        RPT[report — Report Execution]
        HLP[help — ABAP Documentation]
    end

    APC --- WSServices
```

## Package Structure

```
arc-1/
├── cmd/arc1/                    # CLI entry point (cobra/viper)
│   └── main.go                 #   Flags, env vars, auth, server startup
│
├── internal/mcp/               # MCP protocol layer
│   └── server.go               #   122 tool handlers, mode-aware registration
│
├── pkg/adt/                    # ADT client library (core)
│   ├── client.go               #   Read operations + search
│   ├── crud.go                 #   Lock / create / update / delete
│   ├── devtools.go             #   Syntax check, activate, unit tests, ATC
│   ├── codeintel.go            #   Find definition, references, completion
│   ├── workflows.go            #   High-level: GetSource, WriteSource, Grep*
│   ├── debugger.go             #   External ABAP debugger (HTTP + WebSocket)
│   ├── amdp_debugger.go        #   HANA/AMDP SQLScript debugger
│   ├── ui5.go                  #   UI5/Fiori BSP management
│   ├── cds.go                  #   CDS view dependency analysis
│   ├── safety.go               #   Read-only, package/op filtering
│   ├── features.go             #   System capability detection
│   ├── http.go                 #   HTTP transport (CSRF, sessions, auth)
│   └── xml.go                  #   ADT XML type definitions
│
├── pkg/dsl/                    # Fluent API & workflow engine
│   ├── search.go               #   Search builder
│   ├── test_runner.go          #   Unit test orchestration
│   ├── workflow.go             #   YAML workflow engine
│   └── batch.go                #   Batch import/export, pipelines
│
├── pkg/scripting/              # Lua scripting engine
│   ├── lua.go                  #   Lua VM, REPL
│   └── bindings.go             #   40+ ADT tool bindings
│
├── pkg/cache/                  # Caching infrastructure
│   ├── memory.go               #   In-memory cache
│   └── sqlite.go               #   SQLite persistent cache
│
├── embedded/                   # Assets embedded in binary
│   ├── abap/                   #   ZADT_VSP ABAP source files
│   └── deps/                   #   abapGit ZIP packages
│
└── docs/                       # Documentation
    ├── architecture.md         #   This file
    ├── DSL.md                  #   DSL & workflow guide
    └── adr/                    #   Architecture Decision Records
```

## Authentication

ARC-1 supports two independent authentication layers:

1. **MCP Client Auth** — authenticates the MCP client (API Key or OAuth/OIDC)
2. **SAP Auth** — authenticates to the SAP system (Basic, Cookie, mTLS, or Principal Propagation)

```mermaid
flowchart TD
    Request[Incoming Request] --> MCPAuth{MCP Client Auth?}

    MCPAuth -->|API Key| APIKey[VSP_API_KEY header check]
    MCPAuth -->|OAuth/OIDC| OIDC[JWT Validation<br/>via IdP JWKS]
    MCPAuth -->|None| NoAuth[No client auth<br/>local/trusted network]

    APIKey --> SAPAuth
    OIDC --> SAPAuth
    NoAuth --> SAPAuth

    SAPAuth{SAP Auth Method?}

    SAPAuth -->|Basic| Basic[Username + Password<br/>--user / --password]
    SAPAuth -->|Cookie| Cookie[Cookie File/String]
    SAPAuth -->|mTLS| MTLS[Client Certificate<br/>SAP CERTRULE]
    SAPAuth -->|Principal Prop| PP[Ephemeral X.509 Cert<br/>per OIDC user]
    SAPAuth -->|BTP Destination| BTP[Destination Service<br/>Cloud Connector]

    Basic --> CSRF[Fetch CSRF Token]
    Cookie --> CSRF
    MTLS --> CSRF
    PP --> CSRF
    BTP --> CSRF

    CSRF --> Session[Stateful Session<br/>Cookie Jar]
    Session --> SAP[SAP ADT API]
```

### OAuth/OIDC Flow (RFC 9728)

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant ARC1 as ARC-1 Server
    participant IdP as Identity Provider<br/>(Entra ID)
    participant SAP as SAP System

    Client->>ARC1: POST /mcp (no token)
    ARC1-->>Client: 401 + WWW-Authenticate:<br/>Bearer resource_metadata="/.well-known/oauth-protected-resource"

    Client->>ARC1: GET /.well-known/oauth-protected-resource
    ARC1-->>Client: {resource, authorization_servers, scopes_supported}

    Client->>IdP: OAuth 2.0 Authorization Code + PKCE
    IdP-->>Client: Access Token (JWT)

    Client->>ARC1: POST /mcp + Authorization: Bearer <jwt>
    ARC1->>IdP: Fetch JWKS (cached 1h)
    ARC1->>ARC1: Validate JWT (signature, issuer, audience, expiry)
    ARC1->>SAP: ADT REST API (using SAP auth method)
    SAP-->>ARC1: Response
    ARC1-->>Client: MCP Tool Result
```

### BTP Cloud Foundry Deployment

```mermaid
flowchart LR
    subgraph Internet
        Client[MCP Client<br/>Copilot Studio / IDE]
    end

    subgraph BTP["SAP BTP Cloud Foundry"]
        ARC1[ARC-1 Container<br/>Docker on CF]
        DS[Destination Service]
        CS[Connectivity Service<br/>Proxy]
    end

    subgraph OnPrem["On-Premise"]
        CC[Cloud Connector]
        SAP[SAP ABAP System]
    end

    Client -->|"HTTPS + Bearer JWT"| ARC1
    ARC1 -->|"Lookup SAP_TRIAL"| DS
    ARC1 -->|"HTTP via proxy"| CS
    CS -->|"Secure tunnel"| CC
    CC -->|"HTTP"| SAP
```

## Safety System

```mermaid
flowchart TD
    Request[Tool Call] --> RO{Read-Only?}

    RO -->|Yes, Write Op| Block1[BLOCKED]
    RO -->|No / Read Op| SQL{Free SQL<br/>Blocked?}

    SQL -->|Yes, RunQuery| Block2[BLOCKED]
    SQL -->|No| Ops{Operation<br/>Allowed?}

    Ops -->|Disallowed| Block3[BLOCKED]
    Ops -->|Allowed| Pkg{Package<br/>Allowed?}

    Pkg -->|Outside whitelist| Block4[BLOCKED]
    Pkg -->|In whitelist| TE{Transportable<br/>Package?}

    TE -->|Yes, not enabled| Block5[BLOCKED]
    TE -->|No / Enabled| TR{Transport<br/>Allowed?}

    TR -->|Outside whitelist| Block6[BLOCKED]
    TR -->|In whitelist| OK[EXECUTE]
```
