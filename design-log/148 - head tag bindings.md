# Design Log #148 — Head Tag Bindings

## Background

DL#127 added component-driven head injection — components return `HeadTag[]` from `phaseOutput()` to render `<title>`, `<meta>`, and `<link>` in `<head>` during SSR. A later extension added static head tags from the jay-html `<head>` section (`<title>`, `<meta>`, `<link rel="canonical">`), rendered via `headMetaToHeadTags()`.

However, the static head tags don't support `{binding}` expressions. A page with `<title>{productName} | Store</title>` renders literally as `{productName} | Store`. The only way to get dynamic head content is via component `phaseOutput({ headTags })`, which requires writing a component just to set a title.

## Problem

For pages that already have ViewState from contracts/headless components, there's no simple way to bind head metadata to that data without writing explicit component code. Common cases:

- `<title>{productName} | My Store</title>` — product name from ViewState
- `<meta name="description" content="{description}" />`
- `<link rel="canonical" href="https://mystore.com/products/{slug}" />` — slug from route params

The component `phaseOutput({ headTags })` approach works but is heavy for simple interpolation. Designers authoring jay-html should be able to use the same `{binding}` syntax in `<head>` that they use in `<body>`.

### Canonical URL issue

Additionally, `<link rel="canonical">` requires an absolute URL (`https://...`), but the validator doesn't check this. The default should be no canonical — only rendered if explicitly declared.

## Design

### Binding resolution at SSR time

Head meta values (`title`, `meta.content`, `link.href`) are stored as raw strings with `{...}` intact by `parseHeadMeta()`. At SSR time, when the merged ViewState is available, resolve bindings before converting to `HeadTag[]`.

**Resolution function** (`resolveHeadValue`):

```typescript
function resolveHeadValue(template: string, viewState: object): string {
    const parts = parseTemplateParts(template);
    if (parts.every(p => p.kind === 'static')) return template;
    return parts.map(p => {
        if (p.kind === 'static') return p.value;
        const resolved = getByPath(viewState, p.value);
        return resolved !== undefined ? String(resolved) : `{${p.value}}`;
    }).join('');
}
```

Uses `parseTemplateParts` from `compiler-jay-html` (already handles nested braces, ternaries). Simple dot-path resolution against ViewState — no compiler changes needed.

**Updated signature:**

```typescript
export function headMetaToHeadTags(
    headMeta: JayHtmlHeadMeta | undefined,
    viewState?: object,
): HeadTag[]
```

### Priority chain (template wins)

1. Slow phase `phaseOutput({ headTags })` — component defaults
2. Fast phase `phaseOutput({ headTags })` — overrides slow
3. Jay-html `<head>` tags with bindings resolved — **highest priority, template wins**

The template writer (designer) has final control over head content, matching Jay's philosophy that templates control output. Components provide sensible defaults (e.g., product name as title); the template overrides when it needs customization (e.g., `{productPage.name} | My Store` instead of just the product name).

In practice, most pages will only use one source — either the component provides head tags, or the template declares them. When both exist, the template takes precedence.

### Static validation challenge

When the template doesn't declare `<title>` or `<meta description>`, the SEO validator warns about missing head tags. But a component might provide them dynamically via `phaseOutput({ headTags })` — the validator can't know this statically without running the component.

**Solution: `headTags` declaration in plugin.yaml**

Plugins declare which head tags their components provide:

```yaml
name: wix-stores
contracts:
  - name: product-page
    headTags:
      - title
      - meta:description
      - link:canonical
```

The validator checks: "this page imports `product-page` from `wix-stores`, which declares it handles `title`, `meta:description`, and `link:canonical` — skip warnings for those." If the template also declares a `<title>`, no conflict — the template wins at runtime, and the validator knows a title exists from either source.

This declaration is optional — plugins without `headTags` declarations don't affect validation. The validator falls back to checking the jay-html `<head>` only.

### Canonical validation

- Remove the "missing canonical" warning from the SEO validator (no default canonical)
- Add a "relative canonical" warning: if `<link rel="canonical" href="...">` is present and the href doesn't start with `http://` or `https://`, warn
- Skip the check if href contains `{` (binding will resolve at runtime)

### Call site changes

Both the dev and production SSR paths need to pass the merged ViewState to `headMetaToHeadTags`, and the merge order changes (template last = highest priority):

- **Dev** (`generate-ssr-response.ts`): `mergeHeadTags([componentTags, headMetaToHeadTags(cached.headMeta, viewState)])` — template tags last (wins)
- **Production** (`fetch-page-handler.ts`): `mergeHeadTags([componentTags, headMetaToHeadTags(route.headMeta, fullViewState)])` — template tags last (wins)

### Headless-keyed binding resolution

For headless components with keys (e.g., `key="productPage"`), bindings like `{productPage.name}` resolve against the merged ViewState where `productPage` is a top-level key. This works because the merged ViewState flattens keyed headless component data:

```
viewState = {
    productPage: { name: "Ceramic Vase", slug: "ceramic-vase", ... },
    ...
}
```

So `{productPage.name}` resolves via dot-path traversal — no special handling needed.

## Examples

### Simple title binding

```html
<head>
  <title>{productPage.name} | My Store</title>
  <meta name="description" content="{productPage.description}" />
  <link rel="canonical" href="https://mystore.com/products/{productPage.slug}" />
</head>
```

With ViewState `{ productPage: { name: "Ceramic Vase", description: "Handmade...", slug: "ceramic-vase" } }`:

```html
<title>Ceramic Vase | My Store</title>
<meta name="description" content="Handmade..." />
<link rel="canonical" href="https://mystore.com/products/ceramic-vase" />
```

### Template overrides component

Component's fast render returns `headTags: [{ tag: 'title', children: 'Ceramic Vase' }]`. But the jay-html template has `<title>{productPage.name} | My Store</title>`. The template wins — rendered title is "Ceramic Vase | My Store".

### Unresolved binding

If the binding path doesn't exist in ViewState, the `{...}` is kept as-is:

```html
<title>{missing.path} | Store</title>
→ <title>{missing.path} | Store</title>
```

## Implementation Plan

### Phase 1: Binding resolution

1. Add `getByPath(obj, dotPath)` utility to `generate-ssr-response.ts`
2. Add `resolveHeadValue(template, viewState)` using `parseTemplateParts`
3. Update `headMetaToHeadTags` to accept optional `viewState` and resolve bindings
4. Update dev SSR call site — template tags last (highest priority)
5. Update production call site — template tags last (highest priority)

### Phase 2: Plugin headTags declaration

1. Add optional `headTags` to contract entries in `PluginManifest` (`compiler-shared/lib/plugin-resolution.ts`)
2. Update `plugin-validator` to validate `headTags` values (`title`, `meta:name`, `link:rel`)
3. Pass headTags declarations through to the validation context
4. Update SEO validator to check headless imports for `headTags` declarations — skip warnings for head tags covered by a component

### Phase 3: Validation rules

1. Remove "missing canonical" rule from SEO validator (no default canonical)
2. Add "relative canonical" rule: warn if href is not absolute, skip if contains `{`
3. Make "missing title" and "missing description" rules aware of component `headTags` declarations
4. Update tests

### Phase 4: Documentation

1. Update plugin developer instructions (`packages/jay-stack/stack-cli/agent-kit-template/plugin/INSTRUCTIONS.md`) — document `headTags` declaration in plugin.yaml contracts
2. Update relevant topic guides under the plugin role — add a guide or section on declaring head tags
3. Update designer instructions if needed — document that `{binding}` syntax works in `<title>`, `<meta>`, and `<link>` in `<head>`

### Phase 5: Smoke tests

1. Update smoke-test phases page: `<title>{slowTitle} Page</title>` — verify resolves to "Phases Test Page" and overrides component title
2. Verify component headTags work as fallback when template has no head tags

## Verification Criteria

1. `<title>{key}</title>` in jay-html resolves against ViewState in both dev and production SSR
2. Jay-html head tags override component `phaseOutput({ headTags })` (template wins)
3. Unresolved bindings are kept as `{path}` (no crash, no empty string)
4. SEO validator warns on relative canonical, passes absolute canonical, skips `{binding}` canonical
5. No canonical warning when canonical is absent
6. SEO validator suppresses title/description warnings when headless import's plugin declares `headTags: [title, meta:description]`
7. All existing smoke tests pass