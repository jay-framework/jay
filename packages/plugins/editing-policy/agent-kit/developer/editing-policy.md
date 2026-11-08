# Editing policy — the `jay-policy.md` file

The policy file format, how it is validated, and how a baseline-vs-candidate change is compared.

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
    - selector: 'src/pages/page.jay-html#pricing-card' # a jay-policy-marked part
      rules: { design: no, content: yes }
---
# Guidelines for agents ...
```

## Selectors

One kind: a glob over project-root-relative file paths, optionally followed by `#<name>` to target a
`jay-policy="<name>"` marker. Routes are folders under `src/pages`, so address a route by its folder
(`src/pages/products/[slug]/**`) and the home page by `src/pages/page.jay-html`. Shorthand:
`<folder>#<name>` means that folder's `page.jay-html`.

## Rules (what each governs is decided by file type)

| Rule                           | Values                                   | Governs                                                   |
| ------------------------------ | ---------------------------------------- | --------------------------------------------------------- |
| `content`                      | yes / no                                 | Text in `.jay-html`                                       |
| `design`                       | yes / no / designSystemOnly              | Layout, structure, classes, inline styles in `.jay-html`  |
| `css`                          | yes / no                                 | `<style>` in `.jay-html` and external `.css`              |
| `code`                         | yes / no                                 | `.ts`, `.js`, `.jay-contract`                             |
| `dependencies`                 | yes / no                                 | Dependency fields of `package.json` and lockfiles         |
| `config`                       | yes / no                                 | Other non-source project files                            |
| `create` / `delete` / `rename` | yes / no (`create` also `from-template`) | File/page/section lifecycle                               |
| `overrideRoute`                | any / from-template / no                 | Page folders overriding a plugin route                    |
| `policy`                       | yes / no                                 | `jay-policy` markers and the policy file (default **no**) |
| `edit`                         | no                                       | Freezes a selector entirely                               |
| `publish`                      | direct / review                          | Publish directly or route to the admin                    |
| `onViolation`                  | review / block                           | Disposition when a rule is violated                       |

**Resolution:** per rule, the most specific matching selector decides (`#name` > more literal path
segments > globs); equal specificity → the stricter value. A rule no matching selector sets is
**denied** for non-admin roles (fail-closed). Across rules, the strictest `onViolation` wins.

## Validation and comparison

- `jay-stack validate` runs the policy-file validator (via the `projectValidators` hook): it reports
  bad YAML, unknown versions/rules/values, unparsable selectors, rules on selectors that can't carry
  them, duplicate selectors, and warnings (no `**` fallback, selectors matching nothing, missing body).
- `editing-policy compare --baseline <dir> --candidate <dir> --role <name>` classifies the changes
  between two trees, resolves them against the role, and prints a report (markdown, or `--json`).
  Exit codes mirror the disposition: `0` PUBLISH, `10` REVIEW, `11` BLOCK, `1` tool error. The engine
  is pure — it runs no git, install, or network; the caller checks out the two trees and passes them in.
