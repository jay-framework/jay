# Vendor Integration Architecture Diagrams

## System Overview

```mermaid
graph TB
    subgraph "External Editor"
        A[Design Canvas]
        B[Vendor Plugin]
    end

    subgraph "Jay Dev Server"
        C[Editor Server<br/>WebSocket Protocol]
        D[Vendor Router]
        E[Figma Adapter]
        F[Wix Adapter]
        G[Other Adapters]
    end

    subgraph "File System"
        H[page.figma.json<br/>Source of Truth]
        I[page.jay-html<br/>Generated Code]
        J[page.jay-contract<br/>Component Contract]
    end

    A -->|Serialize| B
    B -->|WebSocket: export| C
    C --> D
    D --> E
    D --> F
    D --> G
    E -->|Save| H
    E -->|Generate| I
    E -->|Generate| J

    H -->|Load| D
    D -->|WebSocket: import| B
    B -->|Rebuild| A

    style H fill:#e1f5ff
    style I fill:#fff4e1
    style J fill:#ffe1f5
```

## Export Flow (Editor → Jay)

```mermaid
sequenceDiagram
    participant Editor as External Editor
    participant Plugin as Vendor Plugin
    participant Client as Editor Client
    participant Server as Jay Editor Server
    participant Router as Vendor Router
    participant Adapter as Vendor Adapter
    participant FS as File System

    Editor->>Plugin: User clicks "Export"
    Plugin->>Plugin: Serialize design to vendor JSON
    Plugin->>Client: client.export({vendorDoc})
    Note over Plugin,Client: WebSocket message

    Client->>Server: protocol-message: export
    Note over Client,Server: {pageUrl, vendorId, vendorDoc}

    Server->>Router: Route by vendorId
    Router->>Adapter: Get adapter for vendorId

    Adapter->>FS: Save page.[vendorId].json
    Note over Adapter,FS: Source of truth saved first

    Adapter->>Adapter: convert(vendorDoc, context)
    Note over Adapter: Transform to Jay format

    Adapter->>FS: Write page.jay-html

    alt Contract generated
        Adapter->>FS: Write page.jay-contract
    end

    Adapter-->>Server: ConversionResult
    Server-->>Client: protocol-response: export
    Client-->>Plugin: Promise resolves
    Plugin-->>Editor: Show success message
```

## Import Flow (Jay → Editor)

```mermaid
sequenceDiagram
    participant Editor as External Editor
    participant Plugin as Vendor Plugin
    participant Client as Editor Client
    participant Server as Jay Editor Server
    participant Router as Vendor Router
    participant FS as File System

    Editor->>Plugin: User clicks "Import"
    Plugin->>Client: client.import({pageUrl})
    Note over Plugin,Client: WebSocket message

    Client->>Server: protocol-message: import
    Note over Client,Server: {pageUrl, vendorId}

    Server->>Router: Route by vendorId
    Router->>FS: Read page.[vendorId].json

    FS-->>Router: Vendor document JSON
    Router-->>Server: Return vendor document
    Server-->>Client: protocol-response: import
    Note over Server,Client: {vendorDoc}

    Client-->>Plugin: Promise resolves
    Plugin->>Plugin: Deserialize vendor JSON
    Plugin->>Editor: Rebuild design on canvas
    Editor-->>Plugin: Design restored
```

## Adapter Architecture

```mermaid
classDiagram
    class VendorAdapter {
        <<interface>>
        +vendorId: string
        +convert(vendorDoc, context) ConversionResult
    }

    class ConversionContext {
        +pageDirectory: string
        +pageUrl: string
        +projectRoot: string
        +pagesBase: string
    }

    class ConversionResult {
        +success: boolean
        +jayHtml?: string
        +contract?: string
        +error?: string
        +warnings?: string[]
    }

    class FigmaAdapter {
        +vendorId: "figma"
        +convert(figmaDoc, context)
        -convertToJayHtml(figmaDoc)
        -generateContract(figmaDoc)
    }

    class WixAdapter {
        +vendorId: "wix"
        +convert(wixDoc, context)
        -convertToJayHtml(wixDoc)
        -generateContract(wixDoc)
    }

    class VendorAdapterRegistry {
        -adapters: Map
        +register(adapter)
        +get(vendorId)
        +has(vendorId)
        +getVendorIds()
    }

    VendorAdapter <|.. FigmaAdapter
    VendorAdapter <|.. WixAdapter
    VendorAdapter ..> ConversionContext : uses
    VendorAdapter ..> ConversionResult : returns
    VendorAdapterRegistry o-- VendorAdapter : manages
```

## File Structure After Export

```mermaid
graph LR
    subgraph "Project Root"
        A[src/pages/]

        subgraph "home/"
            B[page.figma.json]
            C[page.jay-html]
            D[page.jay-contract]
            E[page.ts]
        end

        subgraph "products/[id]/"
            F[page.figma.json]
            G[page.jay-html]
            H[page.jay-contract]
        end
    end

    A --> home/
    A --> products/[id]/

    style B fill:#e1f5ff
    style C fill:#fff4e1
    style D fill:#ffe1f5
    style F fill:#e1f5ff
    style G fill:#fff4e1
    style H fill:#ffe1f5
```

## Data Flow: Design Changes

```mermaid
stateDiagram-v2
    [*] --> Designing: User creates design

    Designing --> Exporting: Click "Export to Jay"
    Exporting --> SerializeJSON: Serialize to vendor JSON
    SerializeJSON --> SendToServer: Send via WebSocket
    SendToServer --> SaveSource: Save .json file
    SaveSource --> Convert: Run adapter.convert()
    Convert --> GenerateJay: Create .jay-html
    GenerateJay --> Complete: Export complete

    Complete --> Designing: Continue designing
    Complete --> LoadingBack: Click "Import from Jay"

    LoadingBack --> FetchJSON: Request via WebSocket
    FetchJSON --> DeserializeJSON: Parse vendor JSON
    DeserializeJSON --> RebuildDesign: Recreate in editor
    RebuildDesign --> Designing: Design restored

    Designing --> [*]: Done
```

## Vendor Adapter Extension Points

```mermaid
graph TD
    A[Vendor Document] --> B{Adapter.convert}

    B --> C[Parse Structure]
    B --> D[Map Components]
    B --> E[Transform Styles]
    B --> F[Handle Assets]

    C --> G[Generate Jay HTML]
    D --> G
    E --> G
    F --> G

    G --> H{Has Interactive?}

    H -->|Yes| I[Generate Contract]
    H -->|No| J[No Contract]

    I --> K[ConversionResult]
    J --> K

    style B fill:#ff9
    style G fill:#9f9
    style K fill:#99f
```

## Error Handling Flow

```mermaid
graph TD
    A[Receive Export Message] --> B{Valid Message?}

    B -->|No| C[Return error response]
    B -->|Yes| D{Adapter Exists?}

    D -->|No| E[Return adapter not found]
    D -->|Yes| F[Save Vendor JSON]

    F --> G{Save Success?}
    G -->|No| H[Return save error]
    G -->|Yes| I[Run Conversion]

    I --> J{Conversion Success?}

    J -->|No| K[Return conversion error<br/>Vendor source preserved]
    J -->|Yes| L[Save Jay HTML]

    L --> M{Contract Generated?}
    M -->|Yes| N[Save Contract]
    M -->|No| O[Skip Contract]

    N --> P[Return success response]
    O --> P

    style C fill:#f88
    style E fill:#f88
    style H fill:#f88
    style K fill:#fa8
    style P fill:#8f8
```
