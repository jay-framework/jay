# 59 - Server-Side Figma Conversion and Bi-directional Sync

## Context
Currently, the conversion logic from Figma design to Jay framework code (`jay-html`) resides within the Figma plugin (`@jay-desktop-poc/plugin`). The workflow involves the plugin traversing the Figma node tree, generating the final `jay-html` string, and sending it to the dev server merely for file saving.

## New Approach
We are shifting the conversion responsibility from the Figma Plugin to the **Jay Dev Server**.

In this new architecture:
1.  **The Plugin** acts as a "dumb" client. Its primary role is to extract the raw Figma document structure (nodes, components, variants, styles) and the user-defined binding metadata.
2.  **The Dev Server** receives this raw data, saves it as a "Source of Truth" (`.figma.json`), and then executes the conversion logic to generate the `jay-html` files.
3.  **Bi-directionality**: The Dev Server serves as a repository for design state. The Plugin can request the raw design data back from the server to reconstruct/rehydrate a design on the Figma canvas.

## Architecture Diagram

The following diagram illustrates the flow of data between Figma, the Dev Server, and the File System.

```mermaid
graph LR
    subgraph FigmaEnv [Figma Environment]
        Canvas[Design Canvas]
        PluginLogic[Plugin Logic]
        Rebuilder[Design Rebuilder]
    end

    subgraph DevServer [Jay Dev Server]
        API[API Endpoints]
        Converter[Conversion Engine]
        Compiler[Jay Compiler]
    end

    subgraph FileSystem [Project Files]
        RawData["page.figma.json\n(Raw Source + Bindings)"]
        JaySource["page.jay.html\n(Generated Code)"]
        CompiledOutput["page.js / page.ts\n(Runtime Bundle)"]
    end

    %% Export Flow
    Canvas -->|Read Nodes| PluginLogic
    PluginLogic -->|Export Raw JSON| API
    API -->|Save| RawData
    RawData -->|Input| Converter
    Converter -->|Generate| JaySource
    JaySource -->|Compile| Compiler
    Compiler --> CompiledOutput

    %% Import/Restore Flow
    RawData -->|Load| API
    API -->|Send JSON| PluginLogic
    PluginLogic -->|Hydrate| Rebuilder
    Rebuilder -->|Re-create Nodes| Canvas
```

## Workflow Details

### 1. Export (Publish)
*   **User Action:** Click "Publish" in the Figma Plugin.
*   **Plugin:** Serializes the selected Figma Frame(s) or Page into a JSON representation. This includes:
    *   Visual properties (layout, stroke, fill, effects).
    *   Hierarchy structure.
    *   Jay Binding metadata (which layer maps to which contract property).
*   **Server:** Receives the payload.
    *   Saves `[name].figma.json` (The raw dump).
    *   Triggers the `Conversion Engine`.
    *   Generates `[name].jay.html` based on the raw dump.

### 2. Import (Restore)
*   **User Action:** Click "Load from Code" or "Restore Version" in the Figma Plugin.
*   **Server:** Reads the requested `[name].figma.json`.
*   **Plugin:** Receives the JSON.
    *   Clears the specific frame or creates a new page.
    *   Iteratively recreates the Figma nodes (Rectangles, Text, AutoLayouts) based on the JSON data.
    *   Re-applies the Jay Bindings to the `pluginData` of the new nodes.

## Pros and Cons

### Pros

1.  **Testability & Robustness (Major)**
    *   **Headless Testing:** We can write unit tests for the `Conversion Engine` in the Dev Server (Node.js) environment. We can capture edge-case Figma JSONs and add them to a test suite to ensure the generator never breaks, without needing to spin up Figma manually.
    *   **faster Iteration:** Fixing a bug in the generator doesn't require reloading the Figma plugin. We can just run the server test suite.

2.  **Version Control & History**
    *   Since the raw `page.figma.json` is saved to the file system, it can be committed to Git.
    *   This provides a history of the *design itself*, not just the generated code.
    *   Developers can diff changes in the design data (structure changes, binding updates).

3.  **Design Restoration (Time Travel)**
    *   Because we save the raw source, we can revert to an older commit in Git, reload the Dev Server, and "Import" that version back into Figma. This effectively gives us "Time Travel" for Figma designs relative to the project codebase.

4.  **Separation of Concerns**
    *   **Plugin:** Focuses on UI interaction and Figma API quirks.
    *   **Server:** Focuses on Logic, Code Generation, and File I/O.
    *   This allows the conversion logic to become more complex (e.g., deeper optimization, better code structure) without bloating the plugin bundle or slowing down the Figma UI thread.

5.  **Single Source of Truth**
    *   The file system becomes the master record. The Figma file is just a "View" into that record. This prevents "Drift" where the Figma file and the code involve into two completely different states.

### Cons

1.  **Payload Size & Performance**
    *   Figma documents can be very large. Serializing a complex page into JSON might result in large payloads sent over the local network.
    *   *Mitigation:* Only send diffs or use efficient binary serialization formats if JSON becomes a bottleneck.

2.  **Import Complexity**
    *   Writing the "Rebuilder" (JSON -> Figma Node) is complex. Figma's API handles node creation differently than reading. Ensuring that a restored design is 1:1 pixel-perfect with the original requires significant effort.

3.  **Dependency on Dev Server**
    *   The plugin becomes strictly dependent on the Dev Server being running to perform any meaningful export/import action. (Though this is consistent with the general Jay workflow).

4.  **Asset Handling**
    *   Images and Vectors need to be handled carefully. The JSON payload needs to decide whether to inline binary data (base64) or reference external files that the server manages.


