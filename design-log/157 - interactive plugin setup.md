# Design Log #157 — Interactive Plugin Setup

## Background

`create-jay` (DL#153) currently hardcodes plugin-specific setup logic — Wix CLI login, API key prompts, `wix.config.json` parsing, credential file creation. This couples the scaffolder to specific plugins and doesn't scale as more plugins with setup requirements are added.

The `jay-stack-cli setup` command already exists (DL#87) and runs plugin setup handlers. But it's non-interactive — plugins can create config templates and report what's missing, but they can't prompt the user for input.

### Related

- DL#87 — Jay-stack setup command
- DL#153 — npm create jay

## Problem

Two problems:

1. **Plugin-specific logic in create-jay** — The scaffolder knows about Wix CLI login, API key prompts, `wix.config.json` structure. When a new plugin needs interactive setup (e.g., a CMS plugin asking for API credentials), create-jay would need more hardcoded logic.

2. **Setup command can't ask questions** — `jay-stack-cli setup` runs plugin handlers that create config files and validate credentials. But if credentials are missing, the handler can only report "config template created, fill in your values." It can't prompt the user interactively.

## Questions

**Q1: Should setup handlers be able to prompt the user?**

A1: Yes. The setup handler should receive an interactive context that provides prompt functions (input, confirm, select). When running in interactive mode, prompts work normally. In non-interactive mode (CI, scripts), prompts are skipped and the handler falls back to config templates.

**Q2: How should create-jay interact with setup?**

A2: `create-jay` should only scaffold files and install dependencies. After install, it runs `jay-stack-cli setup --interactive`. Each plugin's setup handler handles its own configuration — Wix login, API keys, etc. No plugin-specific code in create-jay.

**Q3: What about the Wix CLI login flow?**

A3: The `wix-server-client` plugin's setup handler would:
1. Check `npx @wix/cli whoami` — if not logged in, prompt to login
2. Run `npm create @wix/new@latest init` — connects to a Wix site
3. Read `wix.config.json` — extract `siteId` and `appId`
4. Prompt for API key (with link to Wix dashboard)
5. Write `config/.wix.yaml` with credentials
6. Update `.gitignore`

All of this currently lives in `create-jay/lib/index.ts` — it would move to the wix-server-client plugin.

**Q4: What about the auth callback page?**

A4: The `wix-members` plugin's setup handler would check if `src/pages/auth/callback/page.jay-html` exists and create it if missing. Currently create-jay does this.

## Design

### Interactive setup context

Extend `PluginSetupContext` with prompt functions:

```typescript
interface PluginSetupContext {
    projectRoot: string;
    configDir: string;
    interactive: boolean;
    prompt: {
        input(options: { message: string; validate?: (v: string) => boolean | string }): Promise<string>;
        confirm(options: { message: string; default?: boolean }): Promise<boolean>;
        select(options: { message: string; choices: Array<{ label: string; value: string }> }): Promise<string>;
    };
    run(cmd: string): void;
    log(message: string): void;
    warn(message: string): void;
}
```

When `interactive` is false, prompt functions:
- `input` → returns empty string (handler should check and skip)
- `confirm` → returns the default value
- `select` → returns the first choice

### Plugin setup handler signature

```typescript
export async function setupMyPlugin(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    // Check if already configured
    if (fs.existsSync(path.join(ctx.configDir, '.wix.yaml'))) {
        ctx.log('Wix credentials already configured');
        return { status: 'ok' };
    }

    if (!ctx.interactive) {
        ctx.warn('Run `jay-stack setup` interactively to configure Wix credentials');
        return { status: 'needs-config' };
    }

    // Interactive flow
    const apiKey = await ctx.prompt.input({ message: 'Wix API Key:' });
    // ... rest of setup
}
```

### CLI modes

```bash
jay-stack-cli setup                # Interactive (default)
jay-stack-cli setup --no-interactive  # Non-interactive (CI, scripts)
```

### create-jay changes

After scaffolding and installing:

```typescript
// Before: hardcoded Wix logic
if (hasWixPlugins) {
    await promptWixApiKey();
    await setupWix(projectDir, apiKey);
}
run('npx jay-stack-cli agent-kit', projectDir);
run('npx jay-stack-cli setup', projectDir);

// After: just run setup interactively
run('npx jay-stack-cli agent-kit', projectDir);
run('npx jay-stack-cli setup', projectDir);  // interactive by default
```

All plugin-specific logic moves to plugin setup handlers.

### No declaration needed in plugin.yaml

The setup handler receives `ctx.interactive` and decides at runtime whether to prompt or skip. No `interactive: true` flag in plugin.yaml — every handler gets the same context and can check `ctx.interactive` to decide its behavior.

## Implementation Plan

### Phase 1: Extend setup context

1. Add prompt functions to `PluginSetupContext`
2. Add `--no-interactive` flag to `jay-stack-cli setup`
3. Wire up `@inquirer/prompts` in the CLI for interactive mode
4. Provide no-op prompts for non-interactive mode

### Phase 2: Move Wix setup to plugin

1. Move Wix CLI login, API key prompt, credential file creation to `wix-server-client` setup handler
2. Move auth callback page creation to `wix-members` setup handler
3. Remove Wix-specific code from `create-jay`

### Phase 3: Simplify create-jay

1. Remove `promptWixApiKey`, `setupWix`, `hasWixPlugins` from create-jay
2. Just run `jay-stack-cli setup` after install (interactive by default)

## Trade-offs

| Approach | Pro | Con |
|---|---|---|
| Interactive setup in plugins (chosen) | Scales to any plugin, no scaffolder coupling | Requires framework change to setup context |
| Hardcoded in create-jay (current) | Works now, simple | Doesn't scale, couples scaffolder to plugins |
| Separate setup CLI per plugin | No framework change | Users run multiple commands |

## Verification Criteria

1. `jay-stack-cli setup` prompts for Wix credentials when wix-server-client is installed
2. `jay-stack-cli setup --no-interactive` creates config templates without prompting
3. `create-jay` has no plugin-specific logic — just scaffold + install + setup
4. Existing non-interactive setup handlers continue to work unchanged

---

## Implementation Results

### Phase 1: Framework changes (implemented)

**`stack-server-runtime/lib/plugin-setup.ts`:**
- Added `PluginSetupPrompt` interface with `input()`, `confirm()`, `select()` methods
- Added `interactive: boolean` and `prompt: PluginSetupPrompt` to `PluginSetupContext`
- Updated `executePluginSetup()` to accept and pass `interactive` and `prompt` in options

**`stack-cli/lib/setup-prompts.ts`** (new):
- `createInteractivePrompt()` — wraps `@inquirer/prompts` for real user input
- `createNonInteractivePrompt()` — returns empty string / defaults without prompting

**`stack-cli/lib/cli.ts`:**
- Added `--no-interactive` flag to `setup` command

**`stack-cli/lib/run-setup.ts`:**
- Reads `interactive` option (defaults to true)
- Creates appropriate prompt implementation
- Passes both to `executePluginSetup`

### Phase 3: create-jay simplified (implemented)

Removed all Wix-specific logic from create-jay:
- Removed `promptWixApiKey()`, `setupWix()`, `hasWixPlugins()` check
- Removed `@inquirer/prompts` and `fs` imports (no longer needed)
- Flow is now: scaffold → install → agent-kit → setup (interactive by default)
- File size reduced from 13.55KB to 9.96KB

Scaffolding concerns kept (these are project structure, not credentials):
- Auto-including `wix-server-client` dependency when Wix plugins selected
- Wix-specific npm scripts (`wix:deploy`, `wix:serve`)
- Auth callback page template for wix-members

### Phase 2: Move Wix setup to plugin (deferred)

Deferred to Wix DL#27. The framework infrastructure is ready — plugin handlers can now use `ctx.prompt.input()` etc. The actual Wix credential flow needs to move to the `wix-server-client` plugin's setup handler in the wix monorepo.

### Backward compatibility

Existing setup handlers (e.g., gemini-agent) continue to work unchanged. They receive `interactive` and `prompt` in their context but are not required to use them.
