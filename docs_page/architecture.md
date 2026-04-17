# ARC-1 Architecture

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Clients["MCP Clients"]
        CC[Claude Code]
        CD[Claude Desktop]
        Other[Other MCP Clients]
    end

    subgraph ARC1["arc1 - TypeScript"]
        direction TB

        subgraph Entry["Entry Points"]
            MCP[MCP Server<br/>JSON-RPC / stdio + HTTP Streamable]
            CLI[CLI Mode<br/>search · source · lint]
        end

        subgraph Auth["Authentication Layer"]
            APIKEY[API Key<br/>ARC1_API_KEY]
            OIDC[OIDC/JWT Validator<br/>EntraID · Cognito · Keycloak]
            PRM[RFC 9728 Metadata<br/>/.well-known/oauth-protected-resource]
        end

        subgraph Core["src/server/server.ts"]
            direction LR
            Tools[11 Intent-Based Tools]
        end

        subgraph Safety["Safety Layer"]
            RO[Read-Only Mode]
            PF[Package Filter]
            OF[Operation Filter]
        end

        subgraph ADTLib["src/adt/ — ADT Client Library"]
            direction TB
            subgraph Read["Read"]
                client[client.ts<br/>Search · Get*]
            end
            subgraph Write["Write"]
                crud[crud.ts<br/>Lock · Create · Update · Delete]
            end
            subgraph DevTools["DevTools"]
                devtools[devtools.ts<br/>Syntax · Activate · Tests]
                codeintel[codeintel.ts<br/>FindDef · FindRefs · Completion]
            end
        end

        subgraph TransportLayer["Transport Layer"]
            HTTP[http.ts<br/>Discovery MIME · CSRF · Sessions · Auth]
        end

        subgraph Packages["Supporting Packages"]
            Cache[src/cache/<br/>Memory · SQLite]
            Lint[src/lint/<br/>abaplint]
            AFF[src/aff/<br/>AFF Schema Validation]
        end
    end

    subgraph SAP["SAP System"]
        ADT[ADT REST API<br/>/sap/bc/adt/*]
    end

    CC & CD & Other <-->|"JSON-RPC / stdio or HTTP"| MCP
    CLI --> Core
    MCP --> Auth
    Auth --> Core
    Core --> Safety
    Safety --> ADTLib
    ADTLib --> TransportLayer
    HTTP <-->|HTTPS| ADT
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
    Server->>Server: Zod schema validation
    alt Invalid args
        Server-->>Client: Validation error (field paths + expected values)
    end
    Server->>Safety: Check permissions

    alt Blocked
        Safety-->>Server: Denied (read-only / package / operation)
        Server-->>Client: Error result
    else Allowed
        Note over Safety,ADT: For SAPWrite create/batch_create:<br/>AFF metadata validation runs here<br/>(bundled JSON schemas from SAP/abap-file-formats)
        Safety->>ADT: Execute operation
        ADT->>HTTP: HTTP request
        HTTP->>HTTP: Resolve Accept/Content-Type via discovery map
        HTTP->>HTTP: Add CSRF token + cookies
        HTTP->>SAP: HTTPS
        SAP-->>HTTP: Response
        HTTP-->>ADT: Parsed response
        ADT-->>Server: Result
        Server-->>Client: Tool result (JSON)
    end
```

## Tool Categories

```mermaid
flowchart LR
    subgraph ReadTools["Read (1)"]
        SR[SAPRead<br/>PROG · CLAS · INTF · FUNC<br/>FUGR · INCL · DDLS · BDEF<br/>SRVD · TABL · VIEW<br/>TABLE_CONTENTS · DEVC<br/>SYSTEM · COMPONENTS<br/>MESSAGES · TEXT_ELEMENTS<br/>VARIANTS]
    end

    subgraph SearchTools["Search (1)"]
        SS[SAPSearch<br/>Name pattern with wildcards]
    end

    subgraph QueryTools["Query (1)"]
        SQ[SAPQuery<br/>ABAP SQL against tables]
    end

    subgraph WriteTools["Write (2)"]
        SW[SAPWrite<br/>Create · Update · Delete]
        SA[SAPActivate<br/>Activate objects]
    end

    subgraph NavTools["Navigate (1)"]
        SN[SAPNavigate<br/>Definition · References · Completion]
    end

    subgraph ContextTools["Context (1)"]
        SC[SAPContext<br/>Compressed dependency context]
    end

    subgraph QualityTools["Quality (1)"]
        SL[SAPLint<br/>Local lint · Auto-fix · Pre-write gate]
    end

    subgraph DiagTools["Diagnostics (1)"]
        SD[SAPDiagnose<br/>Syntax · Unit tests · ATC · Dumps · Traces]
    end

    subgraph AdminTools["Admin (2)"]
        ST[SAPTransport<br/>List · Create · Release]
        SM[SAPManage<br/>Feature probing]
    end
```

## Package Structure

```
arc-1/
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── cli.ts                      # CLI entry point (commander)
│   ├── server/
│   │   ├── server.ts               # MCP server setup, tool registration
│   │   ├── config.ts               # Config parser (CLI > env > .env > defaults)
│   │   ├── http.ts                 # HTTP Streamable transport + API key/OIDC auth
│   │   ├── logger.ts               # Structured logger (stderr only)
│   │   └── types.ts                # ServerConfig type, defaults
│   ├── handlers/
│   │   ├── intent.ts               # 11 intent-based tool router (handleToolCall)
│   │   └── tools.ts                # Tool definitions (names, descriptions, schemas)
│   ├── adt/
│   │   ├── client.ts               # ADT client facade (all read operations)
│   │   ├── http.ts                 # HTTP transport (undici/fetch, discovery MIME, CSRF, cookies, sessions)
│   │   ├── discovery.ts            # ADT service discovery parser/lookup for MIME negotiation
│   │   ├── errors.ts               # Typed error classes (AdtApiError, AdtSafetyError)
│   │   ├── safety.ts               # Safety system (read-only, op filter, pkg filter)
│   │   ├── features.ts             # Feature detection (auto/on/off)
│   │   ├── config.ts               # ADT client configuration types
│   │   ├── types.ts                # ADT response types
│   │   ├── xml-parser.ts           # XML parser (fast-xml-parser v5)
│   │   ├── btp.ts                  # BTP Destination Service + Connectivity proxy
│   │   ├── cookies.ts              # Cookie file parsing (Netscape format)
│   │   ├── crud.ts                 # CRUD operations (lock, create, update, delete)
│   │   ├── devtools.ts             # Dev tools (syntax check, activate, unit tests)
│   │   ├── codeintel.ts            # Code intelligence (find def, refs, completion)
│   │   └── transport.ts            # CTS transport management
│   ├── cache/
│   │   ├── cache.ts                # Cache interface + types
│   │   ├── memory.ts               # In-memory cache
│   │   └── sqlite.ts               # SQLite cache (better-sqlite3)
│   ├── aff/
│   │   ├── validator.ts            # AFF JSON schema validation (Ajv 2020-12)
│   │   └── schemas/                # Bundled schemas from SAP/abap-file-formats
│   └── lint/
│       └── lint.ts                 # ABAP lint wrapper (@abaplint/core)
│
├── tests/
│   ├── unit/                       # Unit tests (no SAP system needed)
│   └── integration/                # Integration tests (need SAP credentials)
│
└── docs/                           # Documentation (MkDocs Material)
```

## Authentication

ARC-1 supports two independent authentication layers:

1. **MCP Client Auth** — authenticates the MCP client (API Key or OAuth/OIDC)
2. **SAP Auth** — authenticates to the SAP system (Basic, Cookie, or BTP Destination)

```mermaid
flowchart TD
    Request[Incoming Request] --> MCPAuth{MCP Client Auth?}

    MCPAuth -->|API Key| APIKey[ARC1_API_KEY header check]
    MCPAuth -->|OAuth/OIDC| OIDC[JWT Validation<br/>via IdP JWKS]
    MCPAuth -->|None| NoAuth[No client auth<br/>local/trusted network]

    APIKey --> SAPAuth
    OIDC --> SAPAuth
    NoAuth --> SAPAuth

    SAPAuth{SAP Auth Method?}

    SAPAuth -->|Basic| Basic[Username + Password<br/>--user / --password]
    SAPAuth -->|Cookie| Cookie[Cookie File/String]
    SAPAuth -->|BTP Destination| BTP[Destination Service<br/>Cloud Connector]

    Basic --> CSRF[Fetch CSRF Token]
    Cookie --> CSRF
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
    Pkg -->|In whitelist| OK[EXECUTE]
```
