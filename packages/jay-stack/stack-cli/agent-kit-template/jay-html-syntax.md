# Jay-HTML — AI Designer Instructions

## Philosophy

Jay-HTML is standard HTML with data bindings. There is no custom component framework — just native HTML + CSS with `{expression}` bindings for dynamic content.

The design tool can freely read and rewrite jay-html files as long as contract bindings stay intact. Bindings (`{expression}`, `if`, `forEach`, `ref`) are the only extension to HTML. Everything else — CSS, structure, semantics, accessibility — is native.

## Component Types

### Page

Entry point at `src/pages/`. Can import all component types.

### Headfull FS

Reusable component with its own template + contract + three-phase rendering (slow/fast/interactive). Lives alongside the page in a components directory. Can nest other headfull FS and instance headless in its own `<head>`. Cannot use keyed headless.

### Headless

Plugin-provided logic component. No template — the page or headfull component provides the UI via inline template (`<jay:xxx>`). Two import patterns:

- **Key-based** — one instance per page, data merged under a key prefix (`{key.tag}`)
- **Instance-based** — multiple instances with props, each gets its own inline template

## Nesting Rules

| Parent component | Can import headfull FS? | Can import headless (instance)? | Can import keyed headless? |
| ---------------- | ----------------------- | ------------------------------- | -------------------------- |
| **Page**         | Yes                     | Yes                             | Yes                        |
| **Headfull FS**  | Yes (recursive)         | Yes (in its own head)           | No                         |
| **Headless**     | No (no template)        | No (no template)                | No (no template)           |

## Reference

| File                                                         | Topic                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| [jay-html-template-syntax.md](jay-html-template-syntax.md)   | Template markup: file structure, data binding, conditions, loops, refs |
| [jay-html-components.md](jay-html-components.md)             | Component imports: headless (key/instance), headfull FS, nesting |
| [jay-html-styling.md](jay-html-styling.md)                   | Styling: inline, external, dynamic styles, class bindings    |
