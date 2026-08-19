# DL#168 — Font Fallback Metrics for CLS Prevention

## Background

When web fonts load asynchronously via `font-display: swap`, browsers render fallback system fonts first. Differences in vertical metrics (ascent/descent/line-gap) and horizontal metrics (character width) between the web font and fallback cause layout jumps — Flash of Unstyled Text (FOUT) and Cumulative Layout Shift (CLS).

The fix: generate a local fallback `@font-face` definition that overrides system font metrics to match the primary web font, so the swap is visually seamless.

```css
@font-face {
  font-family: 'Inter-Fallback';
  src: local('Arial');
  size-adjust: 98.41%;
  ascent-override: 92.51%;
  descent-override: 24.34%;
  line-gap-override: 0%;
}

body {
  font-family: 'Inter', 'Inter-Fallback', sans-serif;
}
```

### Observed on

Jay website: https://jay-websit-72a2c580-yoav68.wix-site-host.com/docs — visible layout shift when fonts load.

### Related

- DL#151 — Design system validator plugin (static CSS analysis)
- DL#146 — CSS performance fixes

## Problem

1. **Layout shift on font load** — content jumps when web font replaces the fallback, degrading CLS score
2. **No tooling** — designers and agents have no way to generate metric-matched fallback fonts
3. **No validation** — the framework doesn't detect missing fallback overrides

## Design

### Priority 1: Validation (design-system-validator)

Detect `font-family` declarations in CSS that reference a web font (loaded via `@font-face` with a URL `src`) without a corresponding metric-matched fallback `@font-face`.

**What to check:**

1. Scan all `@font-face` rules — collect font families loaded from URLs (not `local()`)
2. Scan all `font-family` declarations — find stacks that reference web fonts
3. For each web font used in a `font-family` stack, check if there's a companion `@font-face` with `src: local(...)` and metric overrides (`size-adjust`, `ascent-override`)
4. If no metric-matched fallback exists → warning with fix suggestion

**Validation message:**

```
Warning: font-family "Inter" loads from a URL but has no metric-matched fallback.
This causes layout shift (CLS) when the font loads.
Run `jay-stack font-fallback` to generate a fallback @font-face.
See: agent-kit/designer/font-fallback-patterns.md
```

### Priority 2: CLI tool (stack-cli)

A `jay-stack font-fallback` command that:

1. Scans the project's CSS for `@font-face` rules with URL sources
2. Downloads or reads the font file
3. Unpacks font metrics using `@capsizecss/unpack`
4. Calculates `size-adjust`, `ascent-override`, `descent-override`, `line-gap-override` against a system fallback (Arial for sans-serif, Times New Roman for serif)
5. Generates a CSS file with the fallback `@font-face` declarations
6. Outputs instructions for adding the fallback to the `font-family` stack

**Metric calculation:**

```typescript
import { fromUrl } from '@capsizecss/unpack';

const primary = await fromUrl('https://fonts.gstatic.com/.../Inter.woff2');
const fallback = await fromUrl('local-metrics/arial.json'); // pre-computed

const sizeAdjust = primary.capHeight / fallback.capHeight;
const ascentOverride = primary.ascent / (primary.unitsPerEm * sizeAdjust);
const descentOverride = Math.abs(primary.descent) / (primary.unitsPerEm * sizeAdjust);
const lineGapOverride = primary.lineGap / (primary.unitsPerEm * sizeAdjust);
```

**Alternative:** use `@capsizecss/core`'s `createFontStack()` which handles the calculation automatically.

### Priority 3: Agent-kit guide

Document in `designer/font-fallback-patterns.md` (design-system-validator agent-kit):

- Why font fallbacks matter (CLS, FOUT)
- How to use the CLI tool
- Manual pattern for custom fonts
- Common system font metrics for reference (Arial, Helvetica, Times New Roman, Georgia)

## Questions

1. ~~Should the fallback CSS be auto-injected at build time, or generated as a file the designer includes manually?~~ The fallback CSS is written by the designer agent (or defined in DESIGN.md). It's determined at code-writing time, not build time.

2. ~~Should the tool handle variable fonts and multiple weights?~~ Yes — particularly when DESIGN.md defines multiple weights. Each weight may have different metrics.

3. ~~Should the validation run during `jay-stack validate` or during CSS extraction at compile time?~~ Validate-time — follows the existing validation pattern.

4. ~~Which system fonts should be used as fallbacks?~~ The designer decides the fallback chain. The tool calculates metrics for whatever fallback font the designer specifies — it doesn't choose for them.

5. Should the validation also check DESIGN.md? If a design system file defines font families, the metric-matched fallbacks should be declared there as the source of truth. The validation checks both DESIGN.md (if present) and the page CSS.

6. Should the tool be a jay-stack CLI command or a plugin action? → Plugin action via `jay-stack run design-system/font-fallback`. This keeps the tool in the design-system-validator plugin (where font concerns belong) and uses the existing plugin action infrastructure instead of extending stack-cli directly.

## Implementation Plan

### Phase 1: Validation rule

**`packages/plugins/design-system-validator/lib/`**:

- Add `checkFontFallbacks` function
- Parse `@font-face` rules from the page's CSS
- Detect web fonts (URL `src`) without a companion metric-matched fallback (`src: local(...)` with `size-adjust`/`ascent-override`)
- If DESIGN.md exists and declares fonts, validate fallbacks are defined there
- Emit warning with suggestion pointing to the plugin action and agent-kit guide

### Phase 2: Plugin action

**`packages/plugins/design-system-validator/lib/actions/`**:

- Add `font-fallback` action (`.jay-action` file + implementation)
- Accepts: primary font name (e.g., "Inter"), fallback font name (e.g., "Arial")
- Uses `@capsizecss/metrics` for known Google/system fonts (zero network requests, pre-computed metric tables)
- Uses `@capsizecss/core`'s `createFontStack()` to calculate overrides automatically
- Falls back to `@capsizecss/unpack` only for custom `.woff2`/`.ttf` files not in the metrics database
- Outputs: the fallback `@font-face` CSS block ready to paste into DESIGN.md or page styles
- Run via: `jay-stack run design-system/font-fallback --primary "Inter" --fallback "Arial"`

### Phase 3: Agent-kit guide

**`packages/plugins/design-system-validator/agent-kit/designer/font-fallback-patterns.md`**:

- Why metric-matched fallbacks matter (CLS, FOUT)
- How to use the action: `jay-stack run design-system/font-fallback`
- Manual pattern for custom fonts
- Where to place the fallback CSS (DESIGN.md or page `<head>` styles)
- Example with common font pairs (Inter/Arial, Playfair Display/Georgia)

### Phase 4: Verify

- `yarn confirm` from monorepo root
- Test with jay-website fonts

## Trade-offs

| Choice | Pro | Con |
|--------|-----|-----|
| Validation + plugin action | Catches the problem, provides the fix, stays in plugin scope | Adds `@capsizecss/metrics` + `@capsizecss/core` dependencies |
| Extend stack-cli directly | Single entry point | Wrong scope — font concerns belong in design-system plugin |
| Auto-inject at build time | Zero-config | Opaque, designer loses control over fallback chain |
| Manual only (guide) | Simple, no tooling changes | Relies on developer knowing the pattern |
