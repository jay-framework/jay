# Plugin Validation

Run `jay-stack validate-plugin` to check your plugin for errors.

## Usage

```bash
# Validate the current plugin
jay-stack validate-plugin

# Validate a specific plugin path
jay-stack validate-plugin --path ./src/plugins/my-plugin

# Verbose output
jay-stack validate-plugin -v
```

## What It Checks

### Contract Validation

- YAML structure is valid
- All required fields are present (`name`, `tags`)
- Tag types are valid (`data`, `variant`, `interactive`, `sub-contract`)
- `dataType` is valid for the tag type
- `trackBy` references an existing data tag with string/number type
- `repeated` sub-contracts have `trackBy`
- Phase constraints are satisfied (children >= parent for arrays)
- No duplicate tag names at the same level
- Props have valid types and unique names

### Plugin Structure

- `plugin.yaml` exists and is valid YAML
- Contract files referenced in `plugin.yaml` exist
- Component export names are valid strings (not file paths)
- Action metadata files (`.jay-action`) exist

### Type Generation

- Contracts compile to valid TypeScript types
- Generated ViewState, Refs, Props, and Params interfaces are correct

## Common Errors

### "trackBy references non-existent tag"

The `trackBy` field must reference a `data` tag within the same sub-contract:

```yaml
# Wrong — trackBy references a tag that doesn't exist
- tag: items
  type: sub-contract
  repeated: true
  trackBy: itemId # No tag named "itemId"
  tags:
    - tag: id # Should be "itemId" or trackBy should be "id"
      type: data
      dataType: string
```

### "Child phase earlier than parent"

Array children must have phase >= parent:

```yaml
# Wrong
- tag: items
  type: sub-contract
  repeated: true
  trackBy: id
  phase: fast
  tags:
    - tag: name
      type: data
      phase: slow # Error: slow < fast
```

### "Interactive tag cannot have explicit phase"

Interactive tags are always `fast+interactive`:

```yaml
# Wrong
- tag: button
  type: interactive
  elementType: HTMLButtonElement
  phase: slow # Error: remove this line
```

### "Component looks like a path"

The `component` field in `plugin.yaml` should be an export name, not a file path:

```yaml
# Wrong
component: ./lib/components/product-page.ts

# Right
component: productPage
```

## Head Tags Declaration

If your component provides head tags dynamically (via `phaseOutput({ headTags })`), declare them in `plugin.yaml` so validators don't warn about missing tags on pages using your component:

```yaml
contracts:
  - name: product-page
    contract: product-page.jay-contract
    component: productPage
    headTags:
      - title
      - meta:description
      - link:canonical
```

Values: `title`, `meta:<name>` (e.g., `meta:description`), `link:<rel>` (e.g., `link:canonical`).

Validators access this via `ctx.headlessImports[].providedHeadTags`.

## Plugin Validators

Plugins can provide custom jay-html validation rules that run during `jay-stack validate`. Declare validators in `plugin.yaml`:

```yaml
validators:
  - name: media-optimization
    handler: ./validators/media-validator
    description: Ensures media URLs use resize parameters
```

### Writing a Validator

The handler module exports a `validate` function:

```typescript
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';

export const validate: JayHtmlValidatorFn = (ctx) => {
  const findings: JayHtmlValidationFinding[] = [];

  // ctx.body — parsed DOM tree (HTMLElement from node-html-parser)
  // ctx.head — parsed <head> metadata (title, meta tags, link tags)
  // ctx.filePath — relative path to the jay-html file
  // ctx.contract — page contract (if any), with tags including meta
  // ctx.headlessImports — headless components used in this file
  //   .providedHeadTags — head tags the component declares in plugin.yaml
  // ctx.projectRoot — absolute project root path

  return findings;
};
```

Each finding has:

- `severity` — `'error'` (fails validation) or `'warning'`
- `message` — what's wrong
- `suggestion` — how to fix it (shown to agents and developers)
- `element` — (optional) which element
- `attribute` — (optional) which attribute

### Validator Utilities

- **`parseTemplateParts(value)`** — split `"{url}/v1/fit/w_300/file.jpg"` into binding and static parts (import from `@jay-framework/compiler-jay-html`)
- **`walkElements(root, ctx, visitor)`** — depth-first traversal tracking data scope through `forEach` and `<jay:component>` boundaries (import from `@jay-framework/compiler-shared`)
- **`resolveBinding(path, scope)`** — resolve a binding path to its contract tag (including `meta`) (import from `@jay-framework/compiler-shared`)

### Contract Tag `meta`

Contract tags can carry a `meta` field — arbitrary key-value metadata that validators read:

```yaml
tags:
  - tag: imageUrl
    type: data
    dataType: string
    meta:
      vendor: wix-image
      defaultTransform: w_300,h_200,q_80
```

Validators use `resolveBinding` to find the tag and inspect `meta`:

```typescript
import { walkElements, resolveBinding } from '@jay-framework/compiler-shared';
import { parseTemplateParts } from '@jay-framework/compiler-jay-html';

export const validate: JayHtmlValidatorFn = (ctx) => {
  const findings: JayHtmlValidationFinding[] = [];

  walkElements(ctx.body, ctx, (el, scope) => {
    if (el.rawTagName !== 'img') return;
    const src = el.getAttribute('src');
    if (!src) return;

    for (const part of parseTemplateParts(src)) {
      if (part.kind !== 'binding') continue;
      const resolved = resolveBinding(part.value, scope);
      if (resolved.tag?.meta?.vendor !== 'wix-image') continue;

      findings.push({
        severity: 'warning',
        message: `Image binding {${part.value}} may need resize parameters`,
        suggestion: 'Add /v1/fit/w_{WIDTH},h_{HEIGHT},q_80/file.jpg after the binding',
      });
    }
  });

  return findings;
};
```
