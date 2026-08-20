# DL#163 — Built-in Bindings and Field Comparison in Templates

## Background

Route params (from `[slug]`, `[role]` directory segments) are available to page components via `props.slug`, `props.role`. But nested components (headfull FS and instance-based headless) receive props from the template, not from the route directly.

Currently, to pass a route param to a nested component, the designer needs the developer to create a `page.ts` that maps params to ViewState, then binds ViewState to the component prop:

```
route param → page.ts → ViewState → template binding → component prop
```

This creates unnecessary coupling. Many pages exist solely to pass params through. The designer role cannot build these pages independently.

A common pattern — navigation menus with an active item — requires both URL awareness and string comparison. Today this is impossible without `page.ts` boilerplate.

### Related Design Logs

- DL#162 — Structural headfull components (no code file)
- DL#144 — Per-route server elements (route param handling)
- DL#109 — Headless instance server rendering (instance props)

## Problem

A docs site has routes like `/docs/designer/[slug]`, `/docs/developer/[slug]`. A sidebar component needs to highlight the active menu item. Today this requires:

1. A page contract declaring `activeRole` and `activePage` as data tags
2. A `page.ts` with `withSlowlyRender` that maps `props.slug` → ViewState
3. Template bindings from ViewState to the sidebar props
4. Inside the sidebar, enum-style conditionals against literal values

The page.ts is pure boilerplate:

```typescript
export const page = makeJayStackComponent<PageContract>().withSlowlyRender(async (props) =>
  phaseOutput({ activeRole: 'designer', activePage: props.slug }, {}),
);
```

## Design

### 1. The `jay.` namespace — framework-provided bindings

Expose framework-provided values under the `jay.` prefix in templates. The `jay.` namespace is consistent with the `jay:` tag prefix and reads naturally:

```html
<jay:DocsSidebar activeRole="{jay.params.role}" activePage="{jay.params.slug}" />
```

No page.ts needed. The framework resolves `jay.params.role` from the URL at render time.

#### Why `jay.` and not `$`

- Reads naturally: `jay.url.path`, `jay.params.slug`
- Consistent with existing `jay:ComponentName` tag prefix
- More extensible: `jay.url`, `jay.params`, `jay.query`, `jay.env`
- Less cryptic than `$params`, `$url`

#### Available `jay.` bindings

| Binding        | Value                                              | Phase                   |
| -------------- | -------------------------------------------------- | ----------------------- |
| `jay.params.X` | Route param value from `[X]` segment               | slow, fast, interactive |
| `jay.url.path` | Full URL pathname (e.g., `/docs/designer/routing`) | slow, fast, interactive |

Future extensions (separate DLs):

| Binding          | Value                 | Phase                  |
| ---------------- | --------------------- | ---------------------- |
| `jay.query.X`    | Query parameter value | fast, interactive only |
| `jay.url.origin` | URL origin            | fast, interactive only |

### 2. String comparison: right side is a field reference by default

For **string-typed** tags, the right side of `===`/`!==` resolves as a **field** by default. String literals require quotes. **Enum-typed** tags are unchanged — the right side remains a literal variant name.

```html
<!-- String type: bare right side = field reference -->
<a if="url === jay.url.path" class="active-link">...</a>
<a if="url === currentPath">Match two string fields</a>

<!-- String type: quoted right side = literal -->
<a if="url === '/about'">Literal match</a>

<!-- Enum type: unchanged — right side is a variant literal (no quotes needed) -->
<div if="status === active">Active</div>
<div if="type === physical">Ships to your door</div>
```

The compiler knows the tag type from the contract, so it can distinguish automatically. No breaking change — existing enum comparisons keep working as-is.

### 3. `startsWith` operator (`^=`) for partial path matching

Exact match (`===`) works for highlighting the current page. But navigation often needs **section-level** highlighting — `/docs/designer` should be active when the URL is `/docs/designer/routing`.

#### Syntax: `^=` (starts with)

```html
<!-- Field right side -->
<a if="jay.url.path ^= sectionUrl" class="section-active">{label}</a>

<!-- Literal right side (quoted) -->
<a if="jay.url.path ^= '/docs/designer'" class="section-active">Designer</a>
```

`^=` mirrors the CSS attribute selector `[attr^=value]` — familiar to designers. `^=` is string-only (no enum variant). Same resolution rules: bare = field, quoted = literal.

This is a pure function (string prefix check) — no security implications.

#### Full operator set for string conditionals

| Operator | Meaning               | Example                           |
| -------- | --------------------- | --------------------------------- |
| `===`    | Exact match (field)   | `if="url === jay.url.path"`       |
| `===`    | Exact match (literal) | `if="url === '/about'"`           |
| `!==`    | Not equal             | `if="url !== jay.url.path"`       |
| `^=`     | Starts with           | `if="jay.url.path ^= sectionUrl"` |

For enum tags: `===`/`!==` right side is always a literal variant (unchanged).

### 4. Navigation menu pattern

The combination of `jay.url.path`, field comparison, `^=`, and conditional class bindings enables clean active-state highlighting:

**Exact page match** — highlight the current page link using conditional class:

```html
<a href="{url}" class="nav-link {url === currentPath ? active}">{label}</a>
```

**Section match** — highlight the section containing the current page:

```html
<a href="{sectionUrl}" class="section-link {jay.url.path ^= sectionUrl ? active}">{sectionLabel}</a>
```

**Complete sidebar example** with both levels:

```html
<!-- sidebar.jay-html — receives currentPath as prop from page -->
<nav>
  <div forEach="sections" trackBy="url">
    <h3>
      <a href="{url}" class="section {currentPath ^= url ? active}">{label}</a>
    </h3>
    <!-- Page links within section — show only if section is active -->
    <div if="currentPath ^= url" forEach="pages" trackBy="url">
      <a href="{url}" class="page {url === currentPath ? active}">{label}</a>
    </div>
  </div>
</nav>
```

This pattern should be documented in the agent-kit designer guides as the standard way to build navigation with active state.

### Phase availability

Route params and URL path are available at **all phases**:

- **Slow** (SSG): params are known at build time (from `loadParams`), URL path is known from the route
- **Fast** (SSR): params and path are part of the request URL
- **Interactive**: available from `window.location`

Binding `jay.params` or `jay.url.path` to a slow-phase prop is safe.

### Scope

`jay.` bindings are available in **page templates only**, not inside headfull component templates. Headfull components receive data via props — they shouldn't reach into the URL directly. The page passes URL data to components through prop bindings:

```html
<!-- Page template — jay. bindings available -->
<jay:Sidebar currentPath="{jay.url.path}" />

<!-- Inside sidebar.jay-html — no jay. bindings, use props/ViewState -->
<a href="{url}" class="nav-link {url === currentPath ? active}">{label}</a>
```

## Questions

1. ~~Should `jay.url.path` include or exclude the trailing slash?~~ Normalize to no trailing slash, matching route patterns.

2. ~~Should the right side of `===` resolve from the same scope as text bindings?~~ Yes — same resolution rules (ViewState, forEach item).

3. ~~Should negated `^=` use `!(a ^= b)` or a dedicated operator?~~ Use the parenthesized form `!(a ^= b)` — consistent with existing `!(a && b)` support.

## Implementation Plan

### Phase 1: Compiler — `jay.` binding resolution

**`compiler-jay-html/lib/jay-target/jay-html-compiler.ts`** and **`jay-html-compiler-hydrate.ts`**:

- Recognize `jay.params.X` and `jay.url.path` in `{binding}` expressions
- For server element: generate code that reads from `__jay.params.X` or `__jay.url.path` on the ViewState
- For hydrate: read from the same `__jay` field

**`compiler-jay-html/lib/jay-target/jay-html-compiler-server.ts`**:

- Resolve `jay.` bindings in prop values for instance and headfull component props

### Phase 2: Runtime — populate `__jay`

**`stack-server-runtime`** (slow + fast runners):

- Add `__jay: { params, url: { path } }` to the ViewState before rendering

**`stack-client-runtime`**:

- Extract `__jay` from initial ViewState, or derive from `window.location`

### Phase 3: Comparison syntax change and `^=` operator

**`compiler-jay-html/lib/jay-target/jay-html-compiler.ts`** and **hydrate**:

- For **string-typed** tags: bare right side resolves as field, quoted as literal
- For **enum-typed** tags: unchanged — bare right side remains a variant literal
- The compiler reads tag type from the contract to decide resolution — no migration needed
- Add `^=` operator: parse `if="a ^= b"` (field) and `if="a ^= 'literal'"` (string)
- Generate `a.startsWith(b)` in the compiled output
- Support negation: `if="!(a ^= b)"`
- Support `^=` in conditional class bindings: `class="link {path ^= url ? active}"`

### Phase 4: Validation

- Validate `jay.params.X` references a param name from route segments
- Validate `jay.url.path` is used correctly (no typos like `jay.url.pathname`)
- Validate `^=` operands are string-typed

### Phase 5: Documentation

**Agent-kit `designer/jay-html-template-syntax.md`**:

- Document `jay.` bindings and available values
- Document string field comparison (bare = field, quoted = literal)
- Document `^=` starts-with operator

**Top-level `docs/core/jay-html.md`** and **`docs/core/routing.md`**:

- Document `jay.` built-in bindings
- Document `jay.params` and `jay.url.path` availability and phase rules

**`compiler-jay-html/docs/jay-html-docs.md`**:

- Document the conditional parsing changes (string vs enum type resolution)
- Document `^=` operator compilation

**New guide: `designer/navigation-patterns.md`**:

- Document the active-menu pattern using `jay.url.path`, `===`, and `^=`
- Show exact-match (current page) and prefix-match (current section) patterns
- Show both static and forEach-based menu examples
- Show the two-level sidebar pattern (sections + pages)

**UI kit plugin: `agent-kit/designer/popover-menu.md`**:

- Add a section showing how to combine `popover-menu` with active-state highlighting
- Example: a nav menu where dropdown items highlight the active page using `if="url==={currentPath}"`
- Cross-reference the framework `navigation-patterns.md` guide for the `jay.url.path` and `^=` patterns

## Trade-offs

| Choice                        | Pro                                                     | Con                                          |
| ----------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| `jay.` bindings               | No page.ts needed, designer-independent, natural prefix | New binding source, compiler complexity      |
| Keep page.ts passthrough      | Explicit, no new concepts                               | Boilerplate, role boundary problem           |
| `$` prefix                    | Familiar from shell/template langs                      | Less readable, inconsistent with `jay:` tags |
| Field comparison with `{...}` | Consistent with binding syntax, backward compatible     | Slightly more complex conditional parser     |
| Dedicated `active` attribute  | Cleaner for the menu case                               | Too narrow, doesn't generalize               |

## Examples

### Before (with page.ts)

```yaml
# page.jay-contract
name: Page
params:
  slug: string
tags:
  - tag: activePage
    type: data
    dataType: string
    phase: slow
```

```typescript
// page.ts
export const page = makeJayStackComponent<PageContract>().withSlowlyRender(async (props) =>
  phaseOutput({ activePage: props.slug }, {}),
);
```

```html
<jay:DocsSidebar activePage="{activePage}" />
```

### After (with jay. bindings)

```html
<!-- No page.ts, no page.jay-contract needed for param passing -->
<jay:DocsSidebar activePage="{jay.params.slug}" currentPath="{jay.url.path}" />
```

### Active menu (inside sidebar component, using conditional class)

```html
<div forEach="items" trackBy="url">
  <a href="{url}" class="nav-link {url === currentPath ? active}">{label}</a>
</div>
```

### Section menu with startsWith (using conditional class)

```html
<div forEach="sections" trackBy="url">
  <a href="{url}" class="section-link {currentPath ^= url ? active}">{label}</a>
  <div if="currentPath ^= url" forEach="pages" trackBy="url">
    <a href="{url}" class="page-link {url === currentPath ? active}">{label}</a>
  </div>
</div>
```

## Implementation Results

### What was implemented

All five phases from the implementation plan, with no deviations from the design.

**PEG Grammar** (`expression-parser.pegjs`):

- `startsWithCondition` rule with `^=` operator
- `quotedStringLiteral` rule for `'literal'` values
- `enumCondition` modified with type-aware dispatch: enum types → variant literal, string types → field reference
- `quotedStringLiteral` added to `equalityComparisonValue`
- Slow render: `applyStartsWith` helper, `slowQuotedStringLiteral`, `jay.*` always-runtime in `slowPropertyAccess`

**Compiler** (`expression-compiler.ts`):

- `Variables.resolveAccessor` maps `jay.*` → `__jay.*` with `JayString` type

**Runtime**:

- `dev-server.ts`: `__jay: { params, url: { path } }` injected via `injectJayBindings()` at both cached and non-cached handler paths
- `fetch-page-handler.ts`: same injection for production serve
- `resolve-instance-props.ts`: `buildInstanceBindingScope` includes `jay: { params, url: { path } }` so `{jay.url.path}` and `{jay.params.slug}` resolve correctly in component prop bindings (e.g., `<jay:Sidebar currentPath="{jay.url.path}" />`). Without this, `jay.*` bindings worked in compiled template code (text, conditionals) but not in runtime prop resolution for headfull/instance components.

**Documentation**:

- Agent-kit: `jay-html-template-syntax.md` updated with string comparison, `^=`, `jay.` bindings
- Agent-kit: new `navigation-patterns.md` guide
- Agent-kit: `INSTRUCTIONS.md` updated with navigation guide reference
- UI kit: `popover-menu.md` updated with active-state section
- Top-level: `docs/core/jay-html.md` — built-in bindings section
- Top-level: `docs/core/routing.md` — accessing route data in templates
- Compiler: `compiler-jay-html/docs/jay-html-docs.md` — type-aware comparison, `^=`, `jay.` internals

### Tests

10 new tests added to `expression-compiler.unit.test.ts`:

- `^=` with field and quoted literal
- `^=` combined with `&&`
- String field-to-field comparison with `===` and `!==`
- Enum comparison unchanged
- String comparison with quoted literal
- `jay.url.path` and `jay.params` accessors

All 195 expression tests pass. All 682 compiler tests pass. Type checking passes.
