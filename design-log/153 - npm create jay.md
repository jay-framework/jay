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

┌─────────────────────────────────────────┐
│  Next steps:                            │
│                                         │
│  cd my-store                            │
│  yarn jay-stack setup                   │
│  yarn dev                               │
│                                         │
│  Setup configures plugin credentials    │
│  and generates reference data.          │
│  Run it before starting development.    │
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
    name: string;           // npm package name
    label: string;          // display name
    description: string;    // one-line description
    group: string;          // grouping: 'Jay Framework', 'Wix', 'AIditor'
    default: boolean;       // pre-selected in the checkbox menu
}
```

Groups:

| Group | Packages |
|-------|----------|
| Jay Framework | ui-kit, a11y-validator, seo-validator, design-system-validator |
| Wix | wix-stores, wix-members, wix-media, wix-data |
| AIditor | aiditor |

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

### Post-Scaffold Steps

After creating files and installing dependencies:

1. **Run `jay-stack agent-kit`** — generates materialized contracts, discovery indexes, role guides
2. **Display banner** — clear next-steps with `cd`, `yarn jay-stack setup`, `yarn dev`

Setup is NOT run automatically — it may require credentials, API keys, or interactive configuration. The banner tells the user to run it.

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

**Q2:** Should we generate a DESIGN.md template if the design-system-validator is selected?

**Q3:** Should the template include a vite.config.ts or rely on jay-stack-cli defaults?

**Q4:** How do we handle version pinning? Should the create command pin to its own version, or use `^latest`?

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
