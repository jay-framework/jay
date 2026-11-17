# 221 — Share plugin: share Jay resources through a dedicated git repo

**Status:** [Design] — product owner 2026-11-16 (no trust gate, thin Phase 1; Q11 closed; four-layer customization model; five manifest/hygiene `SHARE-*` checks in Phase 1a, all warnings; flag-only untrack; `SHARE_BRANCH_PROTECTED`; no automatic fetch); product owner 2026-11-17 (publish to an existing repo + branch, never create repos); approved by product owner 2026-11-17; implementation starting. No implementation yet.

## Decisions for the Implementer (TL;DR)

**Phase 1 (MVP engine)**

1. **New framework plugin `@jay-framework/share`** (plugin name `share`), an NPM plugin that ships `commands`, `actions`, an `agentkit` handler, and a **`share` plugin validator** (Phase 1a, before git flows), all from the `./tools` entry (DL #179). Every `actions:` entry is `devOnly: true`: NPM actions load from the main `.` entry unless `devOnly`, which loads `./tools` (✅ `stack-server-build/lib/action-discovery.ts:374-399`); the handler is `sourceModule[actionName]` (`:397-398`), so each `tools.ts` export name equals its action name. No runtime code; it never runs in the served site.
2. **Unit of sharing = one jay local plugin = one git repo.** The repo root *is* a local plugin (`plugin.yaml` at the root). A linked clone lives in `src/plugins/<folder>/`; local-plugin discovery (✅ `stack-server-runtime/lib/plugin-scanner.ts:82-105`) picks it up.
3. **One framework fix in Phase 1 (fixture first):** the design-system index and `plugins-index.yaml` write `manifest.name` as the plugin key (❌ `stack-server-build/lib/design-system-index.ts:215,222`, `contract-materializer.ts:387,399,628-629`), but `plugin="x"` resolves by folder; write the folder key for local plugins, so linked components resolve after `--as`. Everything else in Phase 1 is plugin code.
4. **Manifest = `share.yaml` at project root** (committed to the site repo): per entry `folder`, `repo`, `ref` (branch, default `main`), `commit` (pinned SHA). `commit` is the lock; `ref` is what `pull` tracks. `link`, `pull`, `push` and `publish` write `commit`; `restore` checks it out.
5. **Repo-inside-a-repo = `.gitignore` lines, not submodules.** A managed block (`# >>> jay share` … `# <<< jay share`) lists `/src/plugins/<folder>/` and `/.jay-share/`. Submodules are refused (`SHARE_SUBMODULE`).
6. **No trust gate (product owner confirmed).** A shared plugin gets the same trust as a teammate's commit or an installed NPM plugin. `link` clones and moves straight into `src/plugins/<folder>/`; the review point is the site PR that moves `commit` in `share.yaml`. `pull` lists changed code files in `incoming.codeFiles` as information only. Stricter isolation = package as NPM (documented in `share-guide.md`).
7. **GitHub only, plain `git` only.** Share never creates repos: the user gives an **existing** GitHub repo URL (`repo`, https or ssh) and optionally a `branch` (default `main`). Every operation is the `git` binary with the user's existing credentials, prompts disabled. No `gh`, no host API, no host interface; tests use a `GitRunner` seam with a local bare repo. Non-GitHub URL → `SHARE_INVALID_REPO`; publish to a branch that already has commits → `SHARE_BRANCH_NOT_EMPTY`.
7a. **Never create a remote repository:** no GitHub API, no `gh`, no repo-creation call. Pushing a new branch to the user-given repo is the only remote write; never force-push, never delete or rewrite other branches.
8. **Seven actions, seven commands** (`jay-stack run share/<cmd>`): `sharePublish`, `shareLink`, `sharePull`, `sharePush`, `shareStatus`, `shareRestore`, `shareUnlink` (prefixed because the registry overwrites duplicates silently, ✅ `stack-server-runtime/lib/action-registry.ts:124`). Each has a `.jay-command` and a `.jay-action` with the same input schema; both call one core function that returns `ShareReport` or throws `ShareError`. Commands read `CONSOLE_CONTEXT.projectRoot` (`run-command.ts:123`); actions use `process.cwd()`, the project root in both hosts (✅ `stack-cli/lib/cli.ts:233`, `stack-cli/lib/server.ts:37-41,59`). Programmatic callers use the actions (typed `ShareReport`); the CLI prints human text and exits `0`/`1`. All flags are named (`run-command.ts:195-226` ignores positionals).
9. **Phase 1 publish = an existing local plugin only:** `sharePublish { plugin, repo, branch?, untrack? }` (`branch` default `main`). The target branch must not exist on the remote (`git ls-remote <url> refs/heads/<branch>`); other branches and content in the repo are fine. The plugin is pushed as its own history (branch root = plugin folder); `share.yaml` records `ref: <branch>`. `shareLink { repo, ref?, as?, untrack? }` takes `ref` (branch) in Phase 1 so teammates can link that branch. No moving files out of the site, no reference rewriting (Phase 2).
10. **Conflicts:** `pull` is `git merge --ff-only`; `push` fetches and requires fast-forward. Divergence → `SHARE_DIVERGED` report (both SHAs, next step "rebase inside `src/plugins/<f>`, then `share/push`"). jay never merges, rebases or force-pushes. `push` refuses a dirty tree (`SHARE_DIRTY`). `share.yaml` is never written on a failed step.
11. **Safety essential for Phase 1:** `publish` always writes the plugin-repo `.gitignore` (denylist below) and aborts with `SHARE_SECRET_FOUND` if any staged path matches the denylist (catches force-added files); `push` applies the same path denylist to outgoing commits. The secret **content** scan is deferred (Later): the denylist covers the common leaks (`config/`, `.env*`, keys), and the site PR is the review point.
12. **Agent-kit guide in Phase 1:** `share-guide.md` plus framework guide edits: "build shareable design-system resources in a local plugin by default", token fallbacks in template `<style>`, divergence handling, reading `incoming.codeFiles`, NPM as the stricter path, and a "Choosing a sharing approach" section (below). Share never pulls on its own: updates are on demand only.
13. **CSS / theming (v1, Q11 closed):** shared tokens are `var(--<plugin>-x, <value>)` **fallbacks** inside each component template's `<style>` (✅ `materialise-context.ts:53-54`, `compiler-inline-composition/lib/materialise.ts:172-203`). The **site or page overrides look** by setting the same `--<plugin>-*` custom properties (e.g. in `DESIGN.md`, a layout wrapper, or page `<style>`) — fallbacks are defaults, not a locked global look. Fonts: guide step (`<link>` in the page head). Phase 1 documents this + the **four customization layers** (below). Token-prefix and font checks are Phase 2.
14. **Customization ladder (product + architect, 2026-11-16):** teach users/agents four layers — **(1) Theme** token overrides in the site/page; **(2) Variant** extra templates per contract + page `as=` imports (DL #205); **(3) Project skin** project-owned template, shared contract/logic when possible; **(4) Detach** full copy into the site, no automatic upstream sync (optional compare-with-upstream later). Prefer the highest layer that works; see § "Customizing a shared design system". Layers 3-4 are agent-guide only in the MVP (no tooling).
15. **`SHARE-*` validators (Phase 1a, implement first):** five manifest/hygiene checks only, all **warning** severity — they must **not** fail `jay-stack validate` exit code or block local dev/edit. No suppression keys and no new config in Phase 1a. `SHARE-TOKEN-PREFIX`, `SHARE-FONT-MISSING`, the `plugin.yaml` fonts field and suppression keys are Phase 2.
16. **`.jay-share/` is the only scratch folder** (tmp clones, backup), not `.jay/share/`: `.jay` is the project config file (✅ `stack-cli/lib/config.ts:61-70`). Nothing is ever deleted: failures and `unlink` move folders to `.jay-share/backup/`.
17. **Raw git inside a linked folder is supported**: it is an ordinary clone; `share/push` re-pins.
18. **Untrack is flag-only:** `--untrack` / `untrack: true` runs `git rm -r --cached` on files the site repo already tracks under the folder; without it → `SHARE_TRACKED`. No prompt.
19. **Protected branch:** a push rejected by branch protection → `SHARE_BRANCH_PROTECTED`, next step: push a branch with plain git and open a PR (the "team" approach).
20. **No automatic fetch:** share only touches the network when a command/action is called; `status` fetches only with `fetch: true`.

**Phase 1a (first slice):** `share` plugin validator — five manifest/hygiene `SHARE-*` checks, warning-only (DL #145).
**Phase 2:** tags as `ref`, `pull --commit <sha>`; publish from the site (`--name --components/--pages/--actions`, move + parser-based reference rewriter, components first, `--dry-run` plan, `--local-only`); `SHARE-TOKEN-PREFIX`, `SHARE-FONT-MISSING` + fonts field, suppression keys.
**Phase 3:** sharing plugin **pages**: the prod local-plugin routes framework fix (not needed while the MVP shares components).
**`SHARE-*` checks:** 5 manifest/hygiene warnings in Phase 1a; the rest in Phase 2 (supersedes the older history note).

**Later / optional:** secret content scan beyond the denylist; page-wide plugin CSS field (own framework DL).

## Background

Jay projects are increasingly built by coding agents. Teams want to reuse a design system (components, tokens, fonts), a page, or a set of actions across several sites, and edit them from any of those sites. Jay already has a self-contained, hot-reloading unit for this: the **local plugin** (`docs/core/plugins.md:134-158`). What is missing is a workflow to put one in its own repo and keep sites in sync.

## Problem

- No managed way to clone, update and contribute back to a shared plugin. A manual `git clone` into `src/plugins` gets committed into the site repo by accident, or drifts silently.
- Resources live in `src/components`, `src/pages`, `src/actions` of one site; nothing moves them into a portable unit or rewrites references (Phase 2).
- Agents have no discoverable surface (actions) or guide for this.

## Prior Art / Adjacent Mechanisms

| Mechanism | Where | Reuse |
|---|---|---|
| Local plugin discovery | ✅ `plugin-scanner.ts:82-105` (map key = folder, `name = manifest.name \|\| entry.name` at `:96-99`); `plugin-resolution.ts:232` resolves `plugin="x"` as `src/plugins/x` | Consumption side; basis of `--as`. |
| Plugin CLI commands | ✅ DL #142; `stack-cli/lib/run-command.ts` | Command surface. |
| Actions + `.jay-action` | DL #92/#95; `action-discovery.ts:198-210` | Agent surface. |
| `./tools` entry | DL #179; ✅ `plugins/agent-skills/package.json:14-19` | git code never enters the serve bundle. |
| Plugin validators | DL #145; ✅ `plugin-resolution.ts:112-117`; `plugin-validators.ts:25-56` | Phase 1a `SHARE-*` checks. |
| Project-level check via per-page hook | DL #216; ✅ `agent-skills/lib/validator.ts:1-21` | Memoize-per-`projectRoot` pattern (Phase 1a). |
| Region flattening carries template `<style>` | DL #196/#206; ✅ `materialise-context.ts:48-58`, `materialise.ts:172-203` | CSS/token transport. |
| Setup / agent-kit handlers | DL #87, #157, #159; `stack-server-build/lib/plugin-setup.ts` | `link`, `pull`, `restore` run setup. |
| Design-system index | DL #125, #204; `contract-materializer.ts:377-381,643-661` | Shared components show up for agents. |
| Plugin validator `--local` | `plugin-validator/lib/validate-plugin.ts:134-151` | `publish` runs it before pushing. |
| Plugin routes | DL #130; ✅ dev `dev-server.ts:112-150`; ❌ prod `packages/jay-stack/production-build/lib/builder/plugin-routes.ts:24` | Shared pages, Phase 3. |
| NPM plugin packaging | ✅ `agent-kit-template/plugin/plugin-structure.md`; `docs/core/plugins.md` | The documented stricter path. |

**Null hypothesis:** "just `git clone` + docs." Rejected: the pin, the ignore block, the denylist and (Phase 2) the move + rewrite are mechanical and error-prone for agents; commands and validations should own them.

### Verified capabilities of local plugins

| Capability | Status |
|---|---|
| Contracts / headless components | ✅ `plugin-scanner.ts:82-105`, `plugin-resolution.ts:232` |
| Actions | ✅ `action-discovery.ts:209-210`; `service-lifecycle.ts:163` |
| Commands | ✅ `plugin-commands.ts:58` (includes local) |
| Component CSS reaches the page | ✅ `materialise-context.ts:53-54`; `materialise.ts:172-203`. A `<link rel=stylesheet>` inside a template does **not** travel. |
| Setup / init handlers | ✅ `plugin-init-discovery.ts:33,139`; `plugin-setup.ts:118` `discoverPluginsWithSetup`, `:210` `executePluginSetup`, `SetupNeedsAnswerError` (`:56`). ⚠️ local setup not traced end-to-end, covered by a VC |
| Routes (dev) | ✅ `dev-server.ts:139-144` |
| Routes (production build) | ❌ `plugin-routes.ts:24` skips local plugins, and `server-code-build.ts:8-9` never compiles their `page.ts`. Phase 3. |
| Page-wide CSS (`:root`, `@font-face`) | ❌ no `PluginManifest` field (Q5). |

## Q&A

- **Q1 Name?** `@jay-framework/share`, plugin name `share`.
- **Q2 Why `.gitignore` and not submodules?** Submodules pin in the parent index and every collaborator and CI must run `git submodule update`; agents routinely break them. `share.yaml` + `restore` gives the same pin in a readable form.
- **Q3 (Phase 2) Which references does publish-from-site rewrite?** Parser-based, never regex; `--dry-run` lists every rewrite; any unsupported form stops publish before files move.

  | # | Source form (page in the site) | Target form after the move |
  |---|---|---|
  | R1 | `<script type="application/jay-headless" contract="../components/card/card.jay-contract" src="../components/card/card.ts" template="../components/card/card.jay-html" key="card">` | `<script type="application/jay-headless" plugin="brand-ds" contract="card" template="../plugins/brand-ds/components/card/card.jay-html" key="card">` |
  | R2 | `plugin="old" contract="card"` (re-homing) | `plugin="brand-ds" contract="card"`, `template=` re-pointed |
  | R3 | `import { addToCart } from '../actions/cart.actions'` | `import { addToCart } from '../plugins/brand-ds/lib/actions/cart.actions'` |
  | ✗ | Headfull `application/jay-headfull src=…` pointing at a moved file | **Unsupported** (`SHARE_UNSUPPORTED_REFERENCE`): headfull imports are file imports (✅ `jay-html-parser.ts:1310-1316`, DL #196). Convert to headless first. |

  Components first (R1/R2); R3 actions follow in the same phase. A moved component's contract, `.ts` and template variants move side by side into `src/plugins/<n>/components/<c>/`, and `plugin.yaml` gains `contracts: [{ name, contract, component }]` (DL #204). A template that links an external stylesheet stops publish.
- **Q4 Name clashes on link? What does `--as` do?** Local plugins resolve by **folder** (✅ `plugin-resolution.ts:232`, scanner key `plugin-scanner.ts:99`), so `--as alias` only sets the folder; the committed `plugin.yaml` is never edited. Commands are keyed by `manifest.name` (✅ `plugin-commands.ts:84`, `run-command.ts:67-71`) and actions by code-defined `actionName` with silent overwrite (✅ `action-registry.ts:112-125`), so two copies of one plugin cannot coexist: `link` refuses with `SHARE_NAME_CLASH` when a scanned plugin has the same `manifest.name`. `--as` is for a folder clash with a different plugin. The guide tells authors to prefix action names with the plugin name.
- **Q5 CSS** — see TL;DR #13. Rationale: only verified existing transport, zero framework change, self-contained components; **per-project / per-page theming** overrides fallbacks via the same `--<plugin>-*` variables. Cost: repeated fallback values in shared templates; fonts manual until page links them.
- **Q6 Versioning?** `commit` is always pinned; `ref` may be a tag. `pull` moves to `ref` HEAD. Phase 1: `link --ref <branch>` picks a branch (default `main`); Phase 2: tags as `ref` and `pull --commit <sha>` pins explicitly, and `<sha>` must be on `origin/<ref>` (else `SHARE_GIT_FAILED`, "commit <sha> is not on origin/<ref>"). No semver.
- **Q7 Divergence?** `push` and `pull` stop with `SHARE_DIVERGED`, `localSha`/`remoteSha`, and the next step: rebase onto `origin/<ref>` inside `src/plugins/<f>` (`git pull --rebase`), then `share/push`. Never force-push.
- **Q8 Dirty working copy?** `pull` and `push` refuse with `SHARE_DIRTY` and list the files; `status` surfaces it.
- **Q9 Offline / no auth?** No separate auth check: the first network step uses the user's git credentials with prompts disabled. No/rejected credentials or no access → `SHARE_NO_ACCESS`; network error → `SHARE_OFFLINE`. `status` works offline.
- **Q10 Which repo does publish push to?** An existing GitHub repo the user gives, on `branch` (default `main`). Share never creates repos. `git ls-remote <url> refs/heads/<branch>` showing the branch → `SHARE_BRANCH_NOT_EMPTY` (`files = []`, next step: pick another branch, or `share/link --repo <url> --ref <branch>` if it is already a shared plugin). Other branches are untouched. `shareLink` without `ref` clones `main` (decided: always `main`, not the remote's default branch); a ref with no `plugin.yaml` at its root → `SHARE_NOT_A_PLUGIN` (next step `--ref <branch>`).
- **Q11 CSS decision?** **Confirmed (product owner 2026-11-16):** v1 = prefixed `var(--<plugin>-x, fallback)` in shared template `<style>`; sites/pages **override tokens** for brand-specific look; customization ladder (TL;DR #14) covers variants, project skins, and detach. No page-wide plugin CSS field in v1 (Later DL).
- **Q12 Untracking previously committed folders? Closed (product owner 2026-11-16): flag-only.** If the site repo already tracks files under the target folder, `link`/`publish` run `git rm -r --cached` only with `--untrack` / `untrack: true`; otherwise `SHARE_TRACKED` (next step: rerun with `--untrack`). No prompt.
- **Q13 Trust model?** None beyond git and normal code review (confirmed by the product owner). A staging-dir trust gate was designed in rounds 1-9 and rejected: users are one in-house team, NPM plugins already run without review, and a large part of the design existed only to close gaps in the gate.
- **Q14 Duplicate-contract validation?** Rejected: publish moves files and rewrites references, so duplicates only come from manual copies, and same name is not evidence of duplication.

## Design

### Manifest — `share.yaml`

```yaml
plugins:
  - folder: brand-ds          # src/plugins/<folder>; equals manifest.name unless linked --as
    repo: https://github.com/acme/brand-ds.git
    ref: main
    commit: 3f9c2a1…           # pinned; written by publish/link/pull/push
```

### Errors and reports — one type

```ts
type ShareErrorCode =
  | 'SHARE_INVALID_REPO' | 'SHARE_BRANCH_NOT_EMPTY' | 'SHARE_NO_ACCESS' | 'SHARE_OFFLINE'
  | 'SHARE_DIRTY' | 'SHARE_DIVERGED' | 'SHARE_BRANCH_PROTECTED'
  | 'SHARE_SUBMODULE' | 'SHARE_TRACKED' | 'SHARE_NAME_CLASH' | 'SHARE_FOLDER_EXISTS'
  | 'SHARE_SECRET_FOUND' | 'SHARE_VALIDATE_FAILED'
  | 'SHARE_NOT_IN_MANIFEST' | 'SHARE_ALREADY_IN_MANIFEST' | 'SHARE_COMMIT_MISSING' | 'SHARE_GIT_FAILED'
  | 'SHARE_NOT_A_PLUGIN'
  | 'SHARE_UNSUPPORTED_REFERENCE'; // Phase 2

interface ShareReport {
  ok: boolean;
  code?: ShareErrorCode;          // set when ok === false
  message: string;
  files: string[];                // dirty / denylisted / failed-folder paths; [folder] for SHARE_ALREADY_IN_MANIFEST
  localSha?: string;              // always set for SHARE_DIVERGED
  remoteSha?: string;             // always set for SHARE_DIVERGED (fetched origin/<ref>)
  nextStep?: string;              // exact command to run next (human-facing)
  plugin?: PluginSummary;         // publish / link / pull
  plugins?: PluginStatus[];       // status / restore
  incoming?: { codeFiles: string[]; otherFiles: string[] }; // pull, pull dryRun; informational
  plan?: PublishPlan;             // Phase 2: publish dryRun
}
interface PluginSummary {
  name: string; folder: string; repo: string;
  sha: string; shortSha: string;
  contracts: string[]; actions: string[]; routes: string[];
  shadowedRoutes: string[];       // plugin routes hidden by project routes (dev-server.ts:121-127)
  hasServerCode: boolean;         // any file in the plugin matches the code-files set (same set as incoming.codeFiles)
  setup: SetupOutcome; setupMessage?: string;
  setupQuestion?: { key: string; type: string; message: string; choices?: { value: string; name: string }[] };
}
interface PluginStatus {
  folder: string; name?: string; present: boolean; dirtyFiles: string[];
  // ahead = commits in HEAD not in origin/<ref>; behind = the reverse; diverged = both > 0.
  // origin/<ref> is the last fetched remote-tracking ref (refreshed only with fetch: true).
  ahead: number; behind: number; diverged: boolean;
  headSha?: string; pinnedSha: string; headMatchesPin: boolean;
  fetched: boolean;
}
type SetupOutcome = 'none' | 'configured' | 'needs-config' | 'needs-answer' | 'error';
class ShareError extends Error { constructor(readonly report: ShareReport) { super(report.message); } }
```

**Programmatic surface = actions.** The 7 action names and input schemas are public API (renames are breaking). In-process callers use `actionRegistry.execute(name, input)` (✅ `action-registry.ts:201`), which returns `ActionExecutionResult<ShareReport>` (`:70-71`). A share failure is `success: true` with `data.ok === false`; `success: false` means the registry itself failed. The CLI prints human text and returns `{ success: report.ok }` → exit `0`/`1` (`run-command.ts:142-145`). **Rejected: `--json` + per-code exit codes**: the handler contract returns only `{ success }` (`plugin-commands.ts:185-193`), `process.exit` would skip Vite cleanup (`run-command.ts:152-155`), and plugin init logs share stdout (`:112`).

**No prompts, ever:** every git call runs with `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, and `GIT_SSH_COMMAND="<base> -o BatchMode=yes"` (base = caller's `GIT_SSH_COMMAND`, else `git config core.sshCommand`, else `ssh`, so user options survive). `lib/core/report.ts` maps `clone`/`fetch`/`push`/`ls-remote` stderr to `SHARE_NO_ACCESS` on (case-insensitive) `Permission denied (publickey`, `The requested URL returned error: 403`, `Repository not found`, `could not read Username`, `does not appear to be a git repository`, `Host key verification failed`. `push` stderr containing `GH006` or `protected branch` → `SHARE_BRANCH_PROTECTED` (checked before the no-access patterns; next step: push a branch with plain git and open a PR). Every push (publish and `push`): `[remote rejected]` without `GH006` (a hook or ruleset blocks it) → `SHARE_NO_ACCESS`. On publish's first push only: `! [rejected]` non-fast-forward / `(fetch first)` (the branch appeared after the `ls-remote` check) → `SHARE_BRANCH_NOT_EMPTY`, remote unchanged. A bare `Permission denied` (filesystem) stays `SHARE_GIT_FAILED`, as do other git failures.

**`SHARE_INVALID_REPO`:** `repo` must be `https://github.com/<owner>/<name>[.git]`, `git@github.com:<owner>/<name>[.git]` or `ssh://git@github.com/<owner>/<name>[.git]` (`[A-Za-z0-9._-]+`); checked before any git call, accepted forms in `message`. Tests reach local bare repos only through the `GitRunner` URL rewrite, never a user flag.

### Git runner

One `GitRunner` (`run(args, cwd) → {stdout}`) applies the no-prompt environment and classifies failures. `ls-remote`, clone, fetch, `merge --ff-only` and push cover every operation. Tests construct it with a URL rewrite (`https://github.com/acme/x.git` → a `git init --bare` temp repo).

### Flows (Phase 1)

- **link** `--repo <url> [--ref <branch>] [--as alias] [--untrack]`: validate URL; an entry with this `repo` already in `share.yaml` → `SHARE_ALREADY_IN_MANIFEST` with `files = [<folder>]` (the existing entry's folder, so callers never parse `nextStep`; next step `share/restore` if its folder is missing, else `share/pull --folder <f>`). Clone with `--branch <ref> --single-branch` (`ref` default `main`, never the remote default branch) into `.jay-share/tmp-<random>/` (the folder name is known only after reading `plugin.yaml`); the fetch refspec stays single-branch, so `pull`/`status --fetch` fetch only `<ref>`. No `plugin.yaml` at the clone root → `SHARE_NOT_A_PLUGIN` (next step `--ref <branch>`), clone moved to backup. Then checks: `SHARE_FOLDER_EXISTS` (next step `--as <other>`), `SHARE_SUBMODULE` (`.gitmodules` lists the path or `git ls-files -s` mode `160000`), `SHARE_TRACKED` unless `--untrack` (Q12), `SHARE_NAME_CLASH` (Q4). A failed check moves the tmp clone to `.jay-share/backup/`. Then move to `src/plugins/<folder>/`, write `share.yaml` (`ref`, `commit` = cloned `HEAD`) and the ignore block; if that write fails, move the folder back out to backup and return `SHARE_GIT_FAILED` (a folder never sits in `src/plugins/` without an entry and an ignore line). Then setup + agent-kit. Returns `plugin`.
- **restore**: for each entry missing on disk: tmp clone, `git cat-file -e <commit>^{commit}` (missing → `SHARE_COMMIT_MISSING` for that entry, clone to backup), `git checkout -B <ref> <commit>` with upstream `origin/<ref>` (not detached, so pull/push work), move, setup + agent-kit. Returns `plugins`; `ok` only if every entry ended linked, otherwise the failing code with `files` naming the failed folders. Never prompts (CI-safe).
- **pull** `[--folder f] [--commit sha (Phase 2)] [--dry-run]`: `SHARE_DIRTY` on a dirty folder; `git fetch`; `git merge --ff-only origin/<ref>` (or `<sha>`, Q6); non-FF → `SHARE_DIVERGED`. On success `commit` = new `HEAD`; `incoming` = `git diff --name-only <old>..<new>` split into code / other files; setup + agent-kit if `HEAD` moved. `--dry-run` fetches and returns `incoming` for `HEAD..origin/<ref>` (or `HEAD..<sha>`) plus both SHAs, changing nothing.
- **push** `[--folder f]`: `SHARE_DIRTY` if uncommitted changes; fetch; non-FF → `SHARE_DIVERGED` (report only); denylist check on `git diff --name-only origin/<ref>..HEAD` (hit → `SHARE_SECRET_FOUND`, nothing pushed); `git push origin <ref>`, stderr classified as above (`SHARE_BRANCH_PROTECTED` / `SHARE_NO_ACCESS`); `commit` = pushed SHA. `files` = outgoing paths.
- **status** `[--folder f] [--fetch]`: one `PluginStatus` per entry; offline by default, `--fetch` refreshes `origin/<ref>` first. Never reports `incoming`. Share never fetches on a timer; callers fetch only on explicit user action.
- **unlink** `--folder <f>`: remove the entry and ignore line; move the folder to `.jay-share/backup/<folder>-<timestamp>-<shortsha>/` (UTC `YYYYMMDDTHHmmssZ`, folder `HEAD`).
- **publish** `--plugin <folder> --repo <url> [--branch b] [--untrack]` (existing local plugin, existing repo, `branch` default `main`): validate URL; `git ls-remote <url> refs/heads/<branch>` (`SHARE_NO_ACCESS` / `SHARE_OFFLINE`) before touching anything; **resume check first:** if the plugin folder has `.git` with `origin` = `<url>` and the remote branch is at the folder's `HEAD` SHA → skip to the `share.yaml` step below; otherwise an existing branch → `SHARE_BRANCH_NOT_EMPTY`; `validate-plugin --local` (`SHARE_VALIDATE_FAILED`); write the plugin `.gitignore`; `git init -b <branch>` in the plugin folder (own history, branch root = plugin folder), `git add -A`, denylist check, first commit; `git remote add origin <url>`, `git push -u origin HEAD:refs/heads/<branch>` (never `--force`; no other branch touched); `share.yaml` entry (`ref: <branch>`) + ignore block + untrack (Q12). A failure before the push leaves the plugin as an ordinary local plugin (the new `.git` is moved to backup). **Resumable:** a failure after a successful push (e.g. the `share.yaml` write) keeps the plugin `.git`; the retry is caught by the resume check above, which runs before the branch-exists check, so publish skips init/commit/push and only writes the `share.yaml` entry + ignore block (idempotent).

**Code files (informational):** `*.ts`, `*.tsx`, `*.mts`, `*.cts`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs`, `plugin.yaml`, `agent-kit/**`. Nothing is blocked on them.

**Setup + agent-kit** (`lib/core/plugin-handlers.ts`), after the files are in `src/plugins/<folder>/`:
- Discover: `discoverPluginsWithSetup({ projectRoot })` (✅ `plugin-setup.ts:118`) filtered by `pluginPath === path.resolve(projectRoot, 'src/plugins', folder)`; same with `discoverPluginsWithAgentKit` (`:163`). No match → `none`.
- Execute: `executePluginSetup(plugin, { projectRoot, configDir, force: false, interactive: false, prompt, viteServer })` (✅ `:210-221`), `configDir` from `loadConfig().devServer?.configBase || './config'` (as `run-setup.ts:54-55`); then `executePluginAgentKit` (`:250-262`). `prompt` is the share plugin's own `createThrowingPrompt` (each method throws `SetupNeedsAnswerError`), since `stack-cli` is not a dependency.
- Loader: a local handler is a relative `.ts`, loadable only via `viteServer.ssrLoadModule` (✅ `plugin-setup.ts:296-302`); handlers get no Vite server (`plugin-commands.ts:192`), so the core starts its own `createViteForCli({ projectRoot })` (✅ `dev-server/lib/vite-factory.ts:156`) for this step only and closes it in `finally`. **Cost: one Vite start (~1 s) per link / pull-that-moved-HEAD / restore.** `@jay-framework/dev-server` is a `./tools` dependency only.
- Map: `PluginSetupResult.status` as is (`plugin-setup-types.ts:63`) with `setupMessage`; `SetupNeedsAnswerError` → `needs-answer` with `setupQuestion`. A setup failure does not roll back the move or the pin.

### Publish safety (Phase 1)

- **Plugin repo `.gitignore` (always written):** `.*` then `!.gitignore` (every hidden dot-file or dot-folder is ignored: `.env*`, `.DS_Store`, `.npmrc`, `.vscode/`, …; only `.gitignore` itself is kept), `config/`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `node_modules/`, `dist/`, `*.log`.
- **Denylist** = the `.gitignore` patterns above: any path segment starting with `.` (except a root `.gitignore`), plus `config/`, key files and `id_rsa*`.
- **Denylist enforcement:** on publish (staged paths after `git add -A`) and push (outgoing paths), any match aborts with `SHARE_SECRET_FOUND`, listing the files.
- **Later:** content scan (private-key headers, cloud/chat/API token patterns, `key/secret/token/password = '…'`).

### Design-system index for local plugins (Phase 1 framework fix)

`buildDesignSystemIndex` loops `for (const [, plugin] of plugins)` (`design-system-index.ts:215`) and emits `plugin: plugin.name` (`:222`, `:202`), which is `manifest.name` (`plugin-scanner.ts:96-99`), but `plugin="x"` resolves a local plugin by folder (`plugin-resolution.ts:232`). **Fix:** bind the key and, for `plugin.isLocal`, emit the folder key (`plugin-scanner.ts:99`); NPM keeps `plugin.name`. `plugins-index.yaml` has the same defect (`contract-materializer.ts:399,460,488,577,611` keyed by `plugin.name`, emitted at `:628-629`); same fix. Materialized output folders (`:510`) are unchanged.

### Phase 1a — `share` plugin validator (implement before git flows)

- **`share` plugin validator** (`validators: [{ name: share, handler: validate }]`, DL #145; memoized per `ctx.projectRoot`, DL #216; runner `stack-cli/lib/validate.ts:1747`, `jay-stack validate` only). Zero-page projects get no project findings (hook limitation; `share/status` covers it).
- **Product rule (2026-11-16):** every `SHARE-*` finding is **warning** severity. None of them may cause `jay-stack validate` to exit non-zero by themselves (local dev and AIditor follow-up must not be blocked). Teams may treat warnings as errors in CI later via a separate policy — out of scope for v1.
- Ship in the share package with a minimal `share.yaml` reader so manifest/hygiene checks work even before link/publish actions land. Phase 1a has five checks, no suppression keys, no new config.

  | Check (Phase 1a) | Severity |
  |---|---|
  | `SHARE-MANIFEST-MISSING-FOLDER` (run `share/restore`) | warning |
  | `SHARE-FOLDER-NOT-IN-MANIFEST` | warning |
  | `SHARE-NOT-IGNORED` (not ignored, or tracked by the site repo) | warning |
  | `SHARE-COMMIT-MISMATCH` (HEAD ≠ `commit`) | warning |
  | `SHARE-DIRTY` | warning |

  **Phase 2:** `SHARE-TOKEN-PREFIX` (custom properties in shared template CSS must start `--<folder>-` or `--<manifest.name>-`), `SHARE-FONT-MISSING` (needs a new `plugin.yaml` fonts field; unknown keys tolerated, `plugin-resolution.ts:174-186`), and `ctx.validationOverrides?.share` suppression keys (as `a11y-validator.ts:16`).

### Customizing a shared design system (four layers)

Users and agents pick the **highest layer that solves the job** — only go lower when necessary.

| Layer | User-facing name | What changes | Upstream `share/pull` |
|---|---|---|---|
| 1 | **Adjust brand (theme)** | Site/page sets `--<plugin>-*` custom properties; shared templates keep fallbacks | Updates shared components; theme stays in the site |
| 2 | **Use another variant** | Second (or more) `.jay-html` per contract; page imports with `as=` (DL #205); contract variants for runtime modes | New shared templates arrive on pull; pages keep their import choice |
| 3 | **Custom look for this site (project skin)** | Project-owned template (and minimal glue) under `src/components/` or `src/plugins/<site>-ds/`, still using shared contract/`.ts` when possible | Pull updates shared logic/contracts; re-check skins |
| 4 | **Detach** | Full component tree copied to the site; references stop using `plugin="<shared>"` for that contract | **No automatic sync** — explicit opt-out; optional future "compare with upstream" (agent/UI), not silent merge |

**Agent-kit (`share-guide.md` + framework `design-system-guide.md`):** one section **"Customizing a shared design system"** with this table, examples for theme + `as=` variant, project-skin layout, and detach confirmation copy ("Updates from the shared design system will no longer apply to this component."). Discourage ad-hoc region CSS on shared imports as the primary customization path — point to variant or project skin (aligns with REGION-OVERRIDE remedies, DL #200).

### Phase 2 — publish from site

- **publish** gains `--name <n> [--components a,b] [--pages /x] [--actions f] [--dry-run] [--local-only]`: plan (moves + Q3 rewrites; stop on unsupported) → move into `src/plugins/<n>/` and generate `plugin.yaml` → rewrite → `jay-stack validate` + `validate-plugin --local` → then the Phase 1 publish path. `--dry-run` returns `plan` with no network call (`repo` still URL-validated if given). `--local-only` stops after move + rewrite + validate (no git, no entry; migrate to a local plugin now, share later with `--plugin`). Failure before the push rolls back the moves from `.jay-share/backup/<folder>-<timestamp>-<shortsha>/`. Pages can be moved but only render in prod after Phase 3.
- `PublishPlan = { moves: {from,to}[]; rewrites: {file; changes: {before; after}[]}[]; unsupported: {file; reason}[]; generatedPluginYaml: string }`.

### Phase 3 — sharing plugin pages (prod local-plugin routes fix, traced)

- Today `scanPluginRoutes` (`plugin-routes.ts:14-63`, called at `build-pipeline.ts:281`) skips local plugins (`:24`). **Fix:** drop the skip; for a local plugin with a relative `component` (dev rule `dev-server.ts:141`), `compPath = path.resolve(plugin.pluginPath, route.component)`, `componentExport = undefined`, and `jayHtml` resolved directly with `path.resolve(plugin.pluginPath, route.jayHtml)` (avoids a stale `dist/` winning in `resolvePluginExport`, `:85-92`).
- **Server:** that route takes the project-page branch (`build-pipeline.ts:298-307` → `server/plugins/<f>/pages/x/page.js`), but `page.ts` is never compiled under `src/plugins/` (`server-code-build.ts:8-9`). `discoverServerEntries` (`:54`) calls `scanPluginRoutes` after `scanRoutes` and adds `pages[entryName] = route.compPath` (entry rule as `:69-74`); it returns them as an additive `pluginRoutes` field (exported, `production-build/lib/index.ts:17`), reused at `:281`.
- **Client:** `build-pipeline.ts:516-523` already uses `exportName = 'page'` when `componentExport` is undefined; the route must export `page`.

### Agent-kit (Phase 1)

- `agent-kit/share-guide.md`: when to share, the 7 flows, reading `status`, divergence handling, mentioning `incoming.codeFiles` in the site PR, token-fallback and font-link rules, never committing secrets and never putting credentials in plugin files (no API keys, tokens or passwords in any file; read them from site config or env at run time), never committing hidden dot-files (Phase 1 mitigation for the deferred content scan), actions vs CLI, `.jay-share/` ownership, prefixing action names. Section "When git sharing is not enough": choose NPM for outside authors, immutable releases or a private registry; convert to the Standalone NPM Package layout, publish, install pinned, `share/unlink`, update `plugin="<folder>"` references to the package name; link to `plugin/plugin-structure.md` by its path in the generated project `agent-kit/`.
- `share-guide.md` section **"Choosing a sharing approach"** (agents act as the user's consultant). Start with **simple** and ask as few questions as possible; describe the others only when the user's needs or complaints call for them:
  1. **Simple (default):** one in-house team, everyone with git access pushes to `main` via `share/push`.
  2. **Team / agency:** GitHub permissions and branch protection on the plugin repo; changes go through branches + PRs. `share/push` to a protected `main` fails (`SHARE_BRANCH_PROTECTED`); the agent then pushes a branch with plain git and opens a PR, and sites `share/pull` after merge.
  3. **Advanced:** package as NPM (the section above) for outside authors, immutable releases or a private registry.
  Also: updates are on demand (the user or the agent runs `share/pull`, or a teammate does it in a site branch/PR), never automatic. When publishing, ask the user for an existing GitHub repo URL and an optional branch (default `main`). Agents never create GitHub repositories; ask the user for an existing repo URL and optional branch. Agents may proactively offer to move existing site components into a local plugin when the user wants to share or reuse them.
- Framework guide edits (`agent-kit-template/designer/design-system-guide.md`, `developer/project-structure.md`): "build shareable design-system resources in a local plugin by default; keep component CSS inline in the template `<style>` with `var(--<plugin>-x, value)` tokens; override look per site/page by setting those variables; use variants (`as=`) before forking templates."
- Section **"Customizing a shared design system"** (four layers table above).

## Implementation Plan

- **Phase 1a — validators (product priority, before git flows)**
  1. Scaffold `packages/plugins/share/` validator entry in `plugin.yaml` + `lib/validators/share.ts` (or `lib/tools.ts` export wired per DL #145).
  2. Implement the five manifest/hygiene `SHARE-*` checks; **fixture red first** per code; assert severity **warning** and validate exit `0` when only share warnings present.
  3. Agent-kit (Phase 1a owns): `share-guide.md` and `design-system-guide.md` sections "Customizing a shared design system" (four layers) and the Q11 token-override sentence.
- **Phase 1 — MVP engine**
  1. Framework fix (fixture first): a local plugin in folder `ds2` with `manifest.name: brand-ds` yields `plugin: ds2` in `design-system-index.yaml` and `name: ds2` in `plugins-index.yaml`.
  2. Package `packages/plugins/share/` (modelled on `plugins/agent-skills`): exports `"."` (empty), `"./tools"`, `"./plugin.yaml"`, each `.jay-command`; `plugin.yaml` with 7 `commands:` and 7 `actions:` (`{ name: share<Cmd>, action: <cmd>.jay-action, devOnly: true }`) and the `agentkit` handler; `lib/tools.ts` exports handlers under their exact action names; deps `@jay-framework/stack-server-build`, `@jay-framework/dev-server`. Core in `lib/core/`: `manifest.ts`, `gitignore-block.ts`, `git-runner.ts`, `repo-url.ts`, `report.ts`, `denylist.ts`, `plugin-handlers.ts`, one file per flow.
  3. Input schemas (same for `.jay-command` and `.jay-action`; output always `ShareReport`; Phase 2 fields are not in the Phase 1 schemas at all and are added in Phase 2: tag values for `ref`, `sharePull.commit`, and the publish-from-site inputs):
     - `sharePublish { plugin: string, repo: string, branch?: string, untrack?: boolean }` → `plugin` (`branch` default `main`)
     - `shareLink { repo: string, ref?: string, as?: string, untrack?: boolean }` → `plugin` (`ref` = branch, default `main`)
     - `sharePull { folder?: string, dryRun?: boolean }` → `incoming`, `localSha`/`remoteSha`, `plugin` unless dryRun
     - `sharePush { folder?: string }` → `localSha`/`remoteSha`, `files` = outgoing paths
     - `shareStatus { folder?: string, fetch?: boolean }` → `plugins`
     - `shareRestore {}` → `plugins`
     - `shareUnlink { folder: string }` → `files` = `[backup path]`
  4. Agent-kit (Phase 1 owns): the rest of `share-guide.md` (flows, status, divergence, protected branch, "Choosing a sharing approach", NPM section) and the "local plugin by default" framework edits.
  5. Tests: `GitRunner` URL rewrite + local bare repo, no network; a failing test first per flow, per Phase 1 error code; action tests assert `ShareReport`, CLI tests assert exit `0`/`1`.
  6. Demo: two example projects share a component plugin through a hand-created existing GitHub repo on a new branch (https and ssh).
- **Phase 2** — `SHARE-TOKEN-PREFIX`, `SHARE-FONT-MISSING` + fonts field, suppression keys; tags as `link --ref` and `pull --commit <sha>` (Q6); publish-from-site planner + parser-based rewriter (R1/R2 components first, then R3), `--dry-run` plan, `--local-only`, rollback.
- **Phase 3** — prod local-plugin routes fix (fixture first: build emits `server/plugins/<f>/pages/x/page.js` and the route hydrates), then sharing plugin pages end to end incl. a prod build.
- **Later / optional** — secret content scan; page-wide plugin CSS field (own framework DL).

## Examples

```bash
jay-stack run share/publish --plugin brand-ds --repo https://github.com/acme/design.git --branch brand-ds
jay-stack run share/link --repo https://github.com/acme/design.git --ref brand-ds   # teammate
jay-stack run share/link --repo git@github.com:acme/brand-ds.git      # → src/plugins/brand-ds, setup run
jay-stack run share/status
# brand-ds  main  3f9c2a1  clean  behind 2
jay-stack run share/pull --folder brand-ds                              # ff-only; lists incoming code files
jay-stack run share/push --folder brand-ds                              # diverged → SHARE_DIVERGED
```

✅ `.ds-card { background: var(--brand-ds-surface, #fff); }` inside `card.jay-html` `<style>`; site sets `--brand-ds-surface: #0f172a` in `theme.css` or a page wrapper
✅ Same `card` on two pages: page A sets tokens on `.page-a { --brand-ds-surface: … }`, page B different values — no fork
✅ Hero vs default card on one page: `card.feature.jay-html` imported `as="feature-card"` (DL #205)
❌ `:root { --surface: #fff; }` in the shared plugin (does not travel, unprefixed)
❌ Silent full copy of a shared component into `src/components` without "detach" semantics — use layer 3 or 4 explicitly

## Trade-offs

| Choice | Pro | Con |
|---|---|---|
| `.gitignore` + manifest vs submodule | Agent-friendly, validatable, no parent-index coupling | Needs `restore` in CI; HEAD vs pin can drift (`status`, Phase 1a `SHARE-COMMIT-MISMATCH`) |
| git repo vs npm package | Edit in place from any site and push back; no registry | No semver or immutable versions; NPM stays the documented stricter path |
| No trust gate (Q13) | Simple; same trust as teammates and NPM plugins; raw git works | Shared code runs on link/pull without a separate approval; review relies on the site PR |
| `ff-only` vs auto-merge | Predictable; jay never authors merges | Divergence needs manual git |
| Plain `git` vs `gh` / host API | No extra tool; user's credentials; one code path | jay never creates repos (user gives an existing repo + branch); GitHub only |
| Thin Phase 1 (existing plugin publish only) | Ships the engine fast; no rewriter risk | Migrating site resources is manual until Phase 2 |
| Denylist only in Phase 1 | Cheap, deterministic, no false positives | A secret inside an allowed file is not caught until the Later content scan |
| Tokens as fallbacks vs page-wide CSS field | Zero framework change; sites override via same variable names | Repeated fallbacks; fonts manual |
| All `SHARE-*` as warnings | Local dev and agents never hard-blocked; educate via validate output | Stricter CI policy deferred; teams must read warnings |

## Verification Criteria

**Phase 1a**
- [P1a] Each of the five `SHARE-*` checks has a failing fixture first; every emitted finding has severity **warning**.
- [P1a] Project with only share warnings: `jay-stack validate` exits `0`.
- [P1a] Guides include four-layer customization + token override example.

**Phase 1**
- [P1] **Index after `--as`:** `link --as ds2` → `design-system-index.yaml` lists `plugin: ds2` (resolves in a page) and `plugins-index.yaml` lists `name: ds2` (fixture red first).
- [P1] Linked plugin's components, actions and commands work in dev; components appear in `design-system-index.yaml`.
- [P1] **Actions load:** all 7 `share*` actions register from `./tools` (`devOnly`); `.` exports none; an action called from the dev server resolves `projectRoot` to the project folder.
- [P1] **Public action names:** `actionRegistry.execute('shareStatus', {})` returns `{ success: true, data: ShareReport }`; `sharePull` on a dirty folder is `success: true`, `data.ok === false`, `code: SHARE_DIRTY`.
- [P1] **Typed results:** each action returns its listed fields; CLI exits `0` on `ok`, `1` otherwise; `SHARE_DIVERGED` always has both SHAs.
- [P1] **Repo URL validation:** `https://gitlab.com/a/b.git`, `/tmp/x.git`, `github.com/a`, `https://github.com/a` → `SHARE_INVALID_REPO` with no git call (runner spy); the four GitHub forms are accepted.
- [P1] **Publish existing plugin:** to an empty bare repo pushes `main` (default branch); `share.yaml` records `repo` and `commit` = pushed SHA; ignore block written; plugin `.gitignore` present.
- [P1] **Publish to a non-empty repo, new branch:** repo with other branches and content + `--branch brand-ds` succeeds; branch root = plugin files; other branches' SHAs unchanged; `share.yaml` records `ref: brand-ds`.
- [P1] **Branch not empty:** publish to an existing branch → `SHARE_BRANCH_NOT_EMPTY`, `files = []`, next step names another branch or `share/link --ref`; remote refs unchanged, `share.yaml` unchanged.
- [P1] **Publish race:** branch created between `ls-remote` and push (stub push stderr `! [rejected] … (fetch first)`) → `SHARE_BRANCH_NOT_EMPTY`, remote unchanged, `share.yaml` unchanged.
- [P1] **Publish branch-creation blocked:** push stderr `[remote rejected]` without `GH006` → `SHARE_NO_ACCESS`, `share.yaml` unchanged.
- [P1] **Publish resume:** push succeeds, `share.yaml` write fails → `SHARE_GIT_FAILED`; retry with remote branch SHA == folder `HEAD` → no push (runner spy), `share.yaml` entry + ignore block written once; a second retry changes nothing.
- [P1] **Not a plugin:** `link` without `ref` clones `main` (not the remote default branch); a ref with no root `plugin.yaml` → `SHARE_NOT_A_PLUGIN`, next step `--ref <branch>`, nothing in `src/plugins/`, clone under backup; the clone's fetch refspec covers only `<ref>`.
- [P1] **Link a branch:** `link --ref brand-ds` checks out that branch and records `ref: brand-ds`; `pull`/`push` track it.
- [P1] **Never create repos:** grep of `packages/plugins/share/lib` finds no GitHub API URL (`api.github.com`), no `gh` invocation, no repo-creation call; no push uses `--force`.
- [P1] **Denylist:** a force-added `.env`, `.vscode/settings.json`, `src/.secret` or `*.pem` makes publish and push return `SHARE_SECRET_FOUND`; bare remote unchanged.
- [P1] **Link report:** `plugin` has name, folder, repo, full/short SHA, contracts, actions, routes, shadowed routes, setup, and `hasServerCode` (`true` for a plugin with a `.ts` file, `false` for one with only `.jay-html`/`.css`/`.jay-contract`).
- [P1] **Link guards:** repo already in `share.yaml` → `SHARE_ALREADY_IN_MANIFEST`, `files = [<folder>]` (next step `share/restore` when folder missing); existing folder → `SHARE_FOLDER_EXISTS`, folder untouched, tmp clone under `.jay-share/backup/`; same `manifest.name` scanned → `SHARE_NAME_CLASH` even with `--as`; submodule path → `SHARE_SUBMODULE`.
- [P1] **`--as`:** files at `src/plugins/ds2/`, `plugin="ds2"` resolves, cloned `plugin.yaml` byte-identical to remote.
- [P1] **Link write failure:** unwritable `share.yaml` → `SHARE_GIT_FAILED`, no `src/plugins/<folder>/`, clone under backup.
- [P1] **Tracked folder:** site `git status` never shows files under a shared folder; a previously tracked folder is untracked only with `--untrack` / `untrack: true`, else `SHARE_TRACKED` (no prompt).
- [P1] **Setup:** link, a pull that moves `HEAD`, and restore call setup and agent-kit once each, after the move (spies); fixtures for `none`, `configured`, `needs-config`, `error`, `needs-answer` (`setupQuestion` filled); a `./setup.ts` handler runs through the core's own Vite server, closed afterwards.
- [P1] **Restore:** clean checkout → `HEAD == commit` on branch `<ref>` (not detached), then `pull` works; one inaccessible entry → `ok: false`, `SHARE_NO_ACCESS`, `files` names it, others restored; commit removed from remote → `SHARE_COMMIT_MISSING`, nothing left in `src/plugins/<folder>/`.
- [P1] **Pull:** a diff touching a `.ts` and a `.css` fast-forwards, sets `commit`, returns `incoming.codeFiles = [.ts]`, `otherFiles = [.css]`; `.tsx/.mts/.cts/.jsx/plugin.yaml/agent-kit/guide.md` count as code files.
- [P1] **Pull dry-run:** lists exactly `HEAD..origin/<ref>` (or `HEAD..<sha>`); HEAD, working copy and `share.yaml` unchanged.
- [P2] **Pull off-branch SHA:** `--commit <sha>` not on `origin/<ref>` → `SHARE_GIT_FAILED` with the Q6 message, nothing changed.
- [P1] **Divergence:** local + remote commits → `push` and `pull` return `SHARE_DIVERGED` with both SHAs, `share.yaml` unchanged, no force push; after a rebase, `push` succeeds and re-pins.
- [P1] **Protected branch:** classifier maps `GH006` and `protected branch` push stderr (only) to `SHARE_BRANCH_PROTECTED` with the branch + PR next step; `share.yaml` unchanged.
- [P1] **Push dirty:** uncommitted change → `SHARE_DIRTY` listing it; remote unchanged.
- [P1] **status:** no network by default (`fetched: false`); `fetch: true` updates ahead/behind/diverged; no `incoming`.
- [P1] **unlink:** two unlinks of the same folder produce two distinct backup folders; nothing deleted.
- [P1] **No access / offline:** a rewritten URL to a missing bare repo → `SHARE_NO_ACCESS` (never prompts); offline → `SHARE_OFFLINE`; classifier unit test covers each pattern, a bare `Permission denied` → `SHARE_GIT_FAILED`; no code path invokes `gh`.
- [P1] **SSH no prompt:** `GIT_SSH_COMMAND` unset → `ssh -o BatchMode=yes`; `ssh -i k` → `ssh -i k -o BatchMode=yes`; `core.sshCommand` kept and appended.
- [P1] **Guides:** `share-guide.md` has "Choosing a sharing approach" (simple default, team branches + PRs, NPM) and the on-demand update rule; it has the NPM section with the `plugin=` update step and a link that resolves inside a generated project `agent-kit/`; framework guides state "shareable DS resources in a local plugin by default".

**Phase 2**
- [P2] Publish of components (+ an action) rewrites all R1/R3 references; `validate` clean; the site renders identically, including component CSS.
- [P2] A headfull reference to a moved file stops publish with `SHARE_UNSUPPORTED_REFERENCE`, nothing moved.
- [P2] `publish --dry-run` returns `plan`, changes no file, and makes no network git call; `--local-only` moves, rewrites, validates and makes no git repo, remote call or `share.yaml` change.

**Phase 3**
- [P3] `jay-stack build` of a project with a local plugin route (`component: ./pages/x/page.ts`) emits `server/plugins/<f>/pages/x/page.js`, renders server-side and hydrates on the client (fixture red first).
- [P3] A page shared through a linked plugin serves in dev and prod.

No false greens: every check and error code gets a failing fixture first.

## Review history

- **Round 1 (NEEDS-WORK) → revised.** Prod local routes marked ❌, with a Phase 1a fix and a VC. Validators moved to the DL #145 hook with the DL #216 memoize pattern; the core fallback was dropped and the zero-pages limitation recorded. Trust gate redesigned around a staging dir outside `src/`; the claim that the dev server is gated was removed. Q3 rewritten with R1–R3 before/after forms, the moved-component layout and headfull unsupported. CSS decided (tokens as fallbacks in template CSS, guide-step fonts, `SHARE-TOKEN-PREFIX`/`SHARE-FONT-MISSING`), flagged as Q12. Concrete denylist, plugin `.gitignore` and scan patterns added. Submodule, tracked-files, detached-HEAD and push-pin cases defined. `ff-only` + `SHARE_DIVERGED` chosen, with one `ShareReport`/`ShareError` type. Invented suppression replaced by `validationOverrides`, with project checks non-suppressible. npm added as a null hypothesis. Phase 1 package/schemas/tests made concrete. VCs added.
- **Round 2 (READY, non-blocking findings) → revised.** Cited the validator runner (`validate.ts:1747` `runPluginValidators`, `jay-stack validate` only; not the dev server). Confirmed unknown top-level keys are tolerated, so `x-share.fonts` stays in `plugin.yaml`. Namespacing made exact: commands and validator sources by `manifest.name`, actions by code-defined `actionName` with silent overwrite; `SHARE_NAME_CLASH` kept for same `manifest.name`, `--as` only for folder clashes. Trust gate: tsconfig/Vite coverage cited, `**/.jay-share/**` watcher-ignore added to Phase 1a, setup/agent-kit only after trust, `plugin.yaml` always executable. `SHARE_NOT_FF` dropped in favor of `SHARE_DIVERGED`. `push` re-runs denylist + scan on outgoing commits. VCs added for other loaders, no-code-before-trust, name clash and push re-scan.
- **Round 3 (READY, non-blocking findings) + programmatic-caller requirements → revised.** Pull with no executable change sets `trusted` = new commit (VC). Prod local routes traced through server (`build-pipeline.ts:298-307`, whole-folder compile at `server-code-build.ts:101-108`) and client hydration (`:516-523`); `resolvePluginExport` fallbacks noted and bypassed for local `jayHtml`; fixture asserts hydration. Team-wide trust stated (Q14), per-machine trust rejected. Restore runs setup + agent-kit after the move. TL;DR #6 softened to "nothing imports or compiles it"; watch-ignore is a tested assertion. `.jay-share/` ownership stated. Platform-specific denylist entry removed. `localSha`/`remoteSha` always set for `SHARE_DIVERGED`/`SHARE_UNTRUSTED`. For editors and agents that drive the share commands programmatically: `--json` + per-code exit codes, `PluginSummary` link report, `PluginStatus` rows with opt-in `--fetch`, `pull --dry-run` with incoming executable files, `link --cancel`, `SHARE_NO_ACCESS`, `publish --owner`, machine-readable `publish --dry-run` plan, `publish --local-only`, setup status in reports. New framework fix: design-system index writes the folder key for local plugins (fixture first). Duplicate-contract validation considered and rejected (Q15).
- **Round 4 (NEEDS-WORK) → revised.** Prod local routes: `page.ts` is excluded from the `src/plugins/` walk (`server-code-build.ts:8-9`), so `discoverServerEntries` now adds local-plugin route `compPath`s from `scanPluginRoutes` (entry rule as `:69-74`); citations made consistent (Prior Art, capabilities, Trust gate) and the fixture asserts the compiled module. `--json` and the per-code exit table dropped (null hypothesis): actions are the typed programmatic surface; CLI is human text with exit `0`/`1`, reasons cited (`plugin-commands.ts:185-193`, `run-command.ts:112,142-155`). All flags named (`--repo`), since `parseRawFlags` ignores positionals. Push trust rule added so a manual rebase cannot launder remote code into `trusted`; Q7 remedy is `share/pull` with the trust step (VC). Setup via `discoverPluginsWithSetup`/`executePluginSetup`, enum `none | configured | needs-config | needs-answer | error`. `SHARE_NO_ACCESS` with `GIT_TERMINAL_PROMPT=0`/`GCM_INTERACTIVE=never` and listed stderr patterns. `incoming` only from `pull --dry-run`; `status --fetch` refreshes ahead/behind only; `link --cancel` replaced by `unlink` of a staged-only folder. `--visibility` in Flows; `--local-only` noted in TL;DR #4; ahead/behind defined once on `PluginStatus`. Executable set adds `*.tsx`, `*.mts`, `*.cts`, `*.jsx`. Index fix uses the map key (`design-system-index.ts:215`) and also covers `plugins-index.yaml` (`contract-materializer.ts:387-399,628-629`).
- **Round 5 (NEEDS-WORK) → revised.** Actions: every `actions:` entry `devOnly: true` (NPM actions load from `.` unless devOnly, `action-discovery.ts:374-399`), export name = action name, names prefixed `share*` (silent overwrite, `action-registry.ts:124`); action projectRoot = `process.cwd()` (`cli.ts:233`, `server.ts:37-41,59`). Setup/agent-kit call fully specified: filter by `pluginPath`, `configDir` from `configBase`, own throwing prompt, own `createViteForCli` loader closed in `finally` (handlers get only `(input, ...services)`). Pull/`incoming` diffs use `trusted..origin/<ref>`; push requires `trusted` ancestor of `HEAD` and trust for remote-reachable executable commits in `trusted..HEAD`; `commit` input on `trust`/`pull --trust` closes the TOCTOU window; `agent-kit/**` is trust-gated. SSH `BatchMode=yes` + host-key/publickey patterns. `plugin: PluginSummary` on staged `PluginStatus` rows for restore. `discoverServerEntries` export change noted as additive. Backup naming `<folder>-<timestamp>-<shortsha>`. Reviser finding: `.jay` is the project config file (`config.ts:61-70`), so the scratch folder is `.jay-share/`, not `.jay/share/`. VCs added for each. Programmatic-caller requirements: action names published as public API via `actionRegistry.execute`; diverged route = `trust --commit <remoteSha>` on a linked folder (records `trusted`, no checkout), Q7 updated; `SHARE_FOLDER_EXISTS` and new `SHARE_ALREADY_IN_MANIFEST` defined in link; restore `ok` with mixed results defined; `push` refuses `SHARE_DIRTY` and lists outgoing files; `publish --dry-run` skips `checkAuth`.
- **Round 6 (NEEDS-WORK) → revised.** Push rule 2: `--remotes` is a union, so remote-reachable = `git rev-list <trusted>..HEAD` minus `git rev-list <trusted>..HEAD --not --remotes` (exact commands; VC (b)/(c) fixed). Raw git into a linked folder (`pull <url>`, `am`, `cherry-pick`, SHA-rewriting rebase) is an accepted limit, counted as self-authored (Q14, TL;DR #14, guide). `trust` removed from the `shareLink` action schema; trust is always `shareTrust { folder, commit }`; CLI `link --trust` requires `--commit`; guide forbids agents from trusting without explicit human approval. `trust` on a linked folder re-fetches and requires `commit == origin/<ref>` (VC). `SHARE-UNTRUSTED` also errors when `<trusted>..HEAD` touches executable files (raw-git backstop). Trusted-ness = equals or is an ancestor of `trusted` everywhere. Link clones into `.jay-share/staging/.tmp-<random>/`, re-checks `SHARE_FOLDER_EXISTS`, renames; failure moves to backup. `SHARE_NO_ACCESS` patterns tightened (no bare `Permission denied`; HTTPS 403 added); `BatchMode=yes` appended to an existing SSH command. `execute` returns `ActionExecutionResult<ShareReport>` (`action-registry.ts:70,201`), asserted in the VC.
- **Round 7 (two text contradictions) → revised.** Push rule 2 next step is `share/trust --commit <remoteSha>` (fetched `origin/<ref>`), then push again (rule 3 applies). Push rule 1 has no trust path: pull (with trust flow), rebase onto `origin/<ref>`, push. Guide bullet and Push trust rules VC (a)/(b) aligned. Restore in CI refuses only when `commit` neither equals nor is an ancestor of `trusted`, matching Flows restore, TL;DR #6 and the "Ancestor is trusted" VC.
- **Round 8 (READY, should-fix) → revised.** Push rule 2 splits on `git merge-base --is-ancestor <sha> origin/<ref>`: commits from another remote branch → `foreign-remote-commits`, no trust shortcut (VC b2). `ShareReport.reason` (`UntrustedReason`) added for every `SHARE_UNTRUSTED` so callers never parse `nextStep`. Pull `commit`: with trust it must equal the re-fetched `origin/<ref>` (`stale-commit`); pinning older uses `pull --commit` without trust, gated by `<trusted>..<sha>` (VC). `SHARE-UNTRUSTED` validate message picks its next step by state. `shareTrust` on a staged clone spelled out. Leftover `SHARE_NOT_FF` mention removed. Watch-ignore test covers both Vite factories (`:85`, `:165-166`).
- **Round 9 (final): READY; text clean-ups applied.**
- **Post-review revision (architect decision):** `**/.jay-share/**` watch-ignore removed from Phase 1a and its VC. Core must not hard-code a plugin's private folder, and watching does not execute code, so the trust gate does not depend on it.
- **Post-review revision (architect decision, trust gate removed):** the staging-dir trust gate, `trusted`, `share/trust`, `UntrustedReason`, TOCTOU checks, push trust rules, `SHARE-UNTRUSTED` and `SHARE_TRUST_REQUIRED_CI` are removed (Q14). `link` clones straight into `src/plugins/`; `pull` reports `incoming.codeFiles` as information. NPM packaging is added as the documented stricter path (agent-kit task). Needs an independent re-review.
- **Round 10 (READY-FOR-DEVELOPMENT; should-fix and nits) → revised.** Action count fixed to 7. Link: failure after the move rolls the folder back to backup; diagram shows all checks. Restore clones via tmp, checks the pinned commit and adds `SHARE_COMMIT_MISSING`. NPM guide task adds the `plugin=` reference update and says how its link resolves. `pull --dry-run` range made explicit. VCs added for link write failure, missing commit, off-branch `pull --commit` and dry-run range.
- **Product decisions 2026-11-16 → revised.** GitHub only; other hosts and snapshots removed (not future work). Share never creates repos: `publish` takes a required GitHub `repo` URL of a user-created empty repo; `owner`, `visibility`, repo creation and `ShareRemote` removed (null hypothesis in Trade-offs: plain git needs no host interface; a `GitRunner` URL-rewrite seam serves tests). `gh` dropped: `SHARE_GH_MISSING` and `SHARE_AUTH` removed, auth/no-access failures map to `SHARE_NO_ACCESS` (patterns unchanged). New `SHARE_INVALID_REPO` (non-GitHub URL, missing repo) and `SHARE_REPO_NOT_EMPTY` (`git ls-remote` lists refs; suggest link). Q9/Q10 rewritten; VCs added. Trust model, staging, reasons unchanged. Needs re-review.
- **Simplification per product owner 2026-11-16 → revised.** Trust-gate removal confirmed. Leftovers swept (staging lifecycle beyond a tmp clone, trust rules, related codes and VCs). Phasing thinned: Phase 1 MVP engine = link, restore, pull (ff-only, dryRun with `incoming.codeFiles`), push (refuse dirty; divergence reported only), status, unlink, `sharePublish { plugin, repo }` for an existing local plugin, `share.yaml`, ignore block, typed `ShareReport`, agent-kit guide, design-system/plugins-index folder-key fix. Phase 2 = publish-from-site move + rewriter (components first), `--local-only`, `SHARE-*` validators. Phase 3 = plugin pages incl. the prod local-plugin routes fix. Later = secret content scan (Phase 1 safety = plugin `.gitignore` + path denylist on publish and push). `PluginSummary.codeFiles/hasServerCode/pages` dropped. VCs tagged by phase. Needs re-review.
- **Round 11 (READY; decisions applied) → revised.** `PluginSummary.hasServerCode` restored, computed from the code-files set (Link report VC). `SHARE_ALREADY_IN_MANIFEST` sets `files = [folder]`. `link --ref` and `pull --commit` moved to Phase 2 (schema fields kept, marked Phase 2; off-branch VC tagged P2); `shareUnlink` stays Phase 1. Guide states "never put credentials in plugin files". Q numbering closed (Q11-Q14).
- **Product-owner answers 2026-11-16 → revised.** Push: everyone pushes in the simple mode; agent-kit "Choosing a sharing approach" covers simple (default) / team with branches + PRs / NPM, with few questions up front. Updates are on demand only. Publish uses the user's name or asks once. Agents may proactively offer the move to a local plugin. Guides VC extended.
- **Product-owner rule 2026-11-16 → revised.** Hidden dot-files are never committed: plugin `.gitignore` starts with `.*` / `!.gitignore` and the denylist blocks any dot path segment. Guide: agents building or editing shared plugins never put or push secrets. Denylist VC extended.
- **Product + architect 2026-11-16 (evening) → revised.** Q11 closed: token fallbacks + site/page overrides. Four-layer customization model (theme → variant → project skin → detach) in Design + agent-kit. Validators moved to **Phase 1a** (implement first); all `SHARE-*` checks **warning** only; must not fail validate exit code alone; manifest/hygiene suppressible per project. P1a VCs added. Phase 2 no longer owns validator delivery.
- **Round 12 review + product-owner decisions 2026-11-16 → revised.** Phase 1a cut to five warning-only manifest/hygiene checks (token-prefix, font check, fonts field and suppression keys → Phase 2); untrack is flag-only (Q12 closed); new `SHARE_BRANCH_PROTECTED`; no automatic fetch; phase labels, `.gitignore`, scanner citation and agent-kit ownership made consistent.
- **Round 13 (READY, both logs) → revised.** Phase split of `SHARE-*` checks stated once above Later.
- **Product-owner requirement 2026-11-17 (existing repo + branch, never create repos) → revised.** `sharePublish.branch` (default `main`); `SHARE_BRANCH_NOT_EMPTY` replaces `SHARE_REPO_NOT_EMPTY`; plugin pushed as its own history to `refs/heads/<branch>`; `shareLink.ref` (branch) moved to Phase 1, tags and `pull --commit` stay Phase 2; VCs added.
- **Round 14 (NEEDS-WORK, edge cases) → revised.** Publish push race → `SHARE_BRANCH_NOT_EMPTY`, `SHARE_BRANCH_PROTECTED` narrowed to `GH006`/`protected branch` (other `[remote rejected]` → `SHARE_NO_ACCESS`), resumable publish, link clones `main` single-branch with new `SHARE_NOT_A_PLUGIN`; VCs added.
- **Round 15 (jay NEEDS-WORK: resume unreachable) → revised.** Resume check runs before the branch-exists check; `[remote rejected]` rule applies to every push; push steps reordered (protection read from push stderr); status line notes the 2026-11-17 decision.
