# Watch Linked Style Files in Dev Server

## Background

When jay-html files reference external CSS files via `<link rel="stylesheet" href="...">`, the CSS content is extracted and inlined during compilation (see Design Log #44). However, the dev server currently only watches the jay-html file itself, not the referenced CSS files.

## Problem

If a developer modifies a linked CSS file (e.g., `styles/main.css`), the dev server doesn't detect the change and won't recompile the jay-html file. The developer must manually touch/save the jay-html file to trigger a rebuild.

**Example scenario:**

```html
<!-- page.jay-html -->
<link rel="stylesheet" href="styles/main.css" />
```

Editing `styles/main.css` → No rebuild triggered → Stale CSS served

## Questions and Answers

**Q1: Where does CSS extraction happen?**
A1: In `compiler-jay-html/lib/jay-target/jay-html-parser.ts`, the `extractCss` function reads linked CSS files from disk at lines 722-752.

**Q2: Where is the current watch registration?**
A2: In `rollup-plugin/lib/runtime/resolve-id.ts` line 78, only the jay-html file is watched via `watchChangesFor(context, resolvedBasePath)`.

**Q3: Do we have access to the plugin context during CSS extraction?**
A3: No. The `extractCss` function in the parser doesn't have access to Rollup/Vite's `PluginContext`. The context is available in the rollup-plugin layer but not passed down to the compiler.

**Q4: Should we watch CSS files that fail to load?**
A4: Yes - if the file doesn't exist now, it might be created later. Watching it would trigger a rebuild when created.

**Q5: Should external URLs be watched?**
A5: No - external URLs (http://, https://, //) cannot be watched and are already skipped during extraction.

## Design

### Option A: Return CSS file paths from parser, watch in plugin layer

Modify `extractCss` to return the list of resolved CSS file paths alongside the CSS content. The rollup plugin can then add these to the watch list.

```typescript
// In jay-html-parser.ts
interface ExtractCssResult {
  css: string | undefined;
  linkedCssFiles: string[]; // Resolved absolute paths
}

async function extractCss(
  root: HTMLElement,
  filePath: string,
): Promise<WithValidations<ExtractCssResult>>;
```

```typescript
// In rollup-plugin, after parsing
for (const cssFile of jayFile.linkedCssFiles) {
  watchChangesFor(context, cssFile);
}
```

**Pros:**

- Clean separation of concerns
- Parser remains context-agnostic
- Easy to test

**Cons:**

- Requires modifying `JayHtmlSourceFile` interface
- Need to pass linked files up through multiple layers

### Option B: Pass watch callback to parser

Pass a callback function to the parser that gets called for each file that should be watched.

**Pros:**

- Minimal interface changes

**Cons:**

- Mixes concerns (parser shouldn't know about watching)
- Harder to test

### Recommendation

**Option A** - cleaner architecture, follows existing patterns.

## Implementation Plan

### Phase 1: Extend parser to track linked CSS files

1. Add `linkedCssFiles: string[]` to `JayHtmlSourceFile` interface in `jay-html-source-file.ts`
2. Modify `extractCss` in `jay-html-parser.ts` to collect resolved CSS file paths
3. Store paths in the returned source file object
4. Update tests for `extractCss` to verify file paths are collected

### Phase 2: Add watch registration in rollup plugin

1. In `loadCssFile` (`rollup-plugin/lib/runtime/load.ts`), after parsing the jay-html file, iterate over `linkedCssFiles` and call `watchChangesFor` for each
2. Alternatively, add watching in the transform hook if that's where compilation happens

### Phase 3: Test HMR behavior

1. Manual test: modify a linked CSS file and verify rebuild triggers
2. Verify CSS changes appear in browser without manual refresh

## Files to Modify

- `jay/packages/compiler/compiler-jay-html/lib/jay-target/jay-html-source-file.ts`
- `jay/packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts`
- `jay/packages/compiler/rollup-plugin/lib/runtime/load.ts`
- `jay/packages/compiler/compiler-jay-html/test/css-extraction.test.ts`

## Trade-offs

| Aspect             | Current             | Proposed               |
| ------------------ | ------------------- | ---------------------- |
| DX for CSS changes | Must save jay-html  | Auto-rebuild           |
| Watch count        | 1 file per jay-html | 1 + N CSS files        |
| Complexity         | Simple              | Slightly more plumbing |

## Verification Criteria

1. Modifying a linked CSS file triggers jay-html recompilation
2. Creating a previously-missing CSS file triggers recompilation
3. External URLs are not watched (no errors)
4. Existing tests continue to pass
5. No performance regression for pages without linked CSS

---

## Implementation Results

### Changes Made

**1. `jay-html-source-file.ts`** - Added `linkedCssFiles?: string[]` property to track absolute paths of referenced CSS files.

**2. `jay-html-parser.ts`** - Modified `extractCss` function to:

- Return `ExtractCssResult` interface with both `css` and `linkedCssFiles`
- Collect resolved CSS file paths before attempting to read them (so missing files are still tracked)
- Updated `parseJayFile` to pass `linkedCssFiles` to the source file

**3. `rollup-plugin/lib/runtime/load.ts`** - Added watch registration:

- Import `watchChangesFor` function
- In `loadCssFile`, iterate over `linkedCssFiles` and register each for watching

**4. `css-extraction.test.ts`** - Added 4 new tests:

- Verify `linkedCssFiles` contains resolved paths
- Verify `linkedCssFiles` is undefined when no CSS linked
- Verify external URLs are excluded
- Verify missing files are tracked for watch

### Test Results

- compiler-jay-html: 406 passed, 4 skipped
- rollup-plugin: 47 passed

### Deviations from Design

None - implementation followed the design exactly.
