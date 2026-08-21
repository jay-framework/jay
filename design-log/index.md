# Jay Design Log Index

Quick reference to find relevant design logs by topic. Design logs capture design decisions as they happen and are not updated after implementation.

---

## Core Concepts & Architecture

| #   | Title                                                                                   | Description                                                           |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 00  | [inspirations](00%20-%20inspirations)                                                   | Initial inspirations for the Jay project                              |
| 01  | [what is Jay](01%20-%20what%20is%20Jay)                                                 | Project overview: design-to-code, 3rd party UI inclusions, security   |
| 27  | [guiding principles of Jay](27%20-%20guiding%20principles%20of%20Jay)                   | Core principles guiding the framework                                 |
| 34  | [jay stack](34%20-%20jay%20stack)                                                       | Full-stack framework design: rendering phases, component API          |
| 68  | [jay stack conceptual model](68%20-%20jay%20stack%20conceptual%20model)                 | Conceptual model and architecture overview                            |
| 86  | [jay stack full workflow lifecycle](86%20-%20jay%20stack%20full%20workflow%20lifecycle) | Full lifecycle: setup → agent-kit → dev → render → refresh            |
| 87  | [jay-stack setup command](87%20-%20jay-stack%20setup%20command)                         | Plugin config templating, credential validation, reference generation |

---

## Jay HTML & Templates

| #   | Title                                                                                                            | Description                                        |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 40  | [changing jay-html format](40%20-%20changing%20jay-html%20format)                                                | Jay HTML format evolution                          |
| 44  | [css support](44%20-%20css%20support)                                                                            | CSS styling support in Jay                         |
| 46  | [recursive jay-html](46%20-%20recursive%20jay-html)                                                              | Recursive template support                         |
| 47  | [recursive html context switching](47%20-%20recursive%20html%20context%20switching)                              | Context switching in recursive templates           |
| 57  | [style binding support in jay-html](57%20-%20style%20binding%20support%20in%20jay-html)                          | Dynamic style bindings                             |
| 71  | [boolean attribute condition style parsing](71%20-%20boolean%20attribute%20condition%20style%20parsing)          | Conditional style parsing                          |
| 75  | [slow rendering jay-html to jay-html](75%20-%20slow%20rendering%20jay-html%20to%20jay-html)                      | Slow phase rendering transformations               |
| 78  | [unified condition parsing](78%20-%20unified%20condition%20parsing%20for%20code%20generation%20and%20evaluation) | Unified parsing for code generation and evaluation |

---

## Contracts & Type System

| #   | Title                                                                                                           | Description                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 35  | [partial and complementary types](35%20-%20partial%20and%20complementary%20types)                               | Type composition patterns                                                    |
| 38  | [Contract File](38%20-%20Contract%20File)                                                                       | Jay contract file format (YAML), ViewState and Refs types                    |
| 45  | [View State Types](45%20-%20View%20State%20Types)                                                               | ViewState type system                                                        |
| 50  | [rendering phases in contracts](50%20-%20rendering%20phases%20in%20contracts)                                   | Phase annotations (`slow`, `fast`, `fast+interactive`) for type safety       |
| 51  | [jay-html with contract references](51%20-%20jay-html%20with%20contract%20references)                           | Contract references in templates                                             |
| 51  | [Project Structure Identification](51%20-%20jay-html%20with%20contract%20references)                            | Pages vs Components identification                                           |
| 61  | [json-patch typed JSONPointer](61%20-%20json-patch%20typed%20JSONPointer)                                       | Typed JSON operations                                                        |
| 79  | [linked contracts with mixed phase properties](79%20-%20linked%20contracts%20with%20mixed%20phase%20properties) | Linked sub-contracts across rendering phases                                 |
| 95  | [jay-action contract references](95%20-%20jay-action%20contract%20references)                                   | Reference contract ViewState types from .jay-action output schemas           |
| 120 | [record type in jay-action](120%20-%20record%20type%20in%20jay-action)                                          | `record(T)` type notation for typed Record maps in action schemas            |
| 122 | [enum name collision across linked contracts](122%20-%20enum%20name%20collision%20across%20linked%20contracts)  | Fix import shadowing and duplication when linked contracts share enum names  |
| 152 | [phase-aware contract props](152%20-%20phase-aware%20contract%20props)                                          | Optional `phase` on props so the framework can validate binding availability |

---

## Full-Stack Components & Rendering

| #   | Title                                                                                                                                 | Description                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 36  | [Partial Rendering](36%20-%20Partial%20Rendering)                                                                                     | Partial/incremental rendering                                                        |
| 37  | [Composite Component](37%20-%20Composite%20Component)                                                                                 | Composite component patterns                                                         |
| 49  | [full stack component rendering manifest](49%20-%20full%20stack%20component%20rendering%20manifest)                                   | Manifest for full-stack rendering                                                    |
| 52  | [jay-stack client-server code splitting](52%20-%20jay-stack%20client-server%20code%20splitting)                                       | Client/server code splitting                                                         |
| 54  | [render result monads](54%20-%20render%20result%20monads)                                                                             | Result type patterns for rendering                                                   |
| 55  | [full stack component parameter flow refinement](55%20-%20full%20stack%20component%20parameter%20flow%20refinement)                   | Props and parameter flow                                                             |
| 56  | [deep merge view states with track-by](56%20-%20deep%20merge%20view%20states%20with%20track-by)                                       | Array merging with track-by keys                                                     |
| 58  | [jay-stack headless component resolution](58%20-%20jay-stack%20headless%20component%20resolution)                                     | Headless component resolution                                                        |
| 62  | [relocate deep merge for stack-client-runtime](62%20-%20relocate%20deep%20merge%20for%20stack-client-runtime)                         | Client runtime deep merge                                                            |
| 72  | [skip client script for non-interactive components](72%20-%20skip%20client%20script%20for%20non-interactive%20components)             | Optimization for static components                                                   |
| 84  | [headless component props and repeater support](84%20-%20headless%20component%20props%20and%20repeater%20support)                     | Props, multiple instances, forEach, jay: prefix                                      |
| 85  | [rendering phases and agent kit for agentic generation](85%20-%20rendering%20phases%20and%20agent%20kit%20for%20agentic%20generation) | Phases + contract/action discovery; agent-kit folder, markdown content → jay-html    |
| 90  | [headless instances in interactive forEach](90%20-%20headless%20instances%20in%20interactive%20forEach%20without%20slow%20phase)      | Allow fast/interactive-only headless components inside forEach (no slow phase)       |
| 111 | [nested headfull full-stack components](111%20-%20nested%20headfull%20full-stack%20components)                                        | Headfull components with own jay-html + SSR via headless pipeline template injection |
| 123 | [deeply nested headfull and headless components](123%20-%20deeply%20nested%20headfull%20and%20headless%20components)                  | Gap analysis: headfull+keyed headless, headfull-in-headfull, headless-in-headfull    |
| 141 | [fast phase request context](141%20-%20fast%20phase%20request%20context)                                                              | Cookie access + response headers (Cache-Control) in fast phase for wix-members       |

---

## Server Actions & Client-Server Communication

| #   | Title                                                                                                             | Description                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 63  | [jay-stack server actions](63%20-%20jay-stack%20server%20actions)                                                 | RPC-style server actions: `makeJayAction`, `makeJayQuery`, action registry |
| 82  | [automatic server-side action service injection](82%20-%20automatic%20server-side%20action%20service%20injection) | Auto-inject services when actions called from server code                  |
| 129 | [streaming actions](129%20-%20streaming%20actions)                                                                | `makeJayStream` with `AsyncGenerator` handlers, SSE transport              |
| 131 | [multipart file upload in actions](131%20-%20multipart%20file%20upload%20in%20actions)                            | `withFiles()` opt-in for binary uploads via FormData, `JayFile` temp paths |

---

## Plugin System

| #   | Title                                                                                                                          | Description                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 39  | [Plugin package](39%20-%20Plugin%20package)                                                                                    | Plugin package requirements and structure                                                      |
| 43  | [Jay Package](43%20-%20Jay%20Package)                                                                                          | Jay package format                                                                             |
| 60  | [plugin system refinement and dynamic contracts](60%20-%20plugin%20system%20refinement%20and%20dynamic%20contracts)            | Plugin.yaml, contract resolution, dynamic contract generation                                  |
| 66  | [transitive plugin dependency resolution](66%20-%20transitive%20plugin%20dependency%20resolution)                              | Plugin dependency resolution                                                                   |
| 80  | [exposing dynamic contracts for agentic generation](80%20-%20materializing%20dynamic%20contracts%20for%20agentic%20generation) | CLI and dev server contract generation for AI agents                                           |
| 87  | [jay-stack setup command](87%20-%20jay-stack%20setup%20command)                                                                | Plugin config templating, credential validation, references                                    |
| 88  | [PR 158 review guide](88%20-%20PR%20158%20review%20guide)                                                                      | Review guide for export_import branch (Figma vendor + plugin resolution)                       |
| 89  | [PR 158 merge concerns](89%20-%20PR%20158%20merge%20concerns)                                                                  | Merge conflicts, duplicate work, and decisions for PR #158 into main                           |
| 130 | [plugin routes and templates](130%20-%20plugin%20routes%20and%20templates)                                                     | Plugins provide pages (jay-html + page.ts) as routes; project overrides                        |
| 142 | [plugin CLI commands](142%20-%20ui-kit-add-menu-contribution)                                                                  | `jay-stack run <plugin>/<command>` for admin/batch operations                                  |
| 145 | [pluggable jay-html validation](145%20-%20pluggable%20jay-html%20validation)                                                   | Plugin-provided validation rules for jay-html with agent-friendly feedback                     |
| 147 | [jay-html validation rules catalog](147%20-%20jay-html%20validation%20rules%20catalog)                                         | Complete catalog of all validation rules across wix-media, SEO, and a11y                       |
| 151 | [design system validator plugin](151%20-%20design%20system%20validator%20plugin)                                               | Static CSS analysis against DESIGN.md tokens; replaces Happy DOM approach                      |
| 154 | [plugin package shipping validation](154%20-%20plugin%20package%20shipping%20validation)                                       | Validate agent-kit directory is listed in package.json files                                   |
| 155 | [markdown plugin](155%20-%20markdown%20plugin)                                                                                 | Markdown rendering: directory-to-pages, inline content, code + mermaid                         |
| 156 | [keyed headless component props](156%20-%20keyed%20headless%20component%20props)                                               | YAML body props for keyed headless components; consolidation with jay-params                   |
| 157 | [interactive plugin setup](157%20-%20interactive%20plugin%20setup)                                                             | Interactive prompts in plugin setup handlers; move Wix logic out of create-jay                 |
| 159 | [setup pipeline re-initialization](159%20-%20setup%20pipeline%20re-initialization)                                             | Re-init services after each plugin setup; suppress init noise; cascade deps                    |
| 160 | [deprecate editor packages](160%20-%20deprecate%20editor%20packages)                                                           | Move editor-client/protocol/server to \_deprecated; remove from stack-cli                      |
| 161 | [markdown image url resolution](161%20-%20markdown%20image%20url%20resolution)                                                 | Rewrite relative image URLs in markdown; copy media to public; CDN mapping                     |
| 162 | [structural headfull components](162%20-%20structural%20headfull%20components)                                                 | Allow headfull components without .ts code file; passthrough from contract                     |
| 163 | [built-in bindings and field comparison](163%20-%20params%20binding%20in%20templates)                                          | `jay.params`, `jay.url.path` bindings; field-to-field `===` comparison; active menu pattern    |
| 164 | [inline style in body](164%20-%20inline%20style%20in%20body)                                                                   | Body `<style>` tags crash the template parser; skip, warn, or hoist to head                    |
| 165 | [graceful expression parse errors](165%20-%20graceful%20expression%20parse%20errors)                                           | Convert expression parse errors to validation messages instead of crashing the page            |
| 166 | [a11y form and label validation rules](166%20-%20a11y%20form%20and%20label%20validation%20rules)                               | Extend a11y-validator: checkbox/radio, ARIA name integrity, duplicate ids, label hygiene       |
| 167 | [a11y nested interactive elements](167%20-%20a11y%20nested%20interactive%20elements)                                           | a11y rule: focusable elements nested inside links/buttons (WCAG 4.1.2)                         |
| 168 | [font fallback metrics](168%20-%20font%20fallback%20metrics)                                                                   | Metric-matched fallback @font-face to prevent CLS on font load; validation + CLI tool          |
| 169 | [data files plugin](169%20-%20data%20lists%20plugin)                                                                           | CSV/YAML/JSON/JSONL data source plugin: list view, item view, per-item pages, cross-references |
| 170 | [seo validator false positives](170%20-%20seo%20validator%20false%20positives)                                                 | Fix false positives: component vs page detection, html-string awareness, fetchpriority         |

---

## Services & Initialization

| #   | Title                                                                                                             | Description                              |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 64  | [client context initialization and plugin init](64%20-%20client%20context%20initialization%20and%20plugin%20init) | Client context and plugin initialization |
| 65  | [makeJayInit builder pattern](65%20-%20makeJayInit%20builder%20pattern)                                           | Server initialization builder API        |
| 67  | [registerReactiveGlobalContext](67%20-%20registerReactiveGlobalContext)                                           | Global reactive context registration     |

---

## Routing & Navigation

| #   | Title                                                                                                                               | Description                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 53  | [jay-stack environment query parameter handling](53%20-%20jay-stack%20environment%20query%20parameter%20handling)                   | Query parameter handling                                             |
| 69  | [route priority ordering for static vs dynamic routes](69%20-%20route%20priority%20ordering%20for%20static%20vs%20dynamic%20routes) | Route matching priority                                              |
| 70  | [static route param inference](70%20-%20static%20route%20param%20inference)                                                         | Static route parameter inference (superseded by #113)                |
| 113 | [explicit route params for static overrides](113%20-%20explicit%20route%20params%20for%20static%20overrides)                        | Replace auto-inference with `<script type="application/jay-params">` |
| 117 | [fast phase query parameters](117%20-%20fast%20phase%20query%20parameters)                                                          | Type-safe query string access in fast phase only (`props.query`)     |

---

## Compiler & Build System

| #    | Title                                                                                                 | Description                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 04   | [compiler](04%20-%20compiler)                                                                         | Initial compiler design                                                                      |
| 20   | [component compiler](20%20-%20component%20compiler)                                                   | Component compilation                                                                        |
| 25   | [building the compiler](25%20-%20building%20the%20compiler)                                           | Compiler architecture, code splitting                                                        |
| 28   | [runtime compiler](28%20-%20runtime%20compiler)                                                       | Runtime compilation                                                                          |
| 29   | [algorithm to split safe code](29%20-%20algorithm%20to%20split%20safe%20code)                         | Safe code splitting algorithm                                                                |
| 73   | [jay-stack validate command](73%20-%20jay-stack%20validate%20command)                                 | Plugin validation command                                                                    |
| 74   | [watch linked style files in dev server](74%20-%20watch%20linked%20style%20files%20in%20dev%20server) | Dev server file watching                                                                     |
| 118  | [jay-html-compiler refactor](118%20-%20jay-html-compiler%20refactor)                                  | Extract shared algorithms + split by compilation target                                      |
| 134  | [production build](134%20-%20production%20build)                                                      | Two-server production architecture: main server + slow render server                         |
| 134a | [build pipeline](134a%20-%20build%20pipeline)                                                         | Per-instance compilation, shared chunks, Vite build strategy                                 |
| 134b | [main server](134b%20-%20main%20server)                                                               | Production request handling: fast phase + SSR with pre-built artifacts                       |
| 134c | [slow render server](134c%20-%20slow%20render%20server)                                               | Webhook invalidation, per-instance rebuild, versioned bucket building                        |
| 134d | [server build](134d%20-%20server%20build)                                                             | Compiling page.ts, actions, services, init.ts to production JS                               |
| 136  | [loadParams route context](136%20-%20loadParams%20route%20context)                                    | Passing inferred/route params to loadParams for multi-prefix filtering                       |
| 139  | [wix deployment separation](139%20-%20wix%20deployment%20separation)                                  | Split build into frontend (CDN) + backend (container); Cloudflare-compatible fetch handler   |
| 140  | [production smoke test](140%20-%20production%20smoke%20test)                                          | Dedicated example project validating dev, production self-hosted, and production CDN modes   |
| 143  | [artifact store abstraction for BaaS](143%20-%20artifact%20store%20abstraction%20for%20BaaS)          | ArtifactStore interface, serve-only export, pre-imported modules for cloud deployment        |
| 144  | [per-route server elements](144%20-%20per-route%20server%20elements)                                  | One server-element.js per route instead of per instance; render from ViewState, not literals |
| 145  | [pluggable jay-html validation](145%20-%20pluggable%20jay-html%20validation)                          | Plugin-provided validation rules for jay-html files with agent-friendly feedback             |
| 146  | [css performance fixes](146%20-%20css%20performance%20fixes)                                          | CSS minification in production build, preload hints for route CSS                            |
| 150  | [build content hash](150%20-%20build%20content%20hash)                                                | SHA-256 content hash of build output for deployment client/server sync                       |
| 153  | [npm create jay](153%20-%20npm%20create%20jay)                                                        | Interactive project scaffolding: name, plugin selection, agent-kit, setup banner             |
| 158  | [staged npm publish](158%20-%20staged%20npm%20publish)                                                | Two-phase publish: stage all packages without OTP, then bulk-approve with single OTP         |
| 147  | [jay-html validation rules catalog](147%20-%20jay-html%20validation%20rules%20catalog)                | Complete catalog of all validation rules across wix-media, SEO, and a11y                     |
| 163  | [a11y form and label validation rules](163%20-%20a11y%20form%20and%20label%20validation%20rules)      | Extend a11y-validator: checkbox/radio, ARIA name integrity, duplicate ids, label hygiene     |

---

## Runtime & State Management

| #   | Title                                                                                   | Description                                                                    |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 03  | [runtime](03%20-%20runtime)                                                             | Runtime architecture                                                           |
| 06  | [state management](06%20-%20state%20management)                                         | State management patterns                                                      |
| 08  | [Jay Component](08%20-%20Jay%20Component)                                               | Component lifecycle and API                                                    |
| 22  | [serialized mutable](22%20-%20serialized%20mutable)                                     | Serialized mutable state                                                       |
| 30  | [Jay Context API](30%20-%20Jay%20Context%20API)                                         | Context API design                                                             |
| 31  | [rename createState to createSignal](31%20-%20rename%20createState%20to%20createSignal) | Signal-based reactivity                                                        |
| 32  | [Reactive Pairing fixes](32%20-%20Reactive%20Pairing%20fixes)                           | Reactive pairing fixes                                                         |
| 133 | [html entities in text nodes](133%20-%20html%20entities%20in%20text%20nodes)            | HTML entities decoded by SSR but not by client-side createTextNode/textContent |

---

## Events & Interactivity

| #   | Title                                                       | Description                  |
| --- | ----------------------------------------------------------- | ---------------------------- |
| 05  | [events](05%20-%20events)                                   | Event handling               |
| 09  | [Safe events](09%20-%20Safe%20events)                       | Safe event handling          |
| 13  | [Redo Events](13%20-%20Redo%20Events)                       | Event system redesign        |
| 14  | [References API](14%20-%20References%20API)                 | Element references API       |
| 18  | [update on conditional](18%20-%20update%20on%20conditional) | Conditional updates          |
| 24  | [refactor refs](24%20-%20refactor%20refs)                   | Reference system refactoring |

---

## Security & Sandboxing

| #   | Title                                                                                           | Description                      |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------- |
| 001 | [3rd party code problem](001%20-%203rd%20party%20code%20problem)                                | Third-party code security issues |
| 02  | [Jay Element vs Component](02%20-%20Jay%20Element%20vs%20Component)                             | Secure model comparison          |
| 07  | [nested components](07%20-%20nested%20components)                                               | Nested component security        |
| 10  | [building components - a challenge](10%20-%20building%20components%20-%20a%20challenge)         | Component building challenges    |
| 12  | [Secure Architecture](12%20-%20Secure%20Architecture)                                           | Security architecture            |
| 15  | [main to worker communication protocol](15%20-%20main%20to%20worker%20communication%20protocol) | Worker communication             |
| 16  | [context api](16%20-%20context%20api)                                                           | Context API security             |
| 17  | [main and sandbox secure contexts](17%20-%20main%20and%20sandbox%20secure%20contexts)           | Secure context separation        |
| 21  | [alternative to context API](21%20-%20alternative%20to%20context%20API)                         | Context API alternatives         |

---

## Server-Side Rendering (SSR) & Hydration

| #   | Title                                                                                                                                  | Description                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 11  | [server side rendering](11%20-%20server%20side%20rendering)                                                                            | SSR design                                                                                             |
| 23  | [JSON compare and patch](23%20-%20JSON%20compare%20and%20patch)                                                                        | JSON diffing for SSR hydration                                                                         |
| 48  | [Jay Stack Services](48%20-%20Jay%20Stack%20Services)                                                                                  | Service injection for SSR                                                                              |
| 50  | [jay stack - headless configuration](50%20-%20rendering%20phases%20in%20contracts)                                                     | Headless SSR configuration                                                                             |
| 93  | [client hydration](93%20-%20client%20hydration)                                                                                        | Hydrate server-rendered DOM: skip static HTML, adopt dynamic nodes                                     |
| 94  | [SSR streaming renderer](94%20-%20ssr%20streaming%20renderer)                                                                          | Compile jay-html to streaming server render, no DOM APIs                                               |
| 98  | [route-based server-element output](98%20-%20route-based%20server-element%20output)                                                    | Server-element files follow route structure (consistent with DL96)                                     |
| 99  | [hydration coordinate alignment bugs](99%20-%20hydration%20coordinate%20alignment%20bugs)                                              | Fix forEach prefix, conditional+ref counter, containerCoordinate                                       |
| 100 | [hydrate conditional creation fallback](100%20-%20hydrate%20conditional%20creation%20fallback)                                         | Level 3 hydration: create elements for false-at-SSR conditionals                                       |
| 102 | [headless instance SSR and hydration compilation](102%20-%20headless%20instance%20SSR%20and%20hydration%20compilation)                 | Server-element and hydrate targets for `<jay:xxx>` headless instances                                  |
| 103 | [coordinate pre-processing for SSR hydration consistency](103%20-%20coordinate%20pre-processing%20for%20SSR%20hydration%20consistency) | Pre-assign jay-coordinate-base to all nodes; server and hydrate read it                                |
| 104 | [hydration test plan](104%20-%20hydration%20test%20plan)                                                                               | Test plan: static, conditionals, forEach, slowForEach, headless (a–d)                                  |
| 106 | [hydrate dynamic elements with Kindergarten](106%20-%20hydrate%20dynamic%20element%20with%20kindergarten)                              | One Kindergarten per parent with mixed children; STATIC sentinel; `_setGroup` pattern                  |
| 107 | [dev server consistency and phase optionality](107%20-%20dev%20server%20consistency%20and%20phase%20optionality)                       | Slow cache on/off parity, optional phases, SSR disable, build cleanup, loadParams cache                |
| 108 | [no-contract phase defaults for jay-stack](108%20-%20no-contract%20phase%20defaults%20for%20jay-stack)                                 | Without contract: all data is fast+interactive, no slow phase, remove noMainContract                   |
| 109 | [unified dev server phase pipeline](109%20-%20unified%20dev%20server%20phase%20pipeline)                                               | Fix instance fast render gate for fast-only pages, hydration initial update                            |
| 110 | [filesystem-based slow render cache](110%20-%20filesystem-based%20slow%20render%20cache)                                               | Cache loadParams per route, embed cache metadata in pre-rendered jay-html                              |
| 112 | [hydration view state consistency](112%20-%20hydration%20view%20state%20consistency)                                                   | Hydrate with SSR ViewState (matches DOM), then update with client ViewState                            |
| 115 | [slowForEachItem adopt element wrapping](115%20-%20slowForEachItem%20adopt%20element%20wrapping)                                       | Wrap slowForEachItem callback in adoptElement for multi-child nested slow forEach                      |
| 116 | [client import rewriting in library builds](116%20-%20client%20import%20rewriting%20in%20library%20builds)                             | Fix bare @jay-framework/\* imports not rewritten to /client in vite build output                       |
| 119 | [async data SSR and hydration](119%20-%20async%20data%20SSR%20and%20hydration)                                                         | Fix async data (Promise types) through SSR swap scripts, hydrate compiler, and ViewState serialization |
| 126 | [coordinate assignment rules](126%20-%20coordinate%20assignment%20rules)                                                               | Complete rules for coordinate assignment across forEach, slowForEach, headless, headfull nesting       |
| 127 | [SEO head injection](127%20-%20SEO%20head%20injection)                                                                                 | Render SEO data (title, meta, OG tags) from ViewState into `<head>` during SSR                         |
| 148 | [head tag bindings](148%20-%20head%20tag%20bindings)                                                                                   | `{binding}` support in jay-html `<title>`, `<meta>`, `<link>` — resolved against ViewState at SSR time |
| 149 | [script tags in jay-html](149%20-%20script%20tags%20in%20jay-html)                                                                     | Reject inline scripts (use page.ts), allow external 3rd-party scripts in `<head>`                      |
| 135 | [display contents for wrapper elements](135%20-%20display%20contents%20for%20wrapper%20elements)                                       | Add `display:contents` to compiler-generated wrappers so they don't break sticky/flex/grid             |
| 137 | [production build self-containment](137%20-%20headfull%20component%20stripping%20in%20pre-rendered%20jay-html)                         | Strip headfull tags, source CSS refs, embed contracts, relative manifest paths — no src/ at runtime    |
| 138 | [safe refs stubs for unused contract refs](138%20-%20safe%20refs%20stubs%20for%20unused%20contract%20refs)                             | No-op proxy for contract-declared refs absent from template; prevents crashes in shared plugin code    |

---

## Developer Experience & Tooling

| #   | Title                                                                                                                                 | Description                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 26  | [`jay start` - compiling sandbox application](26%20-%20%60jay%20start%60%20-%20compiling%20sandbox%20application)                     | Dev server startup                                                                        |
| 33  | [Jay 4 React](33%20-%20Jay%204%20React)                                                                                               | React integration                                                                         |
| 41  | [package naming migration to @jay-framework](41%20-%20package%20naming%20migration%20to%20%40jay-framework)                           | Package naming convention                                                                 |
| 42  | [editor integration](42%20-%20editor%20integration)                                                                                   | Editor/IDE integration                                                                    |
| 76  | [AI Agent Integration](76%20-%20AI%20Agent%20Integration)                                                                             | AI agent automation API                                                                   |
| 77  | [automation dev server integration](77%20-%20automation%20dev%20server%20integration)                                                 | Automation API for dev tools                                                              |
| 80  | [materializing dynamic contracts for agentic generation](80%20-%20materializing%20dynamic%20contracts%20for%20agentic%20generation)   | CLI and dev server contract materialization for AI agents                                 |
| 81  | [dev server test mode](81%20-%20dev%20server%20test%20mode)                                                                           | Health/shutdown endpoints and timeout for smoke testing                                   |
| 83  | [dev server logging and timing](83%20-%20dev%20server%20logging%20and%20timing)                                                       | Clean output, verbose mode, timing for render phases                                      |
| 85  | [rendering phases and agent kit for agentic generation](85%20-%20rendering%20phases%20and%20agent%20kit%20for%20agentic%20generation) | Agent-kit folder: instructions, contracts, markdown content with headless annotations     |
| 91  | [WebMCP plugin for jay-stack](91%20-%20webmcp%20plugin%20for%20jay-stack)                                                             | Generic WebMCP support: automation→tools/resources/prompts, plugin packaging              |
| 114 | [documentation gaps and updates](114%20-%20documentation%20gaps%20and%20updates)                                                      | Audit of docs vs design logs; gap list and update plan                                    |
| 124 | [contract props and params consistency](124%20-%20contract%20props%20and%20params%20consistency)                                      | Ensure contracts declare props/params; agent-kit authoring docs + validate checks         |
| 125 | [plugin agent-kit](125%20-%20plugin%20agent-kit)                                                                                      | `agent-kit --mode plugin` for AI agents creating plugins (contracts, components, actions) |
| 128 | [unfolded variant view](128%20-%20unfolded%20variant%20view)                                                                          | Page freeze: capture ViewState, render static SSR snapshots for side-by-side comparison   |
| 92  | [Gemini agent plugin for jay-stack](92%20-%20gemini%20agent%20plugin%20for%20jay-stack)                                               | Embedded AI agent: Gemini API, .jay-action metadata, chat contract, page automation       |
| 97  | [Contract-based tool descriptions for gemini agent](97%20-%20contract-based%20tool%20descriptions%20for%20gemini%20agent)             | Semantic tool descriptions from .jay-contract via server action, not embedded in HTML     |
| 132 | [ui-kit headless primitives](132%20-%20ui-kit%20headless%20primitives)                                                                | Popover menu, scroll carousel, tab switcher, clipboard copy — thin JS over HTML/CSS       |
| 142 | [ui-kit Add Menu contribution](142%20-%20ui-kit-add-menu-contribution)                                                                | M19.3 add-menu yaml; U1–U3 done; ships with aiditor smoke                                 |

---

## Quick Lookup by Task

### "I need to understand the rendering pipeline"

→ See #34 (jay stack), #50 (rendering phases), #52 (code splitting), #75 (slow rendering), #94 (SSR streaming)

### "I'm working on contracts and types"

→ See #38 (Contract File), #45 (View State Types), #50 (phases in contracts), #79 (linked contracts)

### "I'm adding server-side functionality"

→ See #63 (server actions), #48 (services), #65 (makeJayInit)

### "I'm building or modifying a plugin"

→ See #39 (Plugin package), #60 (plugin system refinement), #66 (plugin dependencies), #84 (headless component props)

### "I'm working with headless components"

→ See #50 (headless configuration), #58 (headless resolution), #84 (props, multiple instances, jay: prefix), #90 (forEach instances without slow phase)

### "I'm working on the compiler"

→ See #25 (building the compiler), #28 (runtime compiler), #29 (code splitting), #78 (condition parsing)

### "I'm adding client-side interactivity"

→ See #06 (state management), #31 (createSignal), #30 (Context API), #09 (safe events), #93 (client hydration)

### "I'm working on SSR or hydration"

→ See #11 (SSR concept), #93 (client hydration), #94 (SSR streaming renderer), #75 (slow rendering), #72 (skip client script), #106 (Kindergarten for mixed children)

### "I'm working on the dev server"

→ See #26 (jay start), #74 (file watching), #77 (automation integration), #81 (test mode), #107 (consistency and phase optionality)

### "I need to understand security model"

→ See #001 (3rd party problem), #12 (Secure Architecture), #17 (secure contexts)

### "I'm working on AI agent integration"

→ See #76 (AI Agent Integration), #77 (automation dev server), #80 (contract materialization for agents), #85 (agent kit and rendering phases), #91 (WebMCP plugin), #92 (Gemini agent plugin)
→ Agent kit skills: `.cursor/skills/jay-agent-kit/` (main), `jay-html-authoring/`, `jay-cli-commands/`, `jay-contracts-and-plugins/`, `jay-dev-server-test/`

### "I need to understand the full workflow lifecycle"

→ See #86 (full workflow lifecycle: setup → agent-kit → coding → slow → fast → interactive → refresh)

### "I'm working on the production build"

→ See #134 (production build: two-server architecture, build pipeline, artifact layout)

---

## Notes

- Design logs are **not updated** after initial writing - they capture decisions at a point in time
- Implementation may deviate from original design - check "Implementation Results" sections
- Some logs have multiple files with the same number (e.g., 50, 51) - these are related but separate topics
- Diagram files (.mmd, .svg, .png) accompany some design logs for visual reference
