# Jay Stack Conceptual Model

## Overview

This design log provides a conceptual diagram showing the relationships between the key building blocks of Jay Stack:

- **Services** - Server-side singletons (database, API clients)
- **Contexts** - Client-side hierarchical dependency injection
- **Pages** - Page definitions that generate website pages
- **Plugins** - NPM packages providing reusable contracts, components, actions
- **Headless Components** - Plugin-provided components with data contracts
- **Init** - Server and client initialization via `makeJayInit`

## Conceptual Relationships Diagram

```mermaid
flowchart TB
    subgraph Plugin["Plugin (NPM Package)"]
        direction TB
        PY[plugin.yaml]
        PINIT[lib/init.ts<br/>makeJayInit]
        PCONTRACTS[Contracts<br/>.jay-contract]
        PCOMPONENTS[Headless<br/>Components]
        PACTIONS[Server<br/>Actions]

        PY --> PINIT
        PY --> PCONTRACTS
        PCONTRACTS --> PCOMPONENTS
        PY --> PACTIONS
    end

    subgraph Project["Project"]
        direction TB
        PROJINIT[src/init.ts<br/>makeJayInit]
        PAGES[Pages<br/>page.ts + page.jay-html]
        PROJSERVICES[Services<br/>createJayService]
        PROJCONTEXTS[Contexts<br/>createJayContext]
    end

    subgraph ServerRuntime["Server Runtime"]
        direction TB
        SVCREGISTRY[Service Registry<br/>registerService / getService]
        ACTIONROUTER[Action Router<br/>POST /_action/:id]
        SSR[Server-Side Rendering<br/>slowRender → fastRender]
    end

    subgraph ClientRuntime["Client Runtime"]
        direction TB
        CTXREGISTRY[Context Registry<br/>registerGlobalContext / useContext]
        ACTIONCALLER[Action Caller<br/>fetch POST /_action/:id]
        HYDRATION[Client Hydration<br/>interactive phase]
    end

    %% Init flow
    PINIT -->|"_serverInit()"| SVCREGISTRY
    PINIT -->|"returns data"| CTXREGISTRY
    PROJINIT -->|"_serverInit()"| SVCREGISTRY
    PROJINIT -->|"returns data"| CTXREGISTRY

    %% Service usage
    SVCREGISTRY -->|"injected via withServices()"| PAGES
    SVCREGISTRY -->|"injected via withServices()"| PACTIONS
    SVCREGISTRY -->|"injected via withServices()"| PCOMPONENTS

    %% Context usage
    CTXREGISTRY -->|"injected via withContexts()"| HYDRATION

    %% Page composition
    PCOMPONENTS -->|"<script jay-headless>"| PAGES
    PCONTRACTS -->|"defines view state"| PAGES

    %% Action flow
    PACTIONS -->|"registered"| ACTIONROUTER
    ACTIONROUTER <-->|"HTTP"| ACTIONCALLER
    ACTIONCALLER -->|"called from"| HYDRATION

    %% Rendering flow
    PAGES --> SSR
    SSR -->|"HTML + embedded data"| HYDRATION
```

## Component Lifecycle Diagram

```mermaid
sequenceDiagram
    participant DevServer as Dev Server
    participant PluginInit as Plugin Init<br/>(lib/init.ts)
    participant ProjectInit as Project Init<br/>(src/init.ts)
    participant Page as Page<br/>(page.ts)
    participant HeadlessComp as Headless<br/>Component
    participant Browser

    Note over DevServer: Server Startup

    rect rgb(240, 248, 255)
        Note over DevServer,ProjectInit: Initialization Phase (once at startup)
        DevServer->>PluginInit: Import & call _serverInit()
        PluginInit->>DevServer: Register services, return client data
        DevServer->>ProjectInit: Import & call _serverInit()
        ProjectInit->>DevServer: Register services, return client data
    end

    Note over DevServer: Request Handling

    rect rgb(255, 248, 240)
        Note over DevServer,HeadlessComp: Server Rendering (per request)
        DevServer->>Page: slowRender(services)
        Page->>HeadlessComp: Load component data
        HeadlessComp-->>Page: slowViewState
        DevServer->>Page: fastRender(services, params)
        Page->>HeadlessComp: Load dynamic data
        HeadlessComp-->>Page: fastViewState
        DevServer-->>Browser: HTML + embedded scripts
    end

    rect rgb(240, 255, 240)
        Note over Browser: Client Phase
        Browser->>Browser: Parse client init data
        Browser->>PluginInit: Call _clientInit(data)
        PluginInit->>Browser: Register contexts
        Browser->>ProjectInit: Call _clientInit(data)
        ProjectInit->>Browser: Register contexts
        Browser->>Browser: Mount component tree
        Browser->>Browser: Hydrate interactive handlers
    end
```

## Entity Relationships

```mermaid
erDiagram
    PLUGIN ||--o{ CONTRACT : "defines"
    PLUGIN ||--o{ HEADLESS_COMPONENT : "provides"
    PLUGIN ||--o{ ACTION : "exposes"
    PLUGIN ||--o| INIT : "has"

    PROJECT ||--o{ PAGE : "contains"
    PROJECT ||--o{ SERVICE : "defines"
    PROJECT ||--o{ CONTEXT : "defines"
    PROJECT ||--o| INIT : "has"
    PROJECT }o--o{ PLUGIN : "uses"

    PAGE ||--o{ HEADLESS_COMPONENT : "uses"
    PAGE }o--o{ CONTRACT : "references"
    PAGE }o--o{ SERVICE : "injects"

    HEADLESS_COMPONENT ||--|| CONTRACT : "implements"
    HEADLESS_COMPONENT }o--o{ SERVICE : "uses"

    ACTION }o--o{ SERVICE : "uses"

    INIT }o--o{ SERVICE : "registers"
    INIT }o--o{ CONTEXT : "registers"

    SERVICE {
        string name
        function factory
        string scope "singleton"
    }

    CONTEXT {
        string name
        any value
        string scope "hierarchical"
    }

    CONTRACT {
        object slowViewState
        object fastViewState
        object props
        object refs
    }
```

## Key Concepts Summary

| Concept                | Runtime                       | Scope                       | Lifecycle            | Purpose                                |
| ---------------------- | ----------------------------- | --------------------------- | -------------------- | -------------------------------------- |
| **Service**            | Server                        | Global singleton            | Application lifetime | Database, API clients, config          |
| **Context**            | Client                        | Hierarchical (parent→child) | Page lifetime        | Theme, auth state, feature flags       |
| **Page**               | Both                          | Per-route                   | Per request          | Define website routes and content      |
| **Plugin**             | Both                          | Global                      | Application lifetime | Package reusable functionality         |
| **Headless Component** | Both                          | Per-usage                   | Component lifetime   | Provide data+behavior without template |
| **Init**               | Both                          | Global                      | Application startup  | Register services/contexts             |
| **Action**             | Server (callable from client) | Per-call                    | Stateless            | Server-side mutations/queries          |

## Data Flow Overview

```mermaid
flowchart LR
    subgraph BuildTime["Build Time"]
        CONTRACTS[Contracts] -->|"generate"| TYPES[TypeScript Types]
    end

    subgraph ServerStartup["Server Startup (once)"]
        PINIT[Plugin Inits] -->|"registerService"| SERVICES[(Services)]
        PINIT -->|"return data"| CLIENTDATA[Client Init Data]
        PROJINIT[Project Init] -->|"registerService"| SERVICES
        PROJINIT -->|"return data"| CLIENTDATA
    end

    subgraph Request["Per Request"]
        SERVICES -->|"withServices"| SLOWRENDER[Slow Render]
        SLOWRENDER -->|"slowViewState"| FASTRENDER[Fast Render]
        FASTRENDER -->|"fastViewState"| HTML[HTML Response]
        CLIENTDATA -->|"embedded JSON"| HTML
    end

    subgraph Client["Client (browser)"]
        HTML -->|"parse"| CONTEXTS[(Contexts)]
        CONTEXTS -->|"withContexts"| COMPONENTS[Components]
        COMPONENTS -->|"user interaction"| ACTIONS[Action Calls]
        ACTIONS -->|"HTTP POST"| ACTIONHANDLER[Action Handler]
    end

    subgraph ServerAction["Server Action Handling"]
        ACTIONHANDLER -->|"withServices"| ACTIONLOGIC[Action Logic]
        ACTIONLOGIC -->|"response"| ACTIONS
    end
```

## File Structure Reference

```
project/
├── src/
│   ├── init.ts                    # Project init (makeJayInit)
│   ├── pages/
│   │   └── products/
│   │       ├── page.ts            # Page logic
│   │       ├── page.jay-html      # Page template
│   │       └── page.jay-contract  # Generated contract
│   ├── services/
│   │   └── database.service.ts    # Service definitions
│   ├── contexts/
│   │   └── theme.context.ts       # Context definitions
│   └── actions/
│       └── cart.actions.ts        # Server actions
├── node_modules/
│   └── @wix/stores/               # Example plugin
│       ├── plugin.yaml
│       ├── lib/
│       │   ├── init.ts            # Plugin init
│       │   ├── contracts/
│       │   └── components/
│       └── dist/
└── package.json
```

## Related Design Logs

- [#34 - Jay Stack](./34%20-%20jay%20stack.md) - Overall Jay Stack architecture
- [#48 - Jay Stack Services](./48%20-%20Jay%20Stack%20Services.md) - Server-side services pattern
- [#30 - Jay Context API](./30%20-%20Jay%20Context%20API.md) - Client-side context system
- [#60 - Plugin System Refinement](./60%20-%20plugin%20system%20refinement%20and%20dynamic%20contracts.md) - Plugin structure
- [#63 - Server Actions](./63%20-%20jay-stack%20server%20actions.md) - Client-server action calls
- [#64 - Client Context Init](./64%20-%20client%20context%20initialization%20and%20plugin%20init.md) - Init patterns
- [#65 - makeJayInit Builder](./65%20-%20makeJayInit%20builder%20pattern.md) - Unified init pattern
- [#66 - Transitive Plugin Dependencies](./66%20-%20transitive%20plugin%20dependency%20resolution.md) - Plugin discovery
