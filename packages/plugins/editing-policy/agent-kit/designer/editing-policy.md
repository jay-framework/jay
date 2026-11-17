# Editing policy — marking parts of a page

How a designer/admin gives part of a page its own editing permissions (for setting up a policy). If
instead you are **editing within** a policy and got a `compare` report to act on, see
`handling-policy-feedback.md`.

The project's editing rules live in `jay-policy.md` at the project root. **Read it first** — its markdown
body is the authoritative guideline for what each role may change, and the rules in its frontmatter are
what the validator and the `compare` check enforce. Never guess the policy; open the file. (Authoring
that file and running the enforcement gate are dev-ops concerns — see the dev-ops editing-policy guide.)

## Marking a part with `jay-policy`

To give an element or a region its own permissions, add a `jay-policy="<name>"` attribute in the
`.jay-html` source, on **a plain element or a region tag**:

```html
<jay:card jay-policy="pricing-card" heading="Starter">...</jay:card>
<jay:card jay-policy="promo-card" heading="Sale">...</jay:card>
<p jay-policy="price-note">Prices exclude VAT.</p>
```

The policy can then target that part with a selector like `src/pages/page.jay-html#pricing-card`.

Rules of thumb:

- **The name is on the instance**, not the tag — two `<jay:card>` regions can have different
  permissions because they carry different `jay-policy` names.
- **Use a plain attribute, not `id`** — ids must be unique per document and break under `forEach`; a
  marked element may repeat (it forms one policy group governed alike).
- **The value is a static literal** — no bindings. The engine reads template source, not rendered output.
- **Add a marker to every part a policy may need to control separately.** If a part has no marker, it
  falls under the file's path rules — you cannot give it tighter or looser permissions later.
- **`jay-policy` never renders** and is never a component prop — it is read only by the editing-policy
  engine.

## Changing a marker is itself governed

Adding, removing, or renaming a `jay-policy` attribute is a `policy` change and needs the `policy`
right for your role. A candidate cannot grant itself rights by editing markers — rights always come
from the baseline policy.
