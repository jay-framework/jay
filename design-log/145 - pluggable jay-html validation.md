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
export type JayHtmlValidatorFn =
    (context: JayHtmlValidationContext) => JayHtmlValidationFinding[];
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
                    'where WIDTH and HEIGHT match the rendered dimensions from the element\'s style. ' +
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
<img src="https://static.wixstatic.com/media/abc123.jpg/v1/fit/w_300,h_200,q_80/abc123.jpg"
     alt="Product photo" style="width: 300px; height: 200px;" />
```

**Bad** (validator reports warning):
```html
<img src="https://static.wixstatic.com/media/abc123.jpg"
     style="width: 300px; height: 200px;" />
```

## Implementation Plan

### Phase 1: Types and Manifest
1. Create `packages/compiler/compiler-shared/lib/plugin-validators.ts` with type definitions
2. Export from `packages/compiler/compiler-shared/lib/index.ts`
3. Add `validators` to `PluginManifest` interface

### Phase 2: Validation Runner
1. Modify `validateJayFiles()` to retain parsed jay-html files after core validation
2. Add plugin scanning (import `scanPlugins` from `stack-server-runtime`)
3. Add validator handler loading and execution
4. Merge findings into `ValidationResult`
5. Update output formatting to show plugin findings with suggestions

### Phase 3: Plugin Validator Schema
1. Update `validateSchema()` in `plugin-validator` to validate the `validators` section
2. Check handler file exists for local plugins

### Phase 4: Tests
1. Create test fixture with a local plugin providing a validator
2. Test that validator findings appear in validation results
3. Test that core validation still works unchanged
4. Test error handling (missing handler, handler throws, etc.)

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Validators get parsed DOM, not raw HTML | Consistent with existing validation, no re-parsing | Validators depend on node-html-parser types |
| Per-file validation only | Simple, matches existing pattern | No cross-file rules (can add later) |
| Accessibility as plugin, not built-in | Core stays focused, rules evolve independently | Projects must opt in |
| Standard import() for handlers | No extra dependencies, works with compiled JS | Local plugins must be compiled first |

## Verification Criteria

1. A plugin with `validators` in its plugin.yaml can provide jay-html validation rules
2. `jay-stack validate` discovers and runs plugin validators after core validation
3. Findings include actionable `suggestion` text suitable for AI agent consumption
4. Core validation behavior is completely unchanged
5. `--json` output includes plugin validation findings
6. `plugin-validator` validates the `validators` section of plugin.yaml