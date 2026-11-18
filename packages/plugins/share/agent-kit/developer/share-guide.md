# Sharing Jay Resources Between Sites (`share` plugin)

The `share` plugin keeps a **local plugin** (`src/plugins/<folder>/`) in its own git repo so several
sites can use and edit the same design system, components or actions. One shared plugin = one git
repo; the repo root is the plugin (`plugin.yaml` at the root).

- `share.yaml` (project root, committed to the site repo) lists each shared folder with `repo`,
  `ref` (the branch it tracks, default `main`) and `commit` (the pinned SHA — the lock).
- A managed block in the site `.gitignore` (`# >>> jay share` … `# <<< jay share`) ignores each
  shared folder and the `.jay-share/` scratch folder. The site repo never contains the plugin files.
- Share uses plain `git` with the user's existing credentials and never prompts. It never creates
  GitHub repositories, never force-pushes, and never touches the network unless a command is run.

## Choosing a sharing approach

You are the user's consultant. Start with **simple** and ask as few questions as possible; describe
the other approaches only when the user's needs or complaints call for them.

1. **Simple (default)** — one in-house team; everyone with git access edits the plugin in place
   and runs `share/push` to `main`.
2. **Team / agency** — the plugin repo uses GitHub permissions and branch protection; changes go
   through branches + PRs. `share/push` to a protected branch fails with `SHARE_BRANCH_PROTECTED`:
   push a branch with plain git inside `src/plugins/<folder>` and open a PR. After the merge, sites
   run `share/pull`.
3. **Advanced** — package the plugin as NPM (see "When git sharing is not enough") for outside
   authors, immutable releases or a private registry.

Updates are **on demand only**: the user or the agent runs `share/pull` (or a teammate does it in a
site branch/PR). Share never pulls on its own and never fetches on a timer.

When publishing, ask the user for an **existing** GitHub repo URL and an optional branch (default
`main`). **Agents never create GitHub repositories** — ask the user for an existing repo URL and
optional branch. You may proactively offer to move existing site components into a local plugin
when the user wants to share or reuse them (Phase 1 moves are manual: build the plugin in
`src/plugins/<name>/`, then publish).

## The seven flows

All flags are named. Each command has a matching devOnly action (`share<Cmd>`) with the same input
that returns a typed `ShareReport` (`ok`, `code`, `message`, `files`, `nextStep`, …). Agents and
editors should call the **actions**; the CLI prints text and exits `0`/`1`.

| Command (`jay-stack run …`)                                             | Action         | What it does                                                                                                                                                   |
| ----------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `share/publish --plugin <folder> --repo <url> [--branch b] [--untrack]` | `sharePublish` | Pushes an existing local plugin as its own history to a **new** branch of an existing repo; writes the plugin `.gitignore`, `share.yaml` entry and ignore line |
| `share/link --repo <url> [--ref <branch>] [--as <folder>] [--untrack]`  | `shareLink`    | Clones that branch (default `main`) into `src/plugins/<folder>`, pins it, runs the plugin's setup + agent-kit                                                  |
| `share/pull [--folder f] [--dry-run]`                                   | `sharePull`    | Fast-forwards to `origin/<ref>`; `--dry-run` only lists `incoming`                                                                                             |
| `share/push [--folder f]`                                               | `sharePush`    | Pushes your commits (fast-forward only) and re-pins                                                                                                            |
| `share/status [--folder f] [--fetch]`                                   | `shareStatus`  | Per folder: present, dirty files, ahead/behind, HEAD vs pin; offline unless `--fetch`                                                                          |
| `share/restore`                                                         | `shareRestore` | Clones every listed folder missing on disk at its pinned commit (run after cloning a site, and in CI)                                                          |
| `share/unlink --folder f`                                               | `shareUnlink`  | Removes the entry and ignore line; moves the folder to `.jay-share/backup/`                                                                                    |

Repo URLs must be GitHub: `https://github.com/<owner>/<name>[.git]`,
`git@github.com:<owner>/<name>[.git]` or `ssh://git@github.com/<owner>/<name>[.git]`.

### Editing a shared plugin

A linked folder is an ordinary git clone. Edit files in place, commit **inside**
`src/plugins/<folder>`, then `share/push`. Raw git there is fine; `share/push` re-pins `commit`.
Commit the changed `share.yaml` in the site repo — the site PR that moves `commit` is the review
point.

### Reading `status`

- `dirtyFiles` — uncommitted changes; `pull` and `push` refuse them (`SHARE_DIRTY`).
- `ahead` / `behind` — against the last fetched `origin/<ref>`; pass `fetch: true` to refresh.
- `headMatchesPin: false` — HEAD moved without re-pinning: push (or check out the pinned commit).

### Divergence (`SHARE_DIVERGED`)

Both your clone and `origin/<ref>` have new commits. jay never merges, rebases or force-pushes.
The report carries `localSha` and `remoteSha`. Run:

```bash
cd src/plugins/<folder> && git pull --rebase origin <ref>
jay-stack run share/push --folder <folder>
```

### Incoming code files

`pull` (and `pull --dry-run`) return `incoming.codeFiles` (`*.ts`, `*.js` and friends,
`plugin.yaml`, `agent-kit/**`) and `incoming.otherFiles`. Nothing is blocked — shared plugins have
the same trust as a teammate's commit — but **mention the incoming code files in the site PR**.

## Safety rules (always)

- **Never commit or push secrets.** Never put credentials in plugin files — no API keys, tokens or
  passwords in any file of a shared plugin; read them from site config (`config/`) or env at run time.
- **Never commit hidden dot-files** in a shared plugin. Its `.gitignore` starts with `.*` and
  `!.gitignore`, and `publish`/`push` refuse any dot path, `config/`, key file (`*.pem`, `*.key`,
  `*.p12`, `*.pfx`) or `id_rsa*` with `SHARE_SECRET_FOUND`.
- `.jay-share/` belongs to share (tmp clones, backups). Nothing is ever deleted: failed clones and
  unlinked folders move to `.jay-share/backup/`.
- **Prefix action names** in a shared plugin with the plugin name (`brandDsSubmit`, not `submit`):
  actions are global and a duplicate silently overwrites another.
- Two copies of one plugin cannot coexist (`SHARE_NAME_CLASH`); `--as` only renames the folder.

## Styling shared components

- Keep component CSS **inside the template `<style>`** — it travels with the region when the
  component is flattened into a page. A `<link rel="stylesheet">` inside a template does not travel.
- Put the **theme** (prefixed tokens, `@font-face`, font `@import url(https://…)`) in one plugin
  stylesheet, e.g. `src/plugins/brand-ds/theme.css`, and declare it in `plugin.yaml`:
  `styles: [theme.css]`. Jay adds it once, before the page CSS, to every page that imports a
  component of the plugin, and the Design System panel previews load it too.
- Declare tokens under **`:where(:root) { --brand-ds-surface: #fff; }`** (specificity 0) so a site
  `:root` override always wins. Plain `:root` in a plugin stylesheet → `DS-THEME-ROOT-SPECIFICITY`.
- **Do not hand-link** the plugin stylesheet in pages (`DS-THEME-HAND-LINKED`); importing a
  component on the page is enough. A plugin used only inside a headfull child is not included yet —
  import one of its components on the page (`DS-THEME-VIA-CHILD`).
- Use **prefixed tokens**: `.ds-card { background: var(--brand-ds-surface, #fff); }`. A token with
  no fallback must be defined in `styles` (`DS-TOKEN-NO-FALLBACK`).

## Customizing a shared design system

Pick the **highest layer that solves the job**; go lower only when necessary.

| Layer | Name                                         | What changes                                                                                                                        | Upstream `share/pull`                                               |
| ----- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1     | **Adjust brand (theme)**                     | The site or page sets `--<plugin>-*` custom properties on `:root`; they win over the plugin's `:where(:root)` defaults              | Updates shared components; the theme stays in the site              |
| 2     | **Use another variant**                      | A second `.jay-html` per contract, imported on the page with `as=`                                                                  | New shared templates arrive on pull; pages keep their import choice |
| 3     | **Custom look for this site (project skin)** | A project-owned template under `src/components/` or `src/plugins/<site>-ds/`, still using the shared contract / `.ts` when possible | Pull updates shared logic and contracts; re-check skins             |
| 4     | **Detach**                                   | A full copy of the component in the site; references stop using `plugin="<shared>"` for it                                          | **No automatic sync** — an explicit opt-out                         |

Theme override (layer 1) — the plugin's `theme.css` defines `:where(:root) { --brand-ds-surface: #fff; }`;
the site overrides it in its own CSS (page `<style>` or a site stylesheet), for the whole site or one page:

```css
/* site CSS — never edit the shared plugin's theme.css for this */
:root {
  --brand-ds-surface: #0f172a;
}
/* or only on one page wrapper */
.page-pricing {
  --brand-ds-surface: #fef3c7;
}
```

Variant (layer 2) — `card.feature.jay-html` next to `card.jay-html`, imported with
`as="feature-card"` (see `designer/design-system-guide.md`).

Before detaching (layer 4), confirm with the user: "Updates from the shared design system will no
longer apply to this component." Do not use ad-hoc region CSS overrides on shared imports as the
main customization path — prefer a variant or a project skin.

## When git sharing is not enough

Choose **NPM** for outside authors, immutable releases or a private registry:

1. Convert the plugin to the Standalone NPM Package layout — see
   [plugin-structure.md](../plugin/plugin-structure.md).
2. Publish it to the registry and install it in each site with a pinned version.
3. `jay-stack run share/unlink --folder <folder>` in each site.
4. Update `plugin="<folder>"` references in pages to the package name.
