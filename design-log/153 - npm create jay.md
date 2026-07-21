# Design Log #153 — npm create jay

## Background

Setting up a new Jay Stack project requires multiple manual steps: creating the directory structure, installing packages, writing boilerplate files, running `agent-kit`, and running `setup`. We want a single `npm create jay` command that scaffolds a working project with the user's choice of plugins.

### Related

- DL#86 — Jay Stack full workflow lifecycle
- DL#87 — Jay-stack setup command

## Design

### Command

```bash
npm create jay
# or
yarn create jay
# or
npx create-jay
```

### Interactive Flow

```
┌─────────────────────────────────────────┐
│  🐦 Create Jay Stack Project            │
└─────────────────────────────────────────┘

? Project name: my-store
? Select plugins to install:
  ◉ @jay-framework/ui-kit
  ◉ @jay-framework/a11y-validator
  ◉ @jay-framework/seo-validator
  ◉ @jay-framework/design-system-validator
  ◯ @jay-framework/wix-stores
  ◯ @jay-framework/wix-members
  ◯ @jay-framework/wix-media
  ◯ @jay-framework/wix-data
  ◯ @jay-framework/aiditor

Creating project in ./my-store...
  ✓ Created project structure
  ✓ Installed dependencies
  ✓ Generated agent-kit
  ✓ Plugin setup complete

┌─────────────────────────────────────────┐
│  🐦 Ready!                             │
│                                         │
│  cd my-store                            │
│  yarn dev                               │
└─────────────────────────────────────────┘
```

### Package: `create-jay`

Lives at `packages/jay-stack/create-jay`. Published as `create-jay` on npm (the `create-` prefix is what makes `npm create jay` work).

```
create-jay/
  lib/
    index.ts          # CLI entry point
    prompts.ts        # Interactive prompts (project name, plugin selection)
    scaffold.ts       # Create directory structure, write template files
    plugins.ts        # Plugin registry (available packages, descriptions, groups)
  templates/
    page.jay-html     # Minimal homepage template
    page.ts           # Minimal page component
    page.jay-contract # Minimal page contract
    styles.css        # Basic theme CSS
    .jay              # Project config
  package.json
  tsconfig.json
```

### Template Files

Minimal project scaffolded:

```
my-store/
  src/
    pages/
      page.jay-html
      page.ts
      page.jay-contract
    styles/
      theme.css
  .jay
  package.json
  tsconfig.json
```

The `page.jay-html` is a minimal but complete page:

```html
<html>
  <head>
    <title>My Store</title>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
    <link rel="stylesheet" href="../styles/theme.css" />
  </head>
  <body>
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
    </main>
  </body>
</html>
```

### Plugin Registry

The create command knows about available plugins from a built-in registry:

```typescript
interface PluginEntry {
  name: string; // npm package name
  label: string; // display name
  description: string; // one-line description
  group: string; // grouping: 'Jay Framework', 'Wix', 'AIditor'
  default: boolean; // pre-selected in the checkbox menu
}
```

Groups:

| Group         | Packages                                                       |
| ------------- | -------------------------------------------------------------- |
| Jay Framework | ui-kit, a11y-validator, seo-validator, design-system-validator |
| Wix           | wix-stores, wix-members, wix-media, wix-data                   |
| AIditor       | aiditor                                                        |

Jay Framework packages are pre-selected by default. Wix and AIditor are opt-in.

### Generated package.json

```json
{
  "name": "my-store",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "jay-stack dev",
    "build": "jay-stack build",
    "serve": "jay-stack serve",
    "validate": "jay-stack validate",
    "agent-kit": "jay-stack agent-kit",
    "setup": "jay-stack setup"
  },
  "dependencies": {
    "@jay-framework/fullstack-component": "^0.21.0",
    "@jay-framework/ui-kit": "^0.21.0"
  },
  "devDependencies": {
    "@jay-framework/jay-stack-cli": "^0.21.0",
    "@jay-framework/compiler-jay-stack": "^0.21.0",
    "@jay-framework/dev-environment": "^0.21.0",
    "@jay-framework/a11y-validator": "^0.21.0",
    "@jay-framework/seo-validator": "^0.21.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.11"
  }
}
```

### Package Manager Detection

Detect which package manager invoked the create command via `process.env.npm_config_user_agent`:

```
npm/10.2.4 node/v20.11.0 darwin arm64
yarn/4.12.0 node/v20.11.0 darwin arm64
```

Parse the first segment to determine `npm` vs `yarn`. All output commands (`install`, `dev`, `setup`) use the detected manager. Default to `npm` if undetectable.

### Post-Scaffold Steps

After creating files:

1. **Run install** — `yarn install` or `npm install` (based on detected package manager)
2. **Run `jay-stack agent-kit`** — generates materialized contracts, discovery indexes, role guides (static, no services needed)
3. **Run `jay-stack setup`** — creates config files, copies AIditor assets. May depend on agent-kit output (e.g., materialized contracts). If a plugin needs credentials that aren't configured, it reports `needs-config` — the user sees the message and can re-run `setup` later.
4. **Display banner** — just `cd` and `dev`

```
Creating project in ./my-store...
  ✓ Created project structure
  ✓ Installed dependencies
  ✓ Generated agent-kit
  ✓ Plugin setup complete

┌─────────────────────────────────────────┐
│  🐦 Ready!                              │
│                                         │
│  cd my-store                            │
│  yarn dev                               │
└─────────────────────────────────────────┘
```

### Interactive Prompts Library

Use `@inquirer/prompts` (lightweight, ESM-compatible) for:

- `input()` — project name
- `checkbox()` — plugin selection

### CLI Dependencies

```json
{
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.0.0"
  }
}
```

Minimal dependencies — the create package should install fast.

## Questions & Answers

**Q1:** Should `npm create jay` also copy the `jay-skill.md` file for AI agents?

**A1:** Yes. Copy to the project root. This is the file that teaches AI agents how to discover contracts and use the CLI.

**Q2:** Should we generate a DESIGN.md template if the design-system-validator is selected?

**A2:** Yes. Generate a starter DESIGN.md with placeholder tokens (colors, typography, spacing, rounded) at the project root.

**Q3:** Should the template include a vite.config.ts or rely on jay-stack-cli defaults?

**A3:** Include both `vite.config.ts` and `tsconfig.json` in the template. The project should be self-contained.

**Q4:** How do we handle version pinning? Should the create command pin to its own version, or use `^latest`?

**A4:** Use `latest` — always install the newest published versions.

## Implementation Plan

### Phase 1: Package scaffold

1. Create `packages/jay-stack/create-jay/` with package.json, tsconfig
2. Build as a single-file CLI with `#!/usr/bin/env node` shebang
3. Implement prompts (project name, plugin selection)
4. Implement template file generation
5. Implement package.json generation with selected plugins
6. Run `yarn install` / `npm install`
7. Run `jay-stack agent-kit`
8. Display banner

### Phase 2: Template polish

9. Refine the minimal template (better default content, theme CSS)
10. Add `jay-skill.md` copy
11. Add DESIGN.md template when design-system-validator is selected

### Phase 3: Testing

12. Test with `npx ./packages/jay-stack/create-jay`
13. Verify the scaffolded project runs with `yarn dev`

## Verification Criteria

1. `npm create jay` prompts for project name and plugins
2. Creates a valid project directory with all required files
3. `yarn install` succeeds in the created project
4. `yarn jay-stack agent-kit` runs without errors
5. Banner displays with correct next steps
6. `yarn jay-stack setup` runs after manual step
7. `yarn dev` starts the dev server and the page renders

---

## Implementation Results

### Dependency changes

- **Removed `@jay-framework/dev-environment`** from core devDeps — was an internal monorepo package. `tsconfig.json` is now self-contained with all compiler options inlined.
- **Removed `@jay-framework/runtime`, `@jay-framework/stack-client-runtime`, `@jay-framework/stack-server-runtime`, `@jay-framework/compiler-jay-stack`** from core — not needed as direct project dependencies.
- **Core dependencies** reduced to: `fullstack-component` + `jay-stack-cli`
- **Core devDependencies**: `aiditor`, `jay-cli`, `@types/node`, `rimraf`, `typescript`, `vite` — with pinned versions instead of `latest`
- **AIditor** moved from selectable plugin to always-installed devDependency

### Scripts updated

All scripts use `jay-stack-cli` (not `jay-stack`). Added `definitions`, `build:production`, `build:check-types`. Conditional `wix:deploy`, `wix:serve` (when wix-deploy selected), `aiditor:publish` (always, content varies by wix-deploy presence).

### CLAUDE.md generated

Every scaffolded project gets a `CLAUDE.md` pointing at the `/jay` skill and the agent-kit.

### Welcome page redesign

The default `page.jay-html` now features:

- Animated hero title using `@jay-framework/ui-kit` letter-split with CSS wave animation
- CTA button linking to `/aiditor`
- Three step cards (AIditor, coding agent, direct editing) with staggered fade-in

### Wix setup flow

When any `@jay-framework/wix-*` plugin is selected:

1. **API key prompt** — shown before `npm install`, with link to Wix API key management
2. **`npm create @wix/new@latest init`** — creates `wix.config.json` with `appId` and `siteId`
3. **`config/.wix.yaml` creation** — fills `apiKey` (from prompt), `siteId` (from wix.config.json), `clientId` (from `appId`)
4. **`.gitignore` update** — ensures credentials file is not committed
5. Agent-kit and setup run after Wix credentials are in place

### Plugin selector improvements

- `pageSize` uses terminal height so all plugins are visible without scrolling
- Group separator headings are disabled (can't be selected)

### Contract params parser fix

The contract parser now supports both object format (`params: { slug: string }`) and array format (`params: [{ name: slug, kind: required }]`). Array format is consistent with `props` and supports `kind` (required/optional/catch-all).

### Auth callback page for wix-members

When `@jay-framework/wix-members` is selected, the scaffolder generates `src/pages/auth/callback/page.jay-html` — a minimal auth callback page using the `auth-callback` headless contract. Shows "Signing you in..." during processing and an error message with homepage link on failure. Uses the project's `theme.css` custom properties.
