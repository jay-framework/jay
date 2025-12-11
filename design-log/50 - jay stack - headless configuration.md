# Jay Stack - Headless Configuration for Missing `jay-html`

## Context

We have a scenario where `jay-html` files might not exist (e.g., during early stages of generation from external tools like Figma), but the folder structure and `jay-contract` files are present. We need a way to define "used components" (headless components) without relying on the `<script type="application/jay-headless">` tags inside `jay-html`.

## Problem

Currently, `getContracts` and `getProjectConfiguration` rely on parsing `jay-html` files to find which components from installed apps are used on a page. If `jay-html` is missing, we lose this information, even if we know the page exists (via folder structure and contract).

## Decision: Localized `page.conf.yaml` (Option B)

We have decided to adopt **Option B: Localized `page.conf.yaml`**. This allows a page to be fully defined by its folder contents, even without the view template (`jay-html`).

### Implementation Details

A page directory is recognized if it contains at least one of:

- `page.jay-html`
- `page.jay-contract`
- `page.conf.yaml`

### Configuration Logic

The `getContracts` API follows this precedence rules for determining page properties:

1.  **Page Existence:**

    - If a directory in the pages tree contains any of the above files, it is treated as a page.
    - `pageUrl` is derived from the directory structure.

2.  **Contract Tags:**

    - If `page.jay-contract` exists: Tags are read from this file.
    - If `page.jay-contract` is missing: The page has an empty contract schema (no tags).

3.  **Used Components (Headless Components):**
    - **Priority 1 (`page.jay-html`):** If `page.jay-html` exists, the system parses it for `<script type="application/jay-headless">` tags. This is considered the source of truth for the view.
    - **Priority 2 (`page.conf.yaml`):** If `page.jay-html` is **missing**, the system checks for `page.conf.yaml`.
      - It reads the `used_components` list from the YAML file.
    - **Fallback:** If neither exists, the list of used components is empty.

### File Structure Example

```
src/pages/
  home/
    page.jay-contract      # Defines page data interface
    page.conf.yaml         # Defines used components (when HTML is missing)
```

### `page.conf.yaml` Format

```yaml
used_components:
  - name: product-list # Component name in the installed app
    src: wix-stores # App module name
    key: products # Key to bind data to
```

## Superseded Options

### Option A: Centralized `project.conf.yaml`

Rejected due to scalability issues and merge conflict risks.

### Option C: Extend `page.jay-contract`

Rejected to maintain separation of concerns between interface (contract) and implementation (dependencies).
