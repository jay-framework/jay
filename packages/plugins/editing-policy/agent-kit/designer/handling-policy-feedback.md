# Handling an editing-policy report

You edited a project that has an editing policy, and `editing-policy compare` produced a report. This
is how to read it and fix what it flags so your change can publish.

## The disposition (first line)

`# Policy comparison: PUBLISH | REVIEW | BLOCK`

| Disposition | Meaning                                                        | What to do                                                            |
| ----------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| **PUBLISH** | nothing to fix                                                 | you're done                                                           |
| **REVIEW**  | allowed, but routes to a human admin (or has fixable findings) | fix any findings to reduce review scope; the rest is a human decision |
| **BLOCK**   | a hard violation                                               | you must change the candidate — it will not publish as-is             |

## Findings

Each finding is one violation:

```
### BLOCK — edit:no
`src/pages/page.jay-html#promo` · lines 21–23 · role `client` · selector `src/pages/**`
design change on src/pages/page.jay-html#promo, but that part is frozen (edit: no)
Suggestion: Revert the change, or request an edit from a role that owns this part
```

- The backtick path is **where** (`path` or `path#section`); `#section` is a `jay-policy="…"`-marked part.
- `lines A–B` (when present) is the marked part's **line range in the candidate file** — go straight there. File-level changes (a whole new page, a `.ts`/`.css` edit) have no range.
- `ruleId` is **why** (`edit:no`, `code:no`, `design:designSystemOnly`, `create:from-template`, …).
- **Do what the `Suggestion:` line says.** It is written for you; the report can be fed back as your task.

## The common rules you'll hit, and how to satisfy them

- **`edit: no` (frozen)** — this file/part is not yours to change. **Revert it.** Don't try to reword it;
  any change is blocked.
- **`design: designSystemOnly`** — you may **add** design-system elements/regions and design-system
  **token** values, but not re-theme or restructure an **existing** element. If you changed an existing
  element's classes/styles, revert that; if you need new look, add a design-system element instead.
- **`create: from-template`** — a new page/section must be **built from a template**: import one from the
  components templates folder with `template=` and flatten it (`jay-stack sync`). A hand-authored new
  page is rejected.
- **`content: no` / `code: no` / `css: no` / `dependencies: no`** — that kind of change isn't allowed for
  your role here. Revert it, or move the work to a part/role that allows it.
- **`policy`** — you changed `jay-policy.md` or a `jay-policy="…"` marker. These need the `policy` right
  (usually denied). Revert the marker/policy edit; permissions come from the baseline policy only.
- **`<rule>:unset` (denied by default)** — no rule grants this change for your role. Revert it, or ask
  the policy owner (dev-ops) to grant it.

## Changes that are NOT findings

A re-flatten of a region back to its current template (**`sync`**) and additive design-system-token
edits are allowed and won't appear as findings — they'll show only in the `## Changes` list. If your
intended change is missing from `## Findings`, it was allowed.

## The fix loop

1. Read each finding, apply its `Suggestion:` (revert, or redo it the allowed way).
2. Re-run `editing-policy compare` (or ask for it to be re-run).
3. Repeat until **PUBLISH**, or until only human-review items remain.

To set up marks/permissions on a page, see the designer editing-policy guide; the rules themselves live
in `jay-policy.md` (owned by dev-ops).
