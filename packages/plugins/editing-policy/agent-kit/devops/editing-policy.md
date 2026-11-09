# Editing policy — authoring `jay-policy.md` and running `compare`

Own the project's editing policy: the `jay-policy.md` rules, and the `editing-policy compare` gate that
enforces them on a change before it reaches production.

`jay-policy.md` at the project root is the source of truth for who may change what. It is YAML
frontmatter (the rules) plus a markdown body (the human/agent guideline). The policy is always read
from the **baseline**, so a candidate cannot loosen its own rules.

## Format

```yaml
---
version: 1
defaultRole: client # fail-safe role when the caller passes none
templates: ['src/components/templates/**'] # components that are templates (DL#196)
correctness:
  validate: true # candidate must pass `jay-stack validate`
roles:
  client:
    - selector: '**' # role baseline (needs a "**" fallback)
      rules:
        {
          content: yes,
          design: designSystemOnly,
          create: from-template,
          code: no,
          css: no,
          publish: review,
          onViolation: review,
        }
    - selector: 'src/pages/legal/**' # a more specific selector wins per rule
      rules: { edit: no, onViolation: block }
    - selector: 'src/components/templates/**' # templates are the designer's — frozen for the client
      rules: { edit: no, onViolation: block }
    - selector: 'src/pages/page.jay-html#pricing-card' # a jay-policy-marked part (see the designer guide)
      rules: { design: no, content: yes }
---
# Guidelines for agents editing this project ...
```

## Selectors

One kind: a glob over project-root-relative file paths, optionally followed by `#<name>` to target a
`jay-policy="<name>"` marker. Routes are folders under `src/pages`, so address a route by its folder
(`src/pages/products/[slug]/**`) and the home page by `src/pages/page.jay-html`. Shorthand:
`<folder>#<name>` means that folder's `page.jay-html`. The whole project is compared — **components are
governed too** (a component's `.jay-html`/`.ts`/`.css` is judged by the selectors matching its path).

## Rules (what each governs is decided by file type)

| Rule                           | Values                                   | Governs                                                                                                                                        |
| ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`                      | yes / no                                 | Text in `.jay-html`                                                                                                                            |
| `design`                       | yes / no / designSystemOnly              | Layout, structure, classes, inline styles in `.jay-html`; `designSystemOnly` = add design-system tokens/elements, don't re-theme existing ones |
| `css`                          | yes / no                                 | `<style>` in `.jay-html` and external `.css`                                                                                                   |
| `code`                         | yes / no                                 | `.ts`, `.js`, `.jay-contract`                                                                                                                  |
| `dependencies`                 | yes / no                                 | Dependency fields of `package.json` and lockfiles                                                                                              |
| `config`                       | yes / no                                 | Other non-source project files                                                                                                                 |
| `create` / `delete` / `rename` | yes / no (`create` also `from-template`) | File/page/section lifecycle                                                                                                                    |
| `overrideRoute`                | any / from-template / no                 | Page folders overriding a plugin route                                                                                                         |
| `policy`                       | yes / no                                 | `jay-policy` markers and the policy file (default **no**)                                                                                      |
| `edit`                         | no                                       | Freezes a selector entirely                                                                                                                    |
| `publish`                      | direct / review                          | Publish directly or route to the admin                                                                                                         |
| `onViolation`                  | review / block                           | Disposition when a rule is violated                                                                                                            |

**Resolution:** per rule, the most specific matching selector decides (`#name` > more literal path
segments > globs); equal specificity → the stricter value. A rule no matching selector sets is
**denied** for non-admin roles (fail-closed). Across rules, the strictest `onViolation` wins.
`designSystemOnly`, `create: from-template`, and a re-flatten (`sync`) are verified against the real
tree (tokens / `template=` provenance); anything unprovable stays a `review`, never auto-published.

## Validating the policy file

`jay-stack validate` runs the policy-file validator (via the `projectValidators` hook): it reports
bad YAML, unknown versions/rules/values, unparsable selectors, rules on selectors that can't carry
them, duplicate selectors, and warnings (no `**` fallback, selectors matching nothing, missing body).
Run it in CI whenever `jay-policy.md` changes.

## Running the `compare` gate

`editing-policy compare` classifies the changes between two project trees, resolves them against a
role, and prints a report. It is **pure** — no git, install, or network: the caller (e.g. the publish
job) checks out the baseline and candidate into two directories and passes them in.

```bash
editing-policy compare \
  --baseline <dir> \        # the tree to compare against (e.g. main)
  --candidate <dir> \       # the proposed tree
  --role <name> \           # required unless the policy sets defaultRole
  [--policy <file>] \       # default: <baseline>/jay-policy.md
  [--validated] \           # assert the candidate passed `jay-stack validate` (for correctness.validate)
  [--json]                  # default output: a markdown report
```

Exit codes mirror the disposition — wire them into the job:

| Exit | Disposition | Meaning                                                |
| ---- | ----------- | ------------------------------------------------------ |
| `0`  | PUBLISH     | no findings — publish directly                         |
| `10` | REVIEW      | route to the admin (findings and/or `publish: review`) |
| `11` | BLOCK       | a `block` violation — do not publish                   |
| `1`  | —           | tool error (unknown role, missing policy, bad args)    |

The markdown report (disposition, findings with suggestions, change summary) is written for an agent:
paste it back to the authoring agent as its fix task. Use `--json` (`{ disposition, findings, changes,
policyHash }`) when a job consumes the result programmatically or combines it with an LLM verdict.

```bash
# typical publish-job shape
git worktree add /tmp/base origin/main
git worktree add /tmp/head "$CANDIDATE_SHA"
editing-policy compare --baseline /tmp/base --candidate /tmp/head --role "$ROLE" --json > verdict.json
case $? in 0) publish ;; 10) request_review ;; 11) block ;; *) fail ;; esac
```
