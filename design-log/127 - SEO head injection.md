# Design Log #127 — SEO Head Injection

## Background

Jay-html templates have a `<head>` and a `<body>`. The compiler processes `<body>` for dynamic bindings (data, conditionals, forEach, refs). The `<head>` is used for static content: headless imports, stylesheets, and static `<title>`/`<meta>` tags. Dynamic bindings like `{value}` in `<head>` elements are not supported.

This means there is no way to render SEO data (title, meta description, Open Graph tags, canonical URLs, etc.) from ViewState into the page's `<head>` during SSR.

## Problem

The Wix Stores product page contract defines an `seoData` structure:

```yaml
- tag: seoData
  type: sub-contract
  tags:
    - tag: tags
      type: sub-contract
      repeated: true
      trackBy: position
      tags:
        - {tag: position, type: data, dataType: string}
        - {tag: type, type: data, dataType: string}    # element name: meta, title, link, etc.
        - tag: props
          type: sub-contract
          repeated: true
          trackBy: key
          tags:
            - {tag: key, type: data, dataType: string}   # attribute name
            - {tag: value, type: data, dataType: string}  # attribute value
        - tag: meta
          type: sub-contract
          repeated: true
          trackBy: key
          tags:
            - {tag: key, type: data, dataType: string}
            - {tag: value, type: data, dataType: string}
        - {tag: children, type: data, dataType: string}   # inner text (e.g. for <title>)
    - tag: settings
      type: sub-contract
      tags:
        - {tag: preventAutoRedirect, type: data, dataType: boolean}
        - tag: keywords
          type: sub-contract
          repeated: true
          trackBy: term
          tags:
            - {tag: term, type: data, dataType: string}
            - {tag: isMain, type: data, dataType: boolean}
```

This structure represents serialized HTML elements for the `<head>`:
- `type` is the element name (`meta`, `title`, `link`, `script`)
- `props` are the attributes (`name`/`content`, `property`/`content` for OG, `rel`/`href` for canonical)
- `children` is inner text (e.g., the text inside `<title>`)

An AI agent tried to bind this in the template body:

```html
<div forEach="p.seoData.tags" trackBy="position">
  <meta forEach="props" trackBy="key" name="{key}" content="{value}" />
</div>
```

This doesn't work because:
1. `<meta>` tags must be in `<head>`, not `<body>`
2. Jay-html doesn't support dynamic element names (the `type` field determines the tag name)
3. Jay-html doesn't support dynamic attribute names (`name="{key}"` — the attribute name itself is dynamic)
4. Even if these were supported, `<div>` wrapping `<meta>` is semantically wrong

## Questions

1. **Q: Should SEO data be rendered by the jay-html compiler or by the SSR pipeline?**
   **A:** By the jay-html compiler, rendered as part of `<head>` during SSR. Head elements are static — rendered only in SSR, never hydrated. They support `slow` and `fast` phases only, no `interactive`. They must be part of the initial HTML response for optimal SEO (not injected after).

2. **Q: Should we support a general mechanism for dynamic `<head>` content, or a specific SEO-focused one?**

3. **Q: Should this be slow-phase only, or also support fast phase?**
   **A:** Both slow and fast. No interactive — head elements are SSR-only.

4. **Q: How does hydration work for head elements?**
   **A:** It doesn't. Head elements are rendered during SSR and left as-is. No hydration, no client-side updates.

5. **Q: Should the seoData contract structure be generic (any HTML tag) or typed (specific SEO tag types)?**
   **A:** Jay's philosophy is that components provide data and templates decide how to render it. The template should control the head structure — what `<meta>` tags, what `<title>`, what attributes. This keeps us forward-compatible with any new header structure. The component provides the data (product name, description, image URL); the jay-html template maps it to specific head elements.

## Design Options

### Option A: Template-driven head bindings

Extend the compiler to support dynamic bindings in `<head>`. The template controls the head structure; the component provides the data.

#### Simple bindings

Standard `{expression}` syntax in `<head>` for known tag shapes:

```html
<head>
  <title>{p.productName} | My Store</title>
  <meta name="description" content="{p.description}" />
  <meta property="og:title" content="{p.productName}" />
  <meta property="og:image" content="{p.mainImageUrl}" />
  <link rel="canonical" href="{p.canonicalUrl}" />
</head>
```

#### Generic bindings (for dynamic tag/attribute names)

Two new head-only directives for fully data-driven structures:

- `jay-element="{type}"` — rendered element name comes from data
- `jay-spread="props"` — a `{key, value}[]` sub-contract is spread as HTML attributes

```html
<head>
  <meta forEach="p.seoData.tags" trackBy="position"
        jay-element="{type}" jay-spread="props">{children}</meta>
</head>
```

Renders the Wix seoData structure as-is — each tag becomes its `type` element with `props` as attributes and `children` as inner text.

#### Contract implications

The contract can be either:
- **Flat named fields** (seoTitle, seoDescription, etc.) — for simple bindings
- **Generic structure** (tags with type/props/children) — for jay-element/jay-spread

The component decides how to expose the data; the template decides how to render it.

#### Head binding rules

1. **SSR only** — rendered during slow and fast phases. No interactive phase, no hydration.
2. **forEach supported** — for generic structures (iterating over tags).
3. **No conditionals** — simplifies implementation. All head elements are always rendered.
4. **No refs** — head elements are not interactive.
5. **jay-element and jay-spread are head-only** — not supported in `<body>`.
6. **Static head elements pass through** — stylesheets, headless imports, jay-params are unchanged.

#### Compilation target

The compiler generates a **head render function** that takes ViewState and returns an HTML string:

```typescript
// Generated: page.jay-html?jay-head.ts
export function renderHead(viewState: ViewState): string {
    let html = '';
    // Simple bindings
    html += `<title>${escapeHtml(viewState.p.productName)} | My Store</title>`;
    // Generic bindings (forEach + jay-element + jay-spread)
    for (const tag of viewState.p.seoData.tags) {
        html += `<${escapeTag(tag.type)}`;
        for (const prop of tag.props) {
            html += ` ${escapeAttr(prop.key)}="${escapeAttr(prop.value)}"`;
        }
        html += tag.children
            ? `>${escapeHtml(tag.children)}</${escapeTag(tag.type)}>`
            : ` />`;
    }
    return html;
}
```

#### Pros

- Follows Jay philosophy — template controls output, component provides data
- Handles both simple (flat fields) and generic (Wix seoData) structures
- Designer controls what goes in `<head>`
- Forward-compatible — new SEO standards just need new template lines

#### Cons

- Requires compiler changes (parser, new compilation target)
- Two new directives (`jay-element`, `jay-spread`) to learn
- `jay-element`/`jay-spread` have security implications (dynamic tag names, attribute names) — must escape carefully
- More implementation effort

---

### Option B: Component-driven head tags

The component's slow/fast render returns head tags alongside ViewState. The SSR pipeline appends them to `<head>`. No template involvement.

#### Raw string API

```typescript
.withSlowlyRender(async (props, db) => {
    const product = await db.getProduct(props.slug);
    return phaseOutput(
        { title: product.name, price: product.price },
        { productId: product.id },
        {
            headTags: [
                `<title>${escapeHtml(product.name)} | My Store</title>`,
                `<meta name="description" content="${escapeAttr(product.description)}" />`,
                `<meta property="og:title" content="${escapeAttr(product.name)}" />`,
            ],
        },
    );
})
```

#### Typed API (safer)

```typescript
return phaseOutput(
    { title: product.name },
    {},
    {
        headTags: [
            { tag: 'title', children: product.name + ' | My Store' },
            { tag: 'meta', attrs: { name: 'description', content: product.description } },
            { tag: 'meta', attrs: { property: 'og:title', content: product.name } },
            { tag: 'link', attrs: { rel: 'canonical', href: canonicalUrl } },
        ],
    },
);
```

The SSR pipeline serializes these into HTML and appends to `<head>`.

#### Mapping the Wix seoData structure

The component maps the generic seoData directly to headTags:

```typescript
headTags: product.seoData.tags.map(tag => ({
    tag: tag.type,
    attrs: Object.fromEntries(tag.props.map(p => [p.key, p.value])),
    children: tag.children,
})),
```

#### Pipeline integration

`phaseOutput` gains an optional third parameter for head metadata. The dev server and SSR renderer serialize headTags and inject them into `<head>` before sending the response.

```
1. SSR: run slow/fast phases → get ViewState + headTags
2. Serialize headTags to HTML strings
3. Inject into <head> (after static elements like stylesheets)
4. Render body as before
```

#### Pros

- No compiler changes — works with existing infrastructure
- Simple implementation — just extend `phaseOutput` and the SSR pipeline
- Handles the generic Wix seoData structure naturally
- Typed API prevents XSS (framework handles escaping)
- Easy to implement incrementally

#### Cons

- Breaks Jay philosophy — component controls head output, not the template
- Designer has no visibility or control over what goes in `<head>`
- Head content is not visible in the jay-html template
- Raw string API is error-prone (XSS risk); typed API mitigates this
- `phaseOutput` API changes (new parameter)

---

### Comparison

| Aspect | Option A (template-driven) | Option B (component-driven) |
| ------ | -------------------------- | --------------------------- |
| Jay philosophy | Follows (template controls) | Breaks (component controls) |
| Compiler changes | Yes (parser, new target) | No |
| Implementation effort | High | Low |
| Designer control | Full | None |
| Generic structures | Yes (jay-element/jay-spread) | Yes (component maps data) |
| Simple cases | Clean (`<title>{name}</title>`) | Verbose (phaseOutput 3rd arg) |
| XSS safety | Must escape in generated code | Typed API handles escaping |
| Forward-compatible | Yes (add template lines) | Yes (add headTags in code) |
| Visibility in template | Head structure visible | Head structure hidden in code |
| Head tags are... | Invisible UI infrastructure | Invisible UI infrastructure |

### Pragmatic consideration

Head tags (`<title>`, `<meta>`, `<link rel="canonical">`) are invisible infrastructure — there's nothing to "design." A designer doesn't need to control whether `og:title` uses `property` or `name` as the attribute. This is different from body elements where visual layout matters. Option B's pragmatism may be justified here, even though it departs from Jay's general philosophy.

## Decision: Option B (component-driven)

Option B chosen for pragmatism — head tags are invisible infrastructure, no compiler changes needed, handles generic structures naturally.

## Head Tag Collision

Multiple sources can produce headTags during a single page render. Collisions must be resolved.

### Sources of headTags

1. **Page component** (`page.ts`) — slow and fast phases
2. **Page-level headless plugin components** — slow and fast phases
3. **Nested headless components** (inside forEach or sub-components)
4. **Nested headfull FS components** (have their own jay-html + component)
5. **Repeated nested components** (inside forEach — multiple instances)

### Collision scenarios

| Scenario | Example | Risk |
| -------- | ------- | ---- |
| Two page-level headless components both declare `<title>` | Product plugin + SEO plugin | High — common |
| Page component and headless plugin both declare `og:title` | Page sets title, plugin sets OG | High — common |
| Nested headless inside forEach declares meta tags | Each product in a list declares its own `<title>` | Medium — likely a bug |
| Nested headfull FS component declares meta tags | A header component adds its own meta | Low — unusual |
| Same component's slow and fast phases both declare `<title>` | Fast phase updates the title from slow | High — expected |

### Identity: what makes two head tags "the same"?

- `<title>` — singleton, only one per page
- `<meta name="X">` — keyed by `name` attribute
- `<meta property="X">` — keyed by `property` attribute (Open Graph)
- `<meta charset="X">` — singleton
- `<link rel="canonical">` — singleton
- `<link rel="X">` — keyed by `rel` + `href` combination
- Other tags — keyed by tag name + all attributes (exact match)

### Resolution strategy

**Last-write-wins with defined ordering:**

1. Collect headTags from all sources during slow phase
2. Collect headTags from all sources during fast phase
3. Merge: fast overwrites slow (same key)
4. Within a phase, ordering determines priority:
   - Page-level headless components: ordered by `<script type="application/jay-headless">` position in the template
   - Page component: processed after headless components
   - Nested components: contribute to their parent's headTags (bubbled up)

This means:
- The **page component** has final say (it runs last, can override plugins)
- **Fast phase** overrides **slow phase** (more recent data wins)
- **Nested components inside forEach** — headTags are collected from all instances but duplicates are deduplicated by key. This is likely a mistake — warn at dev time.

### Questions

1. **Q: Should nested components inside forEach be allowed to declare headTags?**
   **A:** No. HeadTags from components inside forEach are ignored.

2. **Q: Should nested headfull FS components be allowed to declare headTags?**
   A header component might legitimately want to add navigation-related meta tags. But it could also conflict with the page's SEO tags.

3. **Q: Should the pipeline warn on collisions or silently resolve them?**
   **A:** Warn on collision.

4. **Q: Should headTags merge across slow→fast, or does fast replace slow entirely?**
   **A:** Fast replaces slow entirely (no merge).

## Implementation Plan

### Phase 1: Typed headTag API

1. Define `HeadTag` type: `{ tag: string; attrs?: Record<string, string>; children?: string }`
2. Extend `PhaseOutput` with optional `headTags: HeadTag[]`
3. Extend `phaseOutput()` helper to accept the third parameter

### Phase 2: Collection and merging

1. After slow phase: collect headTags from page component and all headless instances
2. After fast phase: collect headTags, merge with slow (fast overrides by key)
3. Implement key extraction: `<title>` → `title`, `<meta name="X">` → `meta:name:X`, etc.
4. Deduplicate by key, last-write-wins

### Phase 3: Serialization and injection

1. Serialize merged headTags to HTML strings (with proper escaping)
2. Inject into `<head>` of the SSR response, after static elements
3. Handle in both dev server and SSR streaming renderer

### Phase 4: Nested component support

1. Define how nested components (headless, headfull) bubble headTags up to the page level
2. forEach instances: warn if multiple instances produce headTags

### Phase 5: Validation and warnings

1. Warn on collision between different components at dev time
2. Warn if forEach-nested components produce headTags
3. Log which component's headTag won in verbose mode

### Phase 6: Tests

1. Dev-server SSR test: page component returns headTags in slow phase → verify `<head>` contains rendered tags
2. Dev-server SSR test: headless plugin returns headTags → verify `<head>` contains rendered tags
3. Dev-server SSR test: fast phase replaces slow phase headTags entirely
4. Dev-server SSR test: collision between page and headless → warn, last-write-wins
5. Dev-server SSR test: forEach-nested component headTags are ignored
6. Dev-server SSR test: static head elements (stylesheets, headless imports) are unaffected
7. Verify no hydration code references head content

### Phase 7: Documentation

1. Add docs to `/docs` folder explaining the headTags API
2. Update the plugin role agent-kit template:
   - Add a `seo-guide.md` to `agent-kit-template/plugin/` explaining how to declare headTags in `phaseOutput`
   - Cover: typed API, mapping generic SEO data, collision rules, forEach restriction
   - Reference from `plugin/INSTRUCTIONS.md`

## Verification Criteria

1. A product page renders `<title>Product Name | My Store</title>` in the HTML `<head>` during SSR
2. `<meta>` tags with dynamic content render correctly in `<head>`
3. Static head elements (stylesheets, headless imports) are unaffected
4. No hydration code is generated for head content
5. When two components declare the same meta tag, warn and last-write-wins with defined ordering
6. Fast phase headTags replace slow phase headTags entirely
7. forEach-nested components' headTags are ignored
8. Existing tests continue to pass
