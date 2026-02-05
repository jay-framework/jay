# Jay Design Log Index

Quick reference to find relevant design logs by topic. Design logs capture design decisions as they happen and are not updated after implementation.

---

## Core Concepts & Architecture

| #   | Title                      | Description                                                         |
| --- | -------------------------- | ------------------------------------------------------------------- |
| 00  | inspirations               | Initial inspirations for the Jay project                            |
| 01  | what is Jay                | Project overview: design-to-code, 3rd party UI inclusions, security |
| 27  | guiding principles of Jay  | Core principles guiding the framework                               |
| 34  | jay stack                  | Full-stack framework design: rendering phases, component API        |
| 68  | jay stack conceptual model | Conceptual model and architecture overview                          |

---

## Jay HTML & Templates

| #   | Title                                     | Description                                        |
| --- | ----------------------------------------- | -------------------------------------------------- |
| 40  | changing jay-html format                  | Jay HTML format evolution                          |
| 44  | css support                               | CSS styling support in Jay                         |
| 46  | recursive jay-html                        | Recursive template support                         |
| 47  | recursive html context switching          | Context switching in recursive templates           |
| 57  | style binding support in jay-html         | Dynamic style bindings                             |
| 71  | boolean attribute condition style parsing | Conditional style parsing                          |
| 75  | slow rendering jay-html to jay-html       | Slow phase rendering transformations               |
| 78  | unified condition parsing                 | Unified parsing for code generation and evaluation |

---

## Contracts & Type System

| #   | Title                                        | Description                                                            |
| --- | -------------------------------------------- | ---------------------------------------------------------------------- |
| 35  | partial and complementary types              | Type composition patterns                                              |
| 38  | Contract File                                | Jay contract file format (YAML), ViewState and Refs types              |
| 45  | View State Types                             | ViewState type system                                                  |
| 50  | rendering phases in contracts                | Phase annotations (`slow`, `fast`, `fast+interactive`) for type safety |
| 51  | jay-html with contract references            | Contract references in templates                                       |
| 51  | Project Structure Identification             | Pages vs Components identification                                     |
| 61  | json-patch typed JSONPointer                 | Typed JSON operations                                                  |
| 79  | linked contracts with mixed phase properties | Linked sub-contracts across rendering phases                           |

---

## Full-Stack Components & Rendering

| #   | Title                                             | Description                        |
| --- | ------------------------------------------------- | ---------------------------------- |
| 36  | Partial Rendering                                 | Partial/incremental rendering      |
| 37  | Composite Component                               | Composite component patterns       |
| 49  | full stack component rendering manifest           | Manifest for full-stack rendering  |
| 52  | jay-stack client-server code splitting            | Client/server code splitting       |
| 54  | render result monads                              | Result type patterns for rendering |
| 55  | full stack component parameter flow refinement    | Props and parameter flow           |
| 56  | deep merge view states with track-by              | Array merging with track-by keys   |
| 58  | jay-stack headless component resolution           | Headless component resolution                         |
| 62  | relocate deep merge for stack-client-runtime      | Client runtime deep merge                             |
| 72  | skip client script for non-interactive components | Optimization for static components                    |
| 84  | headless component props and repeater support     | Props, multiple instances, forEach, jay: prefix       |

---

## Server Actions & Client-Server Communication

| #   | Title                                          | Description                                                                |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| 63  | jay-stack server actions                       | RPC-style server actions: `makeJayAction`, `makeJayQuery`, action registry |
| 82  | automatic server-side action service injection | Auto-inject services when actions called from server code                  |

---

## Plugin System

| #   | Title                                             | Description                                                   |
| --- | ------------------------------------------------- | ------------------------------------------------------------- |
| 39  | Plugin package                                    | Plugin package requirements and structure                     |
| 43  | Jay Package                                       | Jay package format                                            |
| 60  | plugin system refinement and dynamic contracts    | Plugin.yaml, contract resolution, dynamic contract generation |
| 66  | transitive plugin dependency resolution           | Plugin dependency resolution                                  |
| 80  | exposing dynamic contracts for agentic generation | CLI and dev server contract generation for AI agents          |

---

## Services & Initialization

| #   | Title                                         | Description                              |
| --- | --------------------------------------------- | ---------------------------------------- |
| 64  | client context initialization and plugin init | Client context and plugin initialization |
| 65  | makeJayInit builder pattern                   | Server initialization builder API        |
| 67  | registerReactiveGlobalContext                 | Global reactive context registration     |

---

## Routing & Navigation

| #   | Title                                                | Description                      |
| --- | ---------------------------------------------------- | -------------------------------- |
| 53  | jay-stack environment query parameter handling       | Query parameter handling         |
| 69  | route priority ordering for static vs dynamic routes | Route matching priority          |
| 70  | static route param inference                         | Static route parameter inference |

---

## Compiler & Build System

| #   | Title                                  | Description                           |
| --- | -------------------------------------- | ------------------------------------- |
| 04  | compiler                               | Initial compiler design               |
| 20  | component compiler                     | Component compilation                 |
| 25  | building the compiler                  | Compiler architecture, code splitting |
| 28  | runtime compiler                       | Runtime compilation                   |
| 29  | algorithm to split safe code           | Safe code splitting algorithm         |
| 73  | jay-stack validate command             | Plugin validation command             |
| 74  | watch linked style files in dev server | Dev server file watching              |

---

## Runtime & State Management

| #   | Title                              | Description                 |
| --- | ---------------------------------- | --------------------------- |
| 03  | runtime                            | Runtime architecture        |
| 06  | state management                   | State management patterns   |
| 08  | Jay Component                      | Component lifecycle and API |
| 22  | serialized mutable                 | Serialized mutable state    |
| 30  | Jay Context API                    | Context API design          |
| 31  | rename createState to createSignal | Signal-based reactivity     |
| 32  | Reactive Pairing fixes             | Reactive pairing fixes      |

---

## Events & Interactivity

| #   | Title                 | Description                  |
| --- | --------------------- | ---------------------------- |
| 05  | events                | Event handling               |
| 09  | Safe events           | Safe event handling          |
| 13  | Redo Events           | Event system redesign        |
| 14  | References API        | Element references API       |
| 18  | update on conditional | Conditional updates          |
| 24  | refactor refs         | Reference system refactoring |

---

## Security & Sandboxing

| #   | Title                                 | Description                      |
| --- | ------------------------------------- | -------------------------------- |
| 001 | 3rd party code problem                | Third-party code security issues |
| 02  | Jay Element vs Component              | Secure model comparison          |
| 07  | nested components                     | Nested component security        |
| 10  | building components - a challenge     | Component building challenges    |
| 12  | Secure Architecture                   | Security architecture            |
| 15  | main to worker communication protocol | Worker communication             |
| 16  | context api                           | Context API security             |
| 17  | main and sandbox secure contexts      | Secure context separation        |
| 21  | alternative to context API            | Context API alternatives         |

---

## Server-Side Rendering (SSR)

| #   | Title                              | Description                    |
| --- | ---------------------------------- | ------------------------------ |
| 11  | server side rendering              | SSR design                     |
| 23  | JSON compare and patch             | JSON diffing for SSR hydration |
| 48  | Jay Stack Services                 | Service injection for SSR      |
| 50  | jay stack - headless configuration | Headless SSR configuration     |

---

## Developer Experience & Tooling

| #   | Title                                                  | Description                                               |
| --- | ------------------------------------------------------ | --------------------------------------------------------- |
| 26  | `jay start` - compiling sandbox application            | Dev server startup                                        |
| 33  | Jay 4 React                                            | React integration                                         |
| 41  | package naming migration to @jay-framework             | Package naming convention                                 |
| 42  | editor integration                                     | Editor/IDE integration                                    |
| 76  | AI Agent Integration                                   | AI agent automation API                                   |
| 77  | automation dev server integration                      | Automation API for dev tools                              |
| 80  | materializing dynamic contracts for agentic generation | CLI and dev server contract materialization for AI agents |
| 81  | dev server test mode                                   | Health/shutdown endpoints and timeout for smoke testing   |
| 83  | dev server logging and timing                          | Clean output, verbose mode, timing for render phases      |

---

## Quick Lookup by Task

### "I need to understand the rendering pipeline"

→ See #34 (jay stack), #50 (rendering phases), #52 (code splitting), #75 (slow rendering)

### "I'm working on contracts and types"

→ See #38 (Contract File), #45 (View State Types), #50 (phases in contracts), #79 (linked contracts)

### "I'm adding server-side functionality"

→ See #63 (server actions), #48 (services), #65 (makeJayInit)

### "I'm building or modifying a plugin"

→ See #39 (Plugin package), #60 (plugin system refinement), #66 (plugin dependencies), #84 (headless component props)

### "I'm working with headless components"

→ See #50 (headless configuration), #58 (headless resolution), #84 (props, multiple instances, jay: prefix)

### "I'm working on the compiler"

→ See #25 (building the compiler), #28 (runtime compiler), #29 (code splitting), #78 (condition parsing)

### "I'm adding client-side interactivity"

→ See #06 (state management), #31 (createSignal), #30 (Context API), #09 (safe events)

### "I'm working on the dev server"

→ See #26 (jay start), #74 (file watching), #77 (automation integration), #81 (test mode)

### "I need to understand security model"

→ See #001 (3rd party problem), #12 (Secure Architecture), #17 (secure contexts)

### "I'm working on AI agent integration"

→ See #76 (AI Agent Integration), #77 (automation dev server), #80 (contract materialization for agents)

---

## Notes

- Design logs are **not updated** after initial writing - they capture decisions at a point in time
- Implementation may deviate from original design - check "Implementation Results" sections
- Some logs have multiple files with the same number (e.g., 50, 51) - these are related but separate topics
- Diagram files (.mmd, .svg, .png) accompany some design logs for visual reference
