# Design Log #145 — Pluggable Jay-HTML Validation

## Background

Wix media URLs (`https://static.wixstatic.com/media/HASH.jpg`) return full-size unoptimized images. Wix supports image resize and optimization by appending parameters like `/v1/fit/w_300,h_200,q_90/file.jpg`. However, the wix plugins cannot apply this because they don't know the target size — that information lives in the jay-html template (width/height from styles or attributes).

Similarly, accessibility rules (images must have `alt` attributes, inputs must have associated labels) need to be checked at the template level, not the plugin level.

Both use cases require validation that runs against parsed jay-html files, and both need to provide **agent-friendly feedback** explaining how to fix issues — since AI agents are the primary authors of jay-html templates.

## Problem

There is no mechanism for plugins to provide validation rules that run against jay-html files in consuming projects. The existing `jay-stack validate` command validates contracts, route params, ref types, headless instance props, and tag coverage — all built-in to the framework. Plugins have no extension point to add their own checks.

## Questions and Answers

### Q1: What data do validators need access to?

Validators operate on the already-parsed jay-html DOM tree (`HTMLElement` from node-html-parser). They need:

- The element tree (to walk and inspect elements, attributes, text)
- File path (for context in error messages)
- Headless imports (to know which plugins are used in this file)
- Page contract (to understand the data model)

They do **not** need to load external files, run compilation, or access runtime state.

### Q2: How are validator handlers loaded?

Since validators work purely on parsed jay-html data, they need no special TypeScript loader. Handlers are loaded via standard `import()`:

- **NPM plugins**: handler is pre-compiled JS in the package's dist
- **Local plugins**: handler is a relative path to the compiled JS file

### Q3: Should accessibility validation be built-in or pluggable?

Pluggable — implemented as a framework-provided plugin in `packages/plugins/`. Projects opt in by adding the plugin. This keeps the core validation focused on structural correctness and allows accessibility rules to evolve independently.

### Q4: Per-file or batch validation?

Per-file. Each validator receives one parsed jay-html file and returns findings for that file. This matches the existing validation pattern in `validateJayFiles()`. Cross-file validators can be added later if needed.

### Q5: How does the agent consume validation feedback?

Validation findings include a `suggestion` field with actionable, agent-friendly instructions. When `jay-stack validate` runs (either by the agent or in CI), findings are printed with their suggestions. The `--json` output mode already exists and will include suggestion text, making it easy for agents to parse and act on.

## Design

### 1. Validator Declaration in plugin.yaml

Plugins declare validators alongside contracts, actions, and services:

```yaml
name: wix-data
validators:
  - name: wix-media-optimization
    handler: ./validators/media-validator
    description: Ensures wix media URLs use resize parameters for performance
```

- `name`: kebab-case identifier for the validation rule
- `handler`: module path — relative path (local plugins) or export subpath (NPM plugins)
- `description`: human-readable purpose (shown in verbose output)

### 2. Type Definitions

New file `packages/compiler/compiler-shared/lib/plugin-validators.ts`:

```typescript
import type { HTMLElement } from 'node-html-parser';

export interface JayHtmlValidationContext {
  /** Parsed jay-html DOM tree root */
  body: HTMLElement;
  /** Relative file path (from project root) */
  filePath: string;
  /** Absolute project root path */
  projectRoot: string;
}

export interface JayHtmlValidationFinding {
  severity: 'error' | 'warning';
  /** Human-readable problem description */
  message: string;
  /** Agent-friendly instruction on how to fix the issue */
  suggestion: string;
  /** Element context (tag name or ref) */
  element?: string;
  /** Which attribute is problematic */
  attribute?: string;
}

/** Function signature for a validator handler module's default export */
export type JayHtmlValidatorFn = (context: JayHtmlValidationContext) => JayHtmlValidationFinding[];
```

### 3. PluginManifest Extension

Add to `PluginManifest` in `packages/compiler/compiler-shared/lib/plugin-resolution.ts`:

```typescript
/** Jay-HTML validation rules provided by this plugin (DL#145) */
validators?: Array<{
    /** Kebab-case rule name */
    name: string;
    /** Module path: relative (local) or export subpath (NPM) */
    handler: string;
    /** Human-readable description */
    description?: string;
}>;
```

### 4. Validation Flow

Extend `validateJayFiles()` in `packages/jay-stack/stack-cli/lib/validate.ts`:

```
validateJayFiles()
    ├── [existing] Parse and validate .jay-contract files
    ├── [existing] Parse and validate .jay-html files
    │   ├── Route param checks
    │   ├── Ref type checks
    │   ├── Headless instance props
    │   ├── Tag coverage
    │   └── Code generation test
    └── [new] Plugin validator phase
        ├── scanPlugins() to discover all plugins
        ├── Filter plugins with validators
        ├── Load validator handlers via import()
        └── For each already-parsed jay-html file:
            ├── Build JayHtmlValidationContext from the parsed file
            ├── Run each validator function
            └── Collect findings into errors[] and warnings[]
```

Key implementation detail: the jay-html files are **already parsed** by the core validation phase. The plugin validator phase reuses those parsed results — no re-parsing needed. We need to retain the parsed `JayHtmlSourceFile` objects from the core phase and pass them to validators.

### 5. Handler Module Contract

A validator handler module exports a `validate` function:

```typescript
// validators/media-validator.ts
import type { JayHtmlValidatorFn } from '@jay-framework/compiler-shared';

export const validate: JayHtmlValidatorFn = (ctx) => {
  const findings = [];
  // walk ctx.body, inspect elements, return findings
  return findings;
};
```

### 6. Output Format

Findings appear in the standard validation output, attributed to the plugin:

```
⚠ src/pages/products/[slug]/page.jay-html
  [wix-data/wix-media-optimization] Wix media image without resize parameters
      Suggestion: Add resize parameters to the wix media URL. Change the src
      from "https://static.wixstatic.com/media/HASH.jpg" to
      "https://static.wixstatic.com/media/HASH.jpg/v1/fit/w_{WIDTH},h_{HEIGHT},q_80/HASH.jpg"
      where WIDTH and HEIGHT match the element's rendered dimensions.
```

In `--json` mode, findings include `plugin`, `rule`, `message`, and `suggestion` fields.

### 7. Plugin Validator Schema Validation

Update `validateSchema()` in `packages/jay-stack/plugin-validator/lib/validate-plugin.ts` to validate the `validators` section:

- Each validator must have a `name` (kebab-case) and `handler` (non-empty string)
- Handler file must exist (for local plugins)

## Examples

### Wix Media Validator

```typescript
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';

const WIX_MEDIA_PATTERN = 'static.wixstatic.com/media/';

export const validate: JayHtmlValidatorFn = (ctx) => {
  const findings: JayHtmlValidationFinding[] = [];
  walkElements(ctx.body, (el) => {
    if (el.rawTagName !== 'img') return;
    const src = el.getAttribute('src');
    if (src && src.includes(WIX_MEDIA_PATTERN) && !src.includes('/v1/')) {
      findings.push({
        severity: 'warning',
        message: 'Wix media image without resize parameters — full-size image will be served',
        suggestion:
          'Add resize parameters to optimize image delivery. ' +
          'Change src from "https://static.wixstatic.com/media/HASH.jpg" to ' +
          '"https://static.wixstatic.com/media/HASH.jpg/v1/fit/w_{WIDTH},h_{HEIGHT},q_80/HASH.jpg" ' +
          "where WIDTH and HEIGHT match the rendered dimensions from the element's style. " +
          'For responsive images, add a srcset attribute with multiple sizes.',
        element: 'img',
        attribute: 'src',
      });
    }
  });
  return findings;
};

function walkElements(el: any, visitor: (el: any) => void): void {
  visitor(el);
  for (const child of el.childNodes ?? []) {
    if (child.nodeType === 1) walkElements(child, visitor);
  }
}
```

### Accessibility Validator (separate plugin)

```typescript
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';

export const validate: JayHtmlValidatorFn = (ctx) => {
  const findings: JayHtmlValidationFinding[] = [];
  walkElements(ctx.body, (el) => {
    const tag = el.rawTagName?.toLowerCase();

    // img must have alt
    if (tag === 'img' && !el.getAttribute('alt')) {
      findings.push({
        severity: 'warning',
        message: 'Image element missing alt attribute',
        suggestion:
          'Add an alt attribute to the <img> element. ' +
          'Use descriptive text for informative images, or alt="" for decorative images.',
        element: 'img',
        attribute: 'alt',
      });
    }

    // input must have associated label
    if (tag === 'input' && el.getAttribute('type') !== 'hidden') {
      const id = el.getAttribute('id');
      if (!id || !hasLabelFor(ctx.body, id)) {
        findings.push({
          severity: 'warning',
          message: 'Input element without associated label',
          suggestion:
            'Add a <label for="inputId"> element that references this input\'s id, ' +
            'or wrap the input in a <label> element.',
          element: 'input',
          attribute: 'id',
        });
      }
    }
  });
  return findings;
};
```

### Validation Output Examples

**Good** (validator finds no issues):

```html
<img
  src="https://static.wixstatic.com/media/abc123.jpg/v1/fit/w_300,h_200,q_80/abc123.jpg"
  alt="Product photo"
  style="width: 300px; height: 200px;"
/>
```

**Bad** (validator reports warning):

```html
<img src="https://static.wixstatic.com/media/abc123.jpg" style="width: 300px; height: 200px;" />
```

## Implementation Plan

### Phase 1: Contract tag `meta` and types

1. Add `meta?: Record<string, string>` to `ParsedYamlTag` and `ContractTag`
2. Pass `meta` through in `parseTag()` — no validation, opaque to framework
3. Create `packages/compiler/compiler-shared/lib/plugin-validators.ts` with `JayHtmlValidationContext`, `JayHtmlValidationFinding`, `JayHtmlValidatorFn`
4. Add `contract` and `headlessImports` to `JayHtmlValidationContext`
5. Export from `packages/compiler/compiler-shared/lib/index.ts`
6. Add `validators` to `PluginManifest` interface

### Phase 2: Validator utilities

1. Create `packages/compiler/compiler-shared/lib/validator-utils.ts`
2. Implement `parseTemplateParts` — wrap PEG `template` rule, return `TemplatePart[]` instead of generated code (add `templateParts` PEG rule or post-process existing AST)
3. Implement `DataScope` type and `resolveBinding` — walk contract tag tree by dot-separated path within a scope
4. Implement `walkElements` — depth-first traversal that builds `DataScope` at forEach/`<jay:*>` boundaries and passes it to visitor callback
5. Implement `resolveAttributeBindings` — convenience combining the above
6. Export from index
7. Unit tests: `parseTemplateParts` with nested braces/ternaries, `resolveBinding` through sub-contracts with `meta`, `walkElements` scope changes at forEach and headless boundaries

### Phase 3: Validation runner

1. Modify `validateJayFiles()` to retain parsed jay-html files after core validation
2. Add plugin scanning (import `scanPlugins` from `stack-server-runtime`)
3. Add validator handler loading and execution
4. Build `JayHtmlValidationContext` with contract and headless imports from parsed files
5. Merge findings into `ValidationResult`
6. Update output formatting to show plugin findings with suggestions

### Phase 4: Plugin validator schema

1. Update `validateSchema()` in `plugin-validator` to validate the `validators` section
2. Check handler file exists for local plugins

### Phase 5: Tests

1. Contract parser test: tag with `meta` parses and roundtrips correctly
2. Validator utils tests: `parseTemplateParts`, `resolveBindingTag` with nested sub-contracts and `meta`
3. Integration test: local plugin with validator, validate discovers and runs it
4. Test error handling (missing handler, handler throws, etc.)
5. Verify core validation unchanged

### 8. Contract Tag Metadata (`meta`)

Validators often need to know _what kind of data_ a binding represents beyond its dataType. A `string` tag could be a plain label, a URL, or a Wix image URL that requires a resize suffix. The validator needs this semantic context to produce useful findings.

Add an optional `meta` field to contract tags — a free-form key-value map that plugins define and validators consume:

```yaml
# In a wix-data plugin contract
name: ProductPage
tags:
  - tag: mediaGallery
    type: sub-contract
    tags:
      - tag: selectedMedia
        type: sub-contract
        tags:
          - tag: url
            type: data
            dataType: string
            meta:
              vendor: wix-image
              defaultTransform: w_300,h_200,q_80
          - tag: alt
            type: data
            dataType: string
  - tag: productName
    type: data
    dataType: string
```

#### Contract types

`ParsedYamlTag` gains:

```typescript
meta?: Record<string, string>;
```

`ContractTag` gains:

```typescript
/** Vendor/plugin metadata for validation. Opaque to the framework. */
meta?: Record<string, string>;
```

The `parseTag()` function passes `meta` through unchanged — the framework never interprets it, only validators do.

#### Validation context

`JayHtmlValidationContext` gains access to the parsed contract, so validators can look up tag metadata:

```typescript
export interface JayHtmlValidationContext {
  body: HTMLElement;
  filePath: string;
  projectRoot: string;
  /** Parsed contract for this page (undefined if no contract) */
  contract?: Contract;
  /** Headless plugin imports declared in this file */
  headlessImports: Array<{
    pluginName: string;
    contractName: string;
    contract: Contract;
  }>;
}
```

### 9. Validator Utilities

Walking the DOM, parsing bindings, and resolving tag types are common operations every validator needs. Providing utility functions prevents each plugin from reimplementing them (and getting them wrong).

#### Data context scoping problem

Inside a jay-html file, the data context changes at certain boundaries:

- **`forEach`**: children bind against the iteration item type, not the page ViewState
- **`<jay:component>`**: children bind against the headless component's contract, not the page's
- **Nested forEach/headless**: scopes stack — a forEach inside a `<jay:widget>` has the widget's contract as parent scope

A validator that naively resolves `{label}` against the page contract will get the wrong answer when the element is inside `<jay:test-widget>` where `label` comes from the widget's contract.

The compiler solves this with the `Variables` class — a linked chain of scopes built during tree traversal. Validators need the same capability, but without the code-generation machinery.

#### Design: element-anchored resolution

Instead of taking a binding path + contract, resolution takes a **binding path + the element it appears on**. The utility walks up the DOM from the element to reconstruct the data context:

1. Walk ancestors looking for `forEach=` attributes and `<jay:*>` tags
2. Each one pushes a scope onto the chain (forEach → array item type, jay:component → component contract)
3. Resolve the binding against the innermost matching scope

This means the framework pre-builds a `DataContext` for each element during the validation pass, or builds it lazily on demand by walking the ancestor chain.

#### Types

New file `packages/compiler/compiler-shared/lib/validator-utils.ts`:

```typescript
import type { HTMLElement } from 'node-html-parser';
import type { ContractTag, Contract } from './contract';

/** A parsed segment of an attribute or text value */
export interface TemplatePart {
  /** 'static' for literal text, 'binding' for {expression} */
  kind: 'static' | 'binding';
  /** The raw text: literal string for static, accessor path for binding */
  value: string;
}

/** Resolved binding with contract tag info and scope context */
export interface ResolvedBinding {
  /** Full accessor path as written in the template */
  path: string;
  /** The leaf tag from the contract, if resolved */
  tag?: ContractTag;
  /** Which contract the binding resolved against (page or headless component) */
  sourceContract?: Contract;
}

/**
 * Parse an attribute value or text content into static and binding parts.
 * Uses the existing PEG template rule — handles nested braces, ternaries,
 * and escaped characters correctly.
 *
 * Example: `"{mediaGallery.selectedMedia.url}/v1/fit/w_300/file.jpg"`
 * → [{ kind: 'binding', value: 'mediaGallery.selectedMedia.url' },
 *    { kind: 'static', value: '/v1/fit/w_300/file.jpg' }]
 */
export function parseTemplateParts(value: string): TemplatePart[];

/**
 * Resolve a binding path to its contract tag within a data scope.
 *
 * The scope is provided by walkElements — no need to reconstruct it.
 *
 * Example: resolveBinding("selectedMedia.url", scope)
 * Where scope was built by walkElements when entering <jay:product-page>,
 * resolves against the product-page contract.
 */
export function resolveBinding(bindingPath: string, scope: DataScope): ResolvedBinding;

/**
 * Walk all elements depth-first, tracking data context through
 * forEach and <jay:component> boundaries.
 *
 * The visitor receives both the element and its DataScope — the scope
 * is pre-built by walkElements as it traverses, so validators never
 * need to reconstruct it.
 */
export function walkElements(
  root: HTMLElement,
  ctx: JayHtmlValidationContext,
  visitor: (el: HTMLElement, scope: DataScope) => void,
): void;

/**
 * Find all bindings in an element's attribute value and resolve them
 * against the given data scope.
 */
export function resolveAttributeBindings(attrValue: string, scope: DataScope): ResolvedBinding[];
```

#### Data context reconstruction

When `resolveBinding` is called, it walks up the DOM from `element`:

```
<div>                                    ← page contract scope
  <jay:product-page>                     ← product-page contract scope
    <div forEach="mediaGallery.images">  ← iteration item scope (images[n])
      <img src="{url}" />                ← resolveBinding("url", img, ctx)
    </div>
  </jay:product-page>
</div>
```

Walk up from `<img>`:

1. Hit `forEach="mediaGallery.images"` → push scope: item type of `mediaGallery.images` array
2. Hit `<jay:product-page>` → push scope: product-page contract
3. Resolve `url` starting from innermost scope (the forEach item)
4. Find `url` tag on the array item sub-contract → return it with `meta`

`walkElements` builds the scope as it recurses, pushing/popping at boundaries:

```typescript
export interface DataScope {
  contract: Contract;
  /** Tags at this scope level */
  tags: ContractTag[];
  /** Parent scope (undefined at page root) */
  parent?: DataScope;
}

function doWalk(
  el: HTMLElement,
  ctx: JayHtmlValidationContext,
  scope: DataScope,
  visitor: (el: HTMLElement, scope: DataScope) => void,
): void {
  let currentScope = scope;

  // <jay:component-name> switches to that component's contract
  const headless = ctx.headlessImports.find((h) => `jay:${h.contractName}` === el.rawTagName);
  if (headless) {
    currentScope = {
      contract: headless.contract,
      tags: headless.contract.tags,
      parent: scope,
    };
  }

  // forEach="path" narrows to the array item type
  const forEach = el.getAttribute('forEach');
  if (forEach) {
    const arrayTag = resolveTagPath(forEach, currentScope.tags);
    if (arrayTag?.tags) {
      currentScope = {
        contract: currentScope.contract,
        tags: arrayTag.tags,
        parent: currentScope,
      };
    }
  }

  visitor(el, currentScope);

  for (const child of el.childNodes ?? []) {
    if (child.nodeType === 1) {
      doWalk(child as HTMLElement, ctx, currentScope, visitor);
    }
  }
}
```

No ancestor-walking needed per element — the scope is threaded through the recursion and arrives ready at each visitor call.

#### `parseTemplateParts` — reuse PEG parser

The existing PEG grammar (`expression-compiler.ts`) already parses template expressions correctly, handling nested braces, ternaries, and escaping. `parseTemplateParts` wraps the PEG `template` rule but returns structured parts instead of generated code:

```typescript
export function parseTemplateParts(value: string): TemplatePart[] {
  // Use the PEG template rule to get the parsed AST,
  // then extract static/binding segments from it.
  // Falls back to regex for values with no bindings (pure static).
  return parseParts(value, 'templateParts');
}
```

This requires adding a `templateParts` rule to the PEG grammar (or a post-parse extraction from the existing `template` rule's AST) that returns `TemplatePart[]` instead of generated JS code. The PEG grammar already distinguishes static text from `{expression}` — we just need a second output mode.

#### Usage in Wix media validator

With these utilities, the wix media validator becomes:

```typescript
import type { JayHtmlValidatorFn, JayHtmlValidationFinding } from '@jay-framework/compiler-shared';
import { walkElements, parseTemplateParts, resolveBinding } from '@jay-framework/compiler-shared';

export const validate: JayHtmlValidatorFn = (ctx) => {
  if (!ctx.contract) return [];
  const findings: JayHtmlValidationFinding[] = [];

  walkElements(ctx.body, ctx, (el, scope) => {
    if (el.rawTagName !== 'img') return;
    const src = el.getAttribute('src');
    if (!src) return;

    const parts = parseTemplateParts(src);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.kind !== 'binding') continue;

      const resolved = resolveBinding(part.value, scope);
      if (!resolved.tag?.meta?.vendor || resolved.tag.meta.vendor !== 'wix-image') continue;

      // Check if the next static part has the resize suffix
      const next = parts[i + 1];
      if (!next || next.kind !== 'static' || !next.value.includes('/v1/')) {
        const transform = resolved.tag.meta.defaultTransform || 'w_300,h_200,q_80';
        findings.push({
          severity: 'warning',
          message: `Wix image binding {${part.value}} missing resize suffix`,
          suggestion:
            `Add resize parameters after the binding. Change:\n` +
            `  src="{${part.value}}"\n` +
            `to:\n` +
            `  src="{${part.value}}/v1/fit/${transform}/file.jpg"`,
          element: 'img',
          attribute: 'src',
        });
      }
    }
  });

  return findings;
};
```

## Trade-offs

| Decision                                        | Benefit                                                                               | Cost                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Validators get parsed DOM, not raw HTML         | Consistent with existing validation, no re-parsing                                    | Validators depend on node-html-parser types       |
| Per-file validation only                        | Simple, matches existing pattern                                                      | No cross-file rules (can add later)               |
| Accessibility as plugin, not built-in           | Core stays focused, rules evolve independently                                        | Projects must opt in                              |
| Standard import() for handlers                  | No extra dependencies, works with compiled JS                                         | Local plugins must be compiled first              |
| `meta` on contract tags, not separate file      | Discoverable, co-located with data definition                                         | Couples contract format to vendor concerns        |
| Framework-provided validator utilities          | Consistent parsing, no reimplementation                                               | More API surface to maintain                      |
| `parseTemplateParts` reuses PEG grammar         | Handles edge cases (nested braces, ternaries, escaping)                               | Validators depend on compiler-jay-html PEG parser |
| `walkElements` provides `DataScope` in callback | Validators never reconstruct scope; forEach/headless boundaries handled automatically | Slightly larger callback signature                |

## Verification Criteria

1. A plugin with `validators` in its plugin.yaml can provide jay-html validation rules
2. `jay-stack validate` discovers and runs plugin validators after core validation
3. Findings include actionable `suggestion` text suitable for AI agent consumption
4. Core validation behavior is completely unchanged
5. `--json` output includes plugin validation findings
6. `plugin-validator` validates the `validators` section of plugin.yaml
7. Contract tags with `meta` parse correctly and are accessible via `ContractTag.meta`
8. `parseTemplateParts` correctly splits attribute values into static and binding parts
9. `resolveBindingTag` walks sub-contracts and returns the leaf tag with its `meta`
10. A validator can detect a wix-image binding missing a resize suffix using the utilities

## Implementation Results

### Post-implementation fixes (discovered via wix-media plugin)

Four issues were found when the wix-media plugin (an npm-published plugin) used the validation framework from a consuming project:

#### Fix 1: Validator handler loading for npm packages

**File:** `packages/jay-stack/stack-cli/lib/validate.ts`

The validator handler loading always treated `handler` as a file path relative to `pluginPath`. For npm packages, `handler` is an export name from the package's main module — matching the `loadHandler` pattern already used by setup/references in `stack-server-runtime`.

**Change:** Added `plugin.isLocal` branching: local plugins resolve handler as a file path; npm plugins import via `plugin.packageName` and look up the handler as a named export.

#### Fix 2: Validation context doesn't resolve `link:` sub-contracts

**File:** `packages/jay-stack/stack-cli/lib/validate.ts`

Contracts passed to validators had unresolved `link:` references — sub-contract tags with `link: ./media-gallery` had no `tags` array. Validators couldn't traverse through linked sub-contracts to reach nested tags and their `meta`.

**Change:** Added `resolveLinkedTags` / `resolveContractLinks` functions that recursively resolve all `link:` references inline before constructing the validation context. Uses `loadLinkedContract` and `getLinkedContractDir` from `compiler-jay-html`, with `JAY_IMPORT_RESOLVER`. Applied to both page-level contracts (via `parsed.contractRef`) and headless import contracts (via `imp.contractPath`).

#### Fix 3: `scanPlugins` missing `includeDevDeps`

**File:** `packages/jay-stack/stack-cli/lib/validate.ts`

Plugins listed in `devDependencies` were not discovered by the validate command. Validators are dev-time tools, so plugins providing only validators are typically devDependencies.

**Change:** Added `includeDevDeps: true` to the `scanPlugins({ projectRoot })` call.

#### Fix 4: `walkElements` doesn't resolve headless-keyed `forEach` paths

**File:** `packages/compiler/compiler-shared/lib/validator-utils.ts`

`walkElements` handled `forEach` by calling `resolveTagPath(forEach, currentScope.tags)`. When the forEach value was headless-keyed (e.g., `forEach="productSearch.searchResults"`), it tried to find `productSearch` in the current scope — which was empty when there was no page contract. The forEach scope was never entered, so bindings inside it were unresolvable.

**Change:** After `resolveTagPath` returns undefined, check if the first segment matches a headless import key. If so, resolve the remaining path against that import's contract. Added test case.

#### Additional: Validator output

Added `pluginValidators: string[]` to `ValidationResult` and display in the print output, so the user can see which validators were loaded and ran.
