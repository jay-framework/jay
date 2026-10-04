# Jay-HTML — AI Designer Instructions

## Philosophy

Jay-HTML is standard HTML with data bindings. There is no custom component framework — just native HTML + CSS with `{expression}` bindings for dynamic content.

The design tool can freely read and rewrite jay-html files as long as contract bindings stay intact. Bindings (`{expression}`, `if`, `forEach`, `ref`) are the only extension to HTML. Everything else — CSS, structure, semantics, accessibility — is native.

**Common mistake:** expressions are not JavaScript — `if="items.length===0"` fails because jay-html resolves tag names, not property access. Use a boolean tag like `hasItems` or a number tag like `itemCount` instead. See [jay-html-template-syntax.md](jay-html-template-syntax.md#expression-limits-important).

## Component Types

### Page

Entry point at `src/pages/`. Can import all component types.

### Full-stack component (headless)

Reusable component with logic + contract + three-phase rendering (slow/fast/interactive), authored with
`makeJayStackComponent`. It has **no template of its own** — the consuming page flattens its template into a
`<jay:X>` region. Must live in `src/components/` (not inside page directories) so the production build can
discover and compile them. Can nest other full-stack components and instance headless in its own `<head>`.
Cannot use keyed headless. (Imported with `application/jay-headless`, not `application/jay-headfull` — see
[jay-html-components.md](jay-html-components.md#headfull-components-are-not-for-jay-stack).)

### Headless

Plugin-provided logic component. No template of its own — the page or consuming component provides the UI via inline template (`<jay:xxx>`). Two import patterns:

- **Key-based** — one instance per page, data merged under a key prefix (`{key.tag}`)
- **Instance-based** — multiple instances with props, each gets its own inline template

**Prefer a design system:** if the component ships a `.jay-html` template, flatten it (`template=` +
`jay-stack sync`) instead of hand-writing the inline body — see
[design-system-guide.md](design-system-guide.md).

## Nesting Rules

| Parent component            | Can compose full-stack components? | Can import headless (instance)? | Can import keyed headless? |
| --------------------------- | ---------------------------------- | ------------------------------- | -------------------------- |
| **Page**                    | Yes                                | Yes                             | Yes                        |
| **Full-stack component**    | Yes (recursive)                    | Yes (in its own head)           | No                         |
| **Keyed / plugin headless** | No (consumer owns the template)    | No                              | No                         |

## Validation

After creating or editing jay-html files, run `jay-stack validate` to check for errors. It catches issues like unknown refs, missing contracts, and invalid bindings. See [cli-commands.md](cli-commands.md) for details.

## Reference

| File                                                       | Topic                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| [jay-html-template-syntax.md](jay-html-template-syntax.md) | Template markup: file structure, data binding, conditions, loops, refs     |
| [jay-html-components.md](jay-html-components.md)           | Component imports: headless (key/instance), full-stack components, nesting |
| [jay-html-styling.md](jay-html-styling.md)                 | Styling: inline, external, dynamic styles, class bindings                  |
