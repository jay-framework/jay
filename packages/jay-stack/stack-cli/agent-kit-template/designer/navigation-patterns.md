# Navigation Patterns

## Active Menu Item

Use conditional class bindings with `===` to highlight the current page:

```html
<nav>
  <div forEach="menuItems" trackBy="url">
    <a href="{url}" class="nav-link {url === currentPath ? active}">{label}</a>
  </div>
</nav>
```

The `{url === currentPath ? active}` adds the `active` class when the menu item's URL matches the current path.

## Active Section

Use `^=` (starts with) for section-level highlighting. A link to `/docs/designer` should be active when the URL is `/docs/designer/routing`:

```html
<nav>
  <div forEach="sections" trackBy="url">
    <a href="{url}" class="section-link {currentPath ^= url ? active}">{label}</a>
  </div>
</nav>
```

## Two-Level Sidebar

Combine section matching and page matching for a sidebar with expandable sections:

```html
<nav>
  <div forEach="sections" trackBy="url">
    <a href="{url}" class="section {currentPath ^= url ? active}">{label}</a>
    <div if="currentPath ^= url" forEach="pages" trackBy="url">
      <a href="{url}" class="page {url === currentPath ? active}">{label}</a>
    </div>
  </div>
</nav>
```

- Section links use `^=` — active when any child page is current
- Page links within the section use `===` — active on exact match
- The `if="currentPath ^= url"` on the pages container shows child pages only for the active section

## Passing URL Data to Components

In page templates, use `jay.` bindings to pass URL information to nested components without needing a `page.ts`:

```html
<jay:Sidebar currentPath="{jay.url.path}" activeRole="{jay.params.role}" />
```

Inside the component template, use the props as ViewState fields:

```html
<!-- sidebar.jay-html -->
<a href="/docs/designer" class="role-link {currentPath ^= '/docs/designer' ? active}">Designer</a>
<a href="/docs/developer" class="role-link {currentPath ^= '/docs/developer' ? active}"
  >Developer</a
>
```

## Operators

| Operator | Meaning     | Use for                     |
| -------- | ----------- | --------------------------- |
| `===`    | Exact match | Current page highlighting   |
| `^=`     | Starts with | Section/parent highlighting |

Both work with field references (bare identifier) and quoted string literals (`'/docs'`).
