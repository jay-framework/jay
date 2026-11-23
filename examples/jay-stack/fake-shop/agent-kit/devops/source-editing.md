# Source Editing — DevOps / AIditor Integration Guide

**Audience:** AIditor (or a similar visual editor) and the devops integrating it. How to turn on Jay's
source-editing inspector and use it to map a rendered pixel back to its `.jay-html` source (DL#219).

**This is dev-only.** The inspector is served only by the dev server, and only when enabled. It never
affects a production build.

---

## 1. Enable it

In the project's `.jay` file:

```yaml
devServer:
  sourceEditing: true
```

When on, the dev server injects `jay-dev-*` markers into rendered pages (`jay-dev-src` line ranges on every
element, `jay-dev-item` on `forEach` roots, `jay-dev-region*` on region roots). Off by default — the markers
change rendered output, so enable only for source-editing sessions, never in production.

## 2. Open a page in embed mode

Load the page in an `<iframe>` with the `_jay_embed` query param:

```
http://localhost:<port>/<route>?_jay_embed
```

Embed mode registers the inspector's `message` listener (shared with the freeze protocol). The page posts
`jay:route` to the parent on load.

## 3. Ask "what is this?" — the postMessage protocol

Send a point or a rectangle (iframe-relative CSS pixels); receive the resolved source location.

```
// parent → iframe
{ type: 'jay:inspectPoint', requestId, x, y }
{ type: 'jay:inspectRect',  requestId, x, y, width, height }

// iframe → parent
{ type: 'jay:inspectResult', requestId,
  file,                 // project-relative page jay-html path (where the lines live)
  route, routePattern,  // derive route params from these
  node: {               // the element actually hit / chosen; null if nothing marked
    lines: { from, to },    // 1-based line range in `file`
    tag,                    // e.g. 'li', 'span'
    html,                   // one-level HTML of the element (open tag + authored attrs + inline text;
                            //   grandchildren elided) — the single content field
    rect: { x, y, width, height },  // on-screen box, for overlaying a highlight
    contentFromBinding?: true,      // set when the element is generated from a bound value (html-string)
  } | null,
  stack: [              // enclosing data scopes, innermost → outermost (plain wrappers omitted)
    { kind: 'forEach', lines, itemId },        // itemId = runtime trackBy record id
    { kind: 'region',  lines, name, props? },  // name = contract; props = static primitive props
  ] }
```

**`inspectRect`** (drag selection) uses the rect rule: among marked elements the box encloses (overlap over
the element's own area ≥ 0.8), the **largest** is chosen; if none, it falls back to the box center.

## 4. Decide how to edit (the decision rule)

- **Static content** (no `contentFromBinding`, not inside a region): the text/attribute is authored in the
  jay-html — edit `file` at `node.lines`.
- **Bound content** (`contentFromBinding`, or inside a `region`/`forEach` frame): the value comes from data,
  not the markup. Read the binding at `node.lines` (e.g. `{post.content}`), then resolve its source:
  - `stack` region frame → the `name` is the contract; map it via `agent-kit/plugins-index.yaml` to the
    plugin's **editing guide** (see the plugin **source-editing** guide).
  - `forEach` frame `itemId` identifies the record; route params (`route`/`routePattern`) identify the page
    instance.
  - Editing a bound value means editing its source (e.g. a markdown `.md` file, or a plugin's data via its
    `devOnly` action), not the rendered markup.

The inspector returns **locators, not resolved bindings** — it stays client-only, and the agent reads the
jay-html + agent-kit to resolve. (The dev server does not resolve contracts; see DL#219 §2.)

## 5. Try it

The smoke-test example ships a live harness: run `yarn dev` in `examples/jay-stack/smoke-test` and open
`http://localhost:3300/what-is-this.html` — hover/drag over any page and watch the `jay:inspectResult`.

---

See also: the developer **configuration** guide (the `.jay` `sourceEditing` field) and the plugin
**source-editing** guide (making a plugin's contracts editable).
