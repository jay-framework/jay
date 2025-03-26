# Composite Component

When rendering a page that may have page component and a few applications installed, we need a way to compose the
different Jay components onto the page `jay-html`. In addition, if we have slowly rendered data, we need to compose
that data as well.

Consider a case when we have a page with product component, multilingual and A/B jay components. Each provides
a `makeJayStackComponent` definition, each can use contexts and each can have slowly and fast rendered data.
With Jay, unlike other frameworks, there is no "box" encapsulating each component, there is no separate `jsx` for each.
All are working with the same page design, or the same `jay-html`.

On the server, we can run each application slowly and fast rendering independently and generate the partial `ViewState`
of each, then combine the `ViewState`s using `viewState = {...vs1, ...vs2, ...vs3}` and render the `jay-html`.

Partial rendering of the `jay-html` can give another benefit, saving CPU effort for rendering slowly rendered `ViewState`
(see [36 - Partial Rendering.md](36%20-%20Partial%20Rendering.md)), but at the same time this is an optimization we can
implement later.

On the client, we need to compose the client components. We can reuse the client `makeJayComponent` by introducing
a composite `JayComponent` that takes the client component of each jay stack component, the client contexts and the
`carryForward` data (from server), and takes the `ViewState` from the server as default, composing a single client Jay Component.

The Composite Client Jay Component will

- take one or more Jay Stack interactive components, each with its own `Props & CarryForward` and `Contexts`
- take default `ViewState` from server rendering
- run each of the Jay Stack interactive components
- compose the rendering result of each into the interactive `ViewState`
- compose the default `ViewState` with the interactive `ViewState`
- render the page

We note that we have not discussed client components, nor did we discuss component exported APIs.
