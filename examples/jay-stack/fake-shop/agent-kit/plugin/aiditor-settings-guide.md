# AIditor Project Settings — Plugin Contributor Guide

**Audience:** Plugin authors and AI agents adding a **Project settings** tab to a Jay Stack plugin.

**Related guides:** [setup-guide.md](setup-guide.md) (agent-kit handler), [plugin-routes.md](plugin-routes.md) (`devOnly` routes), [add-menu-guide.md](add-menu-guide.md) (Add Menu — orthogonal surface). After `jay-stack setup aiditor`, see also `agent-kit/plugin/aiditor-add-menu.md` for AIditor runtime behavior (iframe, postMessage).

---

## What is Project settings?

AIditor **Project settings** shows one tab per **installed** plugin that has a materialized discovery file under `agent-kit/aiditor/settings/`. Each tab embeds the plugin's settings **route** in an iframe (`?_jay_embed=true`).

This is separate from:

| Surface              | Purpose                                          | Plugin output                                        |
| -------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| **Add Menu**         | Attach agent context to a change request         | `agent-kit/aiditor/add-menu/*.yaml`                  |
| **Project settings** | Configure the project; run backend ops from a UI | `agent-kit/aiditor/settings/*.yaml` + dev-only route |
| **Headless on page** | Site runtime                                     | contracts + components                               |

---

## Contributor checklist

Follow these steps in order. Skipping a step is the most common reason a tab never appears.

1. **Ship template in the npm package** at `agent-kit/aiditor/settings.template.yaml` (exact path — validated by `jay-stack validate-plugin`).
2. **List `agent-kit/` in `package.json` `files`** so the template is included in the published npm tarball and available under `node_modules` after install.
3. **Declare `agentkit` in `plugin.yaml`** and materialize the template in the agent-kit handler to `agent-kit/aiditor/settings/<plugin-name>.yaml` in the **project** root (not inside the package).
4. **Declare a matching route** in `plugin.yaml` `routes[]` with **`devOnly: true`** (settings UIs are dev-server tooling).
5. **Implement the settings page** — `lib/pages/settings/page.jay-html` + page component; use plugin **actions** or **jay-commands** for mutations (never arbitrary shell).
6. **Run `jay-stack agent-kit`** in the consuming project and confirm the YAML file exists.
7. **Run `jay-stack validate-plugin`** — fix errors; heed warnings for missing `devOnly` or route mismatch.

---

## Package layout

```
my-plugin/
├── agent-kit/
│   └── aiditor/
│       └── settings.template.yaml    # shipped in package — source for copy/generate
├── lib/
│   ├── aiditor/
│   │   └── write-settings-contribution.ts   # materialization helper
│   ├── pages/
│   │   └── settings/
│   │       ├── page.jay-html
│   │       └── page.ts
│   └── agentkit.ts                  # calls materialize + other agent-kit work
├── plugin.yaml
└── package.json                     # "files": [..., "agent-kit"]
```

**Materialized output (project only, gitignored or committed per team policy):**

```
<project-root>/agent-kit/aiditor/settings/my-plugin.yaml
```

Use `<plugin>.generated.yaml` only for fixture/dogfood plugins that intentionally differ from the shipped template name.

---

## Settings template schema

```yaml
# agent-kit/aiditor/settings.template.yaml
label: Media Manager # required — tab title in Project settings (text only in v1)
route: /my-plugin/settings # required — must match plugin.yaml routes[].path
pluginName: my-plugin # optional — defaults from output filename (my-plugin.yaml)
requires: # optional — tab blocked until dependency setup succeeds
  - plugin: wix-server-client
    status: configured # only "configured" is valid in v1
```

Validate locally with types from `@jay-framework/plugin-validator`:

```typescript
import { validateAiditorSettingsFile } from '@jay-framework/plugin-validator';
```

---

## plugin.yaml route

Settings pages are **[dev-only plugin routes](plugin-routes.md#dev-only-routes)**. They are served on the dev server, hidden from page-navigation pickers that filter `devOnly`, and loaded by AIditor via explicit route URL.

```yaml
name: my-plugin
agentkit: generateMyAgentKit

routes:
  - path: /my-plugin/settings
    jayHtml: ./lib/pages/settings/page.jay-html
    component: myPluginSettingsPage
    description: Project settings — configure my-plugin for this project
    devOnly: true
```

See [plugin-routes.md](plugin-routes.md) for route authoring, project override precedence, and standalone URL behavior.

---

## Materialize in the agent-kit handler

**Do not** write settings YAML in the `setup` handler. Settings discovery is regenerated on **`jay-stack agent-kit`**, same as Add Menu catalogs.

```typescript
import type {
  PluginAgentKitContext,
  PluginAgentKitResult,
} from '@jay-framework/stack-server-runtime';
import { materializeMyPluginAiditorSettings } from './aiditor/write-settings-contribution.js';

export async function generateMyAgentKit(
  ctx: PluginAgentKitContext,
): Promise<PluginAgentKitResult> {
  const created: string[] = [];

  const settingsPath = materializeMyPluginAiditorSettings(ctx.projectRoot, ctx.force);
  if (settingsPath) created.push(settingsPath);

  // ... add-menu, references, etc.

  return {
    agentKitCreated: created,
    message: created.length ? `Wrote ${created.join(', ')}` : 'Up to date',
  };
}
```

### Static copy vs generated YAML

| Case                              | Pattern                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fixed label + route               | Copy `settings.template.yaml` → `settings/<plugin>.yaml`                                               |
| Label/route depends on live data  | Build YAML object in handler; write with `yaml.stringify`                                              |
| Add Menu rebuild from settings UI | Write `add-menu/<plugin>.generated.yaml` only — never overwrite hand-authored `add-menu/<plugin>.yaml` |

---

## Resolving the packaged template path (required)

Agent-kit handlers run from **bundled** `dist/index.js` in published packages. A fixed `path.join(__dirname, '..')` hop count **breaks** when the module lives under `dist/` vs `lib/` (Vitest) vs nested bundles.

**Use a walk-up resolver** until `agent-kit/aiditor/settings.template.yaml` exists under a parent directory:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AIDITOR_SETTINGS_OUTPUT_REL = 'agent-kit/aiditor/settings/my-plugin.yaml';
const SETTINGS_TEMPLATE_REL = 'agent-kit/aiditor/settings.template.yaml';

/**
 * Resolve a file shipped inside the plugin package (agent-kit templates, etc.).
 * Works from dist/index.js (production) and lib/aiditor/*.ts (Vitest).
 */
export function resolvePackagedAgentKitPath(
  relativePath: string,
  moduleUrl: string = import.meta.url,
): string | null {
  let directory = path.dirname(fileURLToPath(moduleUrl));
  for (let depth = 0; depth < 4; depth++) {
    const candidate = path.join(directory, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

export function writeAiditorSettingsContribution(
  projectRoot: string,
  templatePath: string,
  force = false,
): string | null {
  const outputPath = path.join(projectRoot, AIDITOR_SETTINGS_OUTPUT_REL);
  if (fs.existsSync(outputPath) && !force) {
    return null;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(templatePath, outputPath);
  return AIDITOR_SETTINGS_OUTPUT_REL;
}

export function materializeMyPluginAiditorSettings(
  projectRoot: string,
  force = false,
): string | null {
  const templatePath = resolvePackagedAgentKitPath(SETTINGS_TEMPLATE_REL);
  if (!templatePath) {
    return null;
  }
  return writeAiditorSettingsContribution(projectRoot, templatePath, force);
}
```

### Common mistakes

| Mistake                                                                 | Symptom                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `path.join(dirname(import.meta.url), '..', '..')` from bundled code     | Walks to `node_modules/@jay-framework/` — template not found, **no settings YAML**                      |
| **No client bundle** (`index.client.ts` + `vite build` without `--ssr`) | Settings iframe SSR works; Vite errors on hydrate — `Failed to resolve import .../dist/index.client.js` |
| Writing YAML inside the package instead of `ctx.projectRoot`            | Tab missing in consumer project                                                                         |
| Route in template ≠ `plugin.yaml` `routes[].path`                       | `validate-plugin` warning `settings-route-missing`; iframe 404                                          |
| Missing `devOnly: true`                                                 | `settings-route-dev-only` warning; route may appear in page pickers                                     |
| Template present but no `agentkit` handler                              | `settings-missing-agentkit-handler` warning                                                             |
| `agent-kit/` not in `package.json` `files`                              | Template missing after `yarn add`                                                                       |

**Reference implementations:**

- `@jay-framework/design-system-validator` — `lib/aiditor/write-settings-contribution.ts` (walk-up resolver)
- `@jay-framework/wix-media` — same pattern (prefer walk-up over single `..` from `dist/`)

---

## Settings page responsibilities

The embedded settings route should:

1. **About / onboarding** — what the plugin does, which `config/` files matter, links to agent-kit docs.
2. **Run backend work** via plugin **actions** (`makeJayAction`) or **`jay-stack run <plugin>/<command>`** — not `child_process` shell.
3. **Write project-owned generated files only** — e.g. `agent-kit/aiditor/add-menu/<plugin>.generated.yaml`, reference data under `agent-kit/references/`.
4. **Never collect API keys or OAuth secrets** in settings forms — credentials belong in `setup` → `config/`.

### Notify AIditor when Add Menu catalog changes

After regenerating add-menu YAML from settings:

```typescript
window.parent.postMessage({ type: 'aiditor:addMenuCatalogChanged' }, window.location.origin);
```

### Optional — submit an agent task (explicit user click only)

```typescript
window.parent.postMessage(
  {
    type: 'aiditor:submitAgentTask',
    prompt: '…',
    context: { pageRoute: '/', renderedUrl: window.location.origin },
  },
  window.location.origin,
);
```

Full iframe and discovery behavior: `agent-kit/plugin/aiditor-add-menu.md` (installed by `jay-stack setup aiditor`).

---

## Validation (`jay-stack validate-plugin`)

When `agent-kit/aiditor/settings.template.yaml` exists, the validator:

- Parses schema (`label`, `route`, optional `requires`, `pluginName`)
- Warns if `route` is not in `plugin.yaml` `routes[]`
- Warns if matching route lacks `devOnly: true`
- Warns if template exists but `agentkit` is not declared

Fix all **errors** before publish; treat **warnings** as required for AIditor-facing plugins.

---

## Verification

In a project that depends on your plugin:

```bash
jay-stack agent-kit
ls agent-kit/aiditor/settings/my-plugin.yaml   # must exist
jay-stack validate-plugin /path/to/my-plugin     # or from package root
```

In AIditor: open **Project settings** — tab label matches `label`; iframe loads `route` with `?_jay_embed=true`. If `requires` is set, tab stays blocked until dependency `setup` reports `configured`.

**Dogfood fixture:** `jay-stack setup aiditor` on a starter project with the plugin-settings-fixture local plugin (see aiditor package examples).

---

## AI agent quick reference

When asked to "add Project settings for plugin X":

1. Read this file and `plugin-routes.md` (`devOnly`).
2. Add `agent-kit/aiditor/settings.template.yaml` + ensure `package.json` ships `agent-kit/`.
3. Add `lib/aiditor/write-settings-contribution.ts` with **`resolvePackagedAgentKitPath`** — do not hard-code `..` depth.
4. Wire materialization into existing `agentkit` handler; return path in `agentKitCreated`.
5. Add `routes[]` entry with `devOnly: true` and implement settings page.
6. Do **not** duplicate Add Menu schema here — use [add-menu-guide.md](add-menu-guide.md) for catalog items.
