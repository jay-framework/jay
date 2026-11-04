# Source Editing — Changing Content the User Points At

**Audience:** Agents editing an existing page after a user points at an element (DL#219).

When a user marks an element and asks to change it ("rename this label", "swap this image"), you get the
**inspector result**: `file`, `node` (`lines`, `tag`, `html`, maybe `contentFromBinding`) and `stack`
(`forEach` / `region` frames, innermost → outermost). It locates the source; it does not tell you whether the
value is data. Decide that yourself, before editing.

## 1. Read the source at `node.lines`

Open `file` at `node.lines`. The stack alone is not enough — a page-script headless produces no frame.

## 2. Static or bound?

- **Bound** — the requested text/attribute is a `{…}` expression (`{contact.email.label}`, `src="{image.url}"`),
  or `contentFromBinding` is set, or the node is inside a `region`/`forEach` frame. The value comes from a
  contract: **never replace the binding with a literal**, not even for one page — it would freeze the content
  and break it when the data changes. Go to step 3.
- **Static** — authored text/attributes with no `{…}`: edit `file` at `node.lines` as usual.

Mixed requests ("rename this field and make it wider"): edit the markup/CSS part normally, handle the bound
part with step 3.

## 3. Bound: find the contract and its editing guide

1. **Find the contract.** A `region` frame → its `name`. Otherwise take the binding's first segment `K`
   (`{contact.email.label}` → `contact`) and find the page's
   `<script type="application/jay-headless" … contract="…" key="K">`.
2. **Read the contract file.** `agent-kit/plugins-index.yaml` → that contract's `path` → read the
   `.jay-contract`. Generated (dynamic) contracts carry top-level `editingGuide` plus the record id the guide
   needs (e.g. `recordSetId`) — read it from there, never derive it from the contract name. Static
   contracts declare `editingGuide` (or `readonly: true`) in the plugin's `plugin.yaml`.
3. **Follow the `editingGuide`.** It says how to identify the record (from `forEach` `itemId`, region `props`,
   route params) and whether to write through a `devOnly` action or give the user a dashboard link.
4. **`readonly: true`** or no guide → don't edit the binding; tell the user where the content comes from.

## Example

```html
<script
  type="application/jay-headless"
  plugin="my-forms"
  contract="form/contact-us"
  key="contact"
></script>
...
<label>{contact.firstName.label} <input ref="contact.firstName.input" /></label>
```

"Rename this label" → the label is `{contact.firstName.label}` → key `contact` → contract `form/contact-us` →
its `.jay-contract` has `editingGuide` + the form's id → the guide says the label is managed in the forms
service's dashboard → reply with the dashboard link.

- ✅ follow the guide; the page keeps `{contact.firstName.label}`
- ❌ `<label>Your first name <input … /></label>` — hard-codes data the contract owns
