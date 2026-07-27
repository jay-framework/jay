# DL#159 — Setup Pipeline Re-initialization

## Background

The `jay-stack-cli setup` command runs plugin setup handlers to configure credentials, create config files, and validate services. Plugins declare dependencies on each other — for example, `wix-stores`, `wix-data`, `wix-members`, and `wix-media` all depend on `wix-server-client` providing the `WixClientService`.

## Problem

On a freshly scaffolded project, `jay-stack-cli setup` fails in cascade:

1. **All plugin inits run upfront** before any setup handler executes. `wix-server-client` init fails because `config/.wix.yaml` doesn't exist yet. All dependent plugins also fail because `WixClientService` was never registered.

2. **No re-initialization between plugins.** Even in interactive mode, after `wix-server-client` setup successfully creates `.wix.yaml` and configures the API key, subsequent plugins still see stale `initError` because the service registry isn't refreshed.

3. **Noisy error output.** `[PluginInit] Failed to execute server init for "wix-stores"` logs unconditionally for every plugin, even though these failures are expected — setup's job is to fix them.

4. **Scaffolded `npm run setup` lacks `--interactive`.** The generated script runs `jay-stack-cli setup` without the flag, so users don't get prompted.

## Design

### Setup-first, then init per plugin

Currently the pipeline does two bulk phases: init all plugins, then setup all plugins. This is backwards — init reads config files that setup creates.

Instead, for each plugin in dependency order: setup first, then init:

```
for each plugin (dependency order):
  1. setup (create config, prompt for credentials)
  2. init  (read config, register services)
  3. → next plugin
```

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ wix-server-client           │     │ wix-stores                  │
│  setup → creates .wix.yaml  │     │  setup → creates config     │
│  init  → reads .wix.yaml    │────►│  (WixClientService exists)  │
│       → registers WixClient │     │  init  → registers stores   │
└─────────────────────────────┘     └─────────────────────────────┘
```

After `wix-server-client` setup creates `.wix.yaml` and init registers `WixClientService`, `wix-stores` setup finds the service available. No bulk clear/re-init needed — the service registry accumulates naturally.

If a plugin's setup returns `needs-config` or `error`, skip its init (it would fail anyway). Dependent plugins will also fail gracefully since the service they need was never registered.

### Suppress init error logging during setup

Add a `quiet` parameter to `executePluginServerInits()`. When `true`, init errors are captured in the returned Map but not logged. The setup pipeline handles error reporting itself.

### Fix scaffolded setup script

Change the generated `package.json` setup script from:

```
"setup": "jay-stack-cli setup"
```

to:

```
"setup": "jay-stack-cli setup --interactive"
```

## Implementation Plan

### Phase 1: Core changes

1. **`stack-server-runtime/lib/plugin-init-discovery.ts`** — add `quiet?: boolean` param to `executePluginServerInits`, skip `getLogger().error()` when quiet. Expose per-plugin init (or allow calling with a single-element array).
2. **`stack-cli/lib/run-setup.ts`** — replace bulk init + bulk setup with per-plugin loop: setup → (if configured, init) → next. No need for `cli-services.ts` `initializeServices` during setup — init each plugin inline after its setup succeeds.
3. **`create-jay/lib/scaffold.ts`** — setup script `--interactive`

### Phase 2: Verification

1. Fresh project with Wix plugins → `npm run setup` prompts interactively, plugins configure in cascade
2. No `[PluginInit] Failed to execute server init` noise during setup
3. `jay-stack-cli setup` (non-interactive) — `wix-server-client` returns `needs-config`, dependent plugins also return `needs-config` (not error)
4. After manual config, re-running `jay-stack-cli setup` configures all plugins

## Trade-offs

| Choice                               | Pro                                            | Con                                                                                                  |
| ------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Per-plugin setup+init                | Simple, no reset/re-init, natural accumulation | `run-setup.ts` takes over init responsibility from `cli-services.ts`                                 |
| Quiet init errors                    | Clean output during setup                      | Debugging harder if init fails for unexpected reasons; mitigated by `--verbose`                      |
| `--interactive` in scaffolded script | Users get prompted by default                  | Agents calling `npm run setup` get interactive mode; they should call `jay-stack-cli setup` directly |

## Implementation Results

### Changes made

1. **`stack-server-runtime/lib/plugin-init-discovery.ts`** — added `quiet: boolean = false` param to `executePluginServerInits()`. When quiet, init errors are captured in the Map but not logged.

2. **`stack-cli/lib/cli-services.ts`** — added `quiet: boolean = false` param to `initializeServicesForCli()`, threaded to `executePluginServerInits`.

3. **`stack-cli/lib/run-setup.ts`** — rewrote to per-plugin setup+init flow:

   - Removed bulk `initializeServices()` call
   - No longer depends on `cli-services.ts` for init — does it inline per plugin
   - After each plugin returns `configured`, runs its init quietly via `executePluginServerInits` with a single-element array
   - Project init (`src/init.ts`) runs once after all plugins
   - Signature simplified: removed `initializeServicesForCli` param

4. **`stack-cli/lib/cli.ts`** — updated `runSetup` call to match new signature (3 args instead of 4).

5. **`create-jay/lib/scaffold.ts`** — setup script changed to `jay-stack-cli setup --interactive`.

### Tests

- stack-cli: 113/113 passing
- stack-server-runtime: 152/152 passing
