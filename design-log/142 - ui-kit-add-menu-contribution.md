# Design Log #142 — ui-kit Add Menu contribution

## Status

**Done (U1–U3)** — 2026-06-02. Parent: [jay-aiditor #19](../../jay-aiditor/design-log/19%20-%20aiditor-add-menu.md). **Does not block** M19.1 (aiditor + wix-stores).

**Note:** ui-kit lives in **jay** monorepo (`packages/plugins/ui-kit`), not wix. **wix-media out of scope.**

> **Numbering:** **#142** avoids collision with jay **#134** (production build) and **#134a–d**.

## Release coordination

| Package                                                | M19.1 coupling                                |
| ------------------------------------------------------ | --------------------------------------------- |
| `@jay-framework/aiditor` + `@jay-framework/wix-stores` | Ship together for Add Menu smoke              |
| `@jay-framework/ui-kit`                                | Independent; after M19.1 scanner (aiditor A2) |

## Background

Design log **#132** introduced `@jay-framework/ui-kit` headless primitives. AIditor Add Menu (#19) lets users attach **prompt fragments** at request time. ui-kit has **no `setup` handler today** — must add one to write `agent-kit/aiditor/add-menu/ui-kit.yaml` per the AIditor agreement.

## Problem

1. ui-kit is invisible in Add Menu until a project yaml exists.
2. Designers cannot attach structured catalog items for scroll-carousel, popover-menu, etc.
3. Effect/skill-style items in #19 examples need a pattern: static items + optional skill markdown referenced from `prompt` (U4 defer).

## Design

### Output path (locked by aiditor #19)

```
<project>/agent-kit/aiditor/add-menu/ui-kit.yaml
```

### Items — M19.3 v1 (all static contracts)

| Contract          | `id`                     | `category` / `subCategory` |
| ----------------- | ------------------------ | -------------------------- |
| `popover-menu`    | `ui-kit:popover-menu`    | UI Kit / Components        |
| `scroll-carousel` | `ui-kit:scroll-carousel` | UI Kit / Components        |
| `clipboard-copy`  | `ui-kit:clipboard-copy`  | UI Kit / Components        |
| `word-split`      | `ui-kit:word-split`      | UI Kit / Typography        |
| `letter-split`    | `ui-kit:letter-split`    | UI Kit / Typography        |

No URL `params:` on typical ui-kit contracts → no Q8 route UI for these items.

### Setup handler (new)

Register `setupUiKit` in `plugin.yaml`; export from `lib/index.ts` for stack-cli (jay #87 pattern).

## Cross-repo test validation (locked)

ui-kit and aiditor are **separate packages**. **Do not** import `@jay-framework/aiditor` validator in ui-kit tests.

**Approach (same as wix #20 W2):**

1. Canonical shape: `jay-aiditor/packages/aiditor/test/fixtures/add-menu/valid-item.yaml` (committed in aiditor repo).
2. ui-kit tests: after setup, parse written `ui-kit.yaml` and assert each item has required keys (`id`, `title`, `category`, `prompt`) and **lacks** rejected keys (`kind`, `parameters`, `component`, `allowedScopes`) via inline checks or duplicated ~20-line helper in ui-kit test — **no cross-repo import**.

## Implementation plan

| ID  | Deliverable                                    | Priority |
| --- | ---------------------------------------------- | -------- |
| U1  | `setupUiKit` + plugin.yaml registration        | P0       |
| U2  | `add-menu.template.yaml` with 5 contract items | P0       |
| U3  | Tests (fixture compare, no aiditor import)     | P0       |
| U4  | Optional Effects / skills                      | P2       |

**Depends on:** aiditor #19 schema (A1 types/fixtures). **Recommended:** aiditor A3 for `agent-kit/plugin/aiditor-add-menu.md`. **Does not depend on** wix #20.

## Task index

### Task U1 — Setup handler

**Files:** `lib/setup.ts`, `plugin.yaml`, `lib/index.ts`

### Prompt

```
Add jay-stack setup handler for ui-kit (Design Log #142 U1).

Read: jay/design-log/142 - ui-kit-add-menu-contribution.md and jay-aiditor/design-log/19 - aiditor-add-menu.md.

In packages/plugins/ui-kit:
1. Create lib/setup.ts with setupUiKit(ctx: PluginSetupContext) — write ui-kit.yaml from template (U2), idempotent, ctx.force
2. Register setup in plugin.yaml (handler: setupUiKit)
3. Export setup from lib/index.ts for stack-cli discovery
4. Ensure build copies add-menu template to dist if setup resolves from package root

Do not require @jay-framework/aiditor in the project.
```

---

### Task U2 — Add Menu template

### Prompt

```
Create ui-kit Add Menu template (Design Log #142 U2).

packages/plugins/ui-kit/agent-kit/aiditor/add-menu.template.yaml — five items (popover-menu, scroll-carousel, clipboard-copy, word-split, letter-split).

Each item: id ui-kit:<contract>, packageName @jay-framework/ui-kit, pluginName ui-kit, complete prompt referencing agent-kit/designer guides.

No kind, parameters, component, or allowedScopes.

Wire setupUiKit to write <project>/agent-kit/aiditor/add-menu/ui-kit.yaml.
```

---

### Task U3 — Tests

**Acceptance:** Five items; required fields present; rejected fields absent — **without** importing aiditor package.

### Prompt

```
Add ui-kit Add Menu setup tests (Design Log #142 U3).

packages/plugins/ui-kit/test/setup-add-menu.test.ts:
- Temp project fixture; run setupUiKit
- Assert ui-kit.yaml exists with 5 items and expected ids
- Per item: assert id, title, category, prompt are non-empty strings
- Assert item objects do NOT have keys: kind, parameters, component, allowedScopes

Optional: compare normalized yaml structure to a committed expected fixture in packages/plugins/ui-kit/test/fixtures/add-menu/expected-ui-kit.yaml

Do NOT import @jay-framework/aiditor or jay-aiditor validator. No toContain on code files.

Run yarn vitest in ui-kit package.
```

---

### Task U4 — Optional Effects / skills (defer)

Defer until product requests M19.3 Effects parity with aiditor #19 `ui-kit:spring-card-hover` example.

## Verification

| #   | Check                                                                |
| --- | -------------------------------------------------------------------- |
| 1   | `jay-stack setup ui-kit` writes `ui-kit.yaml`                        |
| 2   | Five contract items; field checks per U3                             |
| 3   | Add Menu shows UI Kit after re-fetch (with aiditor)                  |
| 4   | Marker-scoped attachment → visual-prompt block (aiditor A8 + A10 #3) |
| 5   | No Q8 route UI for ui-kit-only attachments                           |

## Implementation Results (2026-06-02)

| Task | Status   | Notes                                                          |
| ---- | -------- | -------------------------------------------------------------- |
| U1   | Done     | `lib/setup.ts`, `setupUiKit` in `plugin.yaml` + `lib/index.ts` |
| U2   | Done     | `agent-kit/aiditor/add-menu.template.yaml` — 5 items           |
| U3   | Done     | `test/setup-add-menu.test.ts` — 4/4 passing; no aiditor import |
| U4   | Deferred | Effects/skills (P2)                                            |

### Smoke (with aiditor on jay-golf)

1. `jay-stack setup ui-kit` → `agent-kit/aiditor/add-menu/ui-kit.yaml`
2. `/aiditor` → Add Menu → **UI Kit** category shows 5 items

### Verify tests locally

From jay monorepo root (installs vitest into the ui-kit workspace):

```bash
cd jay && yarn install
cd packages/plugins/ui-kit && yarn test test/setup-add-menu.test.ts
```

Or scoped package confirm: `yarn workspace @jay-framework/ui-kit confirm`

## References

- jay **#132** (ui-kit primitives), jay-aiditor **#19**, jay **#87** (setup)
